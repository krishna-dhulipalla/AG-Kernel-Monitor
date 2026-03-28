/**
 * Log tailer — tails the Antigravity.log file for live session data.
 *
 * Parses:
 *   - planner_generator.go:283 → message count per turn
 *   - interceptor.go:74 → active conversation UUID
 *   - http_helpers.go:123 → API call activity
 *
 * Updates SQLite conversations.message_count on each parsed line.
 */

import { existsSync, readdirSync, statSync, readFileSync, watchFile } from "fs";
import { join } from "path";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import { getLogDir } from "../paths";

interface LogState {
  filePath: string;
  offset: number;
  currentConversationId: string | null;
}

/**
 * Find the current (latest) Antigravity.log file.
 *
 * Log path structure:
 *   %APPDATA%/Antigravity/logs/<date>/window1/exthost/google.antigravity/Antigravity.log
 */
function findLatestLogFile(): string | null {
  const logDir = getLogDir();

  if (!existsSync(logDir)) return null;

  try {
    // Find the latest date directory
    const dateDirs = readdirSync(logDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({
        name: d.name,
        path: join(logDir, d.name),
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Newest first

    for (const dateDir of dateDirs) {
      // Search recursively for Antigravity.log
      const logFile = findLogFileRecursive(dateDir.path);
      if (logFile) return logFile;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Recursively search for Antigravity.log file.
 */
function findLogFileRecursive(dir: string): string | null {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name === "Antigravity.log") {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const found = findLogFileRecursive(fullPath);
        if (found) return found;
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Parse relevant log lines.
 */
interface ParsedLogLine {
  type: "message_count" | "conversation_id" | "api_call";
  value: string | number;
  raw: string;
}

function parseLogLine(line: string): ParsedLogLine | null {
  // planner_generator.go:283] Requesting planner with N chat messages
  const msgMatch = line.match(/planner_generator\.go:\d+\]\s*Requesting planner with (\d+) chat messages/);
  if (msgMatch) {
    return { type: "message_count", value: parseInt(msgMatch[1], 10), raw: line };
  }

  // interceptor.go:74] → conversation UUID
  const convMatch = line.match(/interceptor\.go:\d+\].*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (convMatch) {
    return { type: "conversation_id", value: convMatch[1], raw: line };
  }

  // http_helpers.go:123] → API call activity
  const apiMatch = line.match(/http_helpers\.go:\d+\]/);
  if (apiMatch) {
    return { type: "api_call", value: "active", raw: line };
  }

  return null;
}

/**
 * Start tailing the Antigravity.log file.
 */
export function startLogTailer(db: MonitorDB): void {
  const logFile = findLatestLogFile();

  if (!logFile) {
    console.log(chalk.dim("   Log tailer: no Antigravity.log found (will monitor on next restart)"));
    return;
  }

  console.log(chalk.dim(`   Tailing: ${logFile}`));

  const state: LogState = {
    filePath: logFile,
    offset: 0,
    currentConversationId: null,
  };

  // Start from the end of the file (we only want new lines)
  try {
    state.offset = statSync(logFile).size;
  } catch {
    state.offset = 0;
  }

  // Watch for changes
  const POLL_INTERVAL_MS = 1000;
  watchFile(logFile, { interval: POLL_INTERVAL_MS }, () => {
    processNewLines(db, state);
  });
}

/**
 * Read and process new lines since last offset.
 */
function processNewLines(db: MonitorDB, state: LogState): void {
  try {
    const stats = statSync(state.filePath);
    if (stats.size <= state.offset) {
      if (stats.size < state.offset) {
        // File was truncated/rotated — reset offset
        state.offset = 0;
      }
      return;
    }

    // Read new bytes
    const content = readFileSync(state.filePath, "utf-8");
    const newContent = content.slice(state.offset);
    state.offset = stats.size;

    const lines = newContent.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (!parsed) continue;

      switch (parsed.type) {
        case "conversation_id":
          state.currentConversationId = String(parsed.value);
          break;

        case "message_count":
          if (state.currentConversationId) {
            const conv = db.getConversation(state.currentConversationId);
            const newCount = parsed.value as number;

            if (conv) {
              const oldCount = conv.message_count;
              db.upsertConversation({
                ...conv,
                message_count: newCount,
              });

              if (oldCount !== null && newCount > oldCount) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(
                  chalk.dim(`[${timestamp}]`) +
                  chalk.magenta(` [LIVE]`) +
                  ` Session ${state.currentConversationId.slice(0, 12)}... ` +
                  `now at ${chalk.bold(String(newCount))} messages ` +
                  chalk.dim(`(+${newCount - oldCount} since start)`)
                );
              }
            }
          }
          break;

        case "api_call":
          // Track API activity (could be expanded)
          break;
      }
    }
  } catch {
    // Silently ignore transient read errors
  }
}
