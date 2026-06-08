import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";
import { logOperationalEvent } from "../_lib/operationalEvents.js";
import { requireAdminApiUser } from "../_lib/apiAuth.js";

type AutomationConfig = {
  id: string;
  title: string;
  enabled: boolean;
  triggerDays?: number;
  agent: string;
  message: string;
};

type Customer = {
  name?: string;
  phone?: string;
  lastOrderCode?: string;
  lastOrderAt?: string | null;
  lastOrderTotal?: number | null;
  orderCount?: number;
  address?: any;
};

function daysSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function replaceTemplate(message: string, customer: Customer, inactiveDays: number | null) {
  return message
    .replace(/\{\{nome\}\}/g, customer.name || "tudo bem")
    .replace(/\{\{primeiro_nome\}\}/g, (customer.name || "").split(" ")[0] || "tudo bem")
    .replace(/\{\{ultimo_pedido\}\}/g, customer.lastOrderCode || "")
    .replace(/\{\{dias_sem_pedir\}\}/g, inactiveDays === null ? "" : String(inactiveDays));
}

function buildRemoteJid(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function getQueueDocId(prefix: string, key: string, remoteJid: string) {
  return `${prefix}_${key}_${remoteJid.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function isRecentEnough(days: number | null, triggerDays: number) {
  return days !== null && days >= 0 && days <= triggerDays;
}

function isInactiveEnough(days: number | null, triggerDays: number) {
  return days !== null && days >= triggerDays;
}

function isAuthorizedCron(req: VercelRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "GET" && !isAuthorizedCron(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const apiUser = await requireAdminApiUser(req, res);
    if (!apiUser) return;
  }

  try {
    const db = getAdminDb();
    const input = req.method === "POST" ? req.body || {} : req.query || {};
    const dryRun = input.dryRun !== false;
    const queueFollowups = input.queueFollowups === true || input.queueFollowups === "true";
    const config = await getWhatsappAiConfig();
    const automations: AutomationConfig[] = Array.isArray(input.automations) ? input.automations : config.automations;
    const activeAutomations = automations.filter((automation) => automation.enabled);
    const customersSnapshot = await db.collection("promokit_customers").limit(200).get();
    const candidates: any[] = [];
    const sent: any[] = [];
    const queued: any[] = [];
    const operationalActions: any[] = [];

    customersSnapshot.docs.forEach((doc) => {
      const customer = doc.data() as Customer;
      const inactiveDays = daysSince(customer.lastOrderAt);

      activeAutomations.forEach((automation) => {
        const triggerDays = Number(automation.triggerDays || 15);
        const isRecovery = automation.id === "inactive_15_days" || automation.id === "promo_return";
        const isPostDelivery = automation.id === "post_delivery";
        const matches =
          (isRecovery && isInactiveEnough(inactiveDays, triggerDays)) ||
          (isPostDelivery && isRecentEnough(inactiveDays, triggerDays));

        if (matches) {
          candidates.push({
            automationId: automation.id,
            automationTitle: automation.title,
            agent: automation.agent,
            message: replaceTemplate(automation.message, customer, inactiveDays),
            customerId: doc.id,
            customerName: customer.name || "",
            phone: customer.phone || "",
            inactiveDays,
            lastOrderCode: customer.lastOrderCode || "",
            lastOrderTotal: customer.lastOrderTotal ?? null,
            reason: isRecovery
              ? `Cliente esta ha ${inactiveDays} dia(s) sem pedir.`
              : `Cliente teve compra recente ha ${inactiveDays} dia(s).`,
          });
        }
      });
    });

    activeAutomations
      .filter((automation) => automation.id === "stock_low")
      .forEach((automation) => {
        operationalActions.push({
          automationId: automation.id,
          automationTitle: automation.title,
          agent: automation.agent,
          message: automation.message,
          reason: "Regra operacional: orientar atendimento a sugerir alternativas quando o item estiver com estoque baixo.",
        });
      });

    if (!dryRun && !queueFollowups) {
      for (const candidate of candidates) {
        const remoteJid = buildRemoteJid(candidate.phone);
        if (!remoteJid) continue;
        const result = await sendWhatsAppText(remoteJid, candidate.message);
        sent.push({ ...candidate, result });
      }
    }

    if (queueFollowups) {
      const postDeliveryCandidates = candidates.filter((candidate) => candidate.automationId === "post_delivery");
      for (const candidate of postDeliveryCandidates) {
        const remoteJid = buildRemoteJid(candidate.phone);
        if (!remoteJid || !candidate.lastOrderCode) continue;

        const queueRef = db
          .collection("campaign_dispatch_queue")
          .doc(getQueueDocId("post_sale", candidate.lastOrderCode, remoteJid));
        const existing = await queueRef.get();
        const existingStatus = existing.data()?.status;
        if (existing.exists && ["pending", "sending", "sent"].includes(String(existingStatus))) {
          queued.push({ ...candidate, remoteJid, skipped: true, reason: `already_${existingStatus}` });
          continue;
        }

        await queueRef.set(
          {
            campaignId: "post_sale",
            campaignName: "Pós-venda automático",
            automationId: candidate.automationId,
            remoteJid,
            phone: candidate.phone || "",
            customerName: candidate.customerName || "",
            messageText: candidate.message,
            agent: candidate.agent || "Caio",
            status: "pending",
            scheduledFor: Timestamp.fromDate(new Date()),
            attempts: 0,
            source: "automation",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            metadata: {
              lastOrderCode: candidate.lastOrderCode,
              lastOrderTotal: candidate.lastOrderTotal,
              reason: candidate.reason,
            },
          },
          { merge: true }
        );
        queued.push({ ...candidate, remoteJid, queued: true });
      }
    }

    await logOperationalEvent(db, {
      type: "whatsapp_automations",
      title: queueFollowups ? "Pós-venda enfileirado" : dryRun ? "Automações simuladas" : "Automações executadas",
      status: candidates.length || operationalActions.length ? "info" : "success",
      source: "whatsapp",
      message: `${candidates.length} candidato(s), ${queued.length} pós-venda(s) enfileirado(s), ${operationalActions.length} ação(ões) operacional(is), ${sent.length} envio(s).`,
      metadata: {
        dryRun,
        queueFollowups,
        candidateCount: candidates.length,
        queuedCount: queued.length,
        operationalActionCount: operationalActions.length,
        sentCount: sent.length,
      },
    });

    return res.status(200).json({
      ok: true,
      dryRun,
      candidates,
      operationalActions,
      queuedCount: queued.length,
      queued,
      sentCount: sent.length,
      sent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp automations failed";
    console.error("WhatsApp automations failed", { error: message });
    await logOperationalEvent(getAdminDb(), {
      type: "whatsapp_automations",
      title: "Falha nas automações do WhatsApp",
      status: "error",
      source: "whatsapp",
      message,
    });
    return res.status(500).json({ ok: false, error: message });
  }
}
