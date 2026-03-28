/**
 * Brain scanner — analyzes brain/<uuid> folders for planning artifacts.
 *
 * Per brain folder:
 *   - Total bytes, file count, artifact types
 *   - Count .resolved.N files → estimate turn count
 *   - Parse *.metadata.json for additional metadata
 *   - Detect workspace URIs from file:// paths in markdown files
 */

import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { getBrainDir } from "../paths";

export interface BrainScanEntry {
  conversationId: string;
  totalBytes: number;
  fileCount: number;
  artifactCount: number;
  resolvedVersionCount: number;
  workspaceUris: string[];
  brainPath: string;
}

/**
 * Recursively calculate directory size and count files.
 */
function dirStats(dirPath: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = dirStats(fullPath);
        totalBytes += sub.totalBytes;
        fileCount += sub.fileCount;
      } else if (entry.isFile()) {
        try {
          totalBytes += statSync(fullPath).size;
          fileCount++;
        } catch {
          // Skip unstatable files
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return { totalBytes, fileCount };
}

/**
 * Count .resolved.N files in a brain folder (indicates model turns).
 */
function countResolvedVersions(dirPath: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /\.resolved\.\d+$/.test(entry.name)) {
        count++;
      }
      if (entry.isDirectory()) {
        count += countResolvedVersions(join(dirPath, entry.name));
      }
    }
  } catch {
    // Ignore
  }
  return count;
}

/**
 * Count artifact files (non-metadata, non-resolved files).
 */
function countArtifacts(dirPath: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countArtifacts(join(dirPath, entry.name));
      } else if (entry.isFile()) {
        // Skip metadata files and resolved versions
        if (
          !entry.name.endsWith(".metadata.json") &&
          !/\.resolved\.\d+$/.test(entry.name) &&
          entry.name !== "overview.txt"
        ) {
          count++;
        }
      }
    }
  } catch {
    // Ignore
  }
  return count;
}

/**
 * Extract file:// workspace URIs from markdown files in a brain folder.
 * Used as a secondary workspace mapping signal.
 */
function extractWorkspaceUris(dirPath: string): string[] {
  const uris = new Set<string>();

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        for (const uri of extractWorkspaceUris(fullPath)) {
          uris.add(uri);
        }
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          // Match file:// URIs pointing to project directories
          const matches = content.matchAll(/file:\/\/\/[^\s)"\]]+/g);
          for (const match of matches) {
            // Extract the workspace root (first 3-4 path segments)
            const uri = match[0];
            const pathMatch = uri.match(/^(file:\/\/\/(?:[^/]+\/){3,4}[^/]+)/);
            if (pathMatch) {
              uris.add(pathMatch[1]);
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Ignore
  }

  return Array.from(uris);
}

/**
 * Scan all brain/<uuid> folders.
 */
export function scanBrainFolders(customPath?: string): BrainScanEntry[] {
  const brainDir = customPath || getBrainDir();

  if (!existsSync(brainDir)) {
    console.warn(`⚠️  brain directory not found at: ${brainDir}`);
    return [];
  }

  const entries: BrainScanEntry[] = [];

  try {
    const dirs = readdirSync(brainDir, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      // Skip non-UUID-looking directories
      const name = dir.name;
      if (name.startsWith(".")) continue;

      const brainPath = join(brainDir, name);
      const stats = dirStats(brainPath);
      const resolvedCount = countResolvedVersions(brainPath);
      const artifactCount = countArtifacts(brainPath);
      const workspaceUris = extractWorkspaceUris(brainPath);

      entries.push({
        conversationId: name,
        totalBytes: stats.totalBytes,
        fileCount: stats.fileCount,
        artifactCount,
        resolvedVersionCount: resolvedCount,
        workspaceUris,
        brainPath,
      });
    }
  } catch (err) {
    console.error(`❌ Failed to scan brain folders:`, err);
  }

  return entries.sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Get brain data for a single conversation.
 */
export function getBrainEntry(conversationId: string, customPath?: string): BrainScanEntry | null {
  const brainDir = customPath || getBrainDir();
  const brainPath = join(brainDir, conversationId);

  if (!existsSync(brainPath)) return null;

  const stats = dirStats(brainPath);
  return {
    conversationId,
    totalBytes: stats.totalBytes,
    fileCount: stats.fileCount,
    artifactCount: countArtifacts(brainPath),
    resolvedVersionCount: countResolvedVersions(brainPath),
    workspaceUris: extractWorkspaceUris(brainPath),
    brainPath,
  };
}
