/**
 * `agk report` - cache health and cleanup report.
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { basename } from "path";
import { existsSync, readdirSync } from "fs";
import type { MonitorDB } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { reconcile } from "../../ingest/reconciler";
import { getAnnotationsDir, getBrainDir, getConversationsDir } from "../../paths";
import { getCurrentConversationView, listConversationViewModels } from "../../view-models";

interface ReportData {
  currentConversation: ReturnType<typeof getCurrentConversationView>;
  largestSessions: ReturnType<typeof listConversationViewModels>;
  unmappedConversations: ReturnType<typeof listConversationViewModels>;
  recommendedCleanupTargets: ReturnType<typeof listConversationViewModels>;
  orphanBrainFolders: string[];
  orphanAnnotations: string[];
}

export function registerReportCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("report")
    .description("Generate a cache health report with cleanup targets")
    .option("--json", "Output raw JSON")
    .action(async (options) => {
      const useJson = options.json || program.opts().json;

      if (!useJson) {
        console.log(chalk.dim("Scanning Antigravity data..."));
      }
      await reconcile(db, config);

      const report = buildReport(db, config);

      if (useJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(chalk.bold("Antigravity Token Monitor - Health Report"));
      console.log();

      console.log(chalk.bold("Current Risk"));
      if (report.currentConversation.conversation) {
        const current = report.currentConversation.conversation;
        console.log(chalk.dim(`  Session: ${current.id}`));
        console.log(chalk.dim(`  Workspace: ${current.workspaceName}`));
        console.log(chalk.dim(`  Title: ${current.title ?? "Untitled"}`));
        console.log(chalk.dim(`  Detection: ${report.currentConversation.detectionNote}`));
        console.log(chalk.dim(`  Estimated Context: ${current.estimatedTotalTokensFormatted} tokens (${current.contextRatioFormatted})`));
        console.log(chalk.dim(`  Mapping: ${current.mappingSource ?? "unknown"} (${current.mappingConfidence ?? 0})`));
        if (current.mappingNote) {
          console.log(chalk.dim(`  Mapping Note: ${current.mappingNote}`));
        }
        console.log(chalk.dim(`  Why Heavy: ${current.whyHeavy}`));
      } else {
        console.log(chalk.dim("  No conversation data available."));
      }
      console.log();

      if (report.largestSessions.length > 0) {
        console.log(chalk.bold("Largest Sessions"));
        const largestTable = new Table({
          head: [
            chalk.bold("Session"),
            chalk.bold("Workspace"),
            chalk.bold("Est.Total"),
            chalk.bold("Msgs"),
            chalk.bold("Last Active"),
            chalk.bold("Health"),
          ],
          style: { head: [], border: [] },
          colWidths: [16, 26, 12, 10, 14, 10],
        });

        for (const session of report.largestSessions.slice(0, 8)) {
          largestTable.push([
            `${session.id.slice(0, 12)}...`,
            truncate(session.workspaceName, 24),
            session.estimatedTotalTokensFormatted,
            session.messageCount !== null ? String(session.messageCount) : "unknown",
            session.lastActiveRelative,
            session.healthEmoji,
          ]);
        }

        console.log(largestTable.toString());
        console.log();
      }

      console.log(chalk.bold("Unmapped Conversations"));
      if (report.unmappedConversations.length === 0) {
        console.log(chalk.dim("  No unmapped conversations detected."));
      } else {
        const unmappedTable = new Table({
          head: [
            chalk.bold("Session"),
            chalk.bold("Title"),
            chalk.bold("Est.Total"),
            chalk.bold("Last Active"),
            chalk.bold("Why Unmapped"),
          ],
          style: { head: [], border: [] },
          colWidths: [16, 28, 12, 14, 54],
        });

        for (const session of report.unmappedConversations) {
          unmappedTable.push([
            `${session.id.slice(0, 12)}...`,
            truncate(session.title ?? "Untitled", 26),
            session.estimatedTotalTokensFormatted,
            session.lastActiveRelative,
            truncate(session.mappingNote ?? "No mapping diagnosis available.", 52),
          ]);
        }

        console.log(unmappedTable.toString());
      }
      console.log();

      console.log(chalk.bold("Orphaned Artifacts"));
      if (report.orphanBrainFolders.length === 0 && report.orphanAnnotations.length === 0) {
        console.log(chalk.dim("  No orphaned brain folders or annotation files found."));
      } else {
        if (report.orphanBrainFolders.length > 0) {
          console.log(chalk.dim(`  Brain folders: ${report.orphanBrainFolders.join(", ")}`));
        }
        if (report.orphanAnnotations.length > 0) {
          console.log(chalk.dim(`  Annotation files: ${report.orphanAnnotations.join(", ")}`));
        }
      }
      console.log();

      console.log(chalk.bold("Recommended Cleanup Targets"));
      if (report.recommendedCleanupTargets.length === 0) {
        console.log(chalk.dim("  No urgent cleanup targets right now."));
      } else {
        const cleanupTable = new Table({
          head: [
            chalk.bold("Session"),
            chalk.bold("Workspace"),
            chalk.bold("Est.Total"),
            chalk.bold("Why"),
          ],
          style: { head: [], border: [] },
          colWidths: [16, 24, 12, 48],
        });

        for (const session of report.recommendedCleanupTargets) {
          cleanupTable.push([
            `${session.id.slice(0, 12)}...`,
            truncate(session.workspaceName, 22),
            session.estimatedTotalTokensFormatted,
            truncate(session.whyHeavy, 46),
          ]);
        }

        console.log(cleanupTable.toString());
      }
    });
}

function buildReport(db: MonitorDB, config: AgKernelConfig): ReportData {
  const conversations = listConversationViewModels(db, config, db.getAllConversations());
  const currentConversation = getCurrentConversationView(db, config);
  const largestSessions = [...conversations].sort((left, right) => right.estimatedTotalTokens - left.estimatedTotalTokens);
  const unmappedConversations = conversations.filter((conversation) => conversation.mappingSource === "unmapped");
  const recommendedCleanupTargets = largestSessions
    .filter((conversation) => conversation.contextRatio >= 0.8 || conversation.mappingSource === "unmapped")
    .slice(0, 5);

  const pbIds = new Set<string>();
  const conversationsDir = getConversationsDir();
  if (existsSync(conversationsDir)) {
    for (const file of readdirSync(conversationsDir)) {
      if (file.endsWith(".pb")) {
        pbIds.add(basename(file, ".pb"));
      }
    }
  }

  const orphanBrainFolders: string[] = [];
  const brainDir = getBrainDir();
  if (existsSync(brainDir)) {
    for (const entry of readdirSync(brainDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !pbIds.has(entry.name)) {
        orphanBrainFolders.push(entry.name);
      }
    }
  }

  const orphanAnnotations: string[] = [];
  const annotationsDir = getAnnotationsDir();
  if (existsSync(annotationsDir)) {
    for (const file of readdirSync(annotationsDir)) {
      if (file.endsWith(".pbtxt")) {
        const id = basename(file, ".pbtxt");
        if (!pbIds.has(id)) {
          orphanAnnotations.push(id);
        }
      }
    }
  }

  return {
    currentConversation,
    largestSessions,
    unmappedConversations,
    recommendedCleanupTargets,
    orphanBrainFolders,
    orphanAnnotations,
  };
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
