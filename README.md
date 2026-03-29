# Antigravity Token Monitor

**Antigravity Token Monitor** is a precise telemetry tool specifically designed for tracing token accumulations, observing live interaction runs, and scaling with Google Antigravity conversations.

<div align="center">
  <!-- TODO: Replace with an actual screenshot of the extension sidebar -->
  <img src="media/screenshot-placeholder.png" alt="Antigravity Token Monitor Sidebar" width="650" />
</div>

## Overview

Modern AI interactions often involve sending massive context sets back to the model, which can rapidly increase token expenditures and slow down responsiveness. This extension provides real-time visibility into your session's telemetry directly from your editor's sidebar or terminal.

> **Note**: This is a telemetry and analytics tool, *not* a strict quota-enforcement or limit monitor. It enables understanding of token pacing to optimize runs rather than locking you out of your workflow.

It helps you answer practical questions:

- **How many tokens has this session accumulated in total?**
- **How many tokens were generated and tracked during the current turn?**
- **What is the average token density across recent interactions?**
- **Which workspaces are dominating your local storage space through cached assets?**

The primary experience is the **VS Code sidebar extension**. A fully-featured **CLI** is also included for direct inspection and automation.

## What It Shows

- Granular turn-level token additions and message metrics
- Cumulative session total tokens and history scale
- Live session growth while Antigravity is running
- Workspace-level conversation token summaries
- Brain and cache cleanup targets

## Install

### Preferred: Open VSX extension

Install `Antigravity Token Monitor` from Open VSX inside VS Code or compatible editors.

After install:

1. Open the `AG Token` sidebar
2. Keep the sidebar visible while using Antigravity if you want live updates
3. Use VS Code settings if you want to change refresh behavior or config path

### Manual VSIX install

If you already have a `.vsix`:

1. Open Extensions
2. Open the `...` menu
3. Choose `Install from VSIX...`
4. Select the Antigravity Token Monitor package

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
  "bloatLimit": 3000000,
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

### Token Estimates

AG Kernel Monitor uses estimated values unless Antigravity runtime logs expose a direct signal.

- History estimate:
  - prefers direct message count when available
  - otherwise estimates from conversation `.pb` size using `bytesPerToken`
- Artifact estimate:
  - derived from brain folder size
  - adjusted with resolved brain versions

### Live Turn Growth

While monitoring is active:

- `.pb` file growth shows how the conversation data is changing
- runtime log signals attach direct message counts to individual interaction turns
- the sidebar and watch mode isolate the *current turn delta* from the *session total*

### Cache and cleanup management

AG Kernel Monitor scans:

- conversation `.pb` files
- brain folders
- annotation files
- Antigravity runtime logs
- Antigravity state metadata

## Compatibility

- Windows
- macOS
- Linux

The current primary validation environment is Windows.

## Notes

- Live monitoring runs only while the sidebar is visible
- If live activity cannot be confirmed from logs, the monitor falls back to the most recent conversation
- Historical per-chat breakdowns are not reconstructed retroactively; live per-chat tracking starts when monitoring observes the session turn

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

## License

MIT
