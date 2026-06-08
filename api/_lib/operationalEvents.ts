import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

export type OperationalEventStatus = "success" | "warning" | "error" | "info";

type OperationalEventInput = {
  type: string;
  title: string;
  status: OperationalEventStatus;
  message?: string;
  source?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function logOperationalEvent(db: Firestore, event: OperationalEventInput) {
  try {
    await db.collection("operational_events").add({
      ...event,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Operational event log failed", {
      error: error instanceof Error ? error.message : "Unknown event log error",
      eventType: event.type,
    });
  }
}
