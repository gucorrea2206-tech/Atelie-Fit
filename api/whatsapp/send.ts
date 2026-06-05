import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { buildCampaignContext, saveCampaignContext } from "../_lib/campaignContext.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { remoteJid, text, campaignId } = req.body || {};
  if (!remoteJid || !text) {
    return res.status(400).json({ error: "remoteJid and text are required" });
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
