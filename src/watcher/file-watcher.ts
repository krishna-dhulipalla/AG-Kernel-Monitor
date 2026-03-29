/**
 * File watcher - monitors conversations/ for .pb size changes.
 *
 * `fs.watch()` has been unreliable on Windows/Antigravity setups, especially
 * when large protobuf files are rewritten rapidly. Polling the file sizes is
 * slower in theory but materially more reliable for this tool's live mode.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { basename, extname, join } from "path";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { estimateConversationMetrics, formatBytes, formatRatio, formatTokens } from "../metrics/estimator";
import { takeSnapshotIfChanged } from "../metrics/snapshotter";
import { getConversationsDir } from "../paths";
import { ensureConversationLoaded } from "./reconcile-helper";

const POLL_INTERVAL_MS = 1000;

export function startFileWatcher(db: MonitorDB, config: AgKernelConfig): void {
  const conversationsDir = getConversationsDir();

  if (!existsSync(conversationsDir)) {
    console.warn(chalk.yellow(`Cannot watch - conversations directory not found: ${conversationsDir}`));
    return;
  }

  const knownSizes = new Map<string, number>();

  try {
    for (const file of readdirSync(conversationsDir)) {
      if (extname(file) !== ".pb") continue;
      const filePath = join(conversationsDir, file);
      try {
        knownSizes.set(file, statSync(filePath).size);
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.error(chalk.red("Failed to prime file watcher:"), err);
    return;
  }

  const timer = setInterval(() => {
    void pollConversationFiles(db, config, conversationsDir, knownSizes);
  }, POLL_INTERVAL_MS);

  process.once("exit", () => clearInterval(timer));
  console.log(chalk.dim(`   Watching: ${conversationsDir}`));
}

async function pollConversationFiles(
  db: MonitorDB,
  config: AgKernelConfig,
  conversationsDir: string,
  knownSizes: Map<string, number>,
): Promise<void> {
  try {
    const seen = new Set<string>();
    for (const file of readdirSync(conversationsDir)) {
      if (extname(file) !== ".pb") continue;
      const filePath = join(conversationsDir, file);
      seen.add(file);

      let currentSize: number;
      try {
        currentSize = statSync(filePath).size;
      } catch {
        continue;
      }

      const previousSize = knownSizes.get(file);
      if (previousSize === undefined) {
        knownSizes.set(file, currentSize);
        await handlePbChange(db, config, conversationsDir, file, 0);
        continue;
      }

      if (previousSize !== currentSize) {
        knownSizes.set(file, currentSize);
        await handlePbChange(db, config, conversationsDir, file, previousSize);
      }
    }

    for (const file of Array.from(knownSizes.keys())) {
      if (!seen.has(file)) {
        knownSizes.delete(file);
      }
    }
  } catch {
    // Ignore transient directory read failures during rapid writes.
  }
}

async function handlePbChange(
  db: MonitorDB,
  config: AgKernelConfig,
  conversationsDir: string,
  filename: string,
  previousBytes?: number,
): Promise<void> {
  const filePath = join(conversationsDir, filename);
  const conversationId = basename(filename, ".pb");

  try {
    if (!existsSync(filePath)) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`) + chalk.red(` ${conversationId.slice(0, 12)}... deleted`));
      return;
    }

    const conversation = await ensureConversationLoaded(db, config, conversationId);
    if (!conversation) {
      return;
    }

    const currentBytes = statSync(filePath).size;
    const baselineBytes = previousBytes ?? conversation.pb_file_bytes;
    const deltaBytes = currentBytes - baselineBytes;
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
      ` -> ${formatTokens(updatedConversation.estimated_tokens)} estimated total` +
      ` (${formatRatio(ratio)} of limit)`,
    );
  } catch {
    // Ignore transient file access failures during rapid writes.
  }
}
