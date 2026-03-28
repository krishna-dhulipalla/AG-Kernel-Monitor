const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function activate(context) {
  const output = vscode.window.createOutputChannel("AG Kernel Monitor");
  const service = new AgKernelCliService(context.extensionPath, output);
  const provider = new AgKernelSidebarProvider(context.extensionUri, service, output);

  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("agKernelMonitor.sidebar", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agKernelMonitor.refresh", () => provider.refresh(true)),
    vscode.commands.registerCommand("agKernelMonitor.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "agKernelMonitor");
    }),
    vscode.commands.registerCommand("agKernelMonitor.openOutput", () => output.show(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agKernelMonitor")) {
        provider.onConfigurationChanged();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh(false)),
    vscode.window.onDidChangeActiveTextEditor(() => provider.refresh(false)),
  );
}

function deactivate() {}

class AgKernelCliService {
  constructor(extensionPath, output) {
    this.extensionPath = extensionPath;
    this.output = output;
  }

  async loadDashboard() {
    const scan = await this.runJson(["scan", "--json"]);
    const preferredFolder = getPreferredWorkspaceFolder();
    const selectedWorkspace = pickWorkspaceForSidebar(scan, preferredFolder);
    let workspaceDetail = null;

    if (selectedWorkspace?.displayName) {
      workspaceDetail = await this.runJson(["scan", "--workspace", selectedWorkspace.displayName, "--json"]);
    }

    const report = await this.runJson(["report", "--json"]);
    const settings = readSettings();

    return {
      loadedAt: new Date().toISOString(),
      preferredWorkspacePath: preferredFolder?.uri.fsPath ?? null,
      settings,
      scan,
      workspaceDetail,
      report,
    };
  }

  async runJson(args) {
    const cliBundlePath = path.join(this.extensionPath, "vscode", "runtime", "agk-cli.js");
    if (!fs.existsSync(cliBundlePath)) {
      throw new Error("Bundled CLI not found. Run `bun run build:vsx-cli` before packaging the extension.");
    }

    const settings = readSettings();
    const configArgs = [];
    const resolvedConfigPath = resolveConfiguredPath(settings.cliConfigPath);
    if (resolvedConfigPath) {
      configArgs.push("--config", resolvedConfigPath);
    }

    const bunCandidates = buildBunCandidates(settings.bunPath);
    let lastError = null;

    for (const bunPath of bunCandidates) {
      try {
        return await runCliProcess(
          bunPath,
          cliBundlePath,
          [...configArgs, ...args],
          this.output,
          this.extensionPath,
        );
      } catch (error) {
        lastError = error;
        if (error && error.code === "ENOENT") {
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error("Unable to start Bun. Check the `agKernelMonitor.bunPath` setting.");
  }
}

class AgKernelSidebarProvider {
  constructor(extensionUri, service, output) {
    this.extensionUri = extensionUri;
    this.service = service;
    this.output = output;
    this.view = null;
    this.refreshTimer = null;
    this.refreshInFlight = null;
    this.lastState = null;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "vscode", "media")],
    };

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.type === "refresh") {
        this.refresh(true);
        return;
      }

      if (message?.type === "openSettings") {
        vscode.commands.executeCommand("agKernelMonitor.openSettings");
        return;
      }

