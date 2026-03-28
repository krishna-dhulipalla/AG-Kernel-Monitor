/**
 * Snapshot diffing engine — tracks conversation growth over time.
 *
 * On each scan:
 *   - Diff current state against last snapshot in SQLite
 *   - Calculate delta_bytes, delta_tokens, delta_messages
 *   - Persist new snapshot
 *   - Provide historical trend data
 */

import { MonitorDB, type Snapshot, type Conversation } from "../db/schema";

export interface SnapshotDelta {
  conversationId: string;
  deltaBytes: number;
  deltaTokens: number;
  deltaMessages: number | null;
  previousSnapshot: Snapshot | null;
  isNew: boolean;
}

export interface TrendData {
  conversationId: string;
  snapshots: Snapshot[];
  totalGrowthBytes: number;
  totalGrowthTokens: number;
  averageGrowthRatePerHour: number;
  durationHours: number;
}

/**
 * Take a snapshot of a conversation and calculate delta from the last snapshot.
 */
export function takeSnapshot(db: MonitorDB, conversation: Conversation): SnapshotDelta {
  const lastSnap = db.getLatestSnapshot(conversation.id);
  const now = new Date().toISOString();

  const deltaBytes = lastSnap
    ? conversation.pb_file_bytes - (lastSnap.pb_file_bytes || 0)
    : 0;

  const deltaTokens = lastSnap
    ? conversation.estimated_tokens - (lastSnap.estimated_tokens || 0)
    : 0;

  const deltaMessages = lastSnap && conversation.message_count !== null && lastSnap.message_count !== null
    ? conversation.message_count - lastSnap.message_count
    : null;

  db.insertSnapshot({
    conversation_id: conversation.id,
    timestamp: now,
    pb_file_bytes: conversation.pb_file_bytes,
    estimated_tokens: conversation.estimated_tokens,
    message_count: conversation.message_count,
    delta_bytes: deltaBytes,
  });

  return {
    conversationId: conversation.id,
    deltaBytes,
    deltaTokens,
    deltaMessages,
    previousSnapshot: lastSnap,
    isNew: lastSnap === null,
  };
}

/**
 * Get trend data for a conversation.
 */
export function getTrend(db: MonitorDB, conversationId: string, limit = 50): TrendData | null {
  const snapshots = db.getSnapshotHistory(conversationId, limit);

  if (snapshots.length === 0) return null;

  const newest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const totalGrowthBytes = (newest.pb_file_bytes || 0) - (oldest.pb_file_bytes || 0);
  const totalGrowthTokens = (newest.estimated_tokens || 0) - (oldest.estimated_tokens || 0);

  const newestTime = new Date(newest.timestamp).getTime();
  const oldestTime = new Date(oldest.timestamp).getTime();
  const durationHours = Math.max((newestTime - oldestTime) / (1000 * 60 * 60), 0.001);

  const averageGrowthRatePerHour = totalGrowthTokens / durationHours;

  return {
    conversationId,
    snapshots,
    totalGrowthBytes,
    totalGrowthTokens,
    averageGrowthRatePerHour,
    durationHours,
  };
}

/**
 * Format a delta for display.
 */
export function formatDelta(delta: number, suffix = ""): string {
  const sign = delta >= 0 ? "+" : "";
  if (Math.abs(delta) >= 1_000_000) return `${sign}${(delta / 1_000_000).toFixed(1)}M${suffix}`;
  if (Math.abs(delta) >= 1_000) return `${sign}${(delta / 1_000).toFixed(0)}K${suffix}`;
  return `${sign}${delta}${suffix}`;
}
