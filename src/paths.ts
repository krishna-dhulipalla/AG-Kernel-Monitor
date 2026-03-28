/**
 * Cross-platform path resolution for Antigravity data directories.
 *
 * | Platform | Antigravity Data                       | Electron User Data                              |
 * |----------|----------------------------------------|--------------------------------------------------|
 * | Windows  | %USERPROFILE%\.gemini\antigravity\      | %APPDATA%\Antigravity\User\                      |
 * | macOS    | ~/.gemini/antigravity/                  | ~/Library/Application Support/Antigravity/User/   |
 * | Linux    | ~/.gemini/antigravity/                  | ~/.config/Antigravity/User/                       |
 */

import { homedir, platform } from "os";
import { join } from "path";

export type Platform = "win32" | "darwin" | "linux";

function currentPlatform(): Platform {
  const p = platform();
  if (p === "win32" || p === "darwin" || p === "linux") return p;
  // Fallback to linux-style paths for other Unix variants
  return "linux";
}

// ─── Antigravity CLI Data (~/.gemini/antigravity/) ──────────────────────────

/** Root of the Antigravity agent data store */
export function getAntigravityDataDir(): string {
  return join(homedir(), ".gemini", "antigravity");
}

/** Conversation .pb files */
export function getConversationsDir(): string {
  return join(getAntigravityDataDir(), "conversations");
}

/** Brain planning artifacts (per-conversation UUID folders) */
export function getBrainDir(): string {
  return join(getAntigravityDataDir(), "brain");
}

/** Annotation .pbtxt files */
export function getAnnotationsDir(): string {
  return join(getAntigravityDataDir(), "annotations");
}

/** Code tracker active workspace entries */
export function getCodeTrackerDir(): string {
  return join(getAntigravityDataDir(), "code_tracker", "active");
}

// ─── Electron User Data (platform-specific) ────────────────────────────────

/** Platform-specific Electron user data directory */
export function getElectronUserDataDir(): string {
  const p = currentPlatform();
  switch (p) {
    case "win32":
      return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Antigravity", "User");
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Antigravity", "User");
    case "linux":
      return join(homedir(), ".config", "Antigravity", "User");
  }
}

/** storage.json — master workspace registry */
export function getStorageJsonPath(): string {
  return join(getElectronUserDataDir(), "globalStorage", "storage.json");
}

/** Global state.vscdb — contains trajectorySummaries, ChatSessionStore, etc. */
export function getGlobalStateDbPath(): string {
  return join(getElectronUserDataDir(), "globalStorage", "state.vscdb");
}

/** Workspace storage root (per-hash workspace folders) */
export function getWorkspaceStorageDir(): string {
  return join(getElectronUserDataDir(), "workspaceStorage");
}

/** Antigravity log directory (platform-specific, date-based) */
export function getLogDir(): string {
  const p = currentPlatform();
  switch (p) {
    case "win32":
      return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Antigravity", "logs");
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Antigravity", "logs");
    case "linux":
      return join(homedir(), ".config", "Antigravity", "logs");
  }
}

/** Default database path */
export function getDefaultDbPath(): string {
  return join(homedir(), ".ag-kernel", "monitor.db");
}
