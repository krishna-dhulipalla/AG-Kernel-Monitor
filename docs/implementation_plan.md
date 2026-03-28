# AG-Kernel-Monitor — Implementation Plan (v2)

A Bun.js terminal utility for deep token consumption and cache bloat monitoring of Google Antigravity sessions, with SQLite persistence and CLI-first design.

**Sprint 0 Status**: ✅ COMPLETE — see [sprint-0-report.md](./sprint-0-report.md) and [runtime-investigation-report.md](./runtime-investigation-report.md)

---

## Post-Sprint-0 Architecture Decision

> [!IMPORTANT]
> The original plan assumed `.pb` files could be decoded for token-level content analysis. Sprint 0 proved they are AES-encrypted (8.0 bits/byte entropy). The runtime investigation then discovered **far richer local data sources** that make .pb decryption strategically irrelevant.

### New Core Ingestion Stack

| Priority | Source | Location | What It Provides |
|---|---|---|---|
| **★★★** | `storage.json` | `%APPDATA%\Antigravity\User\globalStorage\` | Complete workspace registry (28 URIs, 100% coverage) |
| **★★★** | `state.vscdb` | `%APPDATA%\Antigravity\User\globalStorage\` | `trajectorySummaries`, `ChatSessionStore.index`, `modelCredits`, `sidebarWorkspaces` |
| **★★☆** | `Antigravity.log` | `%APPDATA%\Antigravity\logs\<date>\...\` | Live chat message count per turn (`planner_generator.go:283`), API call traces, conversation UUIDs |
| **★★☆** | `brain/<uuid>/` | `~/.gemini/antigravity/brain/` | Planning artifacts, `.resolved.N` version history (turn count), `file://` workspace paths |
| **★☆☆** | `code_tracker/active/` | `~/.gemini/antigravity/code_tracker/` | Project name + git SHA per tracked workspace |
| **★☆☆** | `annotations/*.pbtxt` | `~/.gemini/antigravity/annotations/` | `last_user_view_time` timestamps (46% coverage) |
| **☆☆☆** | `.pb` file size | `~/.gemini/antigravity/conversations/` | Coarse size-based token estimation (fallback signal only) |

### Cross-Platform Path Resolution

| Platform | Antigravity Data | Electron User Data |
|---|---|---|
| Windows | `%USERPROFILE%\.gemini\antigravity\` | `%APPDATA%\Antigravity\User\` |
| macOS | `~/.gemini/antigravity/` | `~/Library/Application Support/Antigravity/User/` |
| Linux | `~/.gemini/antigravity/` | `~/.config/Antigravity/User/` |

---

## Sprint 1: Project Scaffolding & Data Layer (1 session)

**Goal**: Bun.js project, SQLite schema, config system, and cross-platform path resolution.

### [NEW] package.json
- Runtime: Bun.js
- Dependencies: `chalk` (terminal colors), `cli-table3` (tables), `commander` (CLI framework)
- No `tiktoken` — not needed with new ingestion strategy
- Scripts: `dev`, `start`, `build`, `test`

### [NEW] src/db/schema.ts
SQLite schema using `bun:sqlite`:

```sql
-- Workspaces from storage.json
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  uri TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  total_pb_bytes INTEGER DEFAULT 0,
  total_brain_bytes INTEGER DEFAULT 0,
  conversation_count INTEGER DEFAULT 0,
  last_seen TEXT
);

