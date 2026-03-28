/**
 * Query the global state.vscdb (SQLite) for Antigravity state data.
 *
 * Extracts from ItemTable:
 *   - antigravityUnifiedStateSync.trajectorySummaries → conversation metadata
 *   - chat.ChatSessionStore.index → chat session → workspace mapping
 *   - antigravityUnifiedStateSync.modelCredits → credit usage
 *   - antigravityUnifiedStateSync.modelPreferences → current model selection
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { getGlobalStateDbPath } from "../paths";

export interface ChatSessionEntry {
  sessionId: string;
  workspaceUri?: string;
  workspaceFolder?: string;
  title?: string;
  lastModified?: string;
}

export interface TrajectorySummary {
  conversationId: string;
  title?: string;
  messageCount?: number;
  lastActivity?: string;
  workspaceUri?: string;
}

export interface ModelCredits {
  used: number;
  total: number;
  resetDate?: string;
  raw: unknown;
}

export interface StateVscdbResult {
  chatSessions: ChatSessionEntry[];
  trajectories: TrajectorySummary[];
  modelCredits: ModelCredits | null;
  modelPreferences: Record<string, unknown> | null;
  /** Map from conversation/session ID → workspace URI, built from all available data */
  sessionToWorkspace: Map<string, string>;
}

/**
 * Safely read a key from the ItemTable in state.vscdb.
 * Values are stored as BLOBs — typically JSON-serialized strings.
 */
function readItemTableValue(db: Database, key: string): unknown | null {
  try {
    const row = db.query("SELECT value FROM ItemTable WHERE key = ?1").get(key) as { value: Buffer | string } | null;
    if (!row) return null;

    let str: string;
    if (Buffer.isBuffer(row.value)) {
      str = row.value.toString("utf-8");
    } else if (typeof row.value === "string") {
      str = row.value;
    } else if (row.value instanceof Uint8Array) {
      str = new TextDecoder().decode(row.value);
    } else {
      return null;
    }

    try {
      return JSON.parse(str);
    } catch {
      // Not JSON — return raw string
      return str;
    }
  } catch {
    return null;
  }
}

/**
 * List all keys in the ItemTable (useful for discovery).
 */
export function listStateKeys(customPath?: string): string[] {
  const dbPath = customPath || getGlobalStateDbPath();
  if (!existsSync(dbPath)) return [];

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.query("SELECT key FROM ItemTable ORDER BY key").all() as { key: string }[];
    return rows.map((r) => r.key);
  } finally {
    db.close();
  }
}

/**
 * Parse the global state.vscdb for chat sessions, trajectories, credits, and preferences.
 */
export function parseStateVscdb(customPath?: string): StateVscdbResult | null {
  const dbPath = customPath || getGlobalStateDbPath();

  if (!existsSync(dbPath)) {
    console.warn(`⚠️  state.vscdb not found at: ${dbPath}`);
    return null;
  }

  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (err) {
    console.error(`❌ Failed to open state.vscdb:`, err);
    return null;
  }

  try {
    const sessionToWorkspace = new Map<string, string>();

    // ── Chat Session Store Index ──
    const chatSessions: ChatSessionEntry[] = [];
    const chatIndex = readItemTableValue(db, "chat.ChatSessionStore.index");
    if (chatIndex && typeof chatIndex === "object") {
      // chatIndex can be an array or an object with session keys
      const entries = Array.isArray(chatIndex)
        ? chatIndex
        : Object.values(chatIndex);

      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;

        const sessionId = String(e.sessionId || e.id || "");
        if (!sessionId) continue;

        const wsUri = String(e.workspaceUri || e.workspaceFolder || e.folder || "");
        const session: ChatSessionEntry = {
          sessionId,
          workspaceUri: wsUri || undefined,
          workspaceFolder: String(e.workspaceFolder || ""),
          title: String(e.title || ""),
          lastModified: String(e.lastModified || e.updatedAt || ""),
        };

        chatSessions.push(session);

        if (wsUri) {
          sessionToWorkspace.set(sessionId, wsUri);
        }
      }
    }

    // ── Trajectory Summaries ──
    const trajectories: TrajectorySummary[] = [];
    const trajRaw = readItemTableValue(db, "antigravityUnifiedStateSync.trajectorySummaries");
    if (trajRaw && typeof trajRaw === "object") {
      const entries = Array.isArray(trajRaw)
        ? trajRaw
        : Object.entries(trajRaw).map(([k, v]) => ({ conversationId: k, ...(v as object) }));

      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;

        const convId = String(e.conversationId || e.id || "");
        if (!convId) continue;

        trajectories.push({
          conversationId: convId,
          title: e.title ? String(e.title) : undefined,
          messageCount: typeof e.messageCount === "number" ? e.messageCount : undefined,
          lastActivity: e.lastActivity ? String(e.lastActivity) : undefined,
          workspaceUri: e.workspaceUri ? String(e.workspaceUri) : undefined,
        });

        if (e.workspaceUri) {
          sessionToWorkspace.set(convId, String(e.workspaceUri));
        }
      }
    }

    // ── Model Credits ──
    let modelCredits: ModelCredits | null = null;
    const creditsRaw = readItemTableValue(db, "antigravityUnifiedStateSync.modelCredits");
    if (creditsRaw && typeof creditsRaw === "object") {
      const c = creditsRaw as Record<string, unknown>;
      modelCredits = {
        used: typeof c.used === "number" ? c.used : 0,
        total: typeof c.total === "number" ? c.total : 0,
        resetDate: c.resetDate ? String(c.resetDate) : undefined,
        raw: creditsRaw,
      };
    }

    // ── Model Preferences ──
    let modelPreferences: Record<string, unknown> | null = null;
    const prefsRaw = readItemTableValue(db, "antigravityUnifiedStateSync.modelPreferences");
    if (prefsRaw && typeof prefsRaw === "object") {
      modelPreferences = prefsRaw as Record<string, unknown>;
    }

    return { chatSessions, trajectories, modelCredits, modelPreferences, sessionToWorkspace };
  } finally {
    db.close();
  }
}
