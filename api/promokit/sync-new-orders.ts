import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { processPromokitOrder } from "../_lib/promokitOrderProcessor.js";
import { getPromokitOrder, listPromokitLatestOrders } from "../_lib/promokit.js";

async function saveOrder(order: any) {
  const db = getAdminDb();
  const code = String(order.codigo || order.code || order.id || "");
  if (!code) return null;

  await db.collection("promokit_orders").doc(code).set(
    {
      code,
      customerId: String(order?.cliente?.id || code),
      customerName: order?.cliente?.nome || "",
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

  return code;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
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
    const orders = response?.data?.pedidos || response?.pedidos || [];
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

    return res.status(200).json({
      ok: true,
      status,
      previousLastOrderCode: lastOrderCode,
      nextLastOrderCode,
      count: savedCodes.length,
      savedCodes,
      processedSales,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit automatic sync failed";
    console.error("Promokit automatic sync failed", { error: message });
    return res.status(500).json({ ok: false, error: message });
  }
}
