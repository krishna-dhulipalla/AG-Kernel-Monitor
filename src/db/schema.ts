/**
 * SQLite database schema and access layer using bun:sqlite.
 *
 * Tables:
 *   - workspaces:     workspace registry from Antigravity metadata
 *   - conversations:  canonical conversation telemetry records
 *   - snapshots:      historical trend tracking per conversation
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

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
  title: string | null;
  pb_file_bytes: number;
  brain_folder_bytes: number;
  brain_artifact_count: number;
  resolved_version_count: number;
  message_count: number | null;
  message_count_source: string | null;
  estimated_prompt_tokens: number;
  estimated_artifact_tokens: number;
  estimated_tokens: number;
  annotation_timestamp: number | null;
  created_at: string | null;
  last_modified: string | null;
  last_active_at: string | null;
  activity_source: string | null;
  mapping_source: string | null;
  mapping_confidence: number | null;
  mapping_notes: string | null;
  is_active: number;
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
    title TEXT,
    pb_file_bytes INTEGER DEFAULT 0,
    brain_folder_bytes INTEGER DEFAULT 0,
    brain_artifact_count INTEGER DEFAULT 0,
    resolved_version_count INTEGER DEFAULT 0,
    message_count INTEGER,
    message_count_source TEXT,
    estimated_prompt_tokens INTEGER DEFAULT 0,
    estimated_artifact_tokens INTEGER DEFAULT 0,
    estimated_tokens INTEGER DEFAULT 0,
    annotation_timestamp INTEGER,
    created_at TEXT,
    last_modified TEXT,
    last_active_at TEXT,
    activity_source TEXT,
    mapping_source TEXT,
    mapping_confidence REAL,
    mapping_notes TEXT,
    is_active INTEGER DEFAULT 0,
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

export class MonitorDB {
  private db: Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(SCHEMA_SQL);
    this.ensureColumn("conversations", "title", "TEXT");
    this.ensureColumn("conversations", "message_count_source", "TEXT");
    this.ensureColumn("conversations", "estimated_prompt_tokens", "INTEGER DEFAULT 0");
    this.ensureColumn("conversations", "estimated_artifact_tokens", "INTEGER DEFAULT 0");
    this.ensureColumn("conversations", "last_active_at", "TEXT");
    this.ensureColumn("conversations", "activity_source", "TEXT");
    this.ensureColumn("conversations", "mapping_source", "TEXT");
    this.ensureColumn("conversations", "mapping_confidence", "REAL");
    this.ensureColumn("conversations", "mapping_notes", "TEXT");
    this.ensureColumn("conversations", "is_active", "INTEGER DEFAULT 0");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(is_active, last_active_at)");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((entry) => entry.name === column)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

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

  upsertConversation(conv: Conversation): void {
    this.db.run(
      `INSERT INTO conversations (
         id, workspace_id, title, pb_file_bytes, brain_folder_bytes,
         brain_artifact_count, resolved_version_count, message_count,
         message_count_source, estimated_prompt_tokens, estimated_artifact_tokens,
         estimated_tokens, annotation_timestamp, created_at, last_modified,
         last_active_at, activity_source, mapping_source, mapping_confidence, mapping_notes, is_active
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
       ON CONFLICT(id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         title = excluded.title,
         pb_file_bytes = excluded.pb_file_bytes,
         brain_folder_bytes = excluded.brain_folder_bytes,
         brain_artifact_count = excluded.brain_artifact_count,
         resolved_version_count = excluded.resolved_version_count,
         message_count = excluded.message_count,
         message_count_source = excluded.message_count_source,
         estimated_prompt_tokens = excluded.estimated_prompt_tokens,
         estimated_artifact_tokens = excluded.estimated_artifact_tokens,
         estimated_tokens = excluded.estimated_tokens,
         annotation_timestamp = excluded.annotation_timestamp,
         last_modified = excluded.last_modified,
         last_active_at = excluded.last_active_at,
         activity_source = excluded.activity_source,
         mapping_source = excluded.mapping_source,
         mapping_confidence = excluded.mapping_confidence,
         mapping_notes = excluded.mapping_notes,
         is_active = excluded.is_active`,
      [
        conv.id,
        conv.workspace_id,
        conv.title,
        conv.pb_file_bytes,
        conv.brain_folder_bytes,
        conv.brain_artifact_count,
        conv.resolved_version_count,
        conv.message_count,
        conv.message_count_source,
        conv.estimated_prompt_tokens,
        conv.estimated_artifact_tokens,
        conv.estimated_tokens,
        conv.annotation_timestamp,
        conv.created_at,
        conv.last_modified,
        conv.last_active_at,
        conv.activity_source,
        conv.mapping_source,
        conv.mapping_confidence,
        conv.mapping_notes,
        conv.is_active,
      ]
    );
  }

  getConversationsByWorkspace(workspaceId: string | null): Conversation[] {
    if (workspaceId === null) {
      return this.db.query(
        "SELECT * FROM conversations WHERE workspace_id IS NULL ORDER BY estimated_tokens DESC, pb_file_bytes DESC"
      ).all() as Conversation[];
    }

    return this.db.query(
      "SELECT * FROM conversations WHERE workspace_id = ?1 ORDER BY estimated_tokens DESC, pb_file_bytes DESC"
    ).all(workspaceId) as Conversation[];
  }

  getConversation(id: string): Conversation | null {
    return this.db.query("SELECT * FROM conversations WHERE id = ?1").get(id) as Conversation | null;
  }

  getAllConversations(): Conversation[] {
    return this.db.query(
      "SELECT * FROM conversations ORDER BY estimated_tokens DESC, pb_file_bytes DESC"
    ).all() as Conversation[];
  }

  getCurrentConversation(): Conversation | null {
    return this.db.query(
      `SELECT * FROM conversations
       ORDER BY is_active DESC, COALESCE(last_active_at, last_modified) DESC, estimated_tokens DESC
       LIMIT 1`
    ).get() as Conversation | null;
  }

  deleteConversation(id: string): void {
    this.db.run("DELETE FROM snapshots WHERE conversation_id = ?1", [id]);
    this.db.run("DELETE FROM conversations WHERE id = ?1", [id]);
  }

  deleteConversationsByWorkspace(workspaceId: string): string[] {
    const conversations = this.getConversationsByWorkspace(workspaceId);
    const ids = conversations.map((conversation) => conversation.id);
    for (const id of ids) {
      this.deleteConversation(id);
    }
    return ids;
  }

  deleteConversationsNotIn(ids: string[]): string[] {
    const current = this.db.query("SELECT id FROM conversations").all() as { id: string }[];
    const allowed = new Set(ids);
    const removed: string[] = [];

    for (const row of current) {
      if (!allowed.has(row.id)) {
        this.deleteConversation(row.id);
        removed.push(row.id);
      }
    }

    return removed;
  }

  clearActiveConversation(): void {
    this.db.run("UPDATE conversations SET is_active = 0");
  }

  insertSnapshot(snap: Omit<Snapshot, "id">): void {
    this.db.run(
      `INSERT INTO snapshots (conversation_id, timestamp, pb_file_bytes, estimated_tokens, message_count, delta_bytes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      [
        snap.conversation_id,
        snap.timestamp,
        snap.pb_file_bytes,
        snap.estimated_tokens,
        snap.message_count,
        snap.delta_bytes,
      ]
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

  getTotalStats(): {
    total_pb_bytes: number;
    total_brain_bytes: number;
    total_conversations: number;
    total_estimated_tokens: number;
  } {
    return this.db.query(`
      SELECT
        COALESCE(SUM(pb_file_bytes), 0) as total_pb_bytes,
        COALESCE(SUM(brain_folder_bytes), 0) as total_brain_bytes,
        COUNT(*) as total_conversations,
        COALESCE(SUM(estimated_tokens), 0) as total_estimated_tokens
      FROM conversations
    `).get() as {
      total_pb_bytes: number;
      total_brain_bytes: number;
      total_conversations: number;
      total_estimated_tokens: number;
    };
  }

  close(): void {
    this.db.close();
  }

  raw(): Database {
    return this.db;
  }
}
