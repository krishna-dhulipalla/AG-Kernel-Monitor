/**
 * Conversation scanner — scans .pb files, annotations, and correlates with workspace mappings.
 *
 * Gathers:
 *   - conversations/*.pb → UUID, file size, mtime
 *   - annotations/<uuid>.pbtxt → last_user_view_time
 *   - Correlates conversation UUID with workspace (from state.vscdb and brain files)
 */

import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, basename, extname } from "path";
import { getConversationsDir, getAnnotationsDir } from "../paths";

export interface ConversationScanEntry {
  id: string;
  pbFilePath: string;
  pbFileBytes: number;
  createdAt: Date;
  lastModified: Date;
  annotationTimestamp: number | null;
}

export interface AnnotationData {
  conversationId: string;
  lastUserViewTime: number | null;
  rawContent: string;
}

/**
 * Scan the conversations directory for all .pb files.
 */
export function scanConversations(customPath?: string): ConversationScanEntry[] {
  const convDir = customPath || getConversationsDir();

  if (!existsSync(convDir)) {
    console.warn(`⚠️  conversations directory not found at: ${convDir}`);
    return [];
  }

  const entries: ConversationScanEntry[] = [];

  try {
    const files = readdirSync(convDir);

    for (const file of files) {
      if (extname(file) !== ".pb") continue;

      const filePath = join(convDir, file);
      const id = basename(file, ".pb");

      try {
        const stats = statSync(filePath);
        const annotation = readAnnotation(id);

        entries.push({
          id,
          pbFilePath: filePath,
          pbFileBytes: stats.size,
          createdAt: stats.birthtime,
          lastModified: stats.mtime,
          annotationTimestamp: annotation?.lastUserViewTime ?? null,
        });
      } catch {
        // Skip files we can't stat
      }
    }
  } catch (err) {
    console.error(`❌ Failed to scan conversations:`, err);
  }

  return entries.sort((a, b) => b.pbFileBytes - a.pbFileBytes);
}

/**
 * Read a single annotation .pbtxt file and extract last_user_view_time.
 */
export function readAnnotation(conversationId: string, customDir?: string): AnnotationData | null {
  const annDir = customDir || getAnnotationsDir();
  const annPath = join(annDir, `${conversationId}.pbtxt`);

  if (!existsSync(annPath)) return null;

  try {
    const content = readFileSync(annPath, "utf-8");
    let lastUserViewTime: number | null = null;

    // Parse pbtxt format: look for last_user_view_time field
    const match = content.match(/last_user_view_time\s*:\s*(\d+)/);
    if (match) {
      lastUserViewTime = parseInt(match[1], 10);
    }

    return {
      conversationId,
      lastUserViewTime,
      rawContent: content,
    };
  } catch {
    return null;
  }
}

/**
 * Scan all annotations and return a map of conversationId → timestamp.
 */
export function scanAnnotations(customDir?: string): Map<string, number> {
  const annDir = customDir || getAnnotationsDir();
  const map = new Map<string, number>();

  if (!existsSync(annDir)) return map;

  try {
    const files = readdirSync(annDir);
    for (const file of files) {
      if (!file.endsWith(".pbtxt")) continue;
      const id = basename(file, ".pbtxt");
      const data = readAnnotation(id, annDir);
      if (data?.lastUserViewTime) {
        map.set(id, data.lastUserViewTime);
      }
    }
  } catch {
    // Ignore errors
  }

  return map;
}
