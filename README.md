# AG-Kernel-Monitor

Deep token consumption and cache bloat monitoring for Google Antigravity sessions.

A Bun.js terminal utility that provides granular transparency into the hidden token costs of Antigravity agent sessions — distinguishing between conversation history, reasoning tokens, and brain artifact overhead — with SQLite persistence and CLI-first design.

## Why

Antigravity's agent sessions silently accumulate context that can exceed 500K tokens, causing latency and degraded model performance. There's no built-in tool to tell you exactly **why** a session is heavy. This tool fills that gap by:

- **Granular Transparency**: Breaking down token usage across conversation files, brain artifacts, and model turns
- **Session Hygiene**: Identifying when a session has reached peak utility so you can reset before degradation
- **Data Integrity**: Maintaining persistent historical records that survive IDE restarts
- **Cache Alignment**: Detecting "ghost" artifacts — brain folders orphaned from deleted conversations

## Installation

```bash
# Clone the repo
git clone https://github.com/your-username/AG-Kernel-Monitor.git
cd AG-Kernel-Monitor

# Install dependencies (requires Bun.js)
bun install
```

Requires [Bun.js](https://bun.sh/) runtime.

## Usage

### One-shot scan

```bash
# Workspace summary
bun run dev scan

# Drill into a workspace
bun run dev scan --workspace "My-Project"

# Live monitoring mode
bun run dev scan --watch

# JSON output
bun run dev scan --json
```

### Health report

```bash
# Full health report: orphans, ghosts, bloat violations
bun run dev report
```

### Destructive cleanup

```bash
# Preview what would be deleted (safe)
bun run dev nuke --workspace "My-Project" --dry-run

# Delete all data for a workspace (requires confirmation)
bun run dev nuke --workspace "My-Project"

# Delete a single conversation
bun run dev nuke --conversation <uuid>
```

### JSON API server

```bash
# Start API on localhost:3000
bun run dev serve

# Custom port
bun run dev serve --port 8080
```

**Endpoints:**

| Endpoint | Description |
|---|---|
| `GET /api/workspaces` | Workspace summary |
| `GET /api/conversations?workspace=<name>` | Conversations for a workspace |
| `GET /api/conversation/<uuid>` | Single conversation with snapshots |
| `GET /api/health` | System health overview |

## Configuration

Create `.ag-kernel.json` in your project root or home directory:

```json
{
  "bloatLimit": 300000,
  "bytesPerToken": 3.5,
  "dbPath": "~/.ag-kernel/monitor.db",
  "logLevel": "info"
}
```

| Key | Default | Description |
|---|---|---|
| `bloatLimit` | `300000` | Token threshold for bloat warnings |
| `bytesPerToken` | `3.5` | Estimated bytes per token for `.pb` → token conversion |
| `dbPath` | `~/.ag-kernel/monitor.db` | SQLite database location |
| `logLevel` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Architecture

```
Data Sources
├── storage.json          ★★★  Complete workspace registry
├── state.vscdb           ★★★  Chat sessions, trajectories, model credits
├── Antigravity.log       ★★☆  Live message counts, API call traces
├── brain/<uuid>/         ★★☆  Planning artifacts, turn counts (resolved.N)
├── code_tracker/active/  ★☆☆  Project names + git SHAs
├── annotations/*.pbtxt   ★☆☆  Last user view timestamps
└── conversations/*.pb    ☆☆☆  Coarse size-based token estimation (fallback)

Pipeline
  storage.json + state.vscdb + workspace.json
    → Workspace Registry
    → Conversation ↔ Workspace Mapping
    → Token Estimation (multi-signal)
    → SQLite Persistence
    → CLI Tables / JSON API
```

### Cross-Platform Support

| Platform | Antigravity Data | Electron User Data |
|---|---|---|
| Windows | `%USERPROFILE%\.gemini\antigravity\` | `%APPDATA%\Antigravity\User\` |
| macOS | `~/.gemini/antigravity/` | `~/Library/Application Support/Antigravity/User/` |
| Linux | `~/.gemini/antigravity/` | `~/.config/Antigravity/User/` |

## Health Indicators

| Emoji | Status | Threshold |
|---|---|---|
| 🟢 | HEALTHY | < 50% of bloat limit |
| 🟡 | WARNING | 50–80% of bloat limit |
| 🔴 | CRITICAL | > 80% of bloat limit |
| 💀 | OVER | Exceeds bloat limit |

## Project Structure

```
src/
├── cli/
│   ├── index.ts              CLI entry point (commander)
│   └── commands/
│       ├── scan.ts            One-shot scan + tables
│       ├── report.ts          Health report
│       └── nuke.ts            Destructive cleanup
├── config.ts                  Config loader
├── paths.ts                   Cross-platform path resolution
├── db/
│   └── schema.ts              SQLite schema + CRUD
├── ingest/
│   ├── storage-json.ts        Parse storage.json
│   ├── state-vscdb.ts         Query state.vscdb
│   ├── workspace-storage.ts   Scan workspace storage dirs
│   └── reconciler.ts          Orchestrate all ingestion
├── scanner/
│   ├── conversation-scanner.ts  Scan .pb files + annotations
│   └── brain-scanner.ts        Scan brain folders
├── metrics/
│   ├── estimator.ts            Token estimation engine
│   ├── snapshotter.ts          Historical snapshot diffing
│   └── health.ts               Health assessment (🟢🟡🔴💀)
├── watcher/
│   ├── file-watcher.ts         fs.watch on conversations/
│   └── log-tailer.ts           Tail Antigravity.log
└── server/
    └── index.ts                Bun.serve JSON API
```

## License

MIT
