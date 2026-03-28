/**
 * Data reconciler — orchestrates ingestion, mapping, and persistence.
 */

import { type WorkspaceEntry, parseStorageJson } from "./storage-json";
import { parseStateVscdb, type TrajectorySummary } from "./state-vscdb";
import { type WorkspaceStorageEntry, scanWorkspaceStorage } from "./workspace-storage";
import { scanConversations } from "../scanner/conversation-scanner";
import { scanBrainFolders, type BrainScanEntry } from "../scanner/brain-scanner";
import { type Conversation, MonitorDB } from "../db/schema";
import { estimateConversationMetrics } from "../metrics/estimator";
import { takeSnapshotIfChanged } from "../metrics/snapshotter";
import { scanLatestLogFile } from "../runtime/log-signals";
import type { AgKernelConfig } from "../config";
import {
  extractWorkspaceNameFromUri,
  normalizeWorkspaceUri,
  uriMatchesWorkspaceRoot,
} from "../uri-utils";

export interface ReconcilerStats {
  workspacesFound: number;
  conversationsTotal: number;
  conversationsMapped: number;
  conversationsUnmapped: number;
  brainFoldersFound: number;
  orphanBrainFolders: number;
  orphanAnnotations: number;
  totalPbBytes: number;
  totalBrainBytes: number;
}

interface WorkspaceRegistryEntry {
  id: string;
  uri: string;
  normalizedUri: string;
  name: string;
}

interface MappingResult {
  workspaceId: string;
  workspaceUri: string;
  mappingSource: string;
  mappingConfidence: number;
  mappingNotes: string;
}

const UNMAPPED_WORKSPACE_ID = "__unmapped__";
const UNMAPPED_WORKSPACE_URI = "__unmapped__";

