import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { buildCampaignContext, saveCampaignContext } from "../_lib/campaignContext.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";
import { logOperationalEvent } from "../_lib/operationalEvents.js";
import { requireAdminApiUser } from "../_lib/apiAuth.js";

type Recipient = {
  remoteJid?: string;
  phone?: string;
  name?: string;
};

type QueueStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

function buildRemoteJid(value = "") {
  if (value.includes("@s.whatsapp.net")) return value;
  const digits = value.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function replaceTemplate(message: string, recipient: Recipient) {
  return message
    .replace(/\{\{nome\}\}/g, recipient.name || "tudo bem")
    .replace(/\{\{primeiro_nome\}\}/g, (recipient.name || "").split(" ")[0] || "tudo bem");
}

function isAuthorizedCron(req: VercelRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

function getQueueDocId(campaignId: string, remoteJid: string) {
  return `${campaignId}_${remoteJid.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function getVariantIndex(remoteJid: string, variantsLength: number) {
  if (!variantsLength) return 0;
  return Math.abs(remoteJid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % variantsLength;
}

async function processCampaignQueue(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && !isAuthorizedCron(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const db = getAdminDb();
  const input = req.method === "POST" ? req.body || {} : req.query || {};
  const limit = Math.max(1, Math.min(Number(input.limit || 12), 25));
  const now = new Date();
  const queueSnapshot = await db
    .collection("campaign_dispatch_queue")
    .where("status", "==", "pending")
    .limit(limit * 3)
    .get();
  const queueItems = queueSnapshot.docs
    .filter((doc) => {
      const scheduledFor = doc.data().scheduledFor;
      const scheduledDate = scheduledFor?.toDate ? scheduledFor.toDate() : new Date(0);
      return scheduledDate.getTime() <= now.getTime();
    })
    .sort((a, b) => {
      const aDate = a.data().scheduledFor?.toDate ? a.data().scheduledFor.toDate().getTime() : 0;
      const bDate = b.data().scheduledFor?.toDate ? b.data().scheduledFor.toDate().getTime() : 0;
      return aDate - bDate;
    })
    .slice(0, limit);

  const sent: any[] = [];
  const failed: any[] = [];

  for (const queueDoc of queueItems) {
    const item = queueDoc.data();
    const remoteJid = String(item.remoteJid || "");
    const campaignId = String(item.campaignId || "");
    const messageText = String(item.messageText || "");

    if (!remoteJid || !campaignId || !messageText) {
      await queueDoc.ref.set(
        {
          status: "skipped" satisfies QueueStatus,
          lastError: "Dados insuficientes para envio.",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      failed.push({ id: queueDoc.id, reason: "missing_data" });
      continue;
    }

    await queueDoc.ref.set(
      {
        status: "sending" satisfies QueueStatus,
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const aiConfig = await getWhatsappAiConfig();
      const campaign = aiConfig.campaigns.find((entry) => entry.id === campaignId);

      const result = await sendWhatsAppText(remoteJid, messageText);
      if (campaign) {
        const context = buildCampaignContext(remoteJid, campaign, messageText, "sent");
        await saveCampaignContext(db, context);
      }
      await db.collection("whatsapp_conversations").doc(remoteJid).collection("messages").add({
        direction: "outbound",
        text: messageText,
        agent: campaign?.campaignAgent || item.agent || "Caio",
        campaignId: campaign?.id || campaignId,
        campaignName: campaign?.name || item.campaignName || "Automação",
        sendStatus: "sent",
        queueId: queueDoc.id,
        createdAt: new Date().toISOString(),
      });
      await queueDoc.ref.set(
        {
          status: "sent" satisfies QueueStatus,
          sentAt: new Date().toISOString(),
          result,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      sent.push({ id: queueDoc.id, remoteJid, campaignId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao enviar campanha.";
      await queueDoc.ref.set(
        {
          status: "failed" satisfies QueueStatus,
          lastError: errorMessage,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      failed.push({ id: queueDoc.id, remoteJid, campaignId, error: errorMessage });
    }
  }

  await logOperationalEvent(db, {
    type: "campaign_queue_process",
    title: "Fila de campanhas processada",
    status: failed.length ? "warning" : "success",
    source: "whatsapp",
    message: `${sent.length} envio(s), ${failed.length} falha(s), limite ${limit}.`,
    metadata: {
      limit,
      sent,
      failed,
    },
  });

  return res.status(200).json({
    ok: true,
    processed: queueItems.length,
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return processCampaignQueue(req, res);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiUser = await requireAdminApiUser(req, res);
  if (!apiUser) return;

  const { remoteJid, text, campaignId, recipients, dryRun = false, action = "enqueue", scheduledFor, limit } = req.body || {};
  if (action === "processQueue") {
    return processCampaignQueue(req, res);
  }

  if ((!remoteJid || !text) && !Array.isArray(recipients)) {
    return res.status(400).json({ error: "remoteJid and text are required, or recipients[] for campaign sends" });
  }

  const db = getAdminDb();
  let campaignContext = null;
  let campaign = null;

  if (campaignId) {
    const aiConfig = await getWhatsappAiConfig();
    campaign = aiConfig.campaigns.find((item) => item.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
  }

  if (Array.isArray(recipients)) {
    if (!campaign) {
      return res.status(400).json({ error: "campaignId is required when using recipients[]" });
    }

    const queued: any[] = [];
    const skipped: any[] = [];
    const scheduledDate = scheduledFor ? new Date(scheduledFor) : new Date();
    const safeScheduledDate = Number.isNaN(scheduledDate.getTime()) ? new Date() : scheduledDate;
    const variants = campaign.randomizerEnabled && campaign.messageVariants?.length
      ? campaign.messageVariants
      : [campaign.initialMessage];

    for (const recipient of recipients as Recipient[]) {
      const recipientRemoteJid = buildRemoteJid(recipient.remoteJid || recipient.phone || "");
      if (!recipientRemoteJid) {
        skipped.push({ recipient, reason: "missing_phone" });
        continue;
      }

      const variantIndex = getVariantIndex(recipientRemoteJid, variants.length);
      const messageText = replaceTemplate(variants[variantIndex] || campaign.initialMessage, recipient);
      const queueDocId = getQueueDocId(campaign.id, recipientRemoteJid);
      const queueRef = db.collection("campaign_dispatch_queue").doc(queueDocId);
      const existing = await queueRef.get();
      const existingStatus = existing.data()?.status;

      if (existing.exists && ["pending", "sending", "sent"].includes(String(existingStatus))) {
        skipped.push({ recipient, remoteJid: recipientRemoteJid, reason: `already_${existingStatus}` });
        continue;
      }

      const queuePayload = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        remoteJid: recipientRemoteJid,
        phone: recipient.phone || "",
        customerName: recipient.name || "",
        messageText,
        variantIndex,
        status: dryRun ? ("skipped" satisfies QueueStatus) : ("pending" satisfies QueueStatus),
        dryRun: Boolean(dryRun),
        scheduledFor: Timestamp.fromDate(safeScheduledDate),
        attempts: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!dryRun) await queueRef.set(queuePayload, { merge: true });
      queued.push({ id: queueDocId, remoteJid: recipientRemoteJid, campaignId, campaignName: campaign.name, dryRun, messageText, scheduledFor: safeScheduledDate.toISOString() });
    }

    await logOperationalEvent(db, {
      type: "campaign_queue",
      title: dryRun ? "Fila de campanha simulada" : "Campanha enfileirada",
      status: skipped.length ? "warning" : "success",
      source: "whatsapp",
      entityId: campaignId,
      message: `${queued.length} contato(s) enfileirado(s), ${skipped.length} pulado(s).`,
      metadata: {
        dryRun,
        campaignId,
        campaignName: campaign.name,
        queuedCount: queued.length,
        skippedCount: skipped.length,
        skipped,
      },
    });

    return res.status(200).json({
      ok: true,
      dryRun,
      campaignId,
      queuedCount: queued.length,
      skippedCount: skipped.length,
      queued,
      skipped,
      nextProcessHint: dryRun ? null : "Use action=processQueue or wait for the scheduled queue processor.",
      limit,
    });
  }

  const result = await sendWhatsAppText(remoteJid, text);

  if (campaign) {
    campaignContext = buildCampaignContext(remoteJid, campaign, text, "sent");
    await saveCampaignContext(db, campaignContext);
  }

  await db.collection("whatsapp_conversations").doc(remoteJid).collection("messages").add({
    direction: "outbound",
    text,
    agent: "Humano",
    campaignId: campaignContext?.campaignId || "",
    campaignName: campaignContext?.campaignName || "",
    createdAt: new Date().toISOString(),
  });

  await logOperationalEvent(db, {
    type: "whatsapp_manual_send",
    title: campaign ? "Mensagem com contexto de campanha enviada" : "Mensagem WhatsApp enviada",
    status: "success",
    source: "whatsapp",
    entityId: remoteJid,
    message: campaign ? `Campanha: ${campaign.name}` : "Envio manual registrado.",
    metadata: {
      remoteJid,
      campaignId: campaign?.id || "",
      campaignName: campaign?.name || "",
    },
  });

  return res.status(200).json({ ok: true, result, campaignContext });
}
