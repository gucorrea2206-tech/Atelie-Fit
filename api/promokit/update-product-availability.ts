import type { VercelRequest, VercelResponse } from "@vercel/node";
import { updatePromokitProductAvailability } from "../_lib/promokit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pdvCode, availability } = req.body || {};
    if (!pdvCode || !availability) {
      return res.status(400).json({ error: "pdvCode and availability are required" });
    }

    const result = await updatePromokitProductAvailability({ pdvCode, availability });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit product availability update failed";
    return res.status(500).json({ error: message });
  }
}
