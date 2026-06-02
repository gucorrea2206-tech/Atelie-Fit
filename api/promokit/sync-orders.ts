import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { processPromokitOrder } from "../_lib/promokitOrderProcessor.js";
import { getPromokitOrder, listPromokitLatestOrders } from "../_lib/promokit.js";

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
      syncedAt: new Date().toISOString(),
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

  try {
    const input = req.method === "POST" ? req.body || {} : req.query;
    const lastOrderCode = String(input.lastOrderCode || input.ultimoPedido || "1");
    const take = Number(input.take || input.t || 10);
    const status = String(input.status || input.st || "novo");
    const processSales = input.processSales !== false && input.processSales !== "false";

    const response = await listPromokitLatestOrders({ lastOrderCode, take, status });
    const orders = response?.data?.pedidos || response?.pedidos || [];
    const savedCodes: string[] = [];
    const processedSales = [];

    for (const orderSummary of orders) {
      const code = String(orderSummary.codigo || "");
      const fullOrder = code ? await getPromokitOrder(code).catch(() => ({ data: orderSummary })) : { data: orderSummary };
      const order = fullOrder?.data || fullOrder || orderSummary;
      const savedCode = await saveOrder(order);
      if (savedCode) savedCodes.push(savedCode);

      if (processSales && savedCode) {
        const processResult = await processPromokitOrder(order);
        if (processResult) processedSales.push(processResult);
      }
    }

    return res.status(200).json({
      ok: true,
      count: savedCodes.length,
      savedCodes,
      processedSales,
      nextLastOrderCode: savedCodes[savedCodes.length - 1] || lastOrderCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit sync failed";
    console.error("Promokit sync failed", { error: message });
    return res.status(500).json({ ok: false, error: message });
  }
}
