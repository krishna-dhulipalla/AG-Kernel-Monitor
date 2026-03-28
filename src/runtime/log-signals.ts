/**
 * Runtime signal extraction from Antigravity.log.
 *
 * This module is used both for one-shot scans and live watch mode so the
 * product can consistently identify the active conversation and attach direct
 * message counts when the language-server logs expose them.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getLogDir } from "../paths";

export interface ParsedLogLine {
  type: "message_count" | "conversation_id" | "api_call";
  value: string | number;
  timestamp: string | null;
  raw: string;
}

export interface LogRuntimeSnapshot {
  logFilePath: string | null;
  activeConversationId: string | null;
  activeAt: string | null;
  messageCounts: Map<string, number>;
  lastActivityAt: Map<string, string>;
  linesParsed: number;
}

const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
const CONVERSATION_REGEX = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function findLatestLogFile(): string | null {
  const logDir = getLogDir();

  if (!existsSync(logDir)) return null;

  try {
    const dateDirs = readdirSync(logDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: join(logDir, entry.name),
      }))
      .sort((left, right) => right.name.localeCompare(left.name));

    for (const dateDir of dateDirs) {
      const found = findLogFileRecursive(dateDir.path);
      if (found) return found;
    }
  } catch {
    return null;
  }

  return null;
}

function findLogFileRecursive(dir: string): string | null {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name === "Antigravity.log") {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = findLogFileRecursive(fullPath);
        if (nested) return nested;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function parseLogLine(line: string): ParsedLogLine | null {
  const timestampMatch = line.match(TIMESTAMP_REGEX);
  const timestamp = timestampMatch ? timestampMatch[1] : null;

  const messageMatch = line.match(/planner_generator\.go:\d+\]\s*Requesting planner with (\d+) chat messages/i);
  if (messageMatch) {
    return {
      type: "message_count",
      value: parseInt(messageMatch[1], 10),
      timestamp,
      raw: line,
    };
  }

  const conversationMatch = line.match(/interceptor\.go:\d+\].*?conversation\s+([0-9a-f-]{36})/i)
    ?? line.match(CONVERSATION_REGEX);
  if (conversationMatch) {
    return {
      type: "conversation_id",
      value: conversationMatch[1],
      timestamp,
      raw: line,
    };
  }

  if (/http_helpers\.go:\d+\]/i.test(line)) {
    return {
      type: "api_call",
      value: "active",
      timestamp,
      raw: line,
    };
  }

  return null;
}

export function scanLogText(text: string, filePath: string | null = null): LogRuntimeSnapshot {
  const messageCounts = new Map<string, number>();
  const lastActivityAt = new Map<string, string>();

  let activeConversationId: string | null = null;
  let activeAt: string | null = null;
  let currentConversationId: string | null = null;
  let linesParsed = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    linesParsed++;

    const parsed = parseLogLine(line);
    if (!parsed) continue;

    if (parsed.type === "conversation_id") {
      currentConversationId = String(parsed.value);
      activeConversationId = currentConversationId;
      activeAt = parsed.timestamp;
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
      }
      continue;
    }

    if (parsed.type === "message_count" && currentConversationId) {
      const count = parsed.value as number;
      messageCounts.set(currentConversationId, count);
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
        activeConversationId = currentConversationId;
        activeAt = parsed.timestamp;
      }
    }
  }

  return {
    logFilePath: filePath,
    activeConversationId,
    activeAt,
    messageCounts,
    lastActivityAt,
    linesParsed,
  };
}

export function scanLogFile(filePath: string): LogRuntimeSnapshot {
  const text = readFileSync(filePath, "utf-8");
  return scanLogText(text, filePath);
}

export function scanLatestLogFile(): LogRuntimeSnapshot {
  const logFilePath = findLatestLogFile();
  if (!logFilePath) {
    return {
      logFilePath: null,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map(),
      lastActivityAt: new Map(),
      linesParsed: 0,
    };
  }

  try {
    return scanLogFile(logFilePath);
  } catch {
    return {
      logFilePath,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map(),
      lastActivityAt: new Map(),
      linesParsed: 0,
    };
  }
}
