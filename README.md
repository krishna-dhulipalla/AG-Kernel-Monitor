# AG-Kernel-Monitor

CLI monitoring for Google Antigravity session growth, estimated context bloat, and cleanup decisions.

AG Kernel Monitor is a Bun-based local utility that scans Antigravity data, maps conversations back to workspaces, tracks estimated context growth, and highlights sessions that are becoming expensive to keep alive.

This project is `CLI First`. Token and context numbers are labeled as `estimated` unless they come directly from runtime signals such as live logs.

## Why

Antigravity sessions can silently accumulate large amounts of context across:

- conversation history
- planning and brain artifacts
- cached workspace state

The main problem is not just "a session is large". The useful questions are:

- Which conversation is active right now?
- How large is its current estimated context?
- How much did the last turn add?
- Which workspace does it belong to?
- Which sessions are safe cleanup targets?
- Which artifacts are orphaned or unmapped?

AG Kernel Monitor is built to answer those questions in a way the Antigravity UI currently does not.

## Current Scope

The monitor currently provides:

- workspace and conversation scans
- current or most recent conversation visibility
- estimated prompt/history and artifact token breakdowns
- mapping provenance and confidence
- live watch mode for file and log growth
- cleanup-oriented reporting for large and unmapped sessions
- a local JSON API for downstream UI work

It does not claim exact model billing, exact reasoning-token accounting, or exact dollar-cost reporting.

## Installation

```bash
git clone https://github.com/your-username/AG-Kernel-Monitor.git
cd AG-Kernel-Monitor
bun install
```

Requires [Bun.js](https://bun.sh/).

## Usage

### Scan

```bash
# Workspace summary plus current conversation
bun run dev scan

# Show only the current or most recent conversation
bun run dev scan --current

# Drill into a workspace
bun run dev scan --workspace "My-Project"

# Drill into a single conversation
bun run dev scan --conversation <uuid>

# Live monitoring mode
bun run dev scan --watch

# JSON output
bun run dev scan --json
```

### Report

```bash
# Action-oriented health report
bun run dev report

# JSON report
bun run dev report --json
```

### Cleanup

```bash
# Preview what would be deleted
bun run dev nuke --workspace "My-Project" --dry-run

# Delete all data for a workspace
bun run dev nuke --workspace "My-Project"

# Delete a single conversation
bun run dev nuke --conversation <uuid>
```

### Local API

```bash
# Start API on localhost:3000
bun run dev serve

# Custom port
bun run dev serve --port 8080
```

Endpoints:

- `GET /api/workspaces`
- `GET /api/conversations?workspace=<name>`
- `GET /api/conversation/<uuid>`
- `GET /api/health`

## VS Code / Open VSX Sidebar

The repo now includes a VS Code sidebar extension scaffold that reuses the same AG Kernel Monitor model through the bundled CLI.

What it shows:

- current conversation
- workspace details for the active editor or current conversation
- global brain/cache cleanup view
- extension settings and runtime info

Build the bundled CLI used by the extension:

```bash
bun run build:vsx-cli
```

Current requirement:

- Bun must still be installed on the machine because the extension runs the bundled CLI with Bun.

Current extension files:

- `vscode/extension.cjs`
- `vscode/runtime/agk-cli.js`
- `vscode/media/activity.svg`

## Output Model

Conversation-level output includes:

- `title`
- `isActive`
- `lastActiveAt`
- `mappingSource`
- `mappingConfidence`
- `messageCountSource`
- `estimatedPromptTokens`
- `estimatedArtifactTokens`
- `estimatedTotalTokens`
- `contextRatio`
- `deltaEstimatedTokens`
- `whyHeavy`

Workspace-level output includes:

- `activeConversationCount`
- `largestConversationId`
- `largestConversationTokens`
- `mappedConversationCount`
- `unmappedConversationCount`

## Configuration

Create `.ag-kernel.json` in the project root or home directory:

```json
{
  "bloatLimit": 1000000,
  "bytesPerToken": 3.5,
  "dbPath": "~/.ag-kernel/monitor.db",
  "logLevel": "info"
}
```

You can also pass a config explicitly:

```bash
bun run dev scan --config .ag-kernel.json
```

| Key | Default | Description |
|---|---|---|
| `bloatLimit` | `1000000` | Estimated token threshold for bloat warnings |
| `bytesPerToken` | `3.5` | Estimated bytes per token for `.pb` size conversion |
| `dbPath` | `~/.ag-kernel/monitor.db` | SQLite database location |
| `logLevel` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Data Sources

The monitor builds its view from multiple sources:

- `storage.json` for workspace registry data
- `state.vscdb` for trajectory summaries and session hints
- `Antigravity.log` for live activity and message-count signals
- `brain/<uuid>/` for artifact size and mapping clues
- `annotations/*.pbtxt` for last-view timestamps
- `conversations/*.pb` for size-based fallback estimation

The scanner prefers stronger signals first and falls back to size-based estimation only when necessary.

## Health States

| Status | Meaning |
|---|---|
| `HEALTHY` | Below 50% of bloat limit |
| `WARNING` | 50% to 80% of bloat limit |
| `CRITICAL` | Above 80% of bloat limit |
| `OVER` | Exceeds bloat limit |

## Architecture

```text
storage.json + state.vscdb + workspaceStorage + logs + .pb/.pbtxt/brain
  -> normalized workspace registry
  -> conversation-to-workspace mapping
  -> estimated context metrics
  -> SQLite persistence
  -> CLI views / JSON API / watch mode
```

## Project Structure

```text
src/
  cli/
    index.ts
    commands/
      scan.ts
      report.ts
      nuke.ts
  config.ts
  paths.ts
  uri-utils.ts
  view-models.ts
  db/
    schema.ts
  ingest/
    storage-json.ts
    state-vscdb.ts
    workspace-storage.ts
    reconciler.ts
  scanner/
    conversation-scanner.ts
    brain-scanner.ts
  runtime/
    log-signals.ts
  metrics/
    estimator.ts
    snapshotter.ts
    health.ts
  watcher/
    file-watcher.ts
    log-tailer.ts
  server/
    index.ts
```

## License

MIT
