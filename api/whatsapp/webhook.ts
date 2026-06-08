import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { optionalEnv } from "../_lib/env.js";
import { decideAgentReply } from "../_lib/openai.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";
import { getActiveCampaignContext, markCampaignContextResponded } from "../_lib/campaignContext.js";
import { logOperationalEvent } from "../_lib/operationalEvents.js";

export const config = {
  maxDuration: 60,
};

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

function onlyDigits(value = "") {
  return value.replace(/\D/g, "");
}

async function buildLiveAiContext(db: Firestore, remoteJid: string) {
  const [productsSnapshot, movementsSnapshot] = await Promise.all([
    db.collection("products").get(),
    db.collection("movements").get(),
  ]);

  const stockMap = new Map<string, number>();
  movementsSnapshot.docs.forEach((doc) => {
    const movement = doc.data();
    const productId = String(movement.productId || "");
    const quantity = Number(movement.quantity || 0);
    if (!productId || !quantity) return;
    const current = stockMap.get(productId) || 0;
    stockMap.set(productId, movement.type === "entrada" ? current + quantity : current - quantity);
  });

  const stockSnapshot = productsSnapshot.docs
    .map((doc) => {
      const product = doc.data();
      return {
        id: doc.id,
        name: String(product.name || ""),
        price: Number(product.price || 0),
        stock: stockMap.get(doc.id) || 0,
      };
    })
    .filter((item) => item.name)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 80);

  const phoneDigits = onlyDigits(remoteJid);
  const customerMatches = await Promise.all([
    db.collection("promokit_customers").doc(phoneDigits).get(),
    db.collection("promokit_customers").where("phone", "==", phoneDigits).limit(1).get(),
  ]);
  const directCustomer = customerMatches[0].exists ? customerMatches[0].data() : null;
  const queriedCustomer = customerMatches[1].empty ? null : customerMatches[1].docs[0].data();
  const customer = directCustomer || queriedCustomer || null;

  return {
    stockSnapshot,
    availableProducts: stockSnapshot.filter((item) => item.stock > 0).slice(0, 30),
    unavailableProducts: stockSnapshot.filter((item) => item.stock <= 0).slice(0, 20),
    customerProfile: customer
      ? {
          name: customer.name || "",
          phone: customer.phone || phoneDigits,
          lastOrderCode: customer.lastOrderCode || "",
          lastOrderAt: customer.lastOrderAt || null,
          lastOrderTotal: customer.lastOrderTotal ?? null,
          orderCount: customer.orderCount || 0,
          address: customer.address || null,
        }
      : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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
    const activeCampaignContext = await getActiveCampaignContext(db, normalized.remoteJid);

    if (activeCampaignContext) {
      await markCampaignContextResponded(db, activeCampaignContext, normalized.text);
    }

    await conversationRef.set(
      {
        remoteJid: normalized.remoteJid,
        pushName: normalized.pushName,
        lastMessage: normalized.text,
        campaignId: activeCampaignContext?.campaignId || "",
        campaignName: activeCampaignContext?.campaignName || "",
        activeCampaignContext: activeCampaignContext || null,
        updatedAt: new Date().toISOString(),
        status: "ai",
      },
      { merge: true }
    );

    await messageRef.set({
      direction: "inbound",
      text: normalized.text,
      payload: normalized.raw,
      campaignId: activeCampaignContext?.campaignId || "",
      campaignName: activeCampaignContext?.campaignName || "",
      createdAt: new Date().toISOString(),
    });

    const aiConfig = await getWhatsappAiConfig();
    const liveContext = await buildLiveAiContext(db, normalized.remoteJid);
    const decision = await decideAgentReply(normalized.text, {
      remoteJid: normalized.remoteJid,
      pushName: normalized.pushName,
      aiConfig,
      ...liveContext,
      campaignContext: activeCampaignContext,
      isCampaignResponse: Boolean(activeCampaignContext),
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

    let sendStatus: "skipped" | "sent" | "failed" = "skipped";
    let sendError = "";

    if (decision.shouldReply && decision.reply && decision.agent !== "Humano") {
      try {
        await sendWhatsAppText(normalized.remoteJid, decision.reply);
        sendStatus = "sent";
      } catch (error) {
        sendStatus = "failed";
        sendError = error instanceof Error ? error.message : "Unknown Evolution send error";
        console.error("Evolution send failed", { remoteJid: normalized.remoteJid, error: sendError });
      }

      await conversationRef.collection("messages").add({
        direction: "outbound",
        text: decision.reply,
        agent: decision.agent,
        sendStatus,
        sendError,
        campaignId: activeCampaignContext?.campaignId || "",
        campaignName: activeCampaignContext?.campaignName || "",
        createdAt: new Date().toISOString(),
      });
    }

    await logOperationalEvent(db, {
      type: "whatsapp_message",
      title: activeCampaignContext ? "Resposta de campanha processada" : "Mensagem WhatsApp processada",
      status: sendStatus === "failed" ? "warning" : "success",
      source: "whatsapp",
      entityId: normalized.remoteJid,
      message: `${decision.agent} · ${decision.intent}${sendStatus === "failed" ? ` · envio falhou: ${sendError}` : ""}`,
      metadata: {
        remoteJid: normalized.remoteJid,
        pushName: normalized.pushName,
        campaignId: activeCampaignContext?.campaignId || "",
        campaignName: activeCampaignContext?.campaignName || "",
        decision,
        sendStatus,
      },
    });

    return res.status(200).json({ ok: true, decision, sendStatus, sendError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    console.error("WhatsApp webhook failed", { error: message });
    await logOperationalEvent(getAdminDb(), {
      type: "whatsapp_webhook",
      title: "Falha no webhook do WhatsApp",
      status: "error",
      source: "whatsapp",
      message,
    });
    return res.status(500).json({ ok: false, error: message });
  }
}
