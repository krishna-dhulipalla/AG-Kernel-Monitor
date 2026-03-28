/**
 * `agk report` — Cache sync and ghost artifact report.
 *
 * Reports:
 *   - Orphan conversations (.pb without brain folder, or vice versa)
 *   - Orphan annotations (.pbtxt without matching conversation)
 *   - Ghost artifacts: brain folders with stale data
 *   - Bloat limit violations
 *   - Disk usage summary
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { readdirSync, existsSync } from "fs";
import { basename } from "path";
import type { MonitorDB } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { reconcile } from "../../ingest/reconciler";
import { assessHealth } from "../../metrics/health";
import { formatBytes, formatTokens } from "../../metrics/estimator";
import { getConversationsDir, getBrainDir, getAnnotationsDir } from "../../paths";

export function registerReportCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("report")
    .description("Generate a cache health report — orphans, ghosts, bloat violations")
    .option("--json", "Output raw JSON")
    .action(async (options) => {
      const useJson = options.json || program.opts().json;

      // Run full ingestion first
      console.log(chalk.dim("🔍 Scanning Antigravity data..."));
      const stats = await reconcile(db, config);
      console.log();

      // ── Collect report data ──
      const report = buildReport(db, config, stats);

      if (useJson) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // ── Display report ──
      console.log(chalk.bold.underline("📊 AG Kernel Monitor — Health Report"));
      console.log();

      // 1. Disk usage summary
      console.log(chalk.bold("💾 Disk Usage Summary"));
      const diskTable = new Table({
        style: { head: [], border: [] },
      });
      diskTable.push(
        ["Total .pb files", formatBytes(report.diskUsage.totalPbBytes)],
        ["Total brain folders", formatBytes(report.diskUsage.totalBrainBytes)],
        ["Total conversations", String(report.diskUsage.totalConversations)],
        ["Total estimated tokens", formatTokens(report.diskUsage.totalEstimatedTokens)],
      );
      console.log(diskTable.toString());
      console.log();

      // 2. Bloat violations
      if (report.bloatViolations.length > 0) {
        console.log(chalk.bold.red(`🚨 Bloat Limit Violations (${report.bloatViolations.length})`));
        const bloatTable = new Table({
          head: [chalk.bold("Session ID"), chalk.bold("Workspace"), chalk.bold("Est.Tokens"), chalk.bold("Health")],
          style: { head: [], border: [] },
        });
        for (const v of report.bloatViolations) {
          bloatTable.push([
            v.conversationId.slice(0, 12) + "...",
            v.workspaceName,
            formatTokens(v.estimatedTokens),
            v.healthEmoji + " " + v.healthLabel,
          ]);
        }
        console.log(bloatTable.toString());
        console.log();
      } else {
        console.log(chalk.green("✅ No bloat limit violations"));
        console.log();
      }

      // 3. Orphan conversations
      if (report.orphanConversations.length > 0) {
        console.log(chalk.bold.yellow(`👻 Orphan Conversations (${report.orphanConversations.length})`));
        console.log(chalk.dim("   .pb files without a corresponding brain folder:"));
        for (const id of report.orphanConversations) {
          console.log(chalk.dim(`   - ${id}`));
        }
        console.log();
      }

      // 4. Orphan brain folders
      if (report.orphanBrainFolders.length > 0) {
        console.log(chalk.bold.yellow(`🧠 Orphan Brain Folders (${report.orphanBrainFolders.length})`));
        console.log(chalk.dim("   Brain folders without a corresponding .pb file:"));
        for (const id of report.orphanBrainFolders) {
          console.log(chalk.dim(`   - ${id}`));
        }
        console.log();
      }

      // 5. Orphan annotations
      if (report.orphanAnnotations.length > 0) {
        console.log(chalk.bold.yellow(`📝 Orphan Annotations (${report.orphanAnnotations.length})`));
        console.log(chalk.dim("   .pbtxt files without a matching conversation:"));
        for (const id of report.orphanAnnotations) {
          console.log(chalk.dim(`   - ${id}`));
        }
        console.log();
      }

      // 6. Ingestion stats
      console.log(chalk.bold("📈 Ingestion Stats"));
      const ingestTable = new Table({
        style: { head: [], border: [] },
      });
      ingestTable.push(
        ["Workspaces found", String(stats.workspacesFound)],
        ["Conversations mapped", String(stats.conversationsMapped)],
        ["Conversations unmapped", String(stats.conversationsUnmapped)],
        ["Brain folders found", String(stats.brainFoldersFound)],
        ["Orphan brain folders", String(stats.orphanBrainFolders)],
      );
      console.log(ingestTable.toString());
    });
}

interface ReportData {
  diskUsage: {
    totalPbBytes: number;
    totalBrainBytes: number;
    totalConversations: number;
    totalEstimatedTokens: number;
  };
  bloatViolations: {
    conversationId: string;
    workspaceName: string;
    estimatedTokens: number;
    healthEmoji: string;
    healthLabel: string;
  }[];
  orphanConversations: string[];
  orphanBrainFolders: string[];
  orphanAnnotations: string[];
}

function buildReport(
  db: MonitorDB,
  config: AgKernelConfig,
  stats: any,
): ReportData {
  const totalStats = db.getTotalStats();
  const allConversations = db.getAllConversations();
  const allWorkspaces = db.getAllWorkspaces();

  // Build workspace ID → name map
  const wsNameMap = new Map<string, string>();
  for (const ws of allWorkspaces) {
    wsNameMap.set(ws.id, ws.name);
  }

  // Bloat violations
  const bloatViolations = allConversations
    .filter((c) => c.estimated_tokens > config.bloatLimit * 0.8)
    .map((c) => {
      const health = assessHealth(c.estimated_tokens, config.bloatLimit);
      return {
        conversationId: c.id,
        workspaceName: c.workspace_id ? wsNameMap.get(c.workspace_id) || "Unknown" : "Unmapped",
        estimatedTokens: c.estimated_tokens,
        healthEmoji: health.emoji,
        healthLabel: health.label,
      };
    })
    .sort((a, b) => b.estimatedTokens - a.estimatedTokens);

  // Orphan detection
  const orphanConversations: string[] = [];
  const orphanBrainFolders: string[] = [];
  const orphanAnnotations: string[] = [];

  // Get .pb file IDs
  const pbIds = new Set<string>();
  const convDir = getConversationsDir();
  if (existsSync(convDir)) {
    for (const file of readdirSync(convDir)) {
      if (file.endsWith(".pb")) {
        pbIds.add(basename(file, ".pb"));
      }
    }
  }

  // Get brain folder IDs
  const brainIds = new Set<string>();
  const brainDir = getBrainDir();
  if (existsSync(brainDir)) {
    for (const entry of readdirSync(brainDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        brainIds.add(entry.name);
      }
    }
  }

  // Get annotation IDs
  const annIds = new Set<string>();
  const annDir = getAnnotationsDir();
  if (existsSync(annDir)) {
    for (const file of readdirSync(annDir)) {
      if (file.endsWith(".pbtxt")) {
        annIds.add(basename(file, ".pbtxt"));
      }
    }
  }

  // .pb without brain
  for (const id of pbIds) {
    if (!brainIds.has(id)) orphanConversations.push(id);
  }

  // brain without .pb
  for (const id of brainIds) {
    if (!pbIds.has(id)) orphanBrainFolders.push(id);
  }

  // annotations without .pb
  for (const id of annIds) {
    if (!pbIds.has(id)) orphanAnnotations.push(id);
  }

  return {
    diskUsage: {
      totalPbBytes: totalStats.total_pb_bytes,
      totalBrainBytes: totalStats.total_brain_bytes,
      totalConversations: totalStats.total_conversations,
      totalEstimatedTokens: totalStats.total_estimated_tokens,
    },
    bloatViolations,
    orphanConversations,
    orphanBrainFolders,
    orphanAnnotations,
  };
}
