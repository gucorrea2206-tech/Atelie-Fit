import type { VercelRequest, VercelResponse } from "@vercel/node";
import { missingEnv } from "../_lib/env";

const requiredEnv = [
  "OPENAI_API_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE_NAME",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missing = missingEnv(requiredEnv);
  return res.status(200).json({
    ok: missing.length === 0,
    missing,
    webhookPath: "/api/whatsapp/webhook",
  });
}
