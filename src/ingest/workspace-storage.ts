/**
 * Scan Electron workspaceStorage directories.
 *
 * Each workspace gets a hashed folder under:
 *   %APPDATA%/Antigravity/User/workspaceStorage/<hash>/workspace.json
 *
 * workspace.json contains the workspace URI for that hash.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { getWorkspaceStorageDir } from "../paths";
import { extractWorkspaceNameFromUri, normalizeWorkspaceUri } from "../uri-utils";

export interface WorkspaceStorageEntry {
  hash: string;
  uri: string;
  normalizedUri: string;
  name: string;
}

/**
 * Scan workspace storage directories for workspace.json files.
 * Returns a map of hash → workspace URI.
 */
export function scanWorkspaceStorage(customPath?: string): WorkspaceStorageEntry[] {
  const storageDir = customPath || getWorkspaceStorageDir();

  if (!existsSync(storageDir)) {
    console.warn(`⚠️  workspaceStorage directory not found at: ${storageDir}`);
    return [];
  }

  const entries: WorkspaceStorageEntry[] = [];

  try {
    const hashDirs = readdirSync(storageDir, { withFileTypes: true });

    for (const dir of hashDirs) {
      if (!dir.isDirectory()) continue;

      const wsJsonPath = join(storageDir, dir.name, "workspace.json");
      if (!existsSync(wsJsonPath)) continue;

      try {
        const content = readFileSync(wsJsonPath, "utf-8");
        const parsed = JSON.parse(content);

        // workspace.json typically has a { folder: "file:///..." } structure
        const uri = parsed.folder || parsed.workspace || parsed.uri || "";
        if (uri) {
          const normalizedUri = normalizeWorkspaceUri(String(uri));
          if (!normalizedUri) continue;
          entries.push({
            hash: dir.name,
            uri: String(uri),
            normalizedUri,
            name: extractWorkspaceNameFromUri(String(uri)),
          });
        }
      } catch {
        // Skip malformed workspace.json files
      }
    }
  } catch (err) {
    console.error(`❌ Failed to scan workspaceStorage:`, err);
  }

  return entries;
}
