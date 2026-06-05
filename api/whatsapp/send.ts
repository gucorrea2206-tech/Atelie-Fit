import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { buildCampaignContext, saveCampaignContext } from "../_lib/campaignContext.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";

type Recipient = {
  remoteJid?: string;
  phone?: string;
  name?: string;
};

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { remoteJid, text, campaignId, recipients, dryRun = false } = req.body || {};
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

    const sent: any[] = [];
    const skipped: any[] = [];

    for (const recipient of recipients as Recipient[]) {
      const recipientRemoteJid = buildRemoteJid(recipient.remoteJid || recipient.phone || "");
      if (!recipientRemoteJid) {
        skipped.push({ recipient, reason: "missing_phone" });
        continue;
      }

      const variants = campaign.randomizerEnabled && campaign.messageVariants?.length
        ? campaign.messageVariants
        : [campaign.initialMessage];
      const variantIndex = Math.abs(recipientRemoteJid.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % variants.length;
      const messageText = replaceTemplate(variants[variantIndex] || campaign.initialMessage, recipient);
      const context = buildCampaignContext(recipientRemoteJid, campaign, messageText, "sent");

      if (!dryRun) {
        const result = await sendWhatsAppText(recipientRemoteJid, messageText);
        await saveCampaignContext(db, context);
        await db.collection("whatsapp_conversations").doc(recipientRemoteJid).collection("messages").add({
          direction: "outbound",
          text: messageText,
          agent: campaign.campaignAgent || "Maya",
          campaignId: campaign.id,
          campaignName: campaign.name,
          sendStatus: "sent",
          createdAt: new Date().toISOString(),
        });
        sent.push({ remoteJid: recipientRemoteJid, campaignId, campaignName: campaign.name, result });
      } else {
        sent.push({ remoteJid: recipientRemoteJid, campaignId, campaignName: campaign.name, dryRun: true, messageText, context });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      campaignId,
      sentCount: sent.length,
      skippedCount: skipped.length,
      sent,
      skipped,
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

  return res.status(200).json({ ok: true, result, campaignContext });
}
