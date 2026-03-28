/**
 * Snapshot helpers for trend tracking.
 *
 * Snapshots are only persisted when the conversation materially changes. This
 * keeps delta calculations useful and avoids inflating history with duplicate
 * rows from repeated scans.
 */

import { MonitorDB, type Conversation, type Snapshot } from "../db/schema";

export interface SnapshotDelta {
  conversationId: string;
  deltaBytes: number;
  deltaTokens: number;
  deltaMessages: number | null;
  previousSnapshot: Snapshot | null;
  isNew: boolean;
  changed: boolean;
}

export interface TrendData {
  conversationId: string;
  snapshots: Snapshot[];
  totalGrowthBytes: number;
  totalGrowthTokens: number;
  averageGrowthRatePerHour: number;
  durationHours: number;
}

export function takeSnapshotIfChanged(db: MonitorDB, conversation: Conversation): SnapshotDelta {
  const lastSnapshot = db.getLatestSnapshot(conversation.id);
  const now = new Date().toISOString();

  const previousBytes = lastSnapshot?.pb_file_bytes ?? 0;
  const previousTokens = lastSnapshot?.estimated_tokens ?? 0;

  const deltaBytes = conversation.pb_file_bytes - previousBytes;
  const deltaTokens = conversation.estimated_tokens - previousTokens;
  const deltaMessages = lastSnapshot && conversation.message_count !== null && lastSnapshot.message_count !== null
    ? conversation.message_count - lastSnapshot.message_count
    : null;

  const changed = lastSnapshot === null
    || deltaBytes !== 0
    || deltaTokens !== 0
    || deltaMessages !== null;

  if (changed) {
    db.insertSnapshot({
      conversation_id: conversation.id,
      timestamp: now,
      pb_file_bytes: conversation.pb_file_bytes,
      estimated_tokens: conversation.estimated_tokens,
      message_count: conversation.message_count,
      delta_bytes: deltaBytes,
    });
  }

  return {
    conversationId: conversation.id,
    deltaBytes,
    deltaTokens,
    deltaMessages,
    previousSnapshot: lastSnapshot,
    isNew: lastSnapshot === null,
    changed,
  };
}

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

  return {
    conversationId,
    snapshots,
    totalGrowthBytes,
    totalGrowthTokens,
    averageGrowthRatePerHour: totalGrowthTokens / durationHours,
    durationHours,
  };
}

export function getLatestDeltaTokens(db: MonitorDB, conversationId: string): number {
  const snapshots = db.getSnapshotHistory(conversationId, 2);
  if (snapshots.length < 2) {
    return 0;
  }

  return (snapshots[0].estimated_tokens || 0) - (snapshots[1].estimated_tokens || 0);
}

export function formatDelta(delta: number, suffix = ""): string {
  const sign = delta >= 0 ? "+" : "";
  if (Math.abs(delta) >= 1_000_000) return `${sign}${(delta / 1_000_000).toFixed(1)}M${suffix}`;
  if (Math.abs(delta) >= 1_000) return `${sign}${(delta / 1_000).toFixed(0)}K${suffix}`;
  return `${sign}${delta}${suffix}`;
}
