import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin";
import { optionalEnv } from "../_lib/env";
import { decideAgentReply } from "../_lib/openai";
import { sendWhatsAppText } from "../_lib/evolution";

function normalizeMessage(payload: any) {
  const data = payload?.data || payload;
  const key = data?.key || {};
  const message = data?.message || {};
  const text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    data?.text ||
    payload?.text ||
    "";

  return {
    event: payload?.event || data?.event || "message",
    remoteJid: key?.remoteJid || data?.remoteJid || data?.from || "",
    messageId: key?.id || data?.id || "",
    fromMe: Boolean(key?.fromMe || data?.fromMe),
    pushName: data?.pushName || data?.senderName || "",
    text,
    raw: payload,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = optionalEnv("WEBHOOK_SECRET");
  if (webhookSecret && req.headers["x-webhook-secret"] !== webhookSecret && req.query.secret !== webhookSecret) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const normalized = normalizeMessage(req.body);
  if (!normalized.remoteJid || !normalized.text || normalized.fromMe) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const db = getAdminDb();
  const conversationRef = db.collection("whatsapp_conversations").doc(normalized.remoteJid);
  const messageRef = conversationRef.collection("messages").doc(normalized.messageId || `${Date.now()}`);

  await conversationRef.set(
    {
      remoteJid: normalized.remoteJid,
      pushName: normalized.pushName,
      lastMessage: normalized.text,
      updatedAt: new Date().toISOString(),
      status: "ai",
    },
    { merge: true }
  );

  await messageRef.set({
    direction: "inbound",
    text: normalized.text,
    payload: normalized.raw,
    createdAt: new Date().toISOString(),
  });

  const decision = await decideAgentReply(normalized.text, {
    remoteJid: normalized.remoteJid,
    pushName: normalized.pushName,
  });

  await conversationRef.set(
    {
      intent: decision.intent,
      agent: decision.agent,
      confidence: decision.confidence,
      reason: decision.reason,
      needsHuman: decision.agent === "Humano" || decision.intent === "humano",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  if (decision.shouldReply && decision.reply && decision.agent !== "Humano") {
    await sendWhatsAppText(normalized.remoteJid, decision.reply);
    await conversationRef.collection("messages").add({
      direction: "outbound",
      text: decision.reply,
      agent: decision.agent,
      createdAt: new Date().toISOString(),
    });
  }

  return res.status(200).json({ ok: true, decision });
}
