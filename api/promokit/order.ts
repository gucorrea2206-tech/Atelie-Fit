import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPromokitOrder } from "../_lib/promokit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const code = String(req.query.code || "");
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const order = await getPromokitOrder(code);
    return res.status(200).json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit order failed";
    return res.status(500).json({ error: message });
  }
}
