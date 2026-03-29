# Antigravity Context Monitor

**Antigravity Context Monitor** is a precise telemetry tool for monitoring token consumption, context window usage, and cache bloat during Google Antigravity conversations.

<div align="center">
  <!-- TODO: Replace with an actual screenshot of the extension sidebar -->
  <img src="media/screenshot-placeholder.png" alt="Antigravity Context Monitor Sidebar" width="650" />
</div>

## Overview

AI chats can quickly accumulate massive context windows, leading to slower responses and potential performance degradation. This tool provides real-time visibility into your session's health straight from your editor's sidebar or terminal.

It helps you answer four practical questions:

- **How much context has this session built up so far?**
- **How much did the latest turn add to the conversation?**
- **Which conversations are getting too large and need pruning?**
- **Which cache or brain artifacts are orphaned and worth cleaning up?**

The primary experience is the **VS Code sidebar extension**. A fully-featured **CLI** is also included for direct inspection and automation.

## What It Shows

- Current conversation status and estimated total context
- Live session growth while Antigravity is running
- Workspace-level conversation summaries
- Brain and cache cleanup targets
- Unmapped and orphaned artifacts that need investigation

## Install

### Preferred: Open VSX extension

Install `Antigravity Context Monitor` from Open VSX inside VS Code or compatible editors.

After install:

1. Open the `AG Context` sidebar
2. Keep the sidebar visible while using Antigravity if you want live updates
3. Use VS Code settings if you want to change refresh behavior or config path

### Manual VSIX install

If you already have a `.vsix`:

1. Open Extensions
2. Open the `...` menu
3. Choose `Install from VSIX...`
4. Select the Antigravity Context Monitor package

### CLI fallback

If you want the terminal workflow:

```bash
bun install
bun run dev scan
```

Useful commands:

```bash
# Scan all conversations and show the current snapshot plus workspace totals
bun run dev scan

# Show only the current or most recent conversation
bun run dev scan --current

# Drill into one workspace
bun run dev scan --workspace "My-Project"

# Drill into one conversation by session id
bun run dev scan --conversation <uuid>

# Live monitor conversation growth and runtime signals in the terminal
bun run dev scan --watch

# Show cleanup targets, unmapped conversations, and orphan artifacts
bun run dev report
```

## Configuration

Create `.ag-kernel.json` in your project root or home directory:

```json
{
  "bloatLimit": 1000000,
  "bytesPerToken": 3.5,
  "dbPath": "~/.ag-kernel/monitor.db",
  "logLevel": "info"
}
```

You can also pass a config explicitly in the CLI:

```bash
bun run dev scan --config .ag-kernel.json
```

## How AG Kernel Monitor Calculates Things

### Token and context estimates

AG Kernel Monitor uses estimated values unless Antigravity runtime logs expose a direct signal.

- Prompt/history estimate:
  - prefers direct message count when available
  - otherwise estimates from conversation `.pb` size using `bytesPerToken`
- Artifact estimate:
  - derived from brain folder size
  - adjusted with resolved brain versions
- Estimated total context:
  - prompt/history estimate + artifact estimate

### Live growth

While monitoring is active:

- `.pb` file growth shows how the conversation data is changing
- runtime log signals can attach direct message counts to the same session
- the sidebar and watch mode show the latest added amount and current total context

### Cache and cleanup management

AG Kernel Monitor scans:

- conversation `.pb` files
- brain folders
- annotation files
- Antigravity runtime logs
- Antigravity state metadata

It uses those sources to highlight:

- oversized conversations
- unmapped conversations
- orphan brain folders
- orphan annotation files

## Compatibility

- Windows
- macOS
- Linux

The current primary validation environment is Windows.

## Notes

- Live monitoring runs only while the sidebar is visible
- If live activity cannot be confirmed from logs, the monitor falls back to the most recent conversation
- Historical per-chat breakdown is not reconstructed retroactively; live per-chat tracking starts when monitoring observes the session

## Reporting Issues

Please open an issue in this repository with:

- your OS
- editor version
- extension version
- whether you used the sidebar or CLI
- screenshots or terminal output if available
- a redacted sample of unexpected logs if the bug is live-monitor related

## Contributing

Contributions are welcome.

If you want to help:

- open an issue first for bugs, UX problems, or feature proposals
- keep changes focused and easy to review
- include clear reproduction steps for fixes
- include tests where practical for parser, watcher, or mapping changes

## Scope

AG Kernel Monitor is currently designed for Antigravity only.

The architecture can be extended later to other local AI coding tools such as Claude-based workflows, but that is not the current product scope.

## License

MIT
