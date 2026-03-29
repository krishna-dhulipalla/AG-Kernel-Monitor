const fs = require("fs");
const path = require("path");

const extPath = path.join(__dirname, "vscode", "extension.cjs");
let content = fs.readFileSync(extPath, "utf-8");

const startStr = "function getHtml(webview, model) {";
const endStr = "function formatCompactTokens(tokens) {";

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.error("Could not find bounds");
  process.exit(1);
}

const UI_CODE = `const SVGS = {
  info: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/><path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>\\\`,
  pulse: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z" clip-rule="evenodd"/><path d="M11.5 7h-2.12l-1.05 4.04a.5.5 0 01-.95-.08l-1.46-5.87L4.62 7.5A.5.5 0 014 7h-1v-1h2.12l1.05-4.04a.5.5 0 01.95.08l1.46 5.87L9.38 5.5A.5.5 0 0110 6h2v1h-.5z"/></svg>\\\`,
  files: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3.5 2A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0012.5 4H9.7l-1-1.5H3.5zM3 3.5a.5.5 0 01.5-.5h4.79l1 1.5H12.5a.5.5 0 01.5.5v7a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5v-9z"/></svg>\\\`,
  trash: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>\\\`,
  time: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 3.5a.5.5 0 00-1 0V9a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z"/></svg>\\\`,
  graph: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 01.07.704l-4.5 5.5a.5.5 0 01-.74.037L7.06 6.756l-3.656 5.027a.5.5 0 01-.808-.588l4-5.5a.5.5 0 01.758-.06l2.609 2.61 4.15-5.073a.5.5 0 01.704-.059z"/></svg>\\\`,
  link: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1.001 1.001 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4.018 4.018 0 01-.128-1.287z"/><path d="M6.586 4.672A3 3 0 007.414 9.5l.775-.776a2 2 0 01-.896-3.346L9.12 3.55a2 2 0 012.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 00-4.243-4.243L6.586 4.672z"/></svg>\\\`,
  terminal: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm1 0v10h10V3H3zm2.5 3a.5.5 0 00-.5.5v1a.5.5 0 00.5.5h2a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5h-2z"/></svg>\\\`,
  folder: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M14.5 4H8.7l-1-1.5H1.5v11h13V4zm-12.3 8V3.5h5.8l1 1.5h5v7h-11.8z"/></svg>\\\`,
  refresh: \\\`<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 104.5 9.079l.5.866A6 6 0 114.681 3z"/></svg>\\\`
};

function getHtml(webview, model) {
  const nonce = createNonce();
  const snapshot = model.snapshot;
  const current = snapshot?.currentConversation?.conversation || null;

  return \\\`<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-\\\${nonce}'; script-src 'nonce-\\\${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style nonce="\\\${nonce}">\\\${getStyles()}</style>
  </head>
  <body>
    <div class="tree-root">
      \\\${model.error ? renderNotice(model.error) : ""}
      \\\${model.isActive && !snapshot ? \\\`<div class="loading-state">Loading data...</div>\\\` : ""}
      \\\${snapshot ? renderSection("overview", "Overview", isOpen(model.sectionState, "overview", true), renderOverview(snapshot, current)) : ""}
      \\\${snapshot ? renderSection("current", "Current Conversation", isOpen(model.sectionState, "current", true), renderCurrentConversation(snapshot, current)) : ""}
      \\\${snapshot ? renderSection("live", "Live Activity", isOpen(model.sectionState, "live", Boolean(snapshot?.liveFeed?.length)), renderLiveActivity(snapshot)) : ""}
      \\\${snapshot ? renderSection("workspace", "Workspace", isOpen(model.sectionState, "workspace", false), renderWorkspace(snapshot)) : ""}
      \\\${snapshot ? renderSection("cleanup", "Cleanup", isOpen(model.sectionState, "cleanup", false), renderCleanup(snapshot)) : ""}
    </div>
    <script nonce="\\\${nonce}">
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
          if (action === "openSettings") vscode.postMessage({ type: "openSettings" });
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
  </html>\\\`;
}

function renderOverview(snapshot, current) {
  if (!snapshot) return "";
  const overview = snapshot.overview;
  const tone = toneClass(current?.healthTone || "neutral");
  return \\\`
    \\\${renderTreeItem(SVGS.pulse, "State", formatResolutionLabel(overview.resolutionState), "", tone)}
    \\\${renderTreeItem(SVGS.graph, "Current Context", current ? \\\`\\\${current.estimatedTotalTokensFormatted} (\\\${current.contextRatioFormatted})\\\` : "0")}
    \\\${renderTreeItem(SVGS.link, "Mapped workspaces", \\\`\\\${overview.mappedConversations}/\\\${overview.totalConversations}\\\`)}
    \\\${renderTreeItem(SVGS.info, "Unmapped sessions", String(overview.unmappedConversations))}
  \\\`;
}

function renderCurrentConversation(snapshot, current) {
  if (!snapshot || !current) return '<div class="empty">No current conversation could be resolved.</div>';
  const label = current.title || "Untitled";
  return \\\`
    \\\${renderTreeItem(SVGS.folder, label, "", current.health, current.healthTone)}
    \\\${renderTreeItem(SVGS.graph, "Total Tokens", \\\`\\\${current.estimatedTotalTokensFormatted} (\\\${current.contextRatioFormatted})\\\`)}
    \\\${renderTreeItem(SVGS.pulse, "Latest Delta", current.deltaEstimatedTokensFormatted || "+0")}
    \\\${renderTreeItem(SVGS.time, "Last Active", current.lastActiveRelative || "unknown")}
    \\\${renderTreeItem(SVGS.info, "Messages", current.messageCount !== null ? \\\`\\\${current.messageCount}\\\${current.messageCountSource ? \\\` (\\\${current.messageCountSource})\\\` : ""}\\\` : "unknown")}
    \\\${renderCurrentChatRun(current) || ""}
    \\\${renderRecentChatRuns(current) || ""}
  \\\`;
}

function renderCurrentChatRun(current) {
  const run = current.currentChatRun;
  if (!run) return ''; // Removed duplicate "No live tracking" text
  return \\\`
    \\\${renderTreeItem(SVGS.terminal, \\\`Chat \\\${run.chatIndex}\\\`, \\\`\\\${formatCompactTokens(run.fromTokens)} -> \\\${formatCompactTokens(run.toTokens)} (\\\${run.deltaTokens >= 0 ? "+" : "-"}\\\${formatCompactTokens(Math.abs(run.deltaTokens))})\\\`)}
  \\\`;
}

function renderRecentChatRuns(current) {
  const runs = current.recentChatRuns || [];
  if (runs.length === 0) return "";
  return \\\`
    <div class="tree-subitems-header empty" style="margin-top:4px;">Last (\\\${Math.min(5, runs.length)}) Chats:</div>
    \\\${runs.slice(0, 5).map(run => renderTreeItem(SVGS.time, \\\`Chat \\\${run.chatIndex} completed\\\`, \\\`\\\${run.deltaTokens >= 0 ? "+" : "-"}\\\${formatCompactTokens(Math.abs(run.deltaTokens))}\\\`)).join("")}
  \\\`;
}

function renderLiveActivity(snapshot) {
  const feed = snapshot?.liveFeed || [];
  if (feed.length === 0) return \\\`<div class="empty">No live activity observed.</div>\\\`;
  return feed.map(event => \\\`
    <div class="log-line">
      \\\${escapeHtml(formatLiveEventLine(event))}
    </div>
  \\\`).join("");
}

function renderWorkspace(snapshot) {
  const workspace = snapshot?.workspaceDetail;
  if (!workspace) return \\\`<div class="empty">No workspace available.</div>\\\`;
  let html = \\\`
    \\\${renderTreeItem(SVGS.files, "Current Workspace", workspace.displayName || workspace.name)}
    \\\${renderTreeItem(SVGS.link, "Mapped Chats", \\\`\\\${workspace.mappedConversationCount}/\\\${workspace.conversationCount || 0}\\\`)}
    \\\${renderTreeItem(SVGS.graph, "Brain Size", workspace.brainSizeFormatted || "0 B")}
  \\\`;
  if (workspace.conversations && workspace.conversations.length > 0) {
    html += \\\`<div class="tree-subitems-header empty" style="margin-top:4px;">Workspace Chats:</div>\\\`;
    workspace.conversations.slice(0, 5).forEach(c => {
      html += renderTreeItem(SVGS.time, c.title || "Untitled", \\\`\\\${c.estimatedTotalTokensFormatted}\\\`);
    });
  }
  return html;
}

function renderCleanup(snapshot) {
  if (!snapshot) return \\\`<div class="empty">No cleanup data available.</div>\\\`;
  const cleanup = snapshot.cleanupSummary;
  let html = "";
  if (cleanup.unmappedConversations && cleanup.unmappedConversations.length > 0) {
    html += \\\`<div class="tree-subitems-header empty" style="margin-top:4px;">Unmapped Sessions:</div>\\\`;
    cleanup.unmappedConversations.slice(0, 4).forEach(c => {
      html += renderTreeItem(SVGS.info, c.title || "Untitled", c.estimatedTotalTokensFormatted, "", "", null, \\\`
        <button class="action-btn" title="Refresh" data-action="refresh">\\\${SVGS.refresh}</button>
      \\\`);
    });
  }
  if (cleanup.orphanBrainFolders && cleanup.orphanBrainFolders.length > 0) {
    html += \\\`<div class="tree-subitems-header empty" style="margin-top:4px;">Orphan Brain Folders (\\\${cleanup.orphanBrainFolders.length}):</div>\\\`;
    cleanup.orphanBrainFolders.forEach(folder => {
      html += renderTreeItem(SVGS.folder, folder, "", "", "", null, \\\`
        <button class="action-btn" title="Clean" data-action="clean">\\\${SVGS.trash}</button>
      \\\`);
    });
  }
  if (!html) html = \\\`<div class="empty">Workspace is clean.</div>\\\`;
  return html;
}

function renderNotice(error) {
  return \\\`<div class="notice">\\\${escapeHtml(String(error?.message || error || "Unknown extension error"))}</div>\\\`;
}

function renderSection(id, title, open, body) {
  return \\\`
    <details class="section" data-section-id="\\\${escapeHtml(id)}" \\\${open ? "open" : ""}>
      <summary class="section-header">
        <div class="chevron"></div>
        <span class="section-title">\\\${escapeHtml(title)}</span>
      </summary>
      <div class="section-body">\\\${body}</div>
    </details>
  \\\`;
}

function toneClass(tone) {
  if (tone === "healthy") return "tone-healthy";
  if (tone === "warning") return "tone-warning";
  if (tone === "critical") return "tone-critical";
  return "tone-neutral";
}

function renderTreeItem(iconSvg, label, value = "", badgeText = "", badgeTone = "", subItems = null, actionsHtml = "") {
  return \\\`
    <div class="tree-item-wrapper">
      <div class="tree-item">
        <div class="tree-item-content">
          \\\${iconSvg ? \\\`<span class="tree-icon">\\\${iconSvg}</span>\\\` : ""}
          <span class="tree-label">\\\${escapeHtml(label)}</span>
          \\\${badgeText ? \\\`<span class="pill \\\${badgeTone}">\\\${escapeHtml(badgeText)}</span>\\\` : ""}
          \\\${value ? \\\`<span class="tree-value">\\\${escapeHtml(value)}</span>\\\` : ""}
        </div>
        \\\${actionsHtml ? \\\`<div class="tree-actions">\\\${actionsHtml}</div>\\\` : ""}
      </div>
      \\\${subItems ? \\\`<div class="tree-subitems">\\\${subItems}</div>\\\` : ""}
    </div>
  \\\`;
}

function getStyles() {
  return \\\`
    body {
      margin: 0;
      padding: 0;
      background: transparent;
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .tree-root { display: flex; flex-direction: column; width: 100%; }
    .loading-state { padding: 8px 22px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .notice {
      padding: 6px 22px; 
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
      background: var(--vscode-list-hoverBackground);
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
      padding: 0 16px 0 22px;
      cursor: pointer;
      color: var(--vscode-list-inactiveSelectionForeground, var(--vscode-foreground));
    }
    .tree-item:hover {
      background: var(--vscode-list-hoverBackground);
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
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; font-size: 13px;
    }
    .tree-value {
      white-space: nowrap; flex-shrink: 0; font-size: 12px; opacity: 0.75; margin-left: auto;
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
    .action-btn:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
    .action-btn svg { width: 14px; height: 14px; }
    
    .tree-subitems { padding-left: 22px; display: flex; flex-direction: column; }
    .tree-subitems-header { padding: 4px 22px; font-size: 11px; opacity: 0.7; font-weight: 600; text-transform: uppercase; }
    .empty { padding: 4px 22px; font-size: 12px; color: var(--vscode-descriptionForeground); opacity: 0.8; }
    
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
      padding: 2px 22px;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
    }
    .log-line:hover { background: var(--vscode-list-hoverBackground); }
  \\\`;
}
`;

const newContent = content.substring(0, startIndex) + UI_CODE + "\n" + content.substring(endIndex);
fs.writeFileSync(extPath, newContent, "utf-8");
console.log("Successfully updated extension.cjs HTML/CSS payload!");
