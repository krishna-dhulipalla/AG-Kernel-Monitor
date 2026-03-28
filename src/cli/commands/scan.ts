/**
 * `agk scan` — One-shot scan and display.
 *
 * Displays:
 *   - Workspace summary table (all workspaces)
 *   - Drill-down into a specific workspace with --workspace flag
 *   - Live watch mode with --watch flag
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import type { MonitorDB } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { reconcile } from "../../ingest/reconciler";
import { assessHealth, assessWorkspaceHealth } from "../../metrics/health";
import { formatBytes, formatTokens } from "../../metrics/estimator";

export function registerScanCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("scan")
    .description("Scan Antigravity data and display workspace/conversation metrics")
    .option("-w, --workspace <name>", "Drill into a specific workspace")
    .option("--watch", "Enter live monitoring mode (file watcher + log tailer)")
    .option("--json", "Output raw JSON")
    .action(async (options) => {
      const useJson = options.json || program.opts().json;

      // Run full ingestion
      if (!useJson) {
        console.error(chalk.dim("🔍 Scanning Antigravity data..."));
      }
      const startTime = Date.now();
      const stats = await reconcile(db, config);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!useJson) {
        console.error(
          chalk.dim(`   Scanned ${stats.conversationsTotal} conversations in ${elapsed}s`)
        );
        console.error(
          chalk.dim(
            `   Mapped: ${stats.conversationsMapped} | Unmapped: ${stats.conversationsUnmapped} | Brain orphans: ${stats.orphanBrainFolders}`
          )
        );
        console.error();
      }

      if (options.workspace) {
        // ── Drill-down mode ──
        await displayWorkspaceDetail(db, config, options.workspace, useJson);
      } else if (options.watch) {
        // ── Live watch mode ──
        console.log(chalk.yellow("🔄 Watch mode — press Ctrl+C to exit"));
        console.log(chalk.dim("   Monitoring conversations/ directory for changes..."));
        console.log();

        // Display initial state
        displayWorkspaceSummary(db, config, useJson);

        // Start file watcher (Sprint 5 will enhance this)
        const { startFileWatcher } = await import("../../watcher/file-watcher");
        const { startLogTailer } = await import("../../watcher/log-tailer");

        startFileWatcher(db, config);
        startLogTailer(db);

      } else {
        // ── Summary mode ──
        displayWorkspaceSummary(db, config, useJson);
      }
    });
}

/**
 * Display workspace summary table.
 */
