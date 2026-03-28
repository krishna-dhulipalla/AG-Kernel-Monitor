/**
 * Configuration loader for AG Kernel Monitor.
 *
 * Searches for `.ag-kernel.json` in:
 *   1. Current working directory (project root)
 *   2. User home directory
 *
 * Falls back to sensible defaults if no config file is found.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { getDefaultDbPath } from "./paths";

export interface AgKernelConfig {
  /** Token count threshold for bloat warning (default: 300000) */
  bloatLimit: number;
  /** Estimated bytes per token for .pb file size → token conversion (default: 3.5) */
  bytesPerToken: number;
  /** Path to the SQLite database (default: ~/.ag-kernel/monitor.db) */
  dbPath: string;
  /** Log level: debug | info | warn | error (default: info) */
  logLevel: "debug" | "info" | "warn" | "error";
}

const CONFIG_FILE_NAME = ".ag-kernel.json";

const DEFAULTS: AgKernelConfig = {
  bloatLimit: 300_000,
  bytesPerToken: 3.5,
  dbPath: getDefaultDbPath(),
  logLevel: "info",
};

/**
 * Attempt to find and load the config file.
 * Priority: project root → home directory → defaults.
 */
function findConfigFile(): string | null {
  const projectPath = resolve(process.cwd(), CONFIG_FILE_NAME);
  if (existsSync(projectPath)) return projectPath;

  const homePath = join(homedir(), CONFIG_FILE_NAME);
  if (existsSync(homePath)) return homePath;

  return null;
}

/**
 * Load and merge configuration. Any missing fields use defaults.
 */
export function loadConfig(): AgKernelConfig {
  const configPath = findConfigFile();

  if (!configPath) {
    return { ...DEFAULTS };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    return {
      bloatLimit: typeof parsed.bloatLimit === "number" ? parsed.bloatLimit : DEFAULTS.bloatLimit,
      bytesPerToken: typeof parsed.bytesPerToken === "number" ? parsed.bytesPerToken : DEFAULTS.bytesPerToken,
      dbPath: typeof parsed.dbPath === "string" ? resolveDbPath(parsed.dbPath) : DEFAULTS.dbPath,
      logLevel: isValidLogLevel(parsed.logLevel) ? parsed.logLevel : DEFAULTS.logLevel,
    };
  } catch {
    console.warn(`⚠️  Failed to parse ${configPath}, using defaults`);
    return { ...DEFAULTS };
  }
}

function resolveDbPath(p: string): string {
  if (p.startsWith("~")) {
    return join(homedir(), p.slice(1));
  }
  return resolve(p);
}

function isValidLogLevel(level: unknown): level is AgKernelConfig["logLevel"] {
  return typeof level === "string" && ["debug", "info", "warn", "error"].includes(level);
}
