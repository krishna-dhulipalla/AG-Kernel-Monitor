/**
 * `agk scan` - one-shot scan and display.
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import type { MonitorDB, Workspace } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { reconcile } from "../../ingest/reconciler";
import {
  type ConversationViewModel,
  type CurrentConversationResult,
  type WorkspaceViewModel,
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
        console.log(chalk.dim("Scanning Antigravity data..."));
      }
      const startTime = Date.now();
      const stats = await reconcile(db, config);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (!useJson) {
        console.log(chalk.dim(`   Scanned ${stats.conversationsTotal} conversations in ${elapsed}s`));
        console.log(
          chalk.dim(
            `   Mapped: ${stats.conversationsMapped} | Unmapped: ${stats.conversationsUnmapped} | Brain orphans: ${stats.orphanBrainFolders}`,
          ),
        );
        console.log();
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
        console.log(chalk.yellow("Watch mode - press Ctrl+C to exit"));
        console.log(chalk.dim("   Live watch streams new conversation growth and runtime signals as they happen."));
        console.log(chalk.dim("   Run `agk scan` when you want the full workspace history and cleanup summary."));
        console.log();
        displayCurrentConversation(db, config, false);
        console.log();
        console.log(chalk.dim("   Waiting for .pb changes and Antigravity runtime signals..."));

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

      displayCurrentConversation(db, config, false);
      console.log();
      displayWorkspaceSummary(db, config, false);
    });
}

function buildScanSummaryJson(db: MonitorDB, config: AgKernelConfig) {
  const current = getCurrentConversationView(db, config);
  const workspaces = sortWorkspacesForDisplay(
    listWorkspaceViewModels(db, config)
      .filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__"),
    current.conversation?.workspaceId ?? null,
  );

  return {
    currentConversation: current,
    workspaces,
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
  displayConversationCard(current.conversation, label, current);
}

function displayWorkspaceSummary(db: MonitorDB, config: AgKernelConfig, useJson: boolean): void {
  const current = getCurrentConversationView(db, config);
  const workspaces = sortWorkspacesForDisplay(
    listWorkspaceViewModels(db, config)
      .filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__"),
    current.conversation?.workspaceId ?? null,
  );

  if (useJson) {
    console.log(JSON.stringify({ workspaces }, null, 2));
    return;
  }

  const table = new Table({
    head: [
      chalk.bold("Now"),
      chalk.bold("Workspace"),
      chalk.bold("Est.Total"),
      chalk.bold("Chats"),
      chalk.bold("Map/U"),
      chalk.bold("Brain"),
      chalk.bold("Largest"),
      chalk.bold("Health"),
    ],
    style: { head: [], border: [] },
    colWidths: [8, 30, 12, 8, 10, 10, 12, 10],
  });

  for (const workspace of workspaces) {
    const now = current.conversation?.workspaceId === workspace.id
      ? (current.mode === "active" ? "live" : "recent")
      : "";

    table.push([
      now,
      truncate(workspace.displayName, 28),
      workspace.estimatedTokensFormatted,
      String(workspace.conversationCount),
      `${workspace.mappedConversationCount}/${workspace.unmappedConversationCount}`,
      workspace.brainSizeFormatted,
      workspace.largestConversationTokensFormatted,
      workspace.healthEmoji,
    ]);
  }

  console.log(table.toString());
}

function displayWorkspaceDetail(db: MonitorDB, config: AgKernelConfig, workspaceQuery: string, useJson: boolean): void {
  const resolved = resolveWorkspaceSelection(db, config, workspaceQuery);

  if (resolved.type === "missing") {
    console.error(chalk.red(`Workspace "${workspaceQuery}" not found`));
    return;
  }

  if (resolved.type === "ambiguous") {
    console.error(chalk.yellow(`Workspace "${workspaceQuery}" is ambiguous. Matches:`));
    for (const match of resolved.matches) {
      console.error(chalk.dim(`  - ${match.displayName}`));
    }
    return;
  }

  const { workspace, workspaceView } = resolved;
  const conversations = listConversationViewModels(db, config, db.getConversationsByWorkspace(workspace.id));

  if (useJson) {
    console.log(JSON.stringify({ workspace: workspaceView, conversations }, null, 2));
    return;
  }

  console.log(chalk.bold(`Workspace: ${workspaceView.displayName}`));
  console.log(chalk.dim(`  Location: ${workspaceView.uri}`));
  console.log(chalk.dim(`  Estimated total: ${workspaceView.estimatedTokensFormatted} tokens`));
  console.log(
    chalk.dim(
      `  Storage: ${workspaceView.pbSizeFormatted} conversation data | ${workspaceView.brainSizeFormatted} brain data`,
    ),
  );
  console.log(
    chalk.dim(
      `  Conversations: ${workspaceView.conversationCount} (${workspaceView.mappedConversationCount} mapped, ${workspaceView.unmappedConversationCount} unmapped)`,
    ),
  );
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
    colWidths: [16, 30, 12, 12, 14, 18, 10],
  });

  for (const conversation of conversations) {
    table.push([
      `${conversation.id.slice(0, 12)}...`,
      truncate(conversation.title ?? "Untitled", 28),
      conversation.estimatedTotalTokensFormatted,
      truncate(formatMessageCount(conversation), 10),
      conversation.lastActiveRelative,
      truncate(conversation.mappingSource ?? "unknown", 16),
      conversation.healthEmoji,
    ]);
  }

  console.log(table.toString());
}

function displayConversationDetail(db: MonitorDB, config: AgKernelConfig, conversationId: string, useJson: boolean): void {
  const conversation = db.getConversation(conversationId);
  if (!conversation) {
    console.error(chalk.red(`Conversation "${conversationId}" not found`));
    return;
  }

  const view = listConversationViewModels(db, config, [conversation])[0];
  if (!view) {
    console.error(chalk.red(`Conversation "${conversationId}" not found`));
    return;
  }

  if (useJson) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  const currentContext: CurrentConversationResult = view.isActive
    ? {
        mode: "active",
        detectionSource: "active_pb_write",
        resolutionState: "active_pb_write",
        detectionNote: "Detected from the latest runtime signal.",
        resolutionNote: "Detected from the latest runtime signal.",
        conversation: view,
      }
    : {
        mode: "recent",
        detectionSource: "recent_fallback",
        resolutionState: "recent_fallback",
        detectionNote: "Direct conversation lookup does not imply this is the current live session.",
        resolutionNote: "Direct conversation lookup does not imply this is the current live session.",
        conversation: view,
      };

  displayConversationCard(view, "Conversation Detail", currentContext);
}

function displayConversationCard(
  view: ConversationViewModel,
  label: string,
  current: Pick<CurrentConversationResult, "mode" | "detectionNote">,
): void {
  console.log(chalk.bold(label));
  console.log(chalk.dim(`  Session: ${view.id}`));
  console.log(chalk.dim(`  Title: ${view.title ?? "Untitled"}`));
  console.log(chalk.dim(`  Workspace: ${view.workspaceName}`));
  console.log(chalk.dim(`  Detection: ${current.detectionNote}`));
  console.log(
    chalk.dim(
      `  Last Active: ${view.lastActiveRelative}${view.lastActiveAt ? ` (${view.lastActiveAt})` : ""}${current.mode === "active" ? " [ACTIVE]" : ""}`,
    ),
  );
  console.log(
    chalk.dim(
      `  Messages: ${view.messageCount !== null ? view.messageCount : "unknown"}${view.messageCountSource ? ` (${view.messageCountSource})` : ""}`,
    ),
  );
  console.log(
    chalk.dim(
      `  Estimated Context: ${view.estimatedTotalTokensFormatted} tokens (${view.contextRatioFormatted} of limit)`,
    ),
  );
  console.log(
    chalk.dim(
      `  Breakdown: prompt/history ${view.estimatedPromptTokens.toLocaleString()} | artifacts ${view.estimatedArtifactTokens.toLocaleString()}`,
    ),
  );
  console.log(chalk.dim(`  Delta: ${view.deltaEstimatedTokensFormatted} estimated tokens`));
  console.log(chalk.dim(`  Mapping: ${view.mappingSource ?? "unknown"} (${view.mappingConfidence ?? 0})`));
  if (view.mappingNote) {
    console.log(chalk.dim(`  Mapping Note: ${view.mappingNote}`));
  }
  console.log(chalk.dim(`  Why Heavy: ${view.whyHeavy}`));
}

function resolveWorkspaceSelection(
  db: MonitorDB,
  config: AgKernelConfig,
  query: string,
):
  | { type: "resolved"; workspace: Workspace; workspaceView: WorkspaceViewModel }
  | { type: "ambiguous"; matches: WorkspaceViewModel[] }
  | { type: "missing" } {
  const workspaceViews = listWorkspaceViewModels(db, config)
    .filter((workspace) => workspace.conversationCount > 0 || workspace.uri === "__unmapped__");
  const workspacesById = new Map(db.getAllWorkspaces().map((workspace) => [workspace.id, workspace] as const));
  const normalizedQuery = query.toLowerCase();

  const toResolved = (matches: WorkspaceViewModel[]) => matches
    .map((match) => ({ view: match, workspace: workspacesById.get(match.id) ?? null }))
    .filter((entry): entry is { view: WorkspaceViewModel; workspace: Workspace } => entry.workspace !== null);

  const exactDisplay = toResolved(
    workspaceViews.filter((workspace) => workspace.displayName.toLowerCase() === normalizedQuery),
  );
  if (exactDisplay.length === 1) {
    return {
      type: "resolved",
      workspace: exactDisplay[0]!.workspace,
      workspaceView: exactDisplay[0]!.view,
    };
  }
  if (exactDisplay.length > 1) {
    return { type: "ambiguous", matches: exactDisplay.map((entry) => entry.view) };
  }

  const exactName = toResolved(
    workspaceViews.filter((workspace) => workspace.name.toLowerCase() === normalizedQuery),
  );
  if (exactName.length === 1) {
    return {
      type: "resolved",
      workspace: exactName[0]!.workspace,
      workspaceView: exactName[0]!.view,
    };
  }
  if (exactName.length > 1) {
    return { type: "ambiguous", matches: exactName.map((entry) => entry.view) };
  }

  const partial = toResolved(
    workspaceViews.filter(
      (workspace) =>
        workspace.displayName.toLowerCase().includes(normalizedQuery)
        || workspace.name.toLowerCase().includes(normalizedQuery),
    ),
  );
  if (partial.length === 1) {
    return {
      type: "resolved",
      workspace: partial[0]!.workspace,
      workspaceView: partial[0]!.view,
    };
  }
  if (partial.length > 1) {
    return { type: "ambiguous", matches: partial.map((entry) => entry.view) };
  }

  return { type: "missing" };
}

function sortWorkspacesForDisplay(workspaces: WorkspaceViewModel[], currentWorkspaceId: string | null): WorkspaceViewModel[] {
  return [...workspaces].sort((left, right) => {
    if (currentWorkspaceId && left.id === currentWorkspaceId && right.id !== currentWorkspaceId) return -1;
    if (currentWorkspaceId && right.id === currentWorkspaceId && left.id !== currentWorkspaceId) return 1;
    return right.estimatedTokens - left.estimatedTokens;
  });
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
