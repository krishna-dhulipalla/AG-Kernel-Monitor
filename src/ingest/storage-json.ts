/**
 * Parse storage.json from Electron globalStorage.
 *
 * Extracts:
 *   - profileAssociations.workspaces → Map<hash, workspaceURI>
 *   - antigravityUnifiedStateSync.sidebarWorkspaces → active workspace state
 *   - antigravityUnifiedStateSync.scratchWorkspaces → playground workspaces
 */

import { readFileSync, existsSync } from "fs";
import { getStorageJsonPath } from "../paths";
import { extractWorkspaceNameFromUri, normalizeWorkspaceUri } from "../uri-utils";

export interface WorkspaceEntry {
  hash: string;
  uri: string;
  normalizedUri: string;
  name: string;
}

export interface StorageJsonResult {
  workspaces: WorkspaceEntry[];
  sidebarWorkspaces: SidebarWorkspace[];
  scratchWorkspaces: ScratchWorkspace[];
  raw: Record<string, unknown>;
}

export interface SidebarWorkspace {
  uri: string;
  name: string;
  isActive?: boolean;
}

export interface ScratchWorkspace {
  uri: string;
  name: string;
}

/**
 * Parse the global storage.json file for workspace registry.
 */
export function parseStorageJson(customPath?: string): StorageJsonResult | null {
  const storagePath = customPath || getStorageJsonPath();

  if (!existsSync(storagePath)) {
    console.warn(`⚠️  storage.json not found at: ${storagePath}`);
    return null;
  }

  let raw: Record<string, unknown>;
  try {
    const content = readFileSync(storagePath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    console.error(`❌ Failed to parse storage.json:`, err);
    return null;
  }

  // ── Extract profileAssociations.workspaces ──
  const workspaces: WorkspaceEntry[] = [];
  const profileAssociations = raw["profileAssociations"] as Record<string, unknown> | undefined;
  if (profileAssociations && typeof profileAssociations === "object") {
    const wsMap = profileAssociations["workspaces"] as Record<string, string> | undefined;
    if (wsMap && typeof wsMap === "object") {
      for (const [uri, profileId] of Object.entries(wsMap)) {
        // The key is the workspace URI, the value is the profile ID
        const hash = generateWorkspaceHash(uri);
        const normalizedUri = normalizeWorkspaceUri(uri);
        if (!normalizedUri) continue;
        workspaces.push({
          hash,
          uri,
          normalizedUri,
          name: extractWorkspaceNameFromUri(uri),
        });
      }
    }
  }

  // ── Extract sidebarWorkspaces ──
  const sidebarWorkspaces: SidebarWorkspace[] = [];
  const unifiedState = raw["antigravityUnifiedStateSync"] as Record<string, unknown> | undefined;
  if (unifiedState && typeof unifiedState === "object") {
    const sidebar = unifiedState["sidebarWorkspaces"];
    if (Array.isArray(sidebar)) {
      for (const entry of sidebar) {
        if (entry && typeof entry === "object" && "uri" in entry) {
          sidebarWorkspaces.push({
            uri: String(entry.uri),
            name: extractWorkspaceNameFromUri(String(entry.uri)),
            isActive: Boolean(entry.isActive),
          });
        }
      }
    } else if (typeof sidebar === "string") {
      try {
        const parsed = JSON.parse(sidebar);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry === "object" && "uri" in entry) {
              sidebarWorkspaces.push({
                uri: String(entry.uri),
                name: extractWorkspaceNameFromUri(String(entry.uri)),
                isActive: Boolean(entry.isActive),
              });
            }
          }
        }
      } catch {
        // Not JSON, skip
      }
    }
  }

  // ── Extract scratchWorkspaces ──
  const scratchWorkspaces: ScratchWorkspace[] = [];
  if (unifiedState && typeof unifiedState === "object") {
    const scratch = unifiedState["scratchWorkspaces"];
    if (Array.isArray(scratch)) {
      for (const entry of scratch) {
        if (entry && typeof entry === "object" && "uri" in entry) {
          scratchWorkspaces.push({
            uri: String(entry.uri),
            name: extractWorkspaceNameFromUri(String(entry.uri)),
          });
        }
      }
    } else if (typeof scratch === "string") {
      try {
        const parsed = JSON.parse(scratch);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry === "object" && "uri" in entry) {
              scratchWorkspaces.push({
                uri: String(entry.uri),
                name: extractWorkspaceNameFromUri(String(entry.uri)),
              });
            }
          }
        }
      } catch {
        // Not JSON, skip
      }
    }
  }

  return { workspaces, sidebarWorkspaces, scratchWorkspaces, raw };
}

/**
 * Generate a deterministic hash for a workspace URI.
 * Uses the same hashing approach VS Code uses for workspaceStorage folder names.
 */
function generateWorkspaceHash(uri: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(uri);
  return hasher.digest("hex");
}