function displayWorkspaceSummary(db: MonitorDB, config: AgKernelConfig, useJson: boolean): void {
  const workspaces = db.getAllWorkspaces();

  if (useJson) {
    const data = workspaces.map((ws) => {
      const conversations = db.getConversationsByWorkspace(ws.id);
      const totalTokens = conversations.reduce((sum, c) => sum + c.estimated_tokens, 0);
      const totalMessages = conversations.reduce(
        (sum, c) => sum + (c.message_count || 0),
        0
      );
      const health = assessWorkspaceHealth(
        conversations.map((c) => c.estimated_tokens),
        config.bloatLimit
      );
      return {
        name: ws.name,
        uri: ws.uri,
        estimatedTokens: totalTokens,
        conversations: ws.conversation_count,
        messages: totalMessages,
        brainSize: ws.total_brain_bytes,
        health: health.status,
      };
    });
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Build the formatted table
  const table = new Table({
    head: [
      chalk.bold("Workspace"),
      chalk.bold("Est.Tokens"),
      chalk.bold("Chats"),
      chalk.bold("Messages"),
      chalk.bold("Brain Size"),
      chalk.bold("Health"),
    ],
    style: {
      head: [],
      border: [],
    },
    colWidths: [28, 12, 8, 11, 12, 10],
  });

  let grandTotalTokens = 0;
  let grandTotalChats = 0;
  let grandTotalMessages = 0;
  let grandTotalBrain = 0;

  for (const ws of workspaces) {
    if (ws.conversation_count === 0 && ws.uri !== "__unmapped__") continue;

    const conversations = db.getConversationsByWorkspace(ws.id);
    const totalTokens = conversations.reduce((sum, c) => sum + c.estimated_tokens, 0);
    const totalMessages = conversations.reduce(
      (sum, c) => sum + (c.message_count || 0),
      0
    );
    const hasUnknownMessages = conversations.some((c) => c.message_count === null);

    const health = assessWorkspaceHealth(
      conversations.map((c) => c.estimated_tokens),
      config.bloatLimit
    );

    table.push([
      ws.name.length > 26 ? ws.name.slice(0, 23) + "..." : ws.name,
      formatTokens(totalTokens),
      String(ws.conversation_count),
      hasUnknownMessages ? `~${totalMessages}` : String(totalMessages),
      formatBytes(ws.total_brain_bytes),
      `${health.emoji}`,
    ]);

    grandTotalTokens += totalTokens;
    grandTotalChats += ws.conversation_count;
    grandTotalMessages += totalMessages;
    grandTotalBrain += ws.total_brain_bytes;
  }

  // Totals row
  table.push([
    chalk.bold("TOTAL"),
    chalk.bold(formatTokens(grandTotalTokens)),
    chalk.bold(String(grandTotalChats)),
    chalk.bold(`~${grandTotalMessages}`),
    chalk.bold(formatBytes(grandTotalBrain)),
    "",
  ]);

  console.log(table.toString());

  // Overall stats
  const totalStats = db.getTotalStats();
  console.log();
  console.log(chalk.dim(`Total .pb disk usage: ${formatBytes(totalStats.total_pb_bytes)}`));
  console.log(chalk.dim(`Bloat limit: ${formatTokens(config.bloatLimit)} tokens`));
}

/**
 * Display drill-down table for a specific workspace.
 */
async function displayWorkspaceDetail(
  db: MonitorDB,
  config: AgKernelConfig,
  workspaceName: string,
  useJson: boolean,
): Promise<void> {
  // Find workspace by name (partial match)
  const allWorkspaces = db.getAllWorkspaces();
  const workspace = allWorkspaces.find(
    (w) => w.name.toLowerCase() === workspaceName.toLowerCase() ||
           w.name.toLowerCase().includes(workspaceName.toLowerCase())
  );

  if (!workspace) {
    console.error(chalk.red(`❌ Workspace "${workspaceName}" not found`));
    console.log(chalk.dim("Available workspaces:"));
    for (const ws of allWorkspaces) {
      if (ws.conversation_count > 0) {
        console.log(chalk.dim(`  - ${ws.name}`));
      }
    }
    return;
  }

  const conversations = db.getConversationsByWorkspace(workspace.id);

  if (useJson) {
    console.log(JSON.stringify(conversations, null, 2));
    return;
  }

  console.log(chalk.bold(`📂 ${workspace.name}`));
  console.log(chalk.dim(`   URI: ${workspace.uri}`));
  console.log();

  const table = new Table({
    head: [
      chalk.bold("Session ID"),
      chalk.bold(".pb Size"),
      chalk.bold("Est.Tokens"),
      chalk.bold("Messages"),
      chalk.bold("Brain Size"),
      chalk.bold("Last Active"),
      chalk.bold("Health"),
    ],
    style: {
      head: [],
      border: [],
    },
    colWidths: [16, 10, 12, 10, 12, 14, 10],
  });

  for (const conv of conversations) {
    const health = assessHealth(conv.estimated_tokens, config.bloatLimit);

    // Format last modified as relative time
    const lastMod = conv.last_modified ? relativeTime(new Date(conv.last_modified)) : "—";

    table.push([
      conv.id.slice(0, 12) + "...",
      formatBytes(conv.pb_file_bytes),
      formatTokens(conv.estimated_tokens),
      conv.message_count !== null ? String(conv.message_count) : "—",
      formatBytes(conv.brain_folder_bytes),
      lastMod,
      `${health.emoji}`,
    ]);
  }

  console.log(table.toString());
}

/**
 * Format a date as relative time (e.g., "2 hrs ago", "3 days ago").
 */
function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min ago`;
  return "just now";
}
