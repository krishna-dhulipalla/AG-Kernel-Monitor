/**
 * `agk nuke` — Destructive cleanup command.
 *
 * Delete all data for a workspace or a single conversation.
 *
 * Safety:
 *   --dry-run: List files that WOULD be deleted without actually deleting
 *   Without --dry-run: Mandatory confirmation prompt (type workspace name)
 */

import { Command } from "commander";
import chalk from "chalk";
import { rmSync, existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import type { MonitorDB } from "../../db/schema";
import type { AgKernelConfig } from "../../config";
import { getConversationsDir, getBrainDir, getAnnotationsDir } from "../../paths";
import { formatBytes } from "../../metrics/estimator";

interface NukeTarget {
  conversationId: string;
  pbFilePath: string | null;
  pbFileBytes: number;
  brainFolderPath: string | null;
  brainFolderBytes: number;
  annotationPath: string | null;
  annotationBytes: number;
}

export function registerNukeCommand(program: Command, db: MonitorDB, config: AgKernelConfig): void {
  program
    .command("nuke")
    .description("Permanently delete conversation data for a workspace or session")
    .option("-w, --workspace <name>", "Delete all data for a workspace")
    .option("-c, --conversation <uuid>", "Delete a single conversation")
    .option("--dry-run", "List files that would be deleted without actually deleting")
    .action(async (options) => {
      if (!options.workspace && !options.conversation) {
        console.error(chalk.red("❌ Must specify --workspace <name> or --conversation <uuid>"));
        process.exit(1);
      }

      const targets: NukeTarget[] = [];

      if (options.conversation) {
        // Single conversation
        const target = buildTarget(options.conversation);
        if (target) targets.push(target);
        else {
          console.error(chalk.red(`❌ Conversation ${options.conversation} not found`));
          process.exit(1);
        }
      } else if (options.workspace) {
        // All conversations in workspace
        const workspaces = db.getAllWorkspaces();
        const ws = workspaces.find(
          (w) =>
            w.name.toLowerCase() === options.workspace.toLowerCase() ||
            w.name.toLowerCase().includes(options.workspace.toLowerCase())
        );

        if (!ws) {
          console.error(chalk.red(`❌ Workspace "${options.workspace}" not found`));
          process.exit(1);
        }

        const conversations = db.getConversationsByWorkspace(ws.id);
        for (const conv of conversations) {
          const target = buildTarget(conv.id);
          if (target) targets.push(target);
        }
      }

      if (targets.length === 0) {
        console.log(chalk.yellow("⚠️  No targets found for deletion"));
        return;
      }

      // ── Display what will be deleted ──
      const totalPbBytes = targets.reduce((s, t) => s + t.pbFileBytes, 0);
      const totalBrainBytes = targets.reduce((s, t) => s + t.brainFolderBytes, 0);
      const totalAnnotationBytes = targets.reduce((s, t) => s + t.annotationBytes, 0);
      const totalBytes = totalPbBytes + totalBrainBytes + totalAnnotationBytes;

      const pbCount = targets.filter((t) => t.pbFilePath).length;
      const brainCount = targets.filter((t) => t.brainFolderPath).length;
      const annCount = targets.filter((t) => t.annotationPath).length;

      console.log();
      console.log(chalk.bold.red("⚠️  This will permanently delete:"));
      console.log(`  ${pbCount} conversation .pb file${pbCount !== 1 ? "s" : ""} (${formatBytes(totalPbBytes)})`);
      console.log(`  ${brainCount} brain folder${brainCount !== 1 ? "s" : ""} (${formatBytes(totalBrainBytes)})`);
      console.log(`  ${annCount} annotation .pbtxt file${annCount !== 1 ? "s" : ""} (${formatBytes(totalAnnotationBytes)})`);
      console.log(`  SQLite entries for ${targets.length} conversation${targets.length !== 1 ? "s" : ""}`);
      console.log();
      console.log(chalk.bold(`  Total: ${formatBytes(totalBytes)}`));
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("🏜️  Dry run — no files were deleted"));

        // List individual files
        for (const target of targets) {
          console.log(chalk.dim(`  [${target.conversationId.slice(0, 12)}...]`));
          if (target.pbFilePath) console.log(chalk.dim(`    .pb: ${target.pbFilePath} (${formatBytes(target.pbFileBytes)})`));
          if (target.brainFolderPath) console.log(chalk.dim(`    brain: ${target.brainFolderPath} (${formatBytes(target.brainFolderBytes)})`));
          if (target.annotationPath) console.log(chalk.dim(`    ann: ${target.annotationPath} (${formatBytes(target.annotationBytes)})`));
        }
        return;
      }

      // ── Confirmation prompt ──
      const confirmText = options.workspace || options.conversation.slice(0, 12);
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.yellow(`Type "${confirmText}" to confirm: `), resolve);
      });
      rl.close();

      if (answer.trim() !== confirmText) {
        console.log(chalk.red("❌ Confirmation failed — aborting"));
        return;
      }

      // ── Execute deletion ──
      let deletedCount = 0;

      for (const target of targets) {
        try {
          // Delete .pb file
          if (target.pbFilePath && existsSync(target.pbFilePath)) {
            rmSync(target.pbFilePath);
          }

          // Delete brain folder
          if (target.brainFolderPath && existsSync(target.brainFolderPath)) {
            rmSync(target.brainFolderPath, { recursive: true, force: true });
          }

          // Delete annotation
          if (target.annotationPath && existsSync(target.annotationPath)) {
            rmSync(target.annotationPath);
          }

          // Delete from SQLite
          db.deleteConversation(target.conversationId);
          deletedCount++;
        } catch (err) {
          console.error(chalk.red(`  Failed to delete ${target.conversationId}: ${err}`));
        }
      }

      // Update workspace aggregates
      if (options.workspace) {
        const ws = db.getAllWorkspaces().find(
          (w) => w.name.toLowerCase().includes(options.workspace.toLowerCase())
        );
        if (ws) db.updateWorkspaceAggregates(ws.id);
      }

      console.log(chalk.green(`✅ Deleted ${deletedCount} conversations, freed ${formatBytes(totalBytes)}`));
    });
}

