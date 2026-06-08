import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { processPromokitOrder } from "../_lib/promokitOrderProcessor.js";
import { getPromokitOrder, listPromokitLatestOrders } from "../_lib/promokit.js";
import { logOperationalEvent } from "../_lib/operationalEvents.js";

function normalizePhone(order: any) {
  return (
    order?.cliente?.telefone ||
    order?.cliente?.celular ||
    order?.cliente?.whatsapp ||
    order?.telefone ||
    order?.whatsapp ||
    ""
  );
}

function extractOrders(response: any) {
  return response?.data?.pedidos || response?.pedidos || [];
}

function isAuthorizedCron(req: VercelRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function saveOrder(order: any) {
  const db = getAdminDb();
  const code = String(order.codigo || order.code || order.id || "");
  if (!code) return null;
  const phone = normalizePhone(order);
  const customerId = String(order?.cliente?.id || phone || code);
  const orderRef = db.collection("promokit_orders").doc(code);
  const alreadySaved = (await orderRef.get()).exists;

  await orderRef.set(
    {
      code,
      customerId,
      customerName: order?.cliente?.nome || "",
      customerPhone: phone,
      status: order.status || "",
      statusOrdem: order.statusOrdem ?? null,
      total: order.total ?? null,
      subtotal: order.subvalor ?? null,
      discount: order.desconto ?? null,
      deliveryFee: order.taxaEntrega ?? null,
      paid: Boolean(order.pago),
      canceled: Boolean(order.cancelado),
      finished: Boolean(order.finalizado),
      orderDate: order.horario || null,
      items: order.itens || [],
      payments: order.pagamentos || [],
      address: order.endereco || null,
      raw: order,
      syncedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const customerData: Record<string, any> = {
    id: customerId,
    name: order?.cliente?.nome || "",
    phone,
    lastOrderCode: code,
    lastOrderAt: order.horario || null,
    lastOrderTotal: order.total ?? null,
    address: order.endereco || null,
    raw: order?.cliente || null,
    updatedAt: new Date().toISOString(),
  };

  if (!alreadySaved) {
    customerData.orderCount = FieldValue.increment(1);
  }

  await db.collection("promokit_customers").doc(customerId).set(customerData, { merge: true });

  return code;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "GET" && !isAuthorizedCron(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();
    const input = req.method === "POST" ? req.body || {} : req.query;
    const status = String(input.status || input.st || "novo");
    const take = Number(input.take || input.t || 10);
    const stateRef = db.collection("promokit_sync_state").doc(status);
    const state = await stateRef.get();
    const lastOrderCode = String(input.lastOrderCode || state.data()?.lastOrderCode || "1");

    const response = await listPromokitLatestOrders({ lastOrderCode, take, status });
    const orders = extractOrders(response);
    const savedCodes: string[] = [];
    const processedSales = [];

    for (const orderSummary of orders) {
      const code = String(orderSummary.codigo || "");
      const fullOrder = code ? await getPromokitOrder(code).catch(() => ({ data: orderSummary })) : { data: orderSummary };
      const order = fullOrder?.data || fullOrder || orderSummary;
      const savedCode = await saveOrder(order);
      if (savedCode) savedCodes.push(savedCode);

      const processResult = await processPromokitOrder(order);
      if (processResult) processedSales.push(processResult);
    }

    const nextLastOrderCode = savedCodes[savedCodes.length - 1] || lastOrderCode;
    await stateRef.set(
      {
        status,
        lastOrderCode: nextLastOrderCode,
        lastRunAt: FieldValue.serverTimestamp(),
        lastCount: savedCodes.length,
      },
      { merge: true }
    );

    let leadBackfill = null;
    const shouldBackfillLeads = req.method === "GET" || input.backfillLeads === true || input.backfillLeads === "true";

    if (shouldBackfillLeads) {
      const leadStateRef = db.collection("promokit_sync_state").doc("leads_todos");
      const leadState = await leadStateRef.get();
      const lastLeadOrderCode = String(input.lastLeadOrderCode || leadState.data()?.lastOrderCode || "1");
      const leadsTake = Number(input.leadsTake || 50);
      const leadsMaxPages = Math.max(1, Math.min(Number(input.leadsMaxPages || 5), 20));
      const leadSavedCodes: string[] = [];
      let leadCursor = lastLeadOrderCode;
      let leadPagesRead = 0;

      for (let page = 0; page < leadsMaxPages; page += 1) {
        const leadResponse = await listPromokitLatestOrders({ lastOrderCode: leadCursor, take: leadsTake, status: "todos" });
        const leadOrders = extractOrders(leadResponse);
        leadPagesRead += 1;
        if (leadOrders.length === 0) break;

        for (const orderSummary of leadOrders) {
          const code = String(orderSummary.codigo || "");
          const fullOrder = code ? await getPromokitOrder(code).catch(() => ({ data: orderSummary })) : { data: orderSummary };
          const order = fullOrder?.data || fullOrder || orderSummary;
          const savedCode = await saveOrder(order);
          if (savedCode) leadSavedCodes.push(savedCode);
        }

        leadCursor = leadSavedCodes[leadSavedCodes.length - 1] || leadCursor;
        if (leadOrders.length < leadsTake) break;
      }

      const nextLeadOrderCode = leadSavedCodes[leadSavedCodes.length - 1] || lastLeadOrderCode;
      await leadStateRef.set(
        {
          status: "todos",
          lastOrderCode: nextLeadOrderCode,
          lastRunAt: FieldValue.serverTimestamp(),
          lastCount: leadSavedCodes.length,
        },
        { merge: true }
      );

      leadBackfill = {
        previousLastOrderCode: lastLeadOrderCode,
        nextLastOrderCode: nextLeadOrderCode,
        count: leadSavedCodes.length,
        pagesRead: leadPagesRead,
        savedCodes: leadSavedCodes,
      };
    }

    await logOperationalEvent(db, {
      type: "promokit_sync",
      title: savedCodes.length ? "Pedidos Promokit sincronizados" : "Sincronização Promokit sem novos pedidos",
      status: savedCodes.length ? "success" : "info",
      source: "promokit",
      message: `${savedCodes.length} pedido(s) salvo(s), ${processedSales.length} venda(s) processada(s).`,
      entityId: nextLastOrderCode,
      metadata: {
        status,
        previousLastOrderCode: lastOrderCode,
        nextLastOrderCode,
        savedCodes,
        processedSales,
        leadBackfill,
      },
    });

    return res.status(200).json({
      ok: true,
      status,
      previousLastOrderCode: lastOrderCode,
      nextLastOrderCode,
      count: savedCodes.length,
      savedCodes,
      processedSales,
      leadBackfill,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit automatic sync failed";
    console.error("Promokit automatic sync failed", { error: message });
    await logOperationalEvent(getAdminDb(), {
      type: "promokit_sync",
      title: "Falha na sincronização Promokit",
      status: "error",
      source: "promokit",
      message,
    });
    return res.status(500).json({ ok: false, error: message });
  }
}
