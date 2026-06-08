import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { getPromokitOrder } from "../_lib/promokit.js";
import { processPromokitOrder } from "../_lib/promokitOrderProcessor.js";
import { requireAdminApiUser } from "../_lib/apiAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiUser = await requireAdminApiUser(req, res);
  if (!apiUser) return;

  try {
    const orderCode = String(req.body?.orderCode || req.body?.code || "").trim();
    if (!orderCode) {
      return res.status(400).json({ ok: false, error: "orderCode is required" });
    }

    const db = getAdminDb();
    const savedOrder = await db.collection("promokit_orders").doc(orderCode).get();
    const savedData = savedOrder.data();
    let order = savedData?.raw || null;

    if (!order) {
      const fetchedOrder = await getPromokitOrder(orderCode);
      order = fetchedOrder?.data || fetchedOrder;
    }

    if (!order) {
      return res.status(404).json({ ok: false, error: "Pedido Promokit nao encontrado." });
    }

    const processResult = await processPromokitOrder(order, { forceReprocess: true });

    return res.status(200).json({
      ok: true,
      processResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao reprocessar pedido Promokit.";
    console.error("Promokit order reprocess failed", { error: message });
    return res.status(500).json({ ok: false, error: message });
  }
}
