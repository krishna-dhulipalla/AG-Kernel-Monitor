const vscode = require("vscode");
const path = require("path");
const { AgKernelMonitorRuntime } = require("./monitor-runtime.cjs");

function activate(context) {
  const output = vscode.window.createOutputChannel("AG Kernel Monitor");
  const runtime = new AgKernelMonitorRuntime(context.extensionPath);
  const provider = new AgKernelSidebarProvider(runtime, output);

  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("agKernelMonitor.sidebar", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("agKernelMonitor.refresh", () => provider.refresh(true)),
    vscode.commands.registerCommand("agKernelMonitor.openSettings", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "agKernelMonitor");
    }),
    vscode.commands.registerCommand("agKernelMonitor.openOutput", () => output.show(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agKernelMonitor")) {
        provider.onConfigurationChanged();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.onWorkspaceContextChanged()),
    vscode.window.onDidChangeActiveTextEditor(() => provider.onWorkspaceContextChanged()),
  );
}

function deactivate() {}

class AgKernelSidebarProvider {
  constructor(runtime, output) {
    this.runtime = runtime;
    this.output = output;
    this.view = null;
    this.lastSnapshot = null;
    this.lastError = null;
    this.sectionState = {};
    this.isActive = false;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.type === "refresh") {
        void this.refresh(true);
        return;
      }
      if (message?.type === "openSettings") {
        void vscode.commands.executeCommand("agKernelMonitor.openSettings");
        return;
      }
      if (message?.type === "openOutput") {
        this.output.show(true);
        return;
      }
      if (message?.type === "toggleSection" && message.sectionId) {
        this.sectionState[message.sectionId] = Boolean(message.open);
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.start();
      } else {
        this.stop();
      }
    });

    webviewView.onDidDispose(() => {
      this.stop();
      this.view = null;
    });

    this.render();
    if (webviewView.visible) {
      void this.start();
    }
  }

  onConfigurationChanged() {
    if (this.isActive) {
      void this.start(true);
    } else {
      this.render();
    }
  }

  onWorkspaceContextChanged() {
    if (this.isActive) {
      void this.refresh(false);
    }
  }

  async start(restart = false) {
    if (!this.view) return;
    if (restart) {
      this.stop();
    }
    if (this.isActive) return;

    this.isActive = true;
    this.lastError = null;
    this.render();

    try {
      const settings = readSettings();
      await this.runtime.start({
        preferredWorkspacePath: getPreferredWorkspacePath(),
        configPath: resolveConfiguredPath(settings.cliConfigPath),
        autoRefreshSeconds: settings.autoRefreshSeconds,
        onUpdate: (snapshot) => {
          this.lastSnapshot = snapshot;
          this.lastError = null;
          this.render();
        },
        onError: (error) => {
          this.lastError = error;
          this.output.appendLine(`[error] ${String(error?.stack || error?.message || error)}`);
          this.render();
        },
      });
    } catch (error) {
      this.lastError = error;
      this.output.appendLine(`[error] ${String(error?.stack || error?.message || error)}`);
      this.render();
    }
  }

  stop() {
    this.isActive = false;
    this.runtime.stop();
  }

  async refresh(forceRevealErrors) {
    if (!this.view) return;
    this.runtime.preferredWorkspacePath = getPreferredWorkspacePath();
    this.runtime.configPath = resolveConfiguredPath(readSettings().cliConfigPath);
    try {
      await this.runtime.refresh();
    } catch (error) {
      this.lastError = error;
      if (forceRevealErrors) {
        this.output.show(true);
      }
      this.render();
    }
  }

  render() {
    if (!this.view) return;
    this.view.webview.html = getHtml(this.view.webview, {
      snapshot: this.lastSnapshot,
      error: this.lastError,
      sectionState: this.sectionState,
      isActive: this.isActive,
    });
  }
}

function readSettings() {
  const config = vscode.workspace.getConfiguration("agKernelMonitor");
  return {
    bunPath: config.get("bunPath", "bun"),
    cliConfigPath: config.get("cliConfigPath", ""),
    autoRefreshSeconds: config.get("autoRefreshSeconds", 20),
    preferActiveEditorWorkspace: config.get("preferActiveEditorWorkspace", true),
  };
}

function getPreferredWorkspacePath() {
  const settings = readSettings();
  if (settings.preferActiveEditorWorkspace) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (folder) {
        return folder.uri.fsPath;
      }
    }
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
}

