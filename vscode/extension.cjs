const vscode = require("vscode");
const path = require("path");
const { AgKernelMonitorRuntime } = require("./monitor-runtime.cjs");

function activate(context) {
  const output = vscode.window.createOutputChannel("Antigravity Token Monitor");
  const runtime = new AgKernelMonitorRuntime(context.extensionPath);
  const provider = new AgKernelSidebarProvider(runtime, output);

  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "agKernelMonitor.sidebar",
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
    vscode.commands.registerCommand("agKernelMonitor.refresh", () =>
      provider.refresh(true),
    ),
    vscode.commands.registerCommand("agKernelMonitor.openSettings", () => {
      void vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "agKernelMonitor",
      );
    }),
    vscode.commands.registerCommand("agKernelMonitor.openOutput", () =>
      output.show(true),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("agKernelMonitor")) {
        provider.onConfigurationChanged();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() =>
      provider.onWorkspaceContextChanged(),
    ),
    vscode.window.onDidChangeActiveTextEditor(() =>
      provider.onWorkspaceContextChanged(),
    ),
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

    webviewView.webview.onDidReceiveMessage(async (message) => {
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
      if (message?.type === "reindex") {
        this.runtime.clearCache?.();
        void this.refresh(true);
        return;
      }
      if (message?.type === "clean" && message.orphanId) {
        const orphanId = message.orphanId;
        const answer = await vscode.window.showWarningMessage(
          `Delete orphan brain folder "${orphanId}"? This is irreversible.`,
          { modal: true },
          "Delete",
        );
        if (answer === "Delete") {
          try {
            await this.runtime.cleanOrphanBrainFolder?.(orphanId);
            vscode.window.showInformationMessage(`Deleted orphan folder: ${orphanId}`);
            void this.refresh(true);
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to delete: ${err?.message || err}`);
          }
        }
        return;
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
          this.output.appendLine(
            `[error] ${String(error?.stack || error?.message || error)}`,
          );
          this.render();
        },
      });
    } catch (error) {
      this.lastError = error;
      this.output.appendLine(
        `[error] ${String(error?.stack || error?.message || error)}`,
      );
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
    this.runtime.configPath = resolveConfiguredPath(
      readSettings().cliConfigPath,
    );
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
    preferActiveEditorWorkspace: config.get(
      "preferActiveEditorWorkspace",
      true,
    ),
  };
}

function getPreferredWorkspacePath() {
  const settings = readSettings();
  if (settings.preferActiveEditorWorkspace) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const folder = vscode.workspace.getWorkspaceFolder(
        activeEditor.document.uri,
      );
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

const SVGS = {
  info: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/><path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>`,
  pulse: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z" clip-rule="evenodd"/><path d="M11.5 7h-2.12l-1.05 4.04a.5.5 0 01-.95-.08l-1.46-5.87L4.62 7.5A.5.5 0 014 7h-1v-1h2.12l1.05-4.04a.5.5 0 01.95.08l1.46 5.87L9.38 5.5A.5.5 0 0110 6h2v1h-.5z"/></svg>`,
  files: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0012.5 4H9.7l-1-1.5H3.5zM3 3.5a.5.5 0 01.5-.5h4.79l1 1.5H12.5a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-9z"/></svg>`,
  trash: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`,
  time: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 3.5a.5.5 0 00-1 0V9a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z"/></svg>`,
  graph: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 01.07.704l-4.5 5.5a.5.5 0 01-.74.037L7.06 6.756l-3.656 5.027a.5.5 0 01-.808-.588l4-5.5a.5.5 0 01.758-.06l2.609 2.61 4.15-5.073a.5.5 0 01.704-.059z"/></svg>`,
  link: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1.001 1.001 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4.018 4.018 0 01-.128-1.287z"/><path d="M6.586 4.672A3 3 0 007.414 9.5l.775-.776a2 2 0 01-.896-3.346L9.12 3.55a2 2 0 012.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 00-4.243-4.243L6.586 4.672z"/></svg>`,
  terminal: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm1 0v10h10V3H3zm2.5 3a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5h-2z"/></svg>`,
  folder: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M14.5 4H8.7l-1-1.5H1.5v11h13V4zm-12.3 8V3.5h5.8l1 1.5h5v7h-11.8z"/></svg>`,
  refresh: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 104.5 9.079l.5.866A6 6 0 114.681 3z"/></svg>`,
  clean: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`,
};

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
    <div class="tree-root">
      ${model.error ? renderNotice(model.error) : ""}
      ${model.isActive && !snapshot ? `<div class="loading-state">Loading data...</div>` : ""}
      ${snapshot ? renderSection("overview", "Overview", isOpen(model.sectionState, "overview", true), renderOverview(snapshot, current)) : ""}
      ${snapshot ? renderSection("current", "Current Conversation", isOpen(model.sectionState, "current", true), renderCurrentConversation(snapshot, current)) : ""}
      ${snapshot ? renderSection("live", "Live Activity", isOpen(model.sectionState, "live", Boolean(snapshot?.liveFeed?.length)), renderLiveActivity(snapshot)) : ""}
      ${snapshot ? renderSection("workspace", "Workspace", isOpen(model.sectionState, "workspace", false), renderWorkspace(snapshot)) : ""}
      ${snapshot ? renderSection("cleanup", "Cleanup", isOpen(model.sectionState, "cleanup", false), renderCleanup(snapshot)) : ""}
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const persisted = vscode.getState() || {};
      for (const section of document.querySelectorAll("details[data-section-id]")) {
        if (Object.prototype.hasOwnProperty.call(persisted, section.dataset.sectionId)) {
          section.open = !!persisted[section.dataset.sectionId];
        }
      }
      for (const button of document.querySelectorAll(".action-btn")) {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = button.getAttribute("data-action");
          if (action === "refresh") vscode.postMessage({ type: "refresh" });
          if (action === "reindex") vscode.postMessage({ type: "reindex" });
          if (action === "clean") {
            const orphanId = button.getAttribute("data-orphan-id");
            vscode.postMessage({ type: "clean", orphanId: orphanId });
          }
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
  if (!snapshot) return "";
  const overview = snapshot.overview;
  const tone = toneClass(current?.healthTone || "neutral");
  const modelInfo = formatModelInfo(overview.modelCredits, overview.modelPreferences);
  const creditsStatus = formatCreditsStatus(overview.modelCredits);
  return `
    ${renderTreeItem(SVGS.pulse, "State", formatResolutionLabel(overview.resolutionState), "", tone)}
    ${renderTreeItem(SVGS.info, "Active Model", modelInfo)}
    ${renderTreeItem(SVGS.info, "Credits", creditsStatus)}
    ${renderTreeItem(SVGS.graph, "Warning Limit", formatTokens(overview.warningLimit || 0))}
    ${renderTreeItem(SVGS.link, "Mapped sessions", `${overview.mappedConversations}/${overview.totalConversations}`)}
    ${renderTreeItem(SVGS.info, "Unmapped sessions", String(overview.unmappedConversations))}
  `;
}

function renderCurrentConversation(snapshot, current) {
  if (!snapshot || !current)
    return '<div class="empty">No current conversation could be resolved.</div>';
  const label = current.title || formatSessionLabel(current.conversationId);
  return `
    ${renderTreeItem(SVGS.folder, label, "", current.healthTone === "neutral" ? "" : current.health, current.healthTone)}
    ${renderTreeItem("", "Tokens Added This Turn", current.deltaEstimatedTokensFormatted || "+0")}
    ${renderTreeItem("", "Last Observed Turn", current.lastObservedTurnTokensFormatted || "none")}
    ${renderTreeItem("", "Tokens Added In Last 5 Turns", current.lastFiveTurnsTokensFormatted || "+0")}
    ${renderTreeItem("", "Last Active", current.lastActiveRelative || "listening\u2026")}
    ${renderTreeItem("", "Session Direct Messages", current.messageCount !== null ? `${current.messageCount}${current.messageCountSource ? ` (${current.messageCountSource})` : ""}` : "not yet observed")}
    ${renderTreeItem("", "Direct Messages This Turn", current.currentTurnDirectMessages !== null ? String(current.currentTurnDirectMessages) : "needs more turns")}
    ${renderTreeItem("", "Observed Turns", String(current.observedTurnCount || 0))}
    ${renderTreeItem("", "Avg Tokens / Observed Turn", current.avgTokensPerObservedTurnFormatted || "needs more turns")}
    ${renderTreeItem("", "Avg Direct Msgs / Observed Turn", current.avgDirectMessagesPerObservedTurnFormatted || "needs more turns")}
    ${renderRecentChatRuns(current) || ""}
  `;
}

function renderRecentChatRuns(current) {
  const runs = current.historicalRuns || [];
  if (runs.length === 0) return "";
  return `
    <div class="tree-subitems-header empty" style="margin-top:4px;">Recent Observed Turns:</div>
    ${runs
      .slice(0, 5)
      .map((run) =>
        renderTreeItem(
          "",
          `Turn ${run.chatIndex} | ${run.directMessages === null || run.directMessages === undefined ? "? msgs" : `+${run.directMessages} msgs`}`,
          `${run.deltaTokensFormatted}`,
        ),
      )
      .join("")}
  `;
}

function renderLiveActivity(snapshot) {
  const feed = snapshot?.liveFeed || [];
  if (feed.length === 0)
    return `<div class="empty">No live activity observed.</div>`;
  return feed
    .map(
      (event) => `
    <div class="log-line">
      ${escapeHtml(formatLiveEventLine(event))}
    </div>
  `,
    )
    .join("");
}

function renderWorkspace(snapshot) {
  const workspace = snapshot?.workspaceDetail;
  if (!workspace) return `<div class="empty">No workspace available.</div>`;
  let html = `
    ${renderTreeItem(SVGS.files, "Current Workspace", workspace.displayName || workspace.name)}
    ${renderTreeItem("", "Workspace Total Tokens", workspace.estimatedTokensFormatted || "0")}
    ${workspace.currentSessionShareFormatted ? renderTreeItem("", "Current Session Share", workspace.currentSessionShareFormatted) : ""}
    ${workspace.currentSessionLastTurnTokensFormatted ? renderTreeItem("", "Current Session Last Turn", workspace.currentSessionLastTurnTokensFormatted) : ""}
    ${workspace.currentSessionLastFiveTurnsTokensFormatted ? renderTreeItem("", "Current Session Last 5 Turns", workspace.currentSessionLastFiveTurnsTokensFormatted) : ""}
    ${renderTreeItem("", "Mapped Chats", `${workspace.mappedConversationCount}/${workspace.conversationCount || 0}`)}
    ${renderTreeItem("", "Brain Storage Size", workspace.brainSizeFormatted || "0 B")}
  `;
  if (workspace.conversations && workspace.conversations.length > 0) {
    html += `<div class="tree-subitems-header empty" style="margin-top:4px;">Top Sessions By Total Tokens:</div>`;
    workspace.conversations.slice(0, 5).forEach((c) => {
      html += renderTreeItem(
        "",
        c.title || "Untitled",
        `${c.estimatedTotalTokensFormatted}`,
      );
    });
  }
  return html;
}

function renderCleanup(snapshot) {
  if (!snapshot) return `<div class="empty">No cleanup data available.</div>`;
  const cleanup = snapshot.cleanupSummary;
  let html = `<div style="padding:4px 18px;">
    <button class="action-btn" title="Reindex all sessions" data-action="reindex" style="display:inline-flex;gap:4px;opacity:1;font-size:11px;">${SVGS.refresh} Reindex All Sessions</button>
  </div>`;
  if (
    cleanup.unmappedConversations &&
    cleanup.unmappedConversations.length > 0
  ) {
    html += `<div class="tree-subitems-header empty" style="margin-top:4px;">Unmapped Sessions (try Reindex first):</div>`;
    cleanup.unmappedConversations.slice(0, 4).forEach((c) => {
      html += renderTreeItem(
        SVGS.info,
        c.title || formatSessionLabel(c.conversationId),
        c.estimatedTotalTokensFormatted,
        "",
        "",
        null,
        `
        <button class="action-btn" title="Refresh mapping" data-action="refresh">${SVGS.refresh}</button>
      `,
      );
    });
  }
  if (cleanup.orphanBrainFolders && cleanup.orphanBrainFolders.length > 0) {
    html += `<div class="tree-subitems-header empty" style="margin-top:4px;">Orphan Brain Folders (${cleanup.orphanBrainFolders.length}):</div>`;
    cleanup.orphanBrainFolders.forEach((folder) => {
      html += renderTreeItem(
        SVGS.folder,
        folder,
        "",
        "",
        "",
        null,
        `
        <button class="action-btn" title="Delete this orphan folder" data-action="clean" data-orphan-id="${escapeHtml(folder)}">${SVGS.trash}</button>
      `,
      );
    });
  }
  if (cleanup.unmappedConversations?.length === 0 && cleanup.orphanBrainFolders?.length === 0) {
    html += `<div class="empty">Workspace is clean. No orphan folders found.</div>`;
  }
  return html;
}

function renderNotice(error) {
  return `<div class="notice">${escapeHtml(String(error?.message || error || "Unknown extension error"))}</div>`;
}

function renderSection(id, title, open, body) {
  return `
    <details class="section" data-section-id="${escapeHtml(id)}" ${open ? "open" : ""}>
      <summary class="section-header">
        <div class="chevron"></div>
        <span class="section-title">${escapeHtml(title)}</span>
      </summary>
      <div class="section-body">${body}</div>
    </details>
  `;
}

function toneClass(tone) {
  if (tone === "healthy") return "tone-healthy";
  if (tone === "warning") return "tone-warning";
  if (tone === "critical") return "tone-critical";
  return "tone-neutral";
}

function renderTreeItem(
  iconSvg,
  label,
  value = "",
  badgeText = "",
  badgeTone = "",
  subItems = null,
  actionsHtml = "",
) {
  return `
    <div class="tree-item-wrapper">
      <div class="tree-item">
        <div class="tree-item-content">
          ${iconSvg ? `<span class="tree-icon">${iconSvg}</span>` : ""}
          <span class="tree-label">${escapeHtml(label)}</span>
          ${badgeText ? `<span class="pill ${badgeTone}">${escapeHtml(badgeText)}</span>` : ""}
          ${value ? `<span class="tree-value">${escapeHtml(value)}</span>` : ""}
        </div>
        ${actionsHtml ? `<div class="tree-actions">${actionsHtml}</div>` : ""}
      </div>
      ${subItems ? `<div class="tree-subitems">${subItems}</div>` : ""}
    </div>
  `;
}

function formatTokens(tokens) {
  const value =
    typeof tokens === "number" && Number.isFinite(tokens) ? tokens : 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatModelInfo(modelCredits, modelPreferences) {
  if (modelPreferences && modelPreferences.modelName) {
    return modelPreferences.modelName;
  }
  if (modelPreferences && modelPreferences.modelId) {
    return `Model #${modelPreferences.modelId}`;
  }
  return "not detected";
}

function formatCreditsStatus(modelCredits) {
  if (!modelCredits) return "open Settings \u2192 Models for details";
  
  if (modelCredits.total > 0) {
    const percentage = Math.round((modelCredits.used / modelCredits.total) * 100);
    return `${percentage}% used (${modelCredits.used}/${modelCredits.total})`;
  }

  if (modelCredits.status === "available") return "\u2713 available";
  if (modelCredits.status === "restricted") return "\u26a0 restricted";
  return "open Settings \u2192 Models for details";
}

function formatSessionLabel(id) {
  if (!id) return "Untitled";
  return `Session ${id.substring(0, 8)}\u2026`;
}

function getStyles() {
  return `
    body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .tree-root { display: flex; flex-direction: column; width: 100%; border-left: none; }
    .loading-state { padding: 8px 18px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .notice {
      padding: 6px 18px; 
      color: var(--vscode-errorForeground);
      font-size: 11px; line-height: 1.5;
    }
    .section {
      width: 100%;
    }
    .section-header {
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 3px 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-sideBarSectionHeader-foreground);
      background: var(--vscode-sideBarSectionHeader-background);
      border-top: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      list-style: none;
      user-select: none;
    }
    @media (prefers-color-scheme: dark) {
      .section-header { border-top: 1px solid rgba(200, 200, 200, 0.1); background: transparent; }
    }
    @media (prefers-color-scheme: light) {
      .section-header { border-top: 1px solid rgba(0, 0, 0, 0.1); background: transparent; }
    }
    .section-header:hover {
      background: var(--vscode-list-hoverBackground, rgba(130, 130, 130, 0.1));
    }
    .section-header::-webkit-details-marker { display: none; }
    .chevron {
      width: 0; height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 4px solid currentColor;
      margin-right: 6px; margin-left: 4px;
      transition: transform 0.1s ease;
      display: inline-block;
      opacity: 0.8;
    }
    .section[open] > .section-header > .chevron {
      transform: rotate(90deg);
    }
    .section-title {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
    }
    .section-body { display: flex; flex-direction: column; padding: 2px 0px 8px 0px; }
    
    .tree-item-wrapper { display: flex; flex-direction: column; width: 100%; }
    .tree-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 22px;
      padding: 0 8px 0 18px;
      cursor: pointer;
      color: var(--vscode-list-inactiveSelectionForeground, var(--vscode-foreground));
    }
    .tree-item:hover {
      background: var(--vscode-list-hoverBackground, rgba(130, 130, 130, 0.1));
      color: var(--vscode-list-hoverForeground, var(--vscode-foreground));
    }
    .tree-item-content {
      display: flex; align-items: center; gap: 6px; overflow: hidden; width: 100%; text-overflow: ellipsis;
    }
    .tree-icon {
      width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center;
      color: var(--vscode-icon-foreground); opacity: 0.8; flex-shrink: 0;
    }
    .tree-label {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; font-size: 13px; opacity: 0.9;
    }
    .tree-value {
      white-space: nowrap; flex-shrink: 0; font-size: 12px; opacity: 0.70; margin-left: auto; font-variant-numeric: tabular-nums;
    }
    .tree-actions {
      display: none; align-items: center; gap: 4px; padding-left: 10px; flex-shrink: 0;
    }
    .tree-item:hover .tree-actions {
      display: flex;
    }
    .action-btn {
      background: transparent; border: none; padding: 2px; display: flex; align-items: center; justify-content: center;
      color: var(--vscode-icon-foreground); cursor: pointer; border-radius: 4px; opacity: 0.8;
    }
    .action-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(130, 130, 130, 0.15)); opacity: 1; }
    .action-btn svg { width: 14px; height: 14px; }
    
    .tree-subitems { padding-left: 18px; display: flex; flex-direction: column; }
    .tree-subitems-header { padding: 4px 18px; font-size: 11px; opacity: 0.6; font-weight: 600; text-transform: uppercase; }
    .empty { padding: 4px 18px; font-size: 12px; color: var(--vscode-descriptionForeground); opacity: 0.8; }
    
    .pill {
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 3px;
      padding: 0px 4px;
      font-size: 10px;
      white-space: nowrap;
      text-transform: uppercase;
      margin-left: 6px; flex-shrink: 0;
    }
    .tone-healthy { color: #87d6a3; border-color: rgba(135, 214, 163, 0.4); }
    .tone-warning { color: #f2c779; border-color: rgba(242, 199, 121, 0.4); }
    .tone-critical { color: #f5a3a3; border-color: rgba(245, 163, 163, 0.4); }
    .tone-neutral { color: var(--vscode-descriptionForeground); background: rgba(100,100,100,0.1); }
    
    .log-line {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      line-height: 1.4;
      padding: 3px 18px;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
    }
    .log-line:hover { background: var(--vscode-list-hoverBackground, rgba(130, 130, 130, 0.1)); }
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
    const deltaMessages =
      event.deltaMessages !== null && event.deltaMessages !== undefined
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
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
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
