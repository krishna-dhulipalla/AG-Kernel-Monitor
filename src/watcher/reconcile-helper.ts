import type { AgKernelConfig } from "../config";
import type { Conversation, MonitorDB } from "../db/schema";
import { reconcile } from "../ingest/reconciler";

let reconcileInFlight: Promise<void> | null = null;

export async function reconcileMonitorData(db: MonitorDB, config: AgKernelConfig): Promise<void> {
  if (!reconcileInFlight) {
    reconcileInFlight = reconcile(db, config)
      .then(() => undefined)
      .finally(() => {
        reconcileInFlight = null;
      });
  }

  await reconcileInFlight;
}

export async function ensureConversationLoaded(
  db: MonitorDB,
  config: AgKernelConfig,
  conversationId: string,
): Promise<Conversation | null> {
  const existing = db.getConversation(conversationId);
  if (existing) {
    return existing;
  }

  await reconcileMonitorData(db, config);
  return db.getConversation(conversationId);
}
