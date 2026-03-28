/**
 * `agk scan` — one-shot scan and display.
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import type { MonitorDB } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { reconcile } from "../../ingest/reconciler";
import {
  type ConversationViewModel,
  buildWorkspaceViewModel,
  getCurrentConversationView,
  listConversationViewModels,
  listWorkspaceViewModels,
} from "../../view-models";

export function registerScanCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("scan")
    .description("Scan Antigravity data and display workspace/conversation metrics")
    .option("-w, --workspace <name>", "Drill into a specific workspace")
    .option("-c, --conversation <uuid>", "Show a single conversation by id")
    .option("--current", "Show only the current or most recent conversation")
    .option("--watch", "Enter live monitoring mode (file watcher + log tailer)")
    .option("--json", "Output raw JSON")
    .action(async (options) => {
      const useJson = options.json || program.opts().json;
      const watchMode = Boolean(options.watch);

      if (useJson && watchMode) {
        console.error("watch mode does not support --json");
        process.exitCode = 1;
        return;
      }

      if (!useJson) {
        console.error(chalk.dim("🔍 Scanning Antigravity data..."));
      }
      const startTime = Date.now();
      const stats = await reconcile(db, config);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!useJson) {
        console.error(chalk.dim(`   Scanned ${stats.conversationsTotal} conversations in ${elapsed}s`));
        console.error(
          chalk.dim(
            `   Mapped: ${stats.conversationsMapped} | Unmapped: ${stats.conversationsUnmapped} | Brain orphans: ${stats.orphanBrainFolders}`
          )
        );
        console.error();
      }

      if (options.conversation) {
        displayConversationDetail(db, config, options.conversation, useJson);
        return;
      }

      if (options.current) {
        displayCurrentConversation(db, config, useJson);
        return;
      }

      if (options.workspace) {
        displayWorkspaceDetail(db, config, options.workspace, useJson);
        return;
      }

      if (watchMode) {
        if (!useJson) {
          console.log(chalk.yellow("🔄 Watch mode — press Ctrl+C to exit"));
          console.log();
        }

        displayCurrentConversation(db, config, useJson);
        if (!useJson) {
          console.log();
        }
        displayWorkspaceSummary(db, config, useJson);

        if (!useJson) {
          console.log();
          console.log(chalk.dim("   Monitoring live session growth..."));
        }

        const { startFileWatcher } = await import("../../watcher/file-watcher");
        const { startLogTailer } = await import("../../watcher/log-tailer");
        startFileWatcher(db, config);
        startLogTailer(db, config);
        return;
      }

      if (useJson) {
        console.log(JSON.stringify(buildScanSummaryJson(db, config), null, 2));
        return;
      }

      displayCurrentConversation(db, config, useJson);
      console.log();
      displayWorkspaceSummary(db, config, useJson);
    });
}

function buildScanSummaryJson(db: MonitorDB, config: AgKernelConfig) {
  return {
    currentConversation: getCurrentConversationView(db, config),
    workspaces: listWorkspaceViewModels(db, config)
      .filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__"),
  };
}

function displayCurrentConversation(db: MonitorDB, config: AgKernelConfig, useJson: boolean): void {
  const current = getCurrentConversationView(db, config);

  if (useJson) {
    console.log(JSON.stringify(current, null, 2));
    return;
  }

  if (!current.conversation) {
    console.log(chalk.bold("Current Conversation"));
    console.log(chalk.dim("  No conversations found."));
    return;
  }

  const label = current.mode === "active" ? "Current Conversation" : "Most Recent Conversation";
  displayConversationCard(current.conversation, label, current.mode === "active");
}

function displayWorkspaceSummary(db: MonitorDB, config: AgKernelConfig, useJson: boolean): void {
  const workspaces = listWorkspaceViewModels(db, config)
    .filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__");

  if (useJson) {
    console.log(JSON.stringify({ workspaces }, null, 2));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold("Workspace"),
      chalk.bold("Est.Total"),
      chalk.bold("Chats"),
      chalk.bold("Active"),
      chalk.bold("Largest"),
      chalk.bold("Health"),
    ],
    style: { head: [], border: [] },
    colWidths: [28, 12, 8, 8, 12, 10],
  });

  for (const workspace of workspaces) {
    table.push([
      workspace.name.length > 26 ? `${workspace.name.slice(0, 23)}...` : workspace.name,
      workspace.estimatedTokensFormatted,
      String(workspace.conversationCount),
      String(workspace.activeConversationCount),
      workspace.largestConversationTokensFormatted,
      workspace.healthEmoji,
    ]);
  }

  console.log(table.toString());
}

function displayWorkspaceDetail(db: MonitorDB, config: AgKernelConfig, workspaceName: string, useJson: boolean): void {
  const workspace = db.getAllWorkspaces().find(
    (entry) =>
      entry.name.toLowerCase() === workspaceName.toLowerCase()
      || entry.name.toLowerCase().includes(workspaceName.toLowerCase())
  );

  if (!workspace) {
    console.error(chalk.red(`❌ Workspace "${workspaceName}" not found`));
    return;
  }

  const conversations = listConversationViewModels(
    db,
    config,
    db.getConversationsByWorkspace(workspace.id),
  );
  const workspaceView = buildWorkspaceViewModel(db, config, workspace);

  if (useJson) {
    console.log(JSON.stringify({
      workspace: workspaceView,
      conversations,
    }, null, 2));
    return;
  }

  console.log(chalk.bold(`Workspace: ${workspaceView.name}`));
  console.log(chalk.dim(`  Estimated total: ${workspaceView.estimatedTokensFormatted} tokens`));
  console.log(chalk.dim(`  Conversations: ${workspaceView.conversationCount}`));
  console.log(chalk.dim(`  Largest session: ${workspaceView.largestConversationTokensFormatted}`));
  console.log();

  const table = new Table({
    head: [
      chalk.bold("Session"),
      chalk.bold("Title"),
      chalk.bold("Est.Total"),
      chalk.bold("Msgs"),
      chalk.bold("Last Active"),
      chalk.bold("Map"),
      chalk.bold("Health"),
    ],
    style: { head: [], border: [] },
    colWidths: [16, 28, 12, 10, 14, 16, 10],
  });

  for (const conversation of conversations) {
    table.push([
      `${conversation.id.slice(0, 12)}...`,
      truncate(conversation.title ?? "Untitled", 26),
      conversation.estimatedTotalTokensFormatted,
      formatMessageCount(conversation),
      conversation.lastActiveRelative,
      truncate(conversation.mappingSource ?? "unknown", 14),
      conversation.healthEmoji,
    ]);
  }

  console.log(table.toString());
}

function displayConversationDetail(db: MonitorDB, config: AgKernelConfig, conversationId: string, useJson: boolean): void {
  const conversation = db.getConversation(conversationId);
  if (!conversation) {
    console.error(chalk.red(`❌ Conversation "${conversationId}" not found`));
    return;
  }

  const view = listConversationViewModels(db, config, [conversation])[0];

  if (useJson) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  displayConversationCard(view, "Conversation Detail", view.isActive);
}

function displayConversationCard(view: ConversationViewModel, label: string, emphasizeActive: boolean): void {
  console.log(chalk.bold(label));
  console.log(chalk.dim(`  Session: ${view.id}`));
  console.log(chalk.dim(`  Title: ${view.title ?? "Untitled"}`));
  console.log(chalk.dim(`  Workspace: ${view.workspaceName}`));
  console.log(
    chalk.dim(
      `  Last Active: ${view.lastActiveRelative}${view.lastActiveAt ? ` (${view.lastActiveAt})` : ""}${emphasizeActive ? " [ACTIVE]" : ""}`
    )
  );
  console.log(
    chalk.dim(
      `  Messages: ${view.messageCount !== null ? view.messageCount : "unknown"}${view.messageCountSource ? ` (${view.messageCountSource})` : ""}`
    )
  );
  console.log(
    chalk.dim(
      `  Estimated Context: ${view.estimatedTotalTokensFormatted} tokens (${view.contextRatioFormatted} of limit)`
    )
  );
  console.log(
    chalk.dim(
      `  Breakdown: prompt/history ${view.estimatedPromptTokens.toLocaleString()} • artifacts ${view.estimatedArtifactTokens.toLocaleString()}`
    )
  );
  console.log(chalk.dim(`  Delta: ${view.deltaEstimatedTokensFormatted} estimated tokens`));
  console.log(chalk.dim(`  Mapping: ${view.mappingSource ?? "unknown"} (${view.mappingConfidence ?? 0})`));
  console.log(chalk.dim(`  Why Heavy: ${view.whyHeavy}`));
}

function formatMessageCount(view: ConversationViewModel): string {
  if (view.messageCount === null) {
    return "unknown";
  }

  return view.messageCountSource ? `${view.messageCount} (${view.messageCountSource})` : String(view.messageCount);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
