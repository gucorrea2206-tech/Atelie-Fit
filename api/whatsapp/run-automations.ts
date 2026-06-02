import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_lib/firebaseAdmin.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { getWhatsappAiConfig } from "../_lib/whatsappAiConfig.js";

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

function isRecentEnough(days: number | null, triggerDays: number) {
  return days !== null && days >= 0 && days <= triggerDays;
}

function isInactiveEnough(days: number | null, triggerDays: number) {
  return days !== null && days >= triggerDays;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    const input = req.body || {};
    const dryRun = input.dryRun !== false;
    const config = await getWhatsappAiConfig();
    const automations: AutomationConfig[] = Array.isArray(input.automations) ? input.automations : config.automations;
    const activeAutomations = automations.filter((automation) => automation.enabled);
    const customersSnapshot = await db.collection("promokit_customers").limit(200).get();
    const candidates: any[] = [];
    const sent: any[] = [];
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

    if (!dryRun) {
      for (const candidate of candidates) {
        const remoteJid = buildRemoteJid(candidate.phone);
        if (!remoteJid) continue;
        const result = await sendWhatsAppText(remoteJid, candidate.message);
        sent.push({ ...candidate, result });
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      candidates,
      operationalActions,
      sentCount: sent.length,
      sent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp automations failed";
    console.error("WhatsApp automations failed", { error: message });
    return res.status(500).json({ ok: false, error: message });
  }
}
