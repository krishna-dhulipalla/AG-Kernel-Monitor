/**
 * SQLite database schema and access layer using bun:sqlite.
 *
 * Tables:
 *   - workspaces:     workspace registry from storage.json
 *   - conversations:  per-conversation metrics (1:1 with .pb files)
 *   - snapshots:      historical trend tracking per conversation
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  uri: string;
  name: string;
  total_pb_bytes: number;
  total_brain_bytes: number;
  conversation_count: number;
  last_seen: string | null;
}

export interface Conversation {
  id: string;
  workspace_id: string | null;
  pb_file_bytes: number;
  brain_folder_bytes: number;
  brain_artifact_count: number;
  resolved_version_count: number;
  message_count: number | null;
  estimated_tokens: number;
  annotation_timestamp: number | null;
  created_at: string | null;
  last_modified: string | null;
}

export interface Snapshot {
  id: number;
  conversation_id: string;
  timestamp: string;
  pb_file_bytes: number | null;
  estimated_tokens: number | null;
  message_count: number | null;
  delta_bytes: number | null;
}

// ─── Schema DDL ─────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    uri TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    total_pb_bytes INTEGER DEFAULT 0,
    total_brain_bytes INTEGER DEFAULT 0,
    conversation_count INTEGER DEFAULT 0,
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    pb_file_bytes INTEGER DEFAULT 0,
    brain_folder_bytes INTEGER DEFAULT 0,
    brain_artifact_count INTEGER DEFAULT 0,
    resolved_version_count INTEGER DEFAULT 0,
    message_count INTEGER,
    estimated_tokens INTEGER DEFAULT 0,
    annotation_timestamp INTEGER,
    created_at TEXT,
    last_modified TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    pb_file_bytes INTEGER,
    estimated_tokens INTEGER,
    message_count INTEGER,
    delta_bytes INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_workspace
    ON conversations(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_snapshots_conversation
    ON snapshots(conversation_id);

  CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp
    ON snapshots(timestamp);
`;

// ─── Database Manager ───────────────────────────────────────────────────────

export class MonitorDB {
  private db: Database;

  constructor(dbPath: string) {
    // Ensure parent directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
  }

  /** Create tables if they don't exist */
  private init(): void {
    this.db.exec(SCHEMA_SQL);
  }

  // ─── Workspace CRUD ───────────────────────────────────────────────────

  upsertWorkspace(ws: Omit<Workspace, "total_pb_bytes" | "total_brain_bytes" | "conversation_count">): void {
    this.db.run(
      `INSERT INTO workspaces (id, uri, name, last_seen)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO UPDATE SET
         uri = excluded.uri,
         name = excluded.name,
         last_seen = excluded.last_seen`,
      [ws.id, ws.uri, ws.name, ws.last_seen]
    );
  }

  updateWorkspaceAggregates(workspaceId: string): void {
    this.db.run(
      `UPDATE workspaces SET
         total_pb_bytes = COALESCE((SELECT SUM(pb_file_bytes) FROM conversations WHERE workspace_id = ?1), 0),
         total_brain_bytes = COALESCE((SELECT SUM(brain_folder_bytes) FROM conversations WHERE workspace_id = ?1), 0),
         conversation_count = (SELECT COUNT(*) FROM conversations WHERE workspace_id = ?1)
       WHERE id = ?1`,
      [workspaceId]
    );
  }

  getAllWorkspaces(): Workspace[] {
    return this.db.query("SELECT * FROM workspaces ORDER BY total_pb_bytes DESC").all() as Workspace[];
  }

  getWorkspaceByName(name: string): Workspace | null {
    return this.db.query("SELECT * FROM workspaces WHERE name = ?1").get(name) as Workspace | null;
  }

  getWorkspaceById(id: string): Workspace | null {
    return this.db.query("SELECT * FROM workspaces WHERE id = ?1").get(id) as Workspace | null;
  }

  // ─── Conversation CRUD ────────────────────────────────────────────────

  upsertConversation(conv: Conversation): void {
    this.db.run(
      `INSERT INTO conversations (id, workspace_id, pb_file_bytes, brain_folder_bytes,
         brain_artifact_count, resolved_version_count, message_count,
         estimated_tokens, annotation_timestamp, created_at, last_modified)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         pb_file_bytes = excluded.pb_file_bytes,
         brain_folder_bytes = excluded.brain_folder_bytes,
         brain_artifact_count = excluded.brain_artifact_count,
         resolved_version_count = excluded.resolved_version_count,
         message_count = excluded.message_count,
         estimated_tokens = excluded.estimated_tokens,
         annotation_timestamp = excluded.annotation_timestamp,
         last_modified = excluded.last_modified`,
      [
        conv.id, conv.workspace_id, conv.pb_file_bytes, conv.brain_folder_bytes,
        conv.brain_artifact_count, conv.resolved_version_count, conv.message_count,
        conv.estimated_tokens, conv.annotation_timestamp, conv.created_at, conv.last_modified,
      ]
    );
  }

  getConversationsByWorkspace(workspaceId: string | null): Conversation[] {
    if (workspaceId === null) {
      return this.db.query(
        "SELECT * FROM conversations WHERE workspace_id IS NULL ORDER BY pb_file_bytes DESC"
      ).all() as Conversation[];
    }
    return this.db.query(
      "SELECT * FROM conversations WHERE workspace_id = ?1 ORDER BY pb_file_bytes DESC"
    ).all(workspaceId) as Conversation[];
  }

  getConversation(id: string): Conversation | null {
    return this.db.query("SELECT * FROM conversations WHERE id = ?1").get(id) as Conversation | null;
  }

  getAllConversations(): Conversation[] {
    return this.db.query("SELECT * FROM conversations ORDER BY pb_file_bytes DESC").all() as Conversation[];
  }

  deleteConversation(id: string): void {
    this.db.run("DELETE FROM snapshots WHERE conversation_id = ?1", [id]);
    this.db.run("DELETE FROM conversations WHERE id = ?1", [id]);
  }

  deleteConversationsByWorkspace(workspaceId: string): string[] {
    const convos = this.getConversationsByWorkspace(workspaceId);
    const ids = convos.map((c) => c.id);
    for (const id of ids) {
      this.deleteConversation(id);
    }
    return ids;
  }

  // ─── Snapshot CRUD ────────────────────────────────────────────────────

  insertSnapshot(snap: Omit<Snapshot, "id">): void {
    this.db.run(
      `INSERT INTO snapshots (conversation_id, timestamp, pb_file_bytes, estimated_tokens, message_count, delta_bytes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      [snap.conversation_id, snap.timestamp, snap.pb_file_bytes, snap.estimated_tokens, snap.message_count, snap.delta_bytes]
    );
  }

  getLatestSnapshot(conversationId: string): Snapshot | null {
    return this.db.query(
      "SELECT * FROM snapshots WHERE conversation_id = ?1 ORDER BY timestamp DESC LIMIT 1"
    ).get(conversationId) as Snapshot | null;
  }

  getSnapshotHistory(conversationId: string, limit = 50): Snapshot[] {
    return this.db.query(
      "SELECT * FROM snapshots WHERE conversation_id = ?1 ORDER BY timestamp DESC LIMIT ?2"
    ).all(conversationId, limit) as Snapshot[];
  }

  // ─── Aggregate Queries ────────────────────────────────────────────────

  getTotalStats(): { total_pb_bytes: number; total_brain_bytes: number; total_conversations: number; total_estimated_tokens: number } {
    return this.db.query(`
      SELECT
        COALESCE(SUM(pb_file_bytes), 0) as total_pb_bytes,
        COALESCE(SUM(brain_folder_bytes), 0) as total_brain_bytes,
        COUNT(*) as total_conversations,
        COALESCE(SUM(estimated_tokens), 0) as total_estimated_tokens
      FROM conversations
    `).get() as any;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  /** Expose raw db for advanced queries */
  raw(): Database {
    return this.db;
  }
}
