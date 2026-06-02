import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../_lib/firebaseAdmin.js";

async function callJson(baseUrl: string, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Promokit cron request failed: ${path}`);
  }

  return data;
}

function getBaseUrl(req: VercelRequest) {
  const host = req.headers.host || process.env.VERCEL_URL;
  if (!host) {
    throw new Error("Unable to resolve deployment host for Promokit cron sync.");
  }
  return `https://${host}`;
}

function isAuthorized(req: VercelRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "POST"].includes(req.method || "")) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const db = getAdminDb();
    const baseUrl = getBaseUrl(req);
    const leadStateRef = db.collection("promokit_sync_state").doc("leads_todos");
    const leadState = await leadStateRef.get();
    const lastLeadOrderCode = String(req.body?.lastLeadOrderCode || req.query.lastLeadOrderCode || leadState.data()?.lastOrderCode || "1");

    const newOrders = await callJson(baseUrl, "/api/promokit/sync-new-orders", {
      take: Number(req.body?.newOrdersTake || req.query.newOrdersTake || 20),
      status: String(req.body?.status || req.query.status || "novo"),
    });

    const leads = await callJson(baseUrl, "/api/promokit/sync-orders", {
      lastOrderCode: lastLeadOrderCode,
      take: Number(req.body?.leadsTake || req.query.leadsTake || 50),
      status: "todos",
      processSales: false,
    });

    await leadStateRef.set(
      {
        status: "todos",
        lastOrderCode: leads.nextLastOrderCode || lastLeadOrderCode,
        lastRunAt: FieldValue.serverTimestamp(),
        lastCount: leads.count || 0,
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      newOrders,
      leads,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promokit cron sync failed";
    console.error("Promokit cron sync failed", { error: message });
    return res.status(500).json({ ok: false, error: message });
  }
}
