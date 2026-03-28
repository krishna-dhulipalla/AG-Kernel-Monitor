/**
 * Log tailer - polls the latest Antigravity.log for active-session runtime signals.
 */

import { existsSync, readFileSync, statSync } from "fs";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { estimateConversationMetrics, formatRatio, formatTokens } from "../metrics/estimator";
import { takeSnapshotIfChanged } from "../metrics/snapshotter";
import { findLatestLogFile, parseLogLine, scanLatestLogFile } from "../runtime/log-signals";
import { ensureConversationLoaded } from "./reconcile-helper";

interface LogTailState {
  filePath: string | null;
  offset: number;
  currentConversationId: string | null;
}

export function startLogTailer(db: MonitorDB, config: AgKernelConfig): void {
  const initialSnapshot = scanLatestLogFile();

  if (initialSnapshot.logFilePath && existsSync(initialSnapshot.logFilePath)) {
    console.log(chalk.dim(`   Tailing: ${initialSnapshot.logFilePath}`));
  } else {
    console.log(chalk.dim("   Log tailer: waiting for Antigravity.log..."));
  }

  const state: LogTailState = {
    filePath: initialSnapshot.logFilePath,
    offset: initialSnapshot.logFilePath && existsSync(initialSnapshot.logFilePath)
      ? statSync(initialSnapshot.logFilePath).size
      : 0,
    currentConversationId: initialSnapshot.activeConversationId,
  };

  const poll = async () => {
    await refreshLatestLogFile(state);
    await processNewLines(db, config, state);
  };

  const timer = setInterval(() => {
    void poll();
  }, 1000);

  void poll();
  process.once("exit", () => clearInterval(timer));
}

async function refreshLatestLogFile(state: LogTailState): Promise<void> {
  const latestPath = findLatestLogFile();
  if (!latestPath || !existsSync(latestPath) || latestPath === state.filePath) {
    return;
  }

  const snapshot = scanLatestLogFile();
  state.filePath = latestPath;
  state.offset = 0;
  state.currentConversationId = snapshot.activeConversationId ?? state.currentConversationId;

  console.log(chalk.dim(`   Tailing: ${latestPath}`));
}

async function processNewLines(db: MonitorDB, config: AgKernelConfig, state: LogTailState): Promise<void> {
  try {
    if (!state.filePath || !existsSync(state.filePath)) {
      return;
    }

    const stats = statSync(state.filePath);
    if (stats.size < state.offset) {
      state.offset = 0;
    }
    if (stats.size <= state.offset) {
      return;
    }

    const content = readFileSync(state.filePath, "utf-8");
    const newContent = content.slice(state.offset);
    state.offset = stats.size;

    for (const line of newContent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseLogLine(line);
      if (!parsed) continue;

      if (parsed.type === "conversation_id") {
        state.currentConversationId = String(parsed.value);
        continue;
      }

      if (parsed.type !== "message_count" || !state.currentConversationId) {
        continue;
      }

      const conversation = await ensureConversationLoaded(db, config, state.currentConversationId);
      if (!conversation) {
        continue;
      }

      const newCount = parsed.value as number;
      const metrics = estimateConversationMetrics({
        pbFileBytes: conversation.pb_file_bytes,
        brainFolderBytes: conversation.brain_folder_bytes,
        messageCount: newCount,
        resolvedVersionCount: conversation.resolved_version_count,
        bytesPerToken: config.bytesPerToken,
      });

      const updatedConversation = {
        ...conversation,
        message_count: newCount,
        message_count_source: "log",
        estimated_prompt_tokens: metrics.estimatedPromptTokens,
        estimated_artifact_tokens: metrics.estimatedArtifactTokens,
        estimated_tokens: metrics.estimatedTotalTokens,
        last_active_at: parsed.timestamp ? new Date(parsed.timestamp.replace(" ", "T")).toISOString() : conversation.last_active_at,
        activity_source: "log",
        is_active: 1,
      };

      db.clearActiveConversation();
      db.upsertConversation(updatedConversation);
      takeSnapshotIfChanged(db, updatedConversation);

      if (updatedConversation.workspace_id) {
        db.updateWorkspaceAggregates(updatedConversation.workspace_id);
      }

      const deltaMessages = conversation.message_count !== null ? newCount - conversation.message_count : null;
      const ratio = config.bloatLimit > 0 ? updatedConversation.estimated_tokens / config.bloatLimit : 0;
      const timestamp = new Date().toLocaleTimeString();
      const deltaLabel = deltaMessages !== null ? ` (+${deltaMessages} since last)` : "";
      const title = updatedConversation.title ? ` ${chalk.dim(`"${updatedConversation.title}"`)}` : "";

      console.log(
        chalk.dim(`[${timestamp}]`) +
        chalk.magenta(" [LIVE]") +
        ` ${updatedConversation.id.slice(0, 12)}...${title}` +
        ` now at ${chalk.bold(String(newCount))} direct messages${deltaLabel}` +
        ` -> ${formatTokens(updatedConversation.estimated_tokens)} estimated tokens` +
        ` (${formatRatio(ratio)} of limit)`,
      );
    }
  } catch {
    // Ignore transient watcher read failures.
  }
}