-- Conversations (1:1 with .pb files)
CREATE TABLE conversations (
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

-- Historical snapshots for trend tracking
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  pb_file_bytes INTEGER,
  estimated_tokens INTEGER,
  message_count INTEGER,
  delta_bytes INTEGER,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

### [NEW] src/config.ts
- Load `.ag-kernel.json` from `os.homedir()` or project root (project root takes priority)
- Config schema:
  ```json
  {
    "bloatLimit": 300000,
    "bytesPerToken": 3.5,
    "dbPath": "~/.ag-kernel/monitor.db",
    "logLevel": "info"
  }
  ```

### [NEW] src/paths.ts
- `getAntigravityDataDir()` → `~/.gemini/antigravity/`
- `getElectronUserDataDir()` → platform-specific Electron user data path
- `getConversationsDir()`, `getBrainDir()`, `getAnnotationsDir()`, `getCodeTrackerDir()`
- `getStorageJsonPath()`, `getGlobalStateDbPath()`
- `getLogDir()` → platform-specific Antigravity logs directory
- All using `os.homedir()` and `path.join()` for cross-platform

### [NEW] tsconfig.json
- Bun.js TypeScript config with strict mode

---

## Sprint 2: Source Ingestion & Workspace Mapping (1 session)

**Goal**: Parse all data sources, build the conversation→workspace mapping, persist to SQLite.

### [NEW] src/ingest/storage-json.ts
- Parse `storage.json` → extract `profileAssociations.workspaces`
- Extract all workspace URIs with their hashed keys
- Parse `antigravityUnifiedStateSync.sidebarWorkspaces` for active workspace state
- Parse `antigravityUnifiedStateSync.scratchWorkspaces` for playground workspaces
- Return: `Map<workspaceHash, workspaceURI>`

### [NEW] src/ingest/state-vscdb.ts
- Open global `state.vscdb` using `bun:sqlite` (read-only)
- Extract key values from `ItemTable`:
  - `antigravityUnifiedStateSync.trajectorySummaries` → conversation metadata/summaries
  - `chat.ChatSessionStore.index` → chat session → workspace mapping
  - `antigravityUnifiedStateSync.modelCredits` → credit usage data
  - `antigravityUnifiedStateSync.modelPreferences` → current model selection
- Parse BLOB values (likely JSON-serialized)
- Return structured data for each conversation

### [NEW] src/ingest/workspace-storage.ts
- Scan `%APPDATA%\Antigravity\User\workspaceStorage\<hash>\workspace.json`
- Map each `<hash>` → workspace URI
- Open per-workspace `state.vscdb` for workspace-specific state (if useful data found)
- Return: `Map<hash, workspaceURI>`

### [NEW] src/scanner/conversation-scanner.ts
- List all `conversations/*.pb` files → extract UUID, file size, mtime
- List all `brain/<uuid>/` folders → recursive disk size, artifact count, `.resolved.N` count
- Read `annotations/<uuid>.pbtxt` → `last_user_view_time` timestamps
- Correlate conversation UUID with workspace via:
  1. `chat.ChatSessionStore.index` from state.vscdb (primary)
  2. `brain/<uuid>/*.md` → extract `file:///` paths (secondary)
  3. `code_tracker/active/` directory names (tertiary)
  4. "Unmapped" bucket (fallback)

### [NEW] src/scanner/brain-scanner.ts
- Per brain folder: total bytes, file count, artifact types present
- Count `.resolved.N` files → estimate turn count per conversation
- Parse `*.metadata.json` for additional metadata
- Detect ghost artifacts: brain folders whose conversations may be stale

### [NEW] src/ingest/reconciler.ts
- Orchestrates all ingest modules
- Merges workspace mappings from all sources (storage.json wins conflicts)
- Writes complete data to SQLite: `workspaces` + `conversations` tables
- Takes initial snapshot into `snapshots` table
- Reports ingestion stats: conversations mapped, unmapped, orphans found

---

## Sprint 3: Token Estimation & Metrics Engine (1 session)

**Goal**: Calculate meaningful metrics from the ingested data.

### [NEW] src/metrics/estimator.ts
- **Token Estimation** (multi-signal):
  1. `message_count` from `state.vscdb` or log → `messages × avg_tokens_per_message`
  2. `.pb file size ÷ bytesPerToken` (configurable, default 3.5) — coarse fallback
  3. `brain_folder_bytes ÷ 4.0` — artifact context overhead
  4. `resolved_version_count` — model turn count (each version = one model action)
- **Bloat Score**: composite metric, 0–100, based on:
  - Estimated total tokens vs. context window limit
  - Message count growth rate
  - Brain folder weight relative to conversation
- **Bloat Threshold**: configurable via `.ag-kernel.json`, default 300K tokens

### [NEW] src/metrics/snapshotter.ts
- On each scan, diff current state against last snapshot in `snapshots` table
- Calculate `delta_bytes`, `delta_tokens`, `delta_messages`
- Persist new snapshot
- Provide historical trend data: "This session grew 2.1M tokens in the last 3 hours"

### [NEW] src/metrics/health.ts
- Per-conversation health assessment:
  - 🟢 HEALTHY: < 50% of bloat limit
  - 🟡 WARNING: 50–80% of bloat limit
  - 🔴 CRITICAL: > 80% of bloat limit
  - 💀 OVER: exceeds bloat limit
- Per-workspace aggregate health

---

## Sprint 4: CLI Dashboard & Commands (1 session)

**Goal**: Primary CLI interface with tables, colors, and bloat warnings.

### [NEW] src/cli/index.ts
- Main entry point using `commander`
- Subcommands: `scan`, `watch`, `report`, `nuke`, `serve`
- Global flags: `--config <path>`, `--json` (output raw JSON instead of tables)

### [NEW] src/cli/commands/scan.ts
`agk scan` — One-shot scan and display

**Workspace Summary Table:**
```
┌──────────────────────────┬───────────┬───────┬────────────┬────────────┬────────┐
│ Workspace                │ Est.Tokens│ Chats │ Messages   │ Brain Size │ Health │
├──────────────────────────┼───────────┼───────┼────────────┼────────────┼────────┤
│ Hiring-Trend-Tracker     │ 4.5M      │ 8     │ 312        │ 2.1 MB     │ 🔴     │
│ AG-Kernel-Monitor        │ 110K      │ 1     │ 94         │ 7.3 KB     │ 🟢     │
│ [Playground]             │ 800K      │ 6     │ ~45        │ 120 KB     │ 🟡     │
│ [Unmapped]               │ 200K      │ 3     │ —          │ 0 KB       │ 🟢     │
├──────────────────────────┼───────────┼───────┼────────────┼────────────┼────────┤
│ TOTAL                    │ 5.6M      │ 18    │ ~451       │ 2.3 MB     │        │
└──────────────────────────┴───────────┴───────┴────────────┴────────────┴────────┘
```

`agk scan --workspace "Hiring-Trend-Tracker"` — Drill into workspace:
```
┌──────────────┬──────────┬───────────┬──────────┬────────────┬─────────────┬────────┐
│ Session ID   │ .pb Size │ Est.Tokens│ Messages │ Brain Size │ Last Active │ Health │
├──────────────┼──────────┼───────────┼──────────┼────────────┼─────────────┼────────┤
│ e27b9e32...  │ 31.0 MB  │ 8.9M      │ 129      │ 7.3 KB     │ 2 hrs ago   │ 💀     │
│ 300b8d03...  │ 10.2 MB  │ 2.9M      │ 91       │ 320 KB     │ 3 days ago  │ 🔴     │
│ 4139a473...  │ 892 KB   │ 255K      │ 15       │ 0 KB       │ 1 week ago  │ 🟢     │
└──────────────┴──────────┴───────────┴──────────┴────────────┴─────────────┴────────┘
```

### [NEW] src/cli/commands/report.ts
`agk report` — Cache sync and ghost artifact report

- Orphan conversations (`.pb` without brain folder, or vice versa)
- Orphan annotations (`.pbtxt` without matching conversation)
- Ghost artifacts: brain folders with stale data
- Bloat limit violations with workspace IDs for cleanup targeting
- Disk usage summary: total `.pb` size, total brain size, total Electron data size

---

## Sprint 5: Real-Time File Watcher & Log Tailing (1 session)

**Goal**: Watch for live changes and display real-time session growth.

### [NEW] src/watcher/file-watcher.ts
- `fs.watch()` on `conversations/` directory for `.pb` file size changes
- Debounce rapid writes (500ms window)
- On change: update SQLite, calculate delta, display notification:
  ```
  [12:45:03] e27b9e32... +320 KB (+91K tokens) → 31.3 MB total (💀 OVER LIMIT)
  ```

### [NEW] src/watcher/log-tailer.ts
- Find the current `Antigravity.log` file:
  - `%APPDATA%\Antigravity\logs\<latest-date>\window1\exthost\google.antigravity\Antigravity.log`
- Tail the file, parse lines matching:
  - `planner_generator.go:283] Requesting planner with N chat messages` → extract message count
  - `interceptor.go:74]` → extract active conversation UUID
  - `http_helpers.go:123]` → detect API call activity
- Update SQLite `conversations.message_count` on each parsed line
- Display: `[LIVE] Session e27b... now at 103 messages (+12 since start)`

### [MODIFY] src/cli/commands/scan.ts
- Add `--watch` / `-w` flag to enter live-update mode
- Combines file watcher + log tailer into a single live dashboard
- Clears and re-renders table on each update (or appends delta lines)

---

## Sprint 6: Nuke Command, HTTP Endpoint & Polish (1 session)

**Goal**: Destructive cleanup, secondary JSON endpoint, documentation.

### [NEW] src/cli/commands/nuke.ts
`agk nuke --workspace "Hiring-Trend-Tracker"` — Delete all data for a workspace

- `--dry-run`: List all files + sizes that WOULD be deleted, no actual deletion
- Without `--dry-run`: Mandatory confirmation prompt:
  ```
  ⚠️  This will permanently delete:
    4 conversation .pb files (52.1 MB)
    4 brain folders (2.3 MB)
    3 annotation .pbtxt files (168 bytes)
    SQLite entries for 4 conversations
  
  Type "Hiring-Trend-Tracker" to confirm: _
  ```
- Deletes: `.pb` files, `brain/` folders, `annotations/*.pbtxt`, SQLite rows
- Summary: `✅ Deleted 4 conversations, freed 54.4 MB`

`agk nuke --conversation <uuid>` — Delete a single conversation (same safety flow)

### [NEW] src/server/index.ts
`agk serve` — Secondary JSON endpoint

- `Bun.serve()` on `localhost:3000`
- `GET /api/workspaces` → workspace summary JSON
- `GET /api/conversations?workspace=<name>` → conversation details
- `GET /api/conversation/<uuid>` → single conversation detail with snapshots
- `GET /api/health` → overall system health + ingestion stats
- No HTML, no graphs — raw JSON only

### [MODIFY] README.md
- Installation: `bun install`, `bun run dev`
- Usage: all CLI commands with examples
- Configuration: `.ag-kernel.json` reference
- Architecture: data source mapping diagram
- Sprint 0 findings summary

---

## Verification Plan

### Sprint 1
- `bun test` — SQLite schema creation, CRUD on all three tables
- Verify path resolution returns correct directories on Windows

### Sprint 2
- Parse actual `storage.json` → verify 28 workspace URIs extracted
- Query `state.vscdb` → verify `trajectorySummaries` and `ChatSessionStore.index` are readable
- Verify conversation scanner finds all 41 `.pb` files with correct sizes
- Verify brain scanner matches all 41 brain folders

### Sprint 3
- Estimate tokens for known conversations:
  - `e27b9e32...` (31 MB) → ~8.9M tokens at 3.5 bytes/token
  - `6cfdf254...` (220 KB) → ~63K tokens
- Verify bloat scoring produces sensible health indicators

### Sprint 4
- Run `agk scan` → visually verify table renders with correct data
- Run `agk scan --workspace "..."` → drill-down table correct
- Run `agk report` → verify orphan/ghost detection

### Sprint 5
- Start `agk scan --watch`, send a message in Antigravity → verify live delta
- Verify log tailer extracts message count from `Antigravity.log`

### Sprint 6
- `agk nuke --dry-run --workspace "test"` → verify file listing without deletion
- `curl localhost:3000/api/workspaces` → verify JSON response
- Cross-platform: verify `src/paths.ts` resolves correctly for macOS paths (manual review)

---

## Open Questions

> [!NOTE]
> **1. state.vscdb BLOB format**: The values in `ItemTable` are stored as BLOBs. They're most likely JSON-serialized strings, but could be binary protobuf. Sprint 2 will confirm during initial parsing. If protobuf, we'll use raw string extraction.
>
> **2. `trajectorySummaries` structure**: This key almost certainly contains conversation step history, but we haven't inspected the actual value yet. Sprint 2 will extract and document the schema. If it contains message counts and conversation UUIDs, it becomes our primary data source for token estimation.
>
> **3. Antigravity.log rotation**: Logs are stored in date-based directories. The log tailer will need to detect the "latest" log directory on startup and handle rotation gracefully.
>
> **4. state.vscdb file locking**: Antigravity (Electron) may hold a write lock on `state.vscdb` while running. We open read-only, which should work — but if Electron uses WAL mode and we can't read the WAL, we may get stale data. Sprint 2 will test this.
