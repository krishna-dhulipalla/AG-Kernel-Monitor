# AG-Kernel-Monitor

AG Kernel Monitor helps you see what Antigravity is doing to your conversations: current session growth, estimated context size, workspace mapping, unmapped sessions, brain/cache bloat, and cleanup targets.

The primary product direction is the VS Code sidebar extension. The CLI remains available for direct inspection and automation.

## Install

### 1. Preferred: VS Code / Open VSX extension

Use the Open VSX extension once it is published.

The sidebar is designed to show:

- current conversation
- current editor workspace details
- global brain/cache and cleanup view
- settings and runtime status

### 2. If Open VSX is not available: manual extension install

Install the extension from a `.vsix` package through VS Code:

1. Open Extensions in VS Code.
2. Open the `...` menu.
3. Choose `Install from VSIX...`.
4. Select the downloaded AG Kernel Monitor `.vsix`.

For local development from this repo:

```bash
bun install
bun run build:vsx-cli
```

Then run the extension host from the repo with the launch config in `.vscode/launch.json`.

### 3. CLI fallback

If you do not want the extension yet, use the CLI directly:

```bash
bun install
bun run dev scan
```

Useful commands:

```bash
# Summary plus current or most recent conversation
bun run dev scan

# Current or most recent conversation only
bun run dev scan --current

# Drill into a workspace
bun run dev scan --workspace "My-Project"

# Drill into a single conversation
bun run dev scan --conversation <uuid>

# Health / cleanup report
bun run dev report
```

## Setup Effort

Current state:

- The published extension should ship a platform-specific runtime so the user does not need Bun.
- Local development still uses Bun to build the runtime artifacts.
- The CLI obviously requires Bun as well.

Can Bun be removed technically?

Yes, but not in the current build. The clean way to remove that requirement is to ship a platform-specific runtime with the extension, for example:

- a precompiled Windows binary
- a precompiled macOS binary
- a precompiled Linux binary

That would let the extension run without asking the user to install Bun manually. The current codebase is already structured so that move is practical later.

Current packaging direction:

- `vscode/runtime/bin/win32-x64/agk-monitor.exe`
- `vscode/runtime/bin/win32-arm64/agk-monitor.exe`
- `vscode/runtime/bin/darwin-x64/agk-monitor`
- `vscode/runtime/bin/darwin-arm64/agk-monitor`
- `vscode/runtime/bin/linux-x64/agk-monitor`
- `vscode/runtime/bin/linux-arm64/agk-monitor`

These binaries are generated during packaging and release. They should not be committed to Git.

## Compatibility

The code is designed for:

- Windows
- macOS
- Linux

Why macOS should work:

- Antigravity data paths are resolved per platform in `src/paths.ts`
- workspace URIs are normalized instead of assuming Windows-only paths
- the sidebar extension reads the same cross-platform JSON model as the CLI

Current honesty:

- Windows is the primary validation environment right now
- macOS support is designed in, but not yet validated on a real Mac machine

Expected macOS locations in the current implementation:

- Antigravity data: `~/.gemini/antigravity/`
- Electron user data: `~/Library/Application Support/Antigravity/User/`

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

Available keys:

| Key | Default | Description |
|---|---|---|
| `bloatLimit` | `1000000` | Estimated token threshold for bloat warnings |
| `bytesPerToken` | `3.5` | Estimated bytes per token for `.pb` size conversion |
| `dbPath` | `~/.ag-kernel/monitor.db` | SQLite database location |
| `logLevel` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

## Notes

- Token and context numbers are still estimated unless they come directly from runtime signals.
- Current conversation detection uses live log signals first and falls back to the most recent session when logs do not confirm a live active one.
- Remaining unmapped conversations are now diagnosed in the report instead of being left unexplained.

## License

MIT
