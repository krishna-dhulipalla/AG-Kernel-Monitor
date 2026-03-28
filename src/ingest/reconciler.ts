/**
 * Data reconciler — orchestrates all ingestion modules.
 *
 * Merges workspace mappings from all sources:
 *   1. storage.json (wins conflicts)
 *   2. state.vscdb ChatSessionStore.index
 *   3. workspace storage directory scan
 *   4. Brain folder file:// path extraction
 *
 * Writes complete data to SQLite: workspaces + conversations tables.
 * Takes initial snapshot into snapshots table.
 */

import { parseStorageJson, type WorkspaceEntry } from "./storage-json";
import { parseStateVscdb } from "./state-vscdb";
import { scanWorkspaceStorage } from "./workspace-storage";
import { scanConversations } from "../scanner/conversation-scanner";
import { scanBrainFolders, type BrainScanEntry } from "../scanner/brain-scanner";
import { MonitorDB, type Conversation } from "../db/schema";
import { estimateTokens } from "../metrics/estimator";
import type { AgKernelConfig } from "../config";

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

/**
 * Extract workspace name from URI.
 */
function extractNameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded.replace(/\/$/, "").split("/");
    return parts[parts.length - 1] || decoded;
  } catch {
    return uri;
  }
}

/**
 * Run the full ingestion pipeline and populate the database.
 */
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

  // ── 1. Build the workspace registry from all sources ──

  // Primary: storage.json
  const storageResult = parseStorageJson();
  const workspaceMap = new Map<string, { id: string; uri: string; name: string }>();

  if (storageResult) {
    for (const ws of storageResult.workspaces) {
      workspaceMap.set(ws.uri, {
        id: ws.hash,
        uri: ws.uri,
        name: ws.name,
      });
    }

    // Add sidebar workspaces that might not be in profileAssociations
    for (const sw of storageResult.sidebarWorkspaces) {
      if (!workspaceMap.has(sw.uri)) {
        const hasher = new Bun.CryptoHasher("md5");
        hasher.update(sw.uri);
        workspaceMap.set(sw.uri, {
          id: hasher.digest("hex"),
          uri: sw.uri,
          name: sw.name,
        });
      }
    }
  }

  // Secondary: workspace storage directory scan
  const wsStorageEntries = scanWorkspaceStorage();
  for (const wse of wsStorageEntries) {
    if (!workspaceMap.has(wse.uri)) {
      workspaceMap.set(wse.uri, {
        id: wse.hash,
        uri: wse.uri,
        name: wse.name,
      });
    }
  }

  // ── 2. Build conversation → workspace mapping ──

  const convToWorkspace = new Map<string, string>(); // conversationId → workspace URI

  // Primary: state.vscdb ChatSessionStore
  const stateResult = parseStateVscdb();
  if (stateResult) {
    for (const [sessionId, wsUri] of stateResult.sessionToWorkspace) {
      convToWorkspace.set(sessionId, wsUri);
    }
  }

  // ── 3. Scan conversations (.pb files) ──

  const conversations = scanConversations();
  stats.conversationsTotal = conversations.length;

  // ── 4. Scan brain folders ──

  const brainEntries = scanBrainFolders();
  stats.brainFoldersFound = brainEntries.length;

  // Build a map for quick brain lookup
  const brainMap = new Map<string, BrainScanEntry>();
  for (const be of brainEntries) {
    brainMap.set(be.conversationId, be);
  }

  // ── 5. Use brain folder file:// URIs as tertiary workspace mapping ──

  for (const be of brainEntries) {
    if (!convToWorkspace.has(be.conversationId) && be.workspaceUris.length > 0) {
      // Try to match brain workspace URIs to known workspaces
      for (const bUri of be.workspaceUris) {
        for (const [wsUri] of workspaceMap) {
          if (bUri.includes(extractNameFromUri(wsUri)) || wsUri.includes(extractNameFromUri(bUri))) {
            convToWorkspace.set(be.conversationId, wsUri);
            break;
          }
        }
        if (convToWorkspace.has(be.conversationId)) break;
      }
    }
  }

  // ── 6. Persist workspaces ──

  // Add a special "[Unmapped]" workspace for conversations without a workspace
  const unmappedId = "__unmapped__";
  workspaceMap.set("__unmapped__", {
    id: unmappedId,
    uri: "__unmapped__",
    name: "[Unmapped]",
  });

  // Add a special "[Playground]" workspace for scratch workspaces
  if (storageResult?.scratchWorkspaces && storageResult.scratchWorkspaces.length > 0) {
    const playgroundId = "__playground__";
    workspaceMap.set("__playground__", {
      id: playgroundId,
      uri: "__playground__",
      name: "[Playground]",
    });
  }

  const now = new Date().toISOString();
  for (const [, ws] of workspaceMap) {
    db.upsertWorkspace({
      id: ws.id,
      uri: ws.uri,
      name: ws.name,
      last_seen: now,
    });
  }
  stats.workspacesFound = workspaceMap.size;

  // ── 7. Persist conversations ──

  const conversationIds = new Set<string>();

  for (const conv of conversations) {
    conversationIds.add(conv.id);
    const brain = brainMap.get(conv.id);

    // Determine workspace
    let workspaceId: string | null = null;
    const wsUri = convToWorkspace.get(conv.id);
    if (wsUri && workspaceMap.has(wsUri)) {
      workspaceId = workspaceMap.get(wsUri)!.id;
      stats.conversationsMapped++;
    } else {
      workspaceId = unmappedId;
      stats.conversationsUnmapped++;
    }

    // Get message count from trajectories
    let messageCount: number | null = null;
    if (stateResult) {
      const traj = stateResult.trajectories.find((t) => t.conversationId === conv.id);
      if (traj?.messageCount) {
        messageCount = traj.messageCount;
      }
    }

    const conversation: Conversation = {
      id: conv.id,
      workspace_id: workspaceId,
      pb_file_bytes: conv.pbFileBytes,
      brain_folder_bytes: brain?.totalBytes ?? 0,
      brain_artifact_count: brain?.artifactCount ?? 0,
      resolved_version_count: brain?.resolvedVersionCount ?? 0,
      message_count: messageCount,
      estimated_tokens: estimateTokens({
        pbFileBytes: conv.pbFileBytes,
        brainFolderBytes: brain?.totalBytes ?? 0,
        messageCount,
        resolvedVersionCount: brain?.resolvedVersionCount ?? 0,
        bytesPerToken: config.bytesPerToken,
      }),
      annotation_timestamp: conv.annotationTimestamp,
      created_at: conv.createdAt.toISOString(),
      last_modified: conv.lastModified.toISOString(),
    };

    db.upsertConversation(conversation);
    stats.totalPbBytes += conv.pbFileBytes;
    stats.totalBrainBytes += brain?.totalBytes ?? 0;

    // Take snapshot
    const lastSnap = db.getLatestSnapshot(conv.id);
    const deltaBytes = lastSnap ? conv.pbFileBytes - (lastSnap.pb_file_bytes || 0) : 0;

    db.insertSnapshot({
      conversation_id: conv.id,
      timestamp: now,
      pb_file_bytes: conv.pbFileBytes,
      estimated_tokens: conversation.estimated_tokens,
      message_count: messageCount,
      delta_bytes: deltaBytes,
    });
  }

  // ── 8. Detect orphan brain folders ──

  for (const be of brainEntries) {
    if (!conversationIds.has(be.conversationId)) {
      stats.orphanBrainFolders++;
    }
  }

  // ── 9. Update workspace aggregates ──

  for (const [, ws] of workspaceMap) {
    db.updateWorkspaceAggregates(ws.id);
  }

  return stats;
}