function toIsoString(timestamp: string): string | null {
  const date = new Date(timestamp.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildWorkspaceRegistry(
  storageWorkspaces: WorkspaceEntry[],
  workspaceStorageEntries: WorkspaceStorageEntry[],
): Map<string, WorkspaceRegistryEntry> {
  const registry = new Map<string, WorkspaceRegistryEntry>();

  const addWorkspace = (entry: { hash: string; uri: string; normalizedUri: string; name: string }) => {
    if (!entry.normalizedUri) return;
    if (registry.has(entry.normalizedUri)) return;

    registry.set(entry.normalizedUri, {
      id: entry.hash,
      uri: entry.uri,
      normalizedUri: entry.normalizedUri,
      name: entry.name || extractWorkspaceNameFromUri(entry.uri),
    });
  };

  for (const workspace of storageWorkspaces) {
    addWorkspace(workspace);
  }

  for (const workspace of workspaceStorageEntries) {
    addWorkspace(workspace);
  }

  registry.set(UNMAPPED_WORKSPACE_URI, {
    id: UNMAPPED_WORKSPACE_ID,
    uri: UNMAPPED_WORKSPACE_URI,
    normalizedUri: UNMAPPED_WORKSPACE_URI,
    name: "[Unmapped]",
  });

  return registry;
}

function findWorkspaceMatch(
  candidateUris: string[],
  registry: Map<string, WorkspaceRegistryEntry>,
  sourcePrefix: string,
  exactConfidence: number,
  prefixConfidence: number,
): MappingResult | null {
  for (const candidate of candidateUris) {
    const normalizedCandidate = normalizeWorkspaceUri(candidate);
    if (!normalizedCandidate) continue;

    const exact = registry.get(normalizedCandidate);
    if (exact && exact.id !== UNMAPPED_WORKSPACE_ID) {
      return {
        workspaceId: exact.id,
        workspaceUri: exact.uri,
        mappingSource: `${sourcePrefix}_exact`,
        mappingConfidence: exactConfidence,
        mappingNotes: `Matched normalized workspace URI from ${sourcePrefix}.`,
      };
    }

    for (const workspace of registry.values()) {
      if (workspace.id === UNMAPPED_WORKSPACE_ID) continue;
      if (uriMatchesWorkspaceRoot(normalizedCandidate, workspace.normalizedUri)) {
        return {
          workspaceId: workspace.id,
          workspaceUri: workspace.uri,
          mappingSource: `${sourcePrefix}_prefix`,
          mappingConfidence: prefixConfidence,
          mappingNotes: `Matched a file URI beneath the workspace root from ${sourcePrefix}.`,
        };
      }
    }
  }

  return null;
}

function findWorkspaceByTitleHint(
  titleCandidates: Array<string | undefined>,
  registry: Map<string, WorkspaceRegistryEntry>,
): MappingResult | null {
  const matches = new Map<string, WorkspaceRegistryEntry>();

  for (const rawTitle of titleCandidates) {
    const title = rawTitle?.trim();
    if (!title) continue;

    const normalizedTitle = title.toLowerCase();
    for (const workspace of registry.values()) {
      if (workspace.id === UNMAPPED_WORKSPACE_ID) continue;
      const name = workspace.name.trim();
      if (name.length < 4) continue;

      if (normalizedTitle.includes(name.toLowerCase())) {
        matches.set(workspace.id, workspace);
      }
    }
  }

  if (matches.size !== 1) {
    return null;
  }

  const workspace = Array.from(matches.values())[0]!;
  return {
    workspaceId: workspace.id,
    workspaceUri: workspace.uri,
    mappingSource: "title_hint",
    mappingConfidence: 0.55,
    mappingNotes: "Matched the workspace name from conversation or brain-title text because no URI signal was available.",
  };
}

function buildUnmappedReason(
  trajectory: TrajectorySummary | undefined,
  brain: BrainScanEntry | undefined,
): string {
  const stateUriCount = trajectory?.workspaceUris.length ?? 0;
  const brainUriCount = brain?.workspaceUris.length ?? 0;
  const titleHints = [trajectory?.title, brain?.title].filter((value): value is string => Boolean(value?.trim()));

  if (stateUriCount === 0 && brainUriCount === 0 && titleHints.length === 0) {
    return "No workspace URI, brain URI, or usable title hint was found.";
  }

  const parts: string[] = [];
  if (stateUriCount > 0) {
    parts.push(`state.vscdb exposed ${stateUriCount} workspace URI${stateUriCount > 1 ? "s" : ""} but none matched a known workspace`);
  }
  if (brainUriCount > 0) {
    parts.push(`brain artifacts exposed ${brainUriCount} workspace URI${brainUriCount > 1 ? "s" : ""} but none matched a known workspace`);
  }
  if (titleHints.length > 0) {
    parts.push(`title hints (${titleHints.map((title) => `"${title}"`).join(", ")}) did not uniquely identify a workspace`);
  }

  return `${parts.join("; ")}.`;
}

function chooseLastActive(
  conversationId: string,
  annotationTimestamp: number | null,
  lastModified: Date,
  logSignals: ReturnType<typeof scanLatestLogFile>,
): { lastActiveAt: string; activitySource: string } {
  const logTimestamp = logSignals.lastActivityAt.get(conversationId);
  if (logTimestamp) {
    const iso = toIsoString(logTimestamp);
    if (iso) {
      return { lastActiveAt: iso, activitySource: "log" };
    }
  }

  if (annotationTimestamp) {
    return {
      lastActiveAt: new Date(annotationTimestamp).toISOString(),
      activitySource: "annotation",
    };
  }

  return {
    lastActiveAt: lastModified.toISOString(),
    activitySource: "filesystem",
  };
}

function indexTrajectories(trajectories: TrajectorySummary[]): Map<string, TrajectorySummary> {
  const map = new Map<string, TrajectorySummary>();
  for (const trajectory of trajectories) {
    map.set(trajectory.conversationId, trajectory);
  }
  return map;
}

export async function reconcile(db: MonitorDB, config: AgKernelConfig): Promise<ReconcilerStats> {
  const stats: ReconcilerStats = {
    workspacesFound: 0,
    conversationsTotal: 0,
    conversationsMapped: 0,
    conversationsUnmapped: 0,
    brainFoldersFound: 0,
    orphanBrainFolders: 0,
    orphanAnnotations: 0,
    totalPbBytes: 0,
    totalBrainBytes: 0,
  };

  const storageResult = parseStorageJson();
  const workspaceStorageEntries = scanWorkspaceStorage();
  const workspaceRegistry = buildWorkspaceRegistry(
    storageResult?.workspaces ?? [],
    workspaceStorageEntries,
  );

  const stateResult = parseStateVscdb();
  const trajectoryByConversation = indexTrajectories(stateResult?.trajectories ?? []);
  const logSignals = scanLatestLogFile();

  const conversations = scanConversations();
  const brainEntries = scanBrainFolders();
  const brainByConversation = new Map<string, BrainScanEntry>();

  for (const brainEntry of brainEntries) {
    brainByConversation.set(brainEntry.conversationId, brainEntry);
  }

  const now = new Date().toISOString();
  for (const workspace of workspaceRegistry.values()) {
    db.upsertWorkspace({
      id: workspace.id,
      uri: workspace.uri,
      name: workspace.name,
      last_seen: now,
    });
  }
  stats.workspacesFound = workspaceRegistry.size;

  const scannedConversationIds: string[] = [];
  const activeConversationId = logSignals.activeConversationId;

  for (const conversationEntry of conversations) {
    scannedConversationIds.push(conversationEntry.id);
    const brain = brainByConversation.get(conversationEntry.id);
    const trajectory = trajectoryByConversation.get(conversationEntry.id);

    const stateUris = trajectory?.workspaceUris ?? (trajectory?.workspaceUri ? [trajectory.workspaceUri] : []);
    const brainUris = brain?.workspaceUris ?? [];

    const mapping = findWorkspaceMatch(stateUris, workspaceRegistry, "state_vscdb", 1.0, 0.92)
      ?? findWorkspaceMatch(brainUris, workspaceRegistry, "brain_artifact", 0.8, 0.72)
      ?? findWorkspaceByTitleHint([trajectory?.title, brain?.title], workspaceRegistry)
      ?? {
        workspaceId: UNMAPPED_WORKSPACE_ID,
        workspaceUri: UNMAPPED_WORKSPACE_URI,
        mappingSource: "unmapped",
        mappingConfidence: 0,
        mappingNotes: buildUnmappedReason(trajectory, brain),
      };

    if (mapping.workspaceId === UNMAPPED_WORKSPACE_ID) {
      stats.conversationsUnmapped++;
    } else {
      stats.conversationsMapped++;
    }

    const directMessageCount = logSignals.messageCounts.get(conversationEntry.id);
    const messageCount = directMessageCount ?? trajectory?.messageCount ?? null;
    const messageCountSource = directMessageCount !== undefined
      ? "log"
      : trajectory?.messageCount !== undefined
        ? "state_vscdb"
        : null;

    const activity = chooseLastActive(
      conversationEntry.id,
      conversationEntry.annotationTimestamp,
      conversationEntry.lastModified,
      logSignals,
    );

    const metrics = estimateConversationMetrics({
      pbFileBytes: conversationEntry.pbFileBytes,
      brainFolderBytes: brain?.totalBytes ?? 0,
      messageCount,
      resolvedVersionCount: brain?.resolvedVersionCount ?? 0,
      bytesPerToken: config.bytesPerToken,
    });

    const canonicalConversation: Conversation = {
      id: conversationEntry.id,
      workspace_id: mapping.workspaceId,
      title: trajectory?.title ?? brain?.title ?? null,
      pb_file_bytes: conversationEntry.pbFileBytes,
      brain_folder_bytes: brain?.totalBytes ?? 0,
      brain_artifact_count: brain?.artifactCount ?? 0,
      resolved_version_count: brain?.resolvedVersionCount ?? 0,
      message_count: messageCount,
      message_count_source: messageCountSource,
      estimated_prompt_tokens: metrics.estimatedPromptTokens,
      estimated_artifact_tokens: metrics.estimatedArtifactTokens,
      estimated_tokens: metrics.estimatedTotalTokens,
      annotation_timestamp: conversationEntry.annotationTimestamp,
      created_at: conversationEntry.createdAt.toISOString(),
      last_modified: conversationEntry.lastModified.toISOString(),
      last_active_at: activity.lastActiveAt,
      activity_source: activity.activitySource,
      mapping_source: mapping.mappingSource,
      mapping_confidence: mapping.mappingConfidence,
      mapping_notes: mapping.mappingNotes,
      is_active: activeConversationId === conversationEntry.id ? 1 : 0,
    };

    db.upsertConversation(canonicalConversation);
    takeSnapshotIfChanged(db, canonicalConversation);

    stats.totalPbBytes += canonicalConversation.pb_file_bytes;
    stats.totalBrainBytes += canonicalConversation.brain_folder_bytes;
  }

  db.deleteConversationsNotIn(scannedConversationIds);

  for (const workspace of workspaceRegistry.values()) {
    db.updateWorkspaceAggregates(workspace.id);
  }

  const scannedConversationIdSet = new Set(scannedConversationIds);
  for (const brainEntry of brainEntries) {
    if (!scannedConversationIdSet.has(brainEntry.conversationId)) {
      stats.orphanBrainFolders++;
    }
  }

  stats.conversationsTotal = conversations.length;
  stats.brainFoldersFound = brainEntries.length;
  return stats;
}
