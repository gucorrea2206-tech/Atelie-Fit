import type { VercelRequest, VercelResponse } from "@vercel/node";
import { updatePromokitOrderStatus } from "../_lib/promokit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code, status, paid } = req.body || {};
    if (!code || !status) {
      return res.status(400).json({ error: "code and status are required" });
    }

    const result = await updatePromokitOrderStatus({ code, status, paid });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit status update failed";
    return res.status(500).json({ error: message });
  }
}
