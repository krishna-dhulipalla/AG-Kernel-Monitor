#!/usr/bin/env bun
/**
 * AG Kernel Monitor — CLI entry point.
 *
 * Usage:
 *   agk scan                     One-shot scan and display
 *   agk scan -w "WorkspaceName"  Drill into a workspace
 *   agk scan --watch             Live monitoring mode
 *   agk report                   Cache sync and ghost artifact report
 *   agk nuke                     Destructive cleanup
 *   agk serve                    Start JSON API server
 *
 * Global flags:
 *   --config <path>   Path to .ag-kernel.json
 *   --json            Output raw JSON instead of tables
 */

import { Command } from "commander";
import { loadConfig } from "../config";
import { MonitorDB } from "../db/schema";
import { registerScanCommand } from "./commands/scan";
import { registerReportCommand } from "./commands/report";
import { registerNukeCommand } from "./commands/nuke";
import { registerServeCommand } from "../server/index";

const program = new Command();

program
  .name("agk")
  .description("Deep token consumption and cache bloat monitoring for Google Antigravity sessions")
  .version("0.1.0")
  .option("--config <path>", "Path to .ag-kernel.json config file")
  .option("--json", "Output raw JSON instead of formatted tables");

// Load config and create DB connection (shared across commands)
const config = loadConfig();
const db = new MonitorDB(config.dbPath);

// Register subcommands
registerScanCommand(program, db, config);
registerReportCommand(program, db, config);
registerNukeCommand(program, db, config);
registerServeCommand(program, db, config);

// Ensure DB is closed on exit
process.on("exit", () => {
  db.close();
});

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

program.parse(process.argv);
