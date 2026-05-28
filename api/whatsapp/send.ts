import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin";
import { sendWhatsAppText } from "../_lib/evolution";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { remoteJid, text } = req.body || {};
  if (!remoteJid || !text) {
    return res.status(400).json({ error: "remoteJid and text are required" });
  }

  const result = await sendWhatsAppText(remoteJid, text);
  const db = getAdminDb();
  await db.collection("whatsapp_conversations").doc(remoteJid).collection("messages").add({
    direction: "outbound",
    text,
    agent: "Humano",
    createdAt: new Date().toISOString(),
  });

  return res.status(200).json({ ok: true, result });
}
