import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdminApiUser } from "../_lib/apiAuth.js";
import { missingEnv } from "../_lib/env.js";

const requiredEnv = [
  "OPENAI_API_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE_NAME",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_FIRESTORE_DATABASE_ID",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiUser = await requireAdminApiUser(req, res);
  if (!apiUser) return;

  const missing = missingEnv(requiredEnv);
  return res.status(200).json({
    ok: missing.length === 0,
    missing,
    webhookPath: "/api/whatsapp/webhook",
  });
}
