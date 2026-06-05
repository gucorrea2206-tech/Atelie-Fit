import type { Firestore } from "firebase-admin/firestore";
import type { WhatsAppCampaignConfig } from "./whatsappAiConfig.js";

export type CampaignDeliveryContext = {
  campaignId: string;
  campaignName: string;
  remoteJid: string;
  messageText: string;
  sentAt: string;
  expiresAt: string;
  status: "sent" | "failed" | "responded";
  campaign: Partial<WhatsAppCampaignConfig>;
};

const DEFAULT_CONTEXT_TTL_HOURS = 72;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function buildCampaignContext(
  remoteJid: string,
  campaign: WhatsAppCampaignConfig,
  messageText: string,
  status: "sent" | "failed" = "sent"
): CampaignDeliveryContext {
  const now = new Date();

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    remoteJid,
    messageText,
    sentAt: now.toISOString(),
    expiresAt: addHours(now, DEFAULT_CONTEXT_TTL_HOURS).toISOString(),
    status,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      audience: campaign.audience || "",
      campaignAgent: campaign.campaignAgent || "Maya",
      handoffAgent: campaign.handoffAgent || "Nina",
      objective: campaign.objective || "",
      couponCode: campaign.couponCode || "",
      couponDetails: campaign.couponDetails || "",
      campaignKnowledge: campaign.campaignKnowledge || "",
      initialMessage: campaign.initialMessage || "",
      responseRecognition: campaign.responseRecognition || "",
      responseInstructions: campaign.responseInstructions || "",
      handoffRules: campaign.handoffRules || "",
    },
  };
}

export async function saveCampaignContext(db: Firestore, context: CampaignDeliveryContext) {
  const contextRef = db.collection("whatsapp_campaign_contexts").doc(`${context.remoteJid}_${context.campaignId}`);
  const conversationRef = db.collection("whatsapp_conversations").doc(context.remoteJid);

  await contextRef.set(context, { merge: true });
  await conversationRef.set(
    {
      activeCampaignContext: context,
      campaignId: context.campaignId,
      campaignName: context.campaignName,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function getActiveCampaignContext(db: Firestore, remoteJid: string) {
  const conversationSnapshot = await db.collection("whatsapp_conversations").doc(remoteJid).get();
  const conversationData = conversationSnapshot.data() || {};
  const activeContext = conversationData.activeCampaignContext as CampaignDeliveryContext | undefined;

  if (activeContext?.expiresAt && new Date(activeContext.expiresAt).getTime() > Date.now()) {
    return activeContext;
  }

  return null;
}

export async function markCampaignContextResponded(db: Firestore, context: CampaignDeliveryContext, inboundText: string) {
  const respondedAt = new Date().toISOString();
  const contextRef = db.collection("whatsapp_campaign_contexts").doc(`${context.remoteJid}_${context.campaignId}`);
  await contextRef.set(
    {
      status: "responded",
      respondedAt,
      lastInboundText: inboundText,
    },
    { merge: true }
  );
}
