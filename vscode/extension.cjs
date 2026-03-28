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
    const settings = readSettings();
    const configArgs = [];
    const resolvedConfigPath = resolveConfiguredPath(settings.cliConfigPath);
    if (resolvedConfigPath) {
      configArgs.push("--config", resolvedConfigPath);
    }

    const binaryRuntime = resolveBundledBinary(this.extensionPath);
    if (binaryRuntime) {
      return runProcess(binaryRuntime.command, [...configArgs, ...args], this.output, this.extensionPath);
    }

    if (!fs.existsSync(cliBundlePath)) {
      throw new Error(
        "No bundled platform binary was found, and the Bun JS bundle is also missing. Run `bun run build:vsx-cli` for dev, or ship platform binaries in the published extension.",
      );
    }

    const bunCandidates = buildBunCandidates(settings.bunPath);
    let lastError = null;

    for (const bunPath of bunCandidates) {
      try {
        return await runProcess(
          bunPath,
          [cliBundlePath, ...configArgs, ...args],
          this.output,
          this.extensionPath,
        );
      } catch (error) {
        lastError = error;
        if (isRecoverableBunLaunchError(error)) {
          continue;
        }
        throw error;
      }
    }

    const runtimeError = new Error(
      "This installation does not have a runnable AG Kernel Monitor runtime yet. Republish the extension with bundled binaries, or set `agKernelMonitor.bunPath` to a working Bun executable.",
    );
    runtimeError.cause = lastError || null;
    throw runtimeError;
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

function resolveBundledBinary(extensionPath) {
  const target = getVsCodeTarget();
  if (!target) {
    return null;
  }

  const fileName = target.startsWith("win32-") ? "agk-monitor.exe" : "agk-monitor";
  const candidate = path.join(extensionPath, "vscode", "runtime", "bin", target, fileName);
  return fs.existsSync(candidate) ? { command: candidate, target } : null;
}

function getVsCodeTarget() {
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  if (process.platform === "win32" && process.arch === "arm64") return "win32-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-arm64";
  return null;
}

function runProcess(command, args, output, cwd) {
  return new Promise((resolve, reject) => {
    output.appendLine(`[cli] ${command} ${args.join(" ")}`);
    const spec = buildSpawnSpec(command, args, cwd);
    const child = spawn(spec.command, spec.args, spec.options);

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

function buildSpawnSpec(command, args, cwd) {
  const options = {
    cwd,
    env: process.env,
    windowsHide: true,
  };

  if (process.platform === "win32" && /\.cmd$/i.test(command)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArg).join(" ")],
      options,
    };
  }

  return { command, args, options };
}