      if (message?.type === "openOutput") {
        this.output.show(true);
      }
    });

    this.scheduleAutoRefresh();
    this.refresh(false);
  }

  onConfigurationChanged() {
    this.scheduleAutoRefresh();
    this.refresh(false);
  }

  scheduleAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    const seconds = Math.max(0, Number(readSettings().autoRefreshSeconds || 0));
    if (seconds > 0) {
      this.refreshTimer = setInterval(() => this.refresh(false), seconds * 1000);
    }
  }

  async refresh(forceRevealErrors) {
    if (!this.view) {
      return;
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.renderLoading();
    this.refreshInFlight = this.service.loadDashboard()
      .then((state) => {
        this.lastState = state;
        this.renderState(state);
      })
      .catch((error) => {
        this.output.appendLine(`[error] ${String(error.stack || error.message || error)}`);
        if (forceRevealErrors) {
          this.output.show(true);
        }
        this.renderError(error);
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  renderLoading() {
    if (!this.view) return;
    this.view.webview.html = getHtml(this.view.webview, {
      kind: "loading",
      state: this.lastState,
      error: null,
    });
  }

  renderError(error) {
    if (!this.view) return;
    this.view.webview.html = getHtml(this.view.webview, {
      kind: "error",
      state: this.lastState,
      error,
    });
  }

  renderState(state) {
    if (!this.view) return;
    this.view.webview.html = getHtml(this.view.webview, {
      kind: "ready",
      state,
      error: null,
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

function getPreferredWorkspaceFolder() {
  const settings = readSettings();
  if (settings.preferActiveEditorWorkspace) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (folder) {
        return folder;
      }
    }
  }

  return vscode.workspace.workspaceFolders?.[0] ?? null;
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

function buildBunCandidates(configuredPath) {
  const candidates = [];
  const seen = new Set();

  for (const candidate of [configuredPath, configuredPath === "bun" ? "bun.exe" : null, configuredPath === "bun" ? "bun.cmd" : null]) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function runCliProcess(bunPath, cliBundlePath, args, output, cwd) {
  return new Promise((resolve, reject) => {
    output.appendLine(`[cli] ${bunPath} ${[cliBundlePath, ...args].join(" ")}`);

    const child = spawn(bunPath, [cliBundlePath, ...args], {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(stderr.trim() || stdout.trim() || `AG Kernel Monitor CLI failed with exit code ${code}`);
        error.code = code;
        reject(error);
        return;
      }

      try {
        resolve(parseJsonPayload(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse CLI JSON output: ${String(error.message || error)}\n${stdout}`));
      }
    });
  });
}

function parseJsonPayload(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("CLI returned empty output.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.search(/[\[{]/);
    if (firstObject < 0) {
      throw new Error("No JSON payload found in CLI output.");
    }
    return JSON.parse(trimmed.slice(firstObject));
  }
}

function pickWorkspaceForSidebar(scanSummary, preferredFolder) {
  const workspaces = Array.isArray(scanSummary?.workspaces) ? scanSummary.workspaces : [];
  const preferredPath = preferredFolder ? normalizeFsPath(preferredFolder.uri.fsPath) : null;

  if (preferredPath) {
    const directMatch = workspaces.find((workspace) => {
      const workspacePath = workspaceUriToFsPath(workspace.uri);
      return workspacePath && (preferredPath === workspacePath || preferredPath.startsWith(`${workspacePath}${path.sep}`));
    });
    if (directMatch) {
      return directMatch;
    }
  }

  const currentConversationWorkspaceId = scanSummary?.currentConversation?.conversation?.workspaceId ?? null;
  if (currentConversationWorkspaceId) {
    const currentMatch = workspaces.find((workspace) => workspace.id === currentConversationWorkspaceId);
    if (currentMatch) {
      return currentMatch;
    }
  }

  return workspaces.find((workspace) => workspace.uri !== "__unmapped__") ?? null;
}

function workspaceUriToFsPath(uri) {
  if (!uri || uri === "__unmapped__") return null;
  try {
    return normalizeFsPath(vscode.Uri.parse(uri).fsPath);
  } catch {
    return null;
  }
}

function normalizeFsPath(fsPath) {
  return path.normalize(fsPath).toLowerCase();
}

function getHtml(webview, model) {
  const nonce = createNonce();
  const styles = getStyles();
  const state = model.state;
  const currentConversation = state?.scan?.currentConversation?.conversation ?? state?.report?.currentConversation?.conversation ?? null;
  const currentMeta = state?.scan?.currentConversation ?? state?.report?.currentConversation ?? null;
  const workspaceDetail = state?.workspaceDetail?.workspace ?? null;
  const workspaceConversations = Array.isArray(state?.workspaceDetail?.conversations) ? state.workspaceDetail.conversations : [];
  const report = state?.report ?? null;

  const content = model.kind === "error"
    ? renderErrorContent(model.error, state)
    : renderReadyContent({
        currentConversation,
        currentMeta,
        workspaceDetail,
        workspaceConversations,
        report,
        state,
        loading: model.kind === "loading",
      });

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="${nonce}">${styles}</style>
  </head>
  <body>
    <div class="shell">
      <header class="topbar">
        <div>
          <div class="eyebrow">AG Kernel Monitor</div>
          <div class="title">Sidebar Telemetry</div>
        </div>
        <div class="actions">
          <button data-action="refresh">Refresh</button>
          <button data-action="settings">Settings</button>
          <button data-action="output">Output</button>
        </div>
      </header>
      ${content}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      for (const button of document.querySelectorAll("button[data-action]")) {
        button.addEventListener("click", () => {
          const action = button.getAttribute("data-action");
          if (action === "refresh") vscode.postMessage({ type: "refresh" });
          if (action === "settings") vscode.postMessage({ type: "openSettings" });
          if (action === "output") vscode.postMessage({ type: "openOutput" });
        });
      }
    </script>
  </body>
  </html>`;
}

function renderReadyContent({ currentConversation, currentMeta, workspaceDetail, workspaceConversations, report, state, loading }) {
  const loadedAt = state?.loadedAt ? new Date(state.loadedAt).toLocaleTimeString() : "unknown";
  const preferredWorkspace = state?.preferredWorkspacePath ?? null;

  return `
    <section class="hero">
      <div>
        <div class="hero-label">${loading ? "Refreshing..." : "Live snapshot"}</div>
        <div class="hero-meta">Updated ${escapeHtml(loadedAt)}</div>
      </div>
      <div class="chips">
        ${currentMeta ? renderChip(currentMeta.mode === "active" ? "Active" : currentMeta.mode === "recent" ? "Recent fallback" : "None", currentMeta.mode === "active" ? "good" : "warn") : ""}
        ${currentConversation?.health ? renderChip(currentConversation.health, currentConversation.health === "HEALTHY" ? "good" : currentConversation.health === "WARNING" ? "warn" : "bad") : ""}
      </div>
    </section>

    ${renderSection("Current Conversation", `
      ${currentConversation ? `
        ${renderMetricGrid([
          ["Workspace", currentConversation.workspaceName || "[Unmapped]"],
          ["Estimated Context", `${currentConversation.estimatedTotalTokensFormatted} (${currentConversation.contextRatioFormatted})`],
          ["Messages", currentConversation.messageCount !== null ? String(currentConversation.messageCount) : "unknown"],
          ["Last Active", currentConversation.lastActiveRelative || "unknown"],
        ])}
        <div class="body-copy"><strong>${escapeHtml(currentConversation.title || "Untitled")}</strong></div>
        <div class="detail">Detection: ${escapeHtml(currentMeta?.detectionNote || "unknown")}</div>
        <div class="detail">Breakdown: prompt/history ${escapeHtml(String(currentConversation.estimatedPromptTokens))} | artifacts ${escapeHtml(String(currentConversation.estimatedArtifactTokens))}</div>
        <div class="detail">Mapping: ${escapeHtml(currentConversation.mappingSource || "unknown")} (${escapeHtml(String(currentConversation.mappingConfidence ?? 0))})</div>
        ${currentConversation.mappingNote ? `<div class="detail">Mapping note: ${escapeHtml(currentConversation.mappingNote)}</div>` : ""}
        <div class="detail">Why heavy: ${escapeHtml(currentConversation.whyHeavy || "No explanation available.")}</div>
      ` : `<div class="empty">No conversation detected yet.</div>`}
    `)}

    ${renderSection("Workspace Details", `
      ${workspaceDetail ? `
        ${renderMetricGrid([
          ["Workspace", workspaceDetail.displayName || workspaceDetail.name],
          ["Chats", String(workspaceDetail.conversationCount ?? 0)],
          ["Mapped/Unmapped", `${workspaceDetail.mappedConversationCount ?? 0}/${workspaceDetail.unmappedConversationCount ?? 0}`],
          ["Brain", workspaceDetail.brainSizeFormatted || "0 B"],
        ])}
        <div class="detail">Location: ${escapeHtml(workspaceDetail.uri || "unknown")}</div>
        <div class="detail">Largest session: ${escapeHtml(workspaceDetail.largestConversationTokensFormatted || "0")}</div>
        ${preferredWorkspace ? `<div class="detail">Editor workspace: ${escapeHtml(preferredWorkspace)}</div>` : ""}
        <div class="list">
          ${workspaceConversations.slice(0, 6).map((conversation) => renderListRow({
            title: conversation.title || conversation.id,
            subtitle: `${conversation.estimatedTotalTokensFormatted} | ${conversation.messageCount !== null ? conversation.messageCount : "unknown"} msgs | ${conversation.lastActiveRelative}`,
            meta: conversation.mappingSource || "unknown",
          })).join("") || '<div class="empty">No conversations found for the selected workspace.</div>'}
        </div>
      ` : `<div class="empty">No matching workspace detail is available for the current editor context.</div>`}
    `)}

    ${renderSection("Brain, Cache, Cleanup", `
      <div class="subsection">
        <div class="subheading">Largest Sessions</div>
        <div class="list">
          ${(report?.largestSessions || []).slice(0, 5).map((session) => renderListRow({
            title: `${session.workspaceName} · ${session.estimatedTotalTokensFormatted}`,
            subtitle: `${session.id} · ${session.lastActiveRelative}`,
            meta: session.healthEmoji || session.health || "",
          })).join("") || '<div class="empty">No heavy sessions found.</div>'}
        </div>
      </div>
      <div class="subsection">
        <div class="subheading">Unmapped Conversations</div>
        <div class="list">
          ${(report?.unmappedConversations || []).map((session) => renderListRow({
            title: `${session.title || "Untitled"} · ${session.estimatedTotalTokensFormatted}`,
            subtitle: session.id,
            meta: session.mappingNote || "No unmapped reason available.",
          })).join("") || '<div class="empty">No unmapped conversations.</div>'}
        </div>
      </div>
      <div class="subsection">
        <div class="subheading">Orphans</div>
        <div class="detail">Brain folders: ${escapeHtml((report?.orphanBrainFolders || []).join(", ") || "none")}</div>
        <div class="detail">Annotation files: ${escapeHtml((report?.orphanAnnotations || []).join(", ") || "none")}</div>
      </div>
    `)}

    ${renderSection("Settings", `
      ${renderMetricGrid([
        ["Bun Path", state?.settings?.bunPath || "bun"],
        ["Config Path", state?.settings?.cliConfigPath || "default search"],
        ["Auto Refresh", `${state?.settings?.autoRefreshSeconds ?? 0}s`],
        ["Editor Workspace Source", state?.settings?.preferActiveEditorWorkspace ? "active editor" : "first workspace"],
      ])}
      <div class="detail">This sidebar uses the bundled AG Kernel Monitor CLI and the same JSON model as the terminal workflow.</div>
    `)}
  `;
}

function renderErrorContent(error, state) {
  return `
    ${renderSection("Extension Error", `
      <div class="empty">${escapeHtml(String(error?.message || error || "Unknown error"))}</div>
      <div class="detail">If Bun is not installed or not on PATH, set <code>agKernelMonitor.bunPath</code> in VS Code settings.</div>
      <div class="detail">If the bundled CLI is missing, run <code>bun run build:vsx-cli</code> from this repo before packaging or testing the extension.</div>
      ${state ? `<div class="detail">Last successful refresh: ${escapeHtml(state.loadedAt || "unknown")}</div>` : ""}
    `)}
  `;
}

function renderSection(title, body) {
  return `
    <section class="panel">
      <div class="panel-title">${escapeHtml(title)}</div>
      <div class="panel-body">${body}</div>
    </section>
  `;
}

function renderMetricGrid(items) {
  return `<div class="metrics">${items.map(([label, value]) => `
    <div class="metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
    </div>
  `).join("")}</div>`;
}

function renderListRow({ title, subtitle, meta }) {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <div class="row-meta">${escapeHtml(meta)}</div>
    </div>
  `;
}

function renderChip(label, kind) {
  return `<span class="chip chip-${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
}

function getStyles() {
  return `
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: linear-gradient(180deg, color-mix(in srgb, var(--vscode-editor-background) 92%, #0ea5e9 8%), var(--vscode-editor-background));
    }
    .shell {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .topbar, .hero, .panel {
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 75%, transparent);
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, #ffffff 8%);
      border-radius: 14px;
    }
    .topbar {
      padding: 12px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    .eyebrow {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.7;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      margin-top: 2px;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-radius: 999px;
      padding: 5px 10px;
      cursor: pointer;
      font: inherit;
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .hero {
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .hero-label {
      font-size: 15px;
      font-weight: 700;
    }
    .hero-meta {
      opacity: 0.7;
      font-size: 12px;
      margin-top: 2px;
    }
    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .chip {
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .chip-good {
      background: color-mix(in srgb, #16a34a 18%, transparent);
      color: #7dd3a6;
    }
    .chip-warn {
      background: color-mix(in srgb, #f59e0b 18%, transparent);
      color: #f5d27a;
    }
    .chip-bad {
      background: color-mix(in srgb, #ef4444 18%, transparent);
      color: #f6a0a0;
    }
    .panel {
      padding: 12px;
    }
    .panel-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .panel-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      padding: 8px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 85%, #ffffff 15%);
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
    }
    .metric-label {
      font-size: 11px;
      opacity: 0.75;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-value {
      font-weight: 700;
      line-height: 1.3;
      word-break: break-word;
    }
    .body-copy {
      font-size: 13px;
      line-height: 1.5;
    }
    .detail {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.9;
      word-break: break-word;
    }
    .subsection {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .subheading {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.8;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      padding: 8px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, #ffffff 12%);
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .row-title {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.35;
    }
    .row-subtitle, .row-meta {
      font-size: 12px;
      opacity: 0.8;
      line-height: 1.4;
      word-break: break-word;
    }
    .empty {
      padding: 10px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, #ffffff 12%);
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.85;
    }
    code {
      font-family: var(--vscode-editor-font-family);
    }
  `;
}

function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  activate,
  deactivate,
};
