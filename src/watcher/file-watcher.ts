/**
 * File watcher — monitors conversations/ directory for .pb file changes.
 *
 * Uses fs.watch() with debouncing to detect real-time conversation growth.
 * On change: updates SQLite, calculates delta, displays notification.
 */

import { watch, statSync, existsSync } from "fs";
import { join, basename, extname } from "path";
import chalk from "chalk";
import type { MonitorDB } from "../db/schema";
import type { AgKernelConfig } from "../config";
import { getConversationsDir } from "../paths";
import { estimateTokens, formatBytes, formatTokens } from "../metrics/estimator";
import { assessHealth } from "../metrics/health";

/** Debounce window in ms */
const DEBOUNCE_MS = 500;

/**
 * Start watching the conversations directory for .pb file changes.
 */
export function startFileWatcher(db: MonitorDB, config: AgKernelConfig): void {
  const convDir = getConversationsDir();

  if (!existsSync(convDir)) {
    console.warn(chalk.yellow(`⚠️  Cannot watch — conversations directory not found: ${convDir}`));
    return;
  }

  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  try {
    const watcher = watch(convDir, (eventType, filename) => {
      if (!filename || extname(filename) !== ".pb") return;

      // Debounce rapid writes
      const existing = debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        filename,
        setTimeout(() => {
          debounceTimers.delete(filename);
          handlePbChange(db, config, convDir, filename);
        }, DEBOUNCE_MS)
      );
    });

    // Handle watcher errors gracefully
    watcher.on("error", (err) => {
      console.error(chalk.red(`❌ File watcher error:`), err.message);
    });

    console.log(chalk.dim(`   Watching: ${convDir}`));
  } catch (err) {
    console.error(chalk.red(`❌ Failed to start file watcher:`), err);
  }
}

/**
 * Handle a .pb file change: update DB, calculate delta, display notification.
 */
function handlePbChange(db: MonitorDB, config: AgKernelConfig, convDir: string, filename: string): void {
  const filePath = join(convDir, filename);
  const convId = basename(filename, ".pb");

  try {
    if (!existsSync(filePath)) {
      // File was deleted
      const timestamp = new Date().toLocaleTimeString();
      console.log(chalk.dim(`[${timestamp}]`) + chalk.red(` ${convId.slice(0, 12)}... DELETED`));
      return;
    }

    const stats = statSync(filePath);
    const currentBytes = stats.size;

    // Get previous state from DB
    const existing = db.getConversation(convId);
    const previousBytes = existing?.pb_file_bytes ?? 0;
    const deltaBytes = currentBytes - previousBytes;

    if (deltaBytes === 0) return; // No actual size change

    const newTokens = estimateTokens({
      pbFileBytes: currentBytes,
      brainFolderBytes: existing?.brain_folder_bytes ?? 0,
      messageCount: existing?.message_count ?? null,
      resolvedVersionCount: existing?.resolved_version_count ?? 0,
      bytesPerToken: config.bytesPerToken,
    });

    const previousTokens = existing?.estimated_tokens ?? 0;
    const deltaTokens = newTokens - previousTokens;

    // Update DB
    if (existing) {
      db.upsertConversation({
        ...existing,
        pb_file_bytes: currentBytes,
        estimated_tokens: newTokens,
        last_modified: new Date().toISOString(),
      });
    }

    // Take snapshot
    db.insertSnapshot({
      conversation_id: convId,
      timestamp: new Date().toISOString(),
      pb_file_bytes: currentBytes,
      estimated_tokens: newTokens,
      message_count: existing?.message_count ?? null,
      delta_bytes: deltaBytes,
    });

    // Update workspace aggregates
    if (existing?.workspace_id) {
      db.updateWorkspaceAggregates(existing.workspace_id);
    }

    // Display notification
    const health = assessHealth(newTokens, config.bloatLimit);
    const timestamp = new Date().toLocaleTimeString();
    const sign = deltaBytes >= 0 ? "+" : "";

    console.log(
      chalk.dim(`[${timestamp}]`) +
      ` ${convId.slice(0, 12)}... ` +
      chalk.cyan(`${sign}${formatBytes(Math.abs(deltaBytes))}`) +
      chalk.dim(` (${sign}${formatTokens(Math.abs(deltaTokens))} tokens)`) +
      ` → ${formatBytes(currentBytes)} total ` +
      `(${health.emoji} ${health.label})`
    );
  } catch (err) {
    // Silently ignore transient file access errors during rapid writes
  }
}