function quoteWindowsArg(value) {
  const stringValue = String(value);
  if (!/[\s"]/u.test(stringValue)) {
    return stringValue;
  }

  const escaped = stringValue
    .replace(/(\\*)"/g, "$1$1\\\"")
    .replace(/(\\+)$/g, "$1$1");

  return `"${escaped}"`;
}

function isRecoverableBunLaunchError(error) {
  const message = String(error?.message || error || "");
  return error?.code === "ENOENT"
    || error?.code === "EINVAL"
    || /spawn\s+EINVAL/i.test(message);
}

function parseJsonPayload(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("CLI returned empty output.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const payload = extractFirstJsonPayload(trimmed);
    if (!payload) {
      throw new Error("No complete JSON payload found in CLI output.");
    }
    return JSON.parse(payload);
  }
}

function extractFirstJsonPayload(text) {
  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start];
    if (opening !== "{" && opening !== "[") {
      continue;
    }

    const stack = [opening];
    let inString = false;
    let escaping = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char);
        continue;
      }

      if (char === "}" || char === "]") {
        const expected = char === "}" ? "{" : "[";
        if (stack[stack.length - 1] !== expected) {
          break;
        }

        stack.pop();
        if (stack.length === 0) {
          return text.slice(start, index + 1);
        }
      }
    }
  }

  return null;
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
          <div class="title">Conversation Overview</div>
        </div>
        <div class="actions">
          <button data-action="refresh">Refresh</button>
          <button data-action="settings">Settings</button>
          <button data-action="output">Logs</button>
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
  const runtimeMessage = describeRuntimeError(error);

  return `
    ${renderSection("Runtime Unavailable", `
      <div class="empty">${escapeHtml(runtimeMessage)}</div>
      <div class="detail">This sidebar expects a bundled runtime inside the extension package. Bun is only a fallback for development or recovery.</div>
      <div class="detail">For the next release, package the extension with <code>bun run package:vsix</code> so the universal VSIX includes bundled binaries.</div>
      <div class="detail">If you need a temporary local workaround, point <code>agKernelMonitor.bunPath</code> to a working Bun executable.</div>
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
        <div class="row-title">${escapeHtml(cleanUiText(title))}</div>
        <div class="row-subtitle">${escapeHtml(cleanUiText(subtitle))}</div>
      </div>
      <div class="row-meta">${escapeHtml(cleanUiText(meta))}</div>
    </div>
  `;
}

function renderChip(label, kind) {
  return `<span class="chip chip-${escapeHtml(kind)}">${escapeHtml(label)}</span>`;
}

function describeRuntimeError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (/runnable AG Kernel Monitor runtime/i.test(message)) {
    return "The installed extension package does not include a runnable AG Kernel Monitor runtime.";
  }
  if (/spawn\s+EINVAL/i.test(message)) {
    return "The Bun fallback could not be started by this Antigravity extension host.";
  }
  return message;
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
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--vscode-editor-background) 92%, #7c3aed 8%), transparent 38%),
        linear-gradient(180deg, color-mix(in srgb, var(--vscode-sideBar-background) 96%, #ffffff 4%), var(--vscode-sideBar-background));
    }
    .shell {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .topbar, .hero, .panel {
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 68%, transparent);
      background: color-mix(in srgb, var(--vscode-editor-background) 94%, #ffffff 6%);
      border-radius: 18px;
      box-shadow: 0 10px 28px color-mix(in srgb, #000000 10%, transparent);
    }
    .topbar {
      padding: 14px 16px;
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
      font-size: 16px;
      font-weight: 650;
      margin-top: 4px;
      letter-spacing: 0.01em;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid color-mix(in srgb, var(--vscode-button-border, transparent) 40%, var(--vscode-panel-border) 60%);
      background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 84%, transparent);
      color: var(--vscode-button-secondaryForeground);
      border-radius: 999px;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    button:hover {
      background: color-mix(in srgb, var(--vscode-button-secondaryHoverBackground) 88%, transparent);
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 55%, var(--vscode-panel-border) 45%);
      transform: translateY(-1px);
    }
    .hero {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .hero-label {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .hero-meta {
      opacity: 0.7;
      font-size: 12px;
      margin-top: 4px;
    }
    .chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .chip {
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .chip-good {
      background: color-mix(in srgb, #16a34a 16%, transparent);
      color: #8be0b3;
    }
    .chip-warn {
      background: color-mix(in srgb, #f59e0b 16%, transparent);
      color: #f5d98e;
    }
    .chip-bad {
      background: color-mix(in srgb, #ef4444 16%, transparent);
      color: #f4b0b0;
    }
    .panel {
      padding: 14px 16px;
    }
    .panel-title {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.72;
    }
    .panel-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      padding: 10px 11px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 90%, #ffffff 10%);
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);
    }
    .metric-label {
      font-size: 11px;
      opacity: 0.62;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .metric-value {
      font-weight: 650;
      line-height: 1.3;
      word-break: break-word;
    }
    .body-copy {
      font-size: 14px;
      line-height: 1.5;
      font-weight: 600;
    }
    .detail {
      font-size: 12px;
      line-height: 1.6;
      opacity: 0.82;
      word-break: break-word;
    }
    .subsection {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .subheading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.62;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .row {
      padding: 10px 11px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 91%, #ffffff 9%);
      border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 46%, transparent);
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }
    .row-main { min-width: 0; }
    .row-title {
      font-size: 13px;
      font-weight: 650;
      line-height: 1.35;
    }
    .row-subtitle, .row-meta {
      font-size: 12px;
      opacity: 0.72;
      line-height: 1.4;
      word-break: break-word;
    }
    .row-meta {
      text-align: right;
      max-width: 36%;
      flex: 0 0 auto;
    }
    .empty {
      padding: 12px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, #ffffff 8%);
      font-size: 12px;
      line-height: 1.6;
      opacity: 0.82;
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

function cleanUiText(value) {
  return String(value)
    .replace(/Â·/g, "|")
    .replace(/â†’/g, "->")
    .replace(/â€”/g, "-");
}

module.exports = {
  activate,
  deactivate,
};
