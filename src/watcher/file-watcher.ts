/**
 * File watcher — monitors conversations/ for .pb size changes.
 */

import { existsSync, statSync, watch } from "fs";
import { basename, extname, join } from "path";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { estimateConversationMetrics, formatBytes, formatRatio, formatTokens } from "../metrics/estimator";
import { takeSnapshotIfChanged } from "../metrics/snapshotter";
import { getConversationsDir } from "../paths";

const DEBOUNCE_MS = 500;

export function startFileWatcher(db: MonitorDB, config: AgKernelConfig): void {
  const conversationsDir = getConversationsDir();

  if (!existsSync(conversationsDir)) {
    console.warn(chalk.yellow(`⚠️  Cannot watch — conversations directory not found: ${conversationsDir}`));
    return;
  }

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  try {
    const watcher = watch(conversationsDir, (_eventType, filename) => {
      if (!filename || extname(filename) !== ".pb") return;

      const existing = debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        filename,
        setTimeout(() => {
          debounceTimers.delete(filename);
          handlePbChange(db, config, conversationsDir, filename);
        }, DEBOUNCE_MS),
      );
    });

    watcher.on("error", (err) => {
      console.error(chalk.red("❌ File watcher error:"), err.message);
    });

    console.log(chalk.dim(`   Watching: ${conversationsDir}`));
  } catch (err) {
    console.error(chalk.red("❌ Failed to start file watcher:"), err);
  }
}

function handlePbChange(db: MonitorDB, config: AgKernelConfig, conversationsDir: string, filename: string): void {
  const filePath = join(conversationsDir, filename);
  const conversationId = basename(filename, ".pb");

  try {
    if (!existsSync(filePath)) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`) + chalk.red(` ${conversationId.slice(0, 12)}... deleted`));
      return;
    }

    const conversation = db.getConversation(conversationId);
    if (!conversation) {
      return;
    }

    const currentBytes = statSync(filePath).size;
    const deltaBytes = currentBytes - conversation.pb_file_bytes;
    if (deltaBytes === 0) {
      return;
    }

    const metrics = estimateConversationMetrics({
      pbFileBytes: currentBytes,
      brainFolderBytes: conversation.brain_folder_bytes,
      messageCount: conversation.message_count,
      resolvedVersionCount: conversation.resolved_version_count,
      bytesPerToken: config.bytesPerToken,
    });

    const updatedConversation = {
      ...conversation,
      pb_file_bytes: currentBytes,
      estimated_prompt_tokens: metrics.estimatedPromptTokens,
      estimated_artifact_tokens: metrics.estimatedArtifactTokens,
      estimated_tokens: metrics.estimatedTotalTokens,
      last_modified: new Date().toISOString(),
    };

    db.upsertConversation(updatedConversation);
    const snapshot = takeSnapshotIfChanged(db, updatedConversation);

    if (updatedConversation.workspace_id) {
      db.updateWorkspaceAggregates(updatedConversation.workspace_id);
    }

    const timestamp = new Date().toLocaleTimeString();
    const ratio = config.bloatLimit > 0 ? updatedConversation.estimated_tokens / config.bloatLimit : 0;
    const title = updatedConversation.title ? ` ${chalk.dim(`"${updatedConversation.title}"`)}` : "";

    console.log(
      chalk.dim(`[${timestamp}]`) +
      ` ${updatedConversation.id.slice(0, 12)}...${title}` +
      ` ${deltaBytes >= 0 ? "+" : "-"}${formatBytes(Math.abs(deltaBytes))}` +
      ` (${snapshot.deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(snapshot.deltaTokens))} est. tokens)` +
      ` → ${formatTokens(updatedConversation.estimated_tokens)} estimated total` +
      ` (${formatRatio(ratio)} of limit)`
    );
  } catch {
    // Ignore transient file access failures during rapid writes.
  }
}