function resolveConfiguredPath(configPath) {
  if (!configPath) return null;
  if (path.isAbsolute(configPath)) return configPath;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return path.join(workspaceFolder.uri.fsPath, configPath);
  }

  return path.resolve(configPath);
}

function getHtml(webview, model) {
  const nonce = createNonce();
  const snapshot = model.snapshot;
  const current = snapshot?.currentConversation?.conversation || null;
  const settings = readSettings();

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="${nonce}">${getStyles()}</style>
  </head>
  <body>
    <div class="shell">
      <header class="header">
        <div>
          <div class="title">AG Kernel Monitor</div>
          <div class="subtitle">${snapshot ? `Updated ${escapeHtml(new Date(snapshot.loadedAt).toLocaleTimeString())}` : model.isActive ? "Loading monitor data..." : "Open the view to start monitoring."}</div>
        </div>
        <div class="actions">
          <button data-action="refresh">Refresh</button>
          <button data-action="settings">Settings</button>
          <button data-action="output">Logs</button>
        </div>
      </header>
      ${model.error ? renderNotice(model.error) : ""}
      ${renderSection("overview", "Overview", isOpen(model.sectionState, "overview", true), renderOverview(snapshot, current))}
      ${renderSection("current", "Current Conversation", isOpen(model.sectionState, "current", true), renderCurrentConversation(snapshot, current))}
      ${renderSection("workspace", "Workspace", isOpen(model.sectionState, "workspace", false), renderWorkspace(snapshot))}
      ${renderSection("live", "Live Activity", isOpen(model.sectionState, "live", Boolean(snapshot?.liveFeed?.length)), renderLiveActivity(snapshot))}
      ${renderSection("cleanup", "Cleanup", isOpen(model.sectionState, "cleanup", false), renderCleanup(snapshot))}
      ${renderSection("settings", "Settings", isOpen(model.sectionState, "settings", false), renderSettings(settings, snapshot))}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const persisted = vscode.getState() || {};
      for (const section of document.querySelectorAll("details[data-section-id]")) {
        if (Object.prototype.hasOwnProperty.call(persisted, section.dataset.sectionId)) {
          section.open = !!persisted[section.dataset.sectionId];
        }
      }
      for (const button of document.querySelectorAll("button[data-action]")) {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-action");
          if (action === "refresh") vscode.postMessage({ type: "refresh" });
          if (action === "settings") vscode.postMessage({ type: "openSettings" });
          if (action === "output") vscode.postMessage({ type: "openOutput" });
        });
      }
      for (const section of document.querySelectorAll("details[data-section-id]")) {
        section.addEventListener("toggle", () => {
          const state = vscode.getState() || {};
          state[section.dataset.sectionId] = section.open;
          vscode.setState(state);
          vscode.postMessage({ type: "toggleSection", sectionId: section.dataset.sectionId, open: section.open });
        });
      }
    </script>
  </body>
  </html>`;
}

function renderOverview(snapshot, current) {
  if (!snapshot) {
    return `<div class="empty">No snapshot loaded yet.</div>`;
  }

  const overview = snapshot.overview;
  const tone = toneClass(current?.healthTone || "neutral");
  return `
    <div class="grid">
      ${renderMetric("State", formatResolutionLabel(overview.resolutionState), tone)}
      ${renderMetric("Current Context", current ? `${current.estimatedTotalTokensFormatted} (${current.contextRatioFormatted})` : "0")}
      ${renderMetric("Mapped", `${overview.mappedConversations}/${overview.totalConversations}`)}
      ${renderMetric("Unmapped", String(overview.unmappedConversations))}
    </div>
    <div class="meta">${escapeHtml(overview.resolutionNote)}</div>
  `;
}

function renderCurrentConversation(snapshot, current) {
  if (!snapshot || !current) {
    return `<div class="empty">No current conversation could be resolved.</div>`;
  }

  return `
    <div class="headline">
      <div class="headline-main">
        <div class="headline-title">${escapeHtml(current.title || "Untitled")}</div>
        <div class="headline-subtitle">${escapeHtml(current.workspaceName)}</div>
      </div>
      <span class="pill ${toneClass(current.healthTone)}">${escapeHtml(current.health)}</span>
    </div>
    <div class="grid">
      ${renderMetric("Estimated Context", `${current.estimatedTotalTokensFormatted} (${current.contextRatioFormatted})`)}
      ${renderMetric("Latest Delta", current.deltaEstimatedTokensFormatted || "+0")}
      ${renderMetric("Messages", current.messageCount !== null ? `${current.messageCount}${current.messageCountSource ? ` (${current.messageCountSource})` : ""}` : "unknown")}
      ${renderMetric("Last Active", current.lastActiveRelative || "unknown")}
    </div>
    <div class="meta">Detection: ${escapeHtml(snapshot.currentConversation.resolutionNote)}</div>
    <div class="meta">Breakdown: prompt/history ${escapeHtml(current.estimatedPromptTokens.toLocaleString())} | artifacts ${escapeHtml(current.estimatedArtifactTokens.toLocaleString())}</div>
    ${renderCurrentChatRun(current)}
    ${renderRecentChatRuns(current)}
    <details class="inline">
      <summary>Show raw details</summary>
      <div class="stack">
        <div class="meta">Session: ${escapeHtml(current.id)}</div>
        <div class="meta">Mapping: ${escapeHtml(current.mappingSource || "unknown")} (${escapeHtml(String(current.mappingConfidence ?? 0))})</div>
        ${current.mappingNote ? `<div class="meta">${escapeHtml(current.mappingNote)}</div>` : ""}
        <div class="meta">${escapeHtml(current.whyHeavy)}</div>
      </div>
    </details>
  `;
}

function renderCurrentChatRun(current) {
  const run = current.currentChatRun;
  if (!run) {
    return `<div class="meta">Per-chat tracking starts once live message-count signals appear for this session.</div>`;
  }

  const ratio = run.toTokens > 0 ? Math.max(0, Math.min(1, run.deltaTokens / run.toTokens)) : 0;
  const width = Math.max(6, Math.round(ratio * 100));
  return `
    <div class="subsection-label">Current Chat So Far</div>
    <div class="grid">
      ${renderMetric(`Chat ${run.chatIndex}`, `${formatCompactTokens(run.fromTokens)} -> ${formatCompactTokens(run.toTokens)}`)}
      ${renderMetric("Added", `${run.deltaTokens >= 0 ? "+" : "-"}${formatCompactTokens(Math.abs(run.deltaTokens))}`)}
    </div>
    <div class="bar"><div class="bar-fill" style="width:${width}%"></div></div>
  `;
}

function renderRecentChatRuns(current) {
  const runs = current.recentChatRuns || [];
  if (runs.length === 0) {
    return "";
  }

  return `
    <div class="subsection-label">Last Five Chats</div>
    <div class="list">
      ${runs.slice(0, 5).map((run) => renderRow({
        title: `Chat ${run.chatIndex} | ${run.fromTokens >= 0 ? `${formatCompactTokens(run.fromTokens)} -> ${formatCompactTokens(run.toTokens)}` : formatCompactTokens(run.toTokens)}`,
        subtitle: `${run.completedAt ? new Date(run.completedAt).toLocaleTimeString() : "completed"} | ${run.messageCount} direct messages`,
        meta: `${run.deltaTokens >= 0 ? "+" : "-"}${formatCompactTokens(Math.abs(run.deltaTokens))}`,
      })).join("")}
    </div>
  `;
}

function renderWorkspace(snapshot) {
  const workspace = snapshot?.workspaceDetail;
  if (!workspace) {
    return `<div class="empty">No workspace detail is available for the current editor context.</div>`;
  }

  return `
    <div class="grid">
      ${renderMetric("Workspace", workspace.displayName || workspace.name)}
      ${renderMetric("Chats", String(workspace.conversationCount || 0))}
      ${renderMetric("Mapped / Unmapped", `${workspace.mappedConversationCount}/${workspace.unmappedConversationCount}`)}
      ${renderMetric("Brain", workspace.brainSizeFormatted || "0 B")}
    </div>
    <details class="inline">
      <summary>Show workspace details</summary>
      <div class="stack">
        <div class="meta">Location: ${escapeHtml(workspace.uri || "unknown")}</div>
        <div class="meta">Largest session: ${escapeHtml(workspace.largestConversationTokensFormatted || "0")}</div>
      </div>
    </details>
    <div class="list">
      ${(workspace.conversations || []).slice(0, 6).map((conversation) => renderRow({
        title: conversation.title || "Untitled",
        subtitle: `${conversation.estimatedTotalTokensFormatted} | ${conversation.messageCount !== null ? conversation.messageCount : "unknown"} msgs | ${conversation.lastActiveRelative}`,
        meta: conversation.mappingSource || "unknown",
      })).join("") || `<div class="empty">No workspace conversations found.</div>`}
    </div>
  `;
}

function renderLiveActivity(snapshot) {
  const feed = snapshot?.liveFeed || [];
  if (feed.length === 0) {
    return `<div class="empty">No live activity has been observed since the sidebar became visible.</div>`;
  }

  return `
    <div class="log-list">
      ${feed.map((event) => `<div class="log-line">${escapeHtml(formatLiveEventLine(event))}</div>`).join("")}
    </div>
  `;
}

function renderCleanup(snapshot) {
  if (!snapshot) {
    return `<div class="empty">No cleanup data is available yet.</div>`;
  }

  const cleanup = snapshot.cleanupSummary;
  return `
    <div class="subsection-label">Largest Sessions</div>
    <div class="list">
      ${(cleanup.largestSessions || []).slice(0, 5).map((conversation) => renderRow({
        title: `${conversation.workspaceName} | ${conversation.estimatedTotalTokensFormatted}`,
        subtitle: `${conversation.id} | ${conversation.lastActiveRelative}`,
        meta: conversation.health,
      })).join("") || `<div class="empty">No large sessions found.</div>`}
    </div>
    <div class="subsection-label">Unmapped</div>
    <div class="list">
      ${(cleanup.unmappedConversations || []).slice(0, 4).map((conversation) => `
        <details class="list-disclosure">
          <summary>${escapeHtml(conversation.title || "Untitled")} | ${escapeHtml(conversation.estimatedTotalTokensFormatted)}</summary>
          <div class="meta">${escapeHtml(conversation.id)}</div>
          <div class="meta">${escapeHtml(conversation.mappingNote || "No unmapped reason recorded.")}</div>
        </details>
      `).join("") || `<div class="empty">No unmapped conversations.</div>`}
    </div>
    <div class="subsection-label">Orphans</div>
    <div class="stack">
      <div class="meta">Brain folders: ${escapeHtml((cleanup.orphanBrainFolders || []).join(", ") || "none")}</div>
      <div class="meta">Annotation files: ${escapeHtml((cleanup.orphanAnnotations || []).join(", ") || "none")}</div>
    </div>
  `;
}

function renderSettings(settings, snapshot) {
  return `
    <div class="stack">
      <div class="meta">Live monitoring runs only while this sidebar is visible.</div>
      <div class="meta">Auto refresh: ${escapeHtml(String(settings.autoRefreshSeconds))}s fallback polling</div>
      <div class="meta">Workspace source: ${settings.preferActiveEditorWorkspace ? "active editor" : "first workspace"}</div>
      <div class="meta">CLI config path: ${escapeHtml(settings.cliConfigPath || "default search")}</div>
      <div class="meta">Bundled extension runtime: in-process Node + sql.js</div>
      ${snapshot?.currentConversation?.conversation?.resolutionState === "unresolved_log_uuid" ? `<div class="meta">Current log UUID was not found locally. The sidebar is falling back to the most recent local session.</div>` : ""}
    </div>
  `;
}

function renderNotice(error) {
  return `<div class="notice">${escapeHtml(String(error?.message || error || "Unknown extension error"))}</div>`;
}

function renderSection(id, title, open, body) {
  return `
    <details class="section" data-section-id="${escapeHtml(id)}" ${open ? "open" : ""}>
      <summary>${escapeHtml(title)}</summary>
      <div class="section-body">${body}</div>
    </details>
  `;
}

function renderMetric(label, value, tone = "") {
  return `
    <div class="metric ${tone}">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderRow({ title, subtitle, meta }) {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <div class="row-meta">${escapeHtml(meta || "")}</div>
    </div>
  `;
}

function isOpen(sectionState, id, defaultOpen) {
  if (Object.prototype.hasOwnProperty.call(sectionState, id)) {
    return Boolean(sectionState[id]);
  }
  return defaultOpen;
}

function formatResolutionLabel(state) {
  if (state === "active_log") return "Live log";
  if (state === "active_pb_write") return "Recent write";
  if (state === "unresolved_log_uuid") return "Log fallback";
  return "Recent fallback";
}

function toneClass(tone) {
  if (tone === "healthy") return "tone-healthy";
  if (tone === "warning") return "tone-warning";
  if (tone === "critical") return "tone-critical";
  return "tone-neutral";
}

function getStyles() {
  return `
    body {
      margin: 0;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
    }
    .shell { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .header {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;
      padding-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .title { font-size: 15px; font-weight: 700; }
    .subtitle { font-size: 12px; opacity: 0.72; margin-top: 2px; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    button {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 4px 10px;
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .notice {
      padding: 10px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 8px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, #7f1d1d 8%);
      color: var(--vscode-errorForeground);
      font-size: 12px; line-height: 1.5;
    }
    .section {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      overflow: hidden;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 98%, #ffffff 2%);
    }
    .section > summary {
      list-style: none;
      cursor: pointer;
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border-bottom: 1px solid transparent;
    }
    .section[open] > summary { border-bottom-color: var(--vscode-panel-border); }
    .section > summary::-webkit-details-marker { display: none; }
    .section-body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .metric {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 8px 10px;
      min-width: 0;
    }
    .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.66; margin-bottom: 4px; }
    .metric-value { font-size: 13px; font-weight: 650; line-height: 1.35; word-break: break-word; }
    .headline { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .headline-title { font-size: 15px; font-weight: 700; line-height: 1.4; }
    .headline-subtitle { font-size: 12px; opacity: 0.72; margin-top: 2px; }
    .pill {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      white-space: nowrap;
    }
    .tone-healthy { color: #87d6a3; }
    .tone-warning { color: #f2c779; }
    .tone-critical { color: #f5a3a3; }
    .tone-neutral { color: var(--vscode-descriptionForeground); }
    .meta, .row-subtitle { font-size: 12px; line-height: 1.55; color: var(--vscode-descriptionForeground); word-break: break-word; }
    .list, .stack { display: flex; flex-direction: column; gap: 8px; }
    .row {
      display: flex; justify-content: space-between; gap: 10px;
      padding: 8px 0; border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 72%, transparent);
    }
    .row:first-child { border-top: none; padding-top: 0; }
    .row-title { font-size: 13px; font-weight: 650; line-height: 1.4; }
    .row-main { min-width: 0; }
    .row-meta { font-size: 12px; color: var(--vscode-descriptionForeground); text-align: right; max-width: 38%; }
    .empty {
      font-size: 12px; color: var(--vscode-descriptionForeground); line-height: 1.55;
      padding: 2px 0;
    }
    .subsection-label {
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }
      .inline, .list-disclosure {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        padding: 0 10px;
      }
      .log-list { display: flex; flex-direction: column; gap: 6px; }
      .log-line {
        font-family: var(--vscode-editor-font-family);
        font-size: 11.5px;
        line-height: 1.5;
        padding: 8px 10px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        color: var(--vscode-descriptionForeground);
        background: color-mix(in srgb, var(--vscode-sideBar-background) 94%, #ffffff 6%);
        word-break: break-word;
      }
      .bar {
        height: 8px;
        border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      overflow: hidden;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 86%, #ffffff 14%);
    }
    .bar-fill {
      height: 100%;
      background: color-mix(in srgb, var(--vscode-focusBorder) 75%, #7ea6ff 25%);
    }
    .inline > summary, .list-disclosure > summary {
      cursor: pointer; list-style: none; padding: 8px 0; font-size: 12px; font-weight: 600;
    }
    .inline > summary::-webkit-details-marker, .list-disclosure > summary::-webkit-details-marker { display: none; }
    .inline[open], .list-disclosure[open] { padding-bottom: 8px; }
  `;
}

function formatCompactTokens(tokens) {
  const absolute = Math.abs(tokens);
  if (absolute >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

function formatLiveEventLine(event) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const session = `${event.conversationId.slice(0, 12)}...`;

  if (event.source === "log" && event.messageCount !== undefined) {
    const deltaMessages = event.deltaMessages !== null && event.deltaMessages !== undefined
      ? ` (${event.deltaMessages >= 0 ? "+" : ""}${event.deltaMessages} since last)`
      : "";
    return `[${time}] [LIVE] ${session} now at ${event.messageCount} direct messages${deltaMessages} -> ${event.totalTokensFormatted} estimated tokens (${event.contextRatioFormatted} of limit)`;
  }

  return `[${time}] ${session} ${event.deltaBytesFormatted} (${event.deltaTokensFormatted} est. tokens) -> ${event.totalTokensFormatted} estimated total (${event.contextRatioFormatted} of limit)`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

module.exports = {
  activate,
  deactivate,
};