/**
 * Build a NukeTarget for a conversation ID.
 */
function buildTarget(conversationId: string): NukeTarget | null {
  const convDir = getConversationsDir();
  const brainDir = getBrainDir();
  const annDir = getAnnotationsDir();

  const pbFilePath = join(convDir, `${conversationId}.pb`);
  const brainFolderPath = join(brainDir, conversationId);
  const annotationPath = join(annDir, `${conversationId}.pbtxt`);

  let pbFileBytes = 0;
  let brainFolderBytes = 0;
  let annotationBytes = 0;

  if (existsSync(pbFilePath)) {
    try { pbFileBytes = statSync(pbFilePath).size; } catch { /* ignore */ }
  }

  if (existsSync(brainFolderPath)) {
    brainFolderBytes = getDirSize(brainFolderPath);
  }

  if (existsSync(annotationPath)) {
    try { annotationBytes = statSync(annotationPath).size; } catch { /* ignore */ }
  }

  // At least one file must exist
  if (pbFileBytes === 0 && brainFolderBytes === 0 && annotationBytes === 0) {
    return null;
  }

  return {
    conversationId,
    pbFilePath: existsSync(pbFilePath) ? pbFilePath : null,
    pbFileBytes,
    brainFolderPath: existsSync(brainFolderPath) ? brainFolderPath : null,
    brainFolderBytes,
    annotationPath: existsSync(annotationPath) ? annotationPath : null,
    annotationBytes,
  };
}

/**
 * Recursively calculate directory size.
 */
function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        try { size += statSync(fullPath).size; } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return size;
}
