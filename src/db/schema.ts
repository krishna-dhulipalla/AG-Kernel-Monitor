/**
 * SQLite database schema and access layer using sql.js.
 *
 * Tables:
 *   - workspaces:     workspace registry from Antigravity metadata
 *   - conversations:  canonical conversation telemetry records
 *   - snapshots:      historical trend tracking per conversation
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
  private dbPath: string;

  private constructor(dbPath: string, db: Database) {
    this.dbPath = dbPath;
    this.db = db;
    this.db.exec("PRAGMA foreign_keys = ON");
    this.init();
  }

  static async create(dbPath: string): Promise<MonitorDB> {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db;
    if (existsSync(dbPath)) {
      const filebuffer = readFileSync(dbPath);
      db = new SQL.Database(filebuffer);
    } else {
      db = new SQL.Database();
    }
    return new MonitorDB(dbPath, db);
  }

  save(): void {
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  private queryAll(sql: string, params: any[] = []): any[] {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  private queryGet(sql: string, params: any[] = []): any {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  private run(sql: string, params: any[] = []): void {
    this.db.run(sql, params);
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
    const columns = this.queryAll(`PRAGMA table_info(${table})`) as { name: string }[];
    if (columns.some((entry) => entry.name === column)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  upsertWorkspace(ws: Omit<Workspace, "total_pb_bytes" | "total_brain_bytes" | "conversation_count">): void {
    const upsertSql = `
      INSERT INTO workspaces (id, uri, name, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        uri = excluded.uri,
        name = excluded.name,
        last_seen = excluded.last_seen
    `;
    this.run(upsertSql, [ws.id, ws.uri, ws.name, ws.last_seen || null]);
  }

  updateWorkspaceAggregates(workspaceId: string): void {
    this.run(
      `UPDATE workspaces SET
         total_pb_bytes = COALESCE((SELECT SUM(pb_file_bytes) FROM conversations WHERE workspace_id = ?), 0),
         total_brain_bytes = COALESCE((SELECT SUM(brain_folder_bytes) FROM conversations WHERE workspace_id = ?), 0),
         conversation_count = (SELECT COUNT(*) FROM conversations WHERE workspace_id = ?)
       WHERE id = ?`,
      [workspaceId, workspaceId, workspaceId, workspaceId]
    );
  }

  getAllWorkspaces(): Workspace[] {
    return this.queryAll("SELECT * FROM workspaces ORDER BY total_pb_bytes DESC") as Workspace[];
  }

  getWorkspaceByName(name: string): Workspace | null {
    return this.queryGet("SELECT * FROM workspaces WHERE name = ?", [name]) as Workspace | null;
  }

  getWorkspaceById(id: string): Workspace | null {
    return this.queryGet("SELECT * FROM workspaces WHERE id = ?", [id]) as Workspace | null;
  }

  upsertConversation(conv: Conversation): void {
    const upsertSql = `
       INSERT INTO conversations (
         id, workspace_id, title, pb_file_bytes, brain_folder_bytes,
         brain_artifact_count, resolved_version_count, message_count,
         message_count_source, estimated_prompt_tokens, estimated_artifact_tokens,
         estimated_tokens, annotation_timestamp, created_at, last_modified,
         last_active_at, activity_source, mapping_source, mapping_confidence, mapping_notes, is_active
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         is_active = excluded.is_active
    `;
    this.run(upsertSql, [
      conv.id,
      conv.workspace_id || null,
      conv.title || null,
      conv.pb_file_bytes,
      conv.brain_folder_bytes,
      conv.brain_artifact_count,
      conv.resolved_version_count,
      conv.message_count ?? null,
      conv.message_count_source || null,
      conv.estimated_prompt_tokens,
      conv.estimated_artifact_tokens,
      conv.estimated_tokens,
      conv.annotation_timestamp ?? null,
      conv.created_at || null,
      conv.last_modified || null,
      conv.last_active_at || null,
      conv.activity_source || null,
      conv.mapping_source || null,
      conv.mapping_confidence ?? null,
      conv.mapping_notes || null,
      conv.is_active,
    ]);
  }

  getConversationsByWorkspace(workspaceId: string | null): Conversation[] {
    if (workspaceId === null) {
      return this.queryAll(
        "SELECT * FROM conversations WHERE workspace_id IS NULL ORDER BY estimated_tokens DESC, pb_file_bytes DESC"
      ) as Conversation[];
    }

    return this.queryAll(
      "SELECT * FROM conversations WHERE workspace_id = ? ORDER BY estimated_tokens DESC, pb_file_bytes DESC",
      [workspaceId]
    ) as Conversation[];
  }

  getConversation(id: string): Conversation | null {
    return this.queryGet("SELECT * FROM conversations WHERE id = ?", [id]) as Conversation | null;
  }

  getAllConversations(): Conversation[] {
    return this.queryAll(
      "SELECT * FROM conversations ORDER BY estimated_tokens DESC, pb_file_bytes DESC"
    ) as Conversation[];
  }

  getCurrentConversation(): Conversation | null {
    return this.queryGet(
      `SELECT * FROM conversations
       ORDER BY is_active DESC, COALESCE(last_active_at, last_modified) DESC, estimated_tokens DESC
       LIMIT 1`
    ) as Conversation | null;
  }

  deleteConversation(id: string): void {
    this.run("DELETE FROM snapshots WHERE conversation_id = ?", [id]);
    this.run("DELETE FROM conversations WHERE id = ?", [id]);
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
    const current = this.queryAll("SELECT id FROM conversations") as { id: string }[];
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
    this.run("UPDATE conversations SET is_active = 0");
  }

  insertSnapshot(snap: Omit<Snapshot, "id">): void {
    this.run(
      `INSERT INTO snapshots (conversation_id, timestamp, pb_file_bytes, estimated_tokens, message_count, delta_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        snap.conversation_id,
        snap.timestamp,
        snap.pb_file_bytes ?? null,
        snap.estimated_tokens ?? null,
        snap.message_count ?? null,
        snap.delta_bytes ?? null,
      ]
    );
  }

  getLatestSnapshot(conversationId: string): Snapshot | null {
    return this.queryGet(
      "SELECT * FROM snapshots WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT 1",
      [conversationId]
    ) as Snapshot | null;
  }

  getSnapshotHistory(conversationId: string, limit = 50): Snapshot[] {
    return this.queryAll(
      "SELECT * FROM snapshots WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?",
      [conversationId, limit]
    ) as Snapshot[];
  }

  getTotalStats(): {
    total_pb_bytes: number;
    total_brain_bytes: number;
    total_conversations: number;
    total_estimated_tokens: number;
  } {
    return this.queryGet(`
      SELECT
        COALESCE(SUM(pb_file_bytes), 0) as total_pb_bytes,
        COALESCE(SUM(brain_folder_bytes), 0) as total_brain_bytes,
        COUNT(*) as total_conversations,
        COALESCE(SUM(estimated_tokens), 0) as total_estimated_tokens
      FROM conversations
    `) as {
      total_pb_bytes: number;
      total_brain_bytes: number;
      total_conversations: number;
      total_estimated_tokens: number;
    };
  }

  close(): void {
    // sql.js doesn't need to be explicitly closed in the same way, but we can just free memory if desired.
  }

  raw(): Database {
    return this.db;
  }
}
