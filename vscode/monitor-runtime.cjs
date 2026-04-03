const fs = require("fs");
const path = require("path");
const os = require("os");
const { createHash } = require("crypto");
const initSqlJs = require("sql.js/dist/sql-wasm.js");

const ACTIVE_WINDOW_MS = 90_000;
const LIVE_FEED_LIMIT = 5;
const QUIET_TURN_FINALIZE_MS = 30000;
const UNMAPPED_WORKSPACE_ID = "__unmapped__";
const UNMAPPED_WORKSPACE_URI = "__unmapped__";
const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const BASE64_REGEX = /(?:[A-Za-z0-9+/]{24,}={0,2})/g;
const TITLE_REGEX =
  /([A-Z][A-Za-z0-9&/()'.,:_-]*(?: [A-Za-z0-9&/()'.,:_-]+){1,12})/;
const WINDOWS_DRIVE_REGEX = /^([a-zA-Z]):[\\/]/;
const FILE_URI_REGEX =
  /file:\/\/(?:\/(?:[a-zA-Z]:|[a-zA-Z]%3A)|wsl\.localhost\/)[^\s"'<>)\]}]+/gi;
const TIMESTAMP_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
const LOG_CONVERSATION_REGEX =
  /conversation(?:_id)?[\s:=\[]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function getAntigravityDataDir() {
  return path.join(os.homedir(), ".gemini", "antigravity");
}

function getConversationsDir() {
  return path.join(getAntigravityDataDir(), "conversations");
}

function getBrainDir() {
  return path.join(getAntigravityDataDir(), "brain");
}

function getAnnotationsDir() {
  return path.join(getAntigravityDataDir(), "annotations");
}

function getElectronUserDataDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Antigravity",
      "User",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Antigravity",
      "User",
    );
  }
  return path.join(os.homedir(), ".config", "Antigravity", "User");
}

function getStorageJsonPath() {
  return path.join(getElectronUserDataDir(), "globalStorage", "storage.json");
}

function getGlobalStateDbPath() {
  return path.join(getElectronUserDataDir(), "globalStorage", "state.vscdb");
}

function getWorkspaceStorageDir() {
  return path.join(getElectronUserDataDir(), "workspaceStorage");
}

function getLogDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Antigravity",
      "logs",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Antigravity",
      "logs",
    );
  }
  return path.join(os.homedir(), ".config", "Antigravity", "logs");
}

function trimDecorators(input) {
  return String(input || "")
    .trim()
    .replace(/^[>\s"'`]+/, "")
    .replace(/[>\s"'`,.;:!?]+$/, "");
}

function collapseSlashes(input) {
  return String(input).replace(/\/{2,}/g, "/");
}

function normalizeWindowsPath(input) {
  const forward = String(input).replace(/\\/g, "/");
  return forward.replace(
    WINDOWS_DRIVE_REGEX,
    (_, drive) => `${drive.toLowerCase()}:/`,
  );
}

function normalizeFileUriLike(input) {
  const cleaned = trimDecorators(input).replace(/\\/g, "/");

  if (/^file:\/\/wsl\.localhost\//i.test(cleaned)) {
    const suffix = cleaned.slice("file://".length);
    const normalized = collapseSlashes(suffix).replace(
      /^wsl\.localhost/i,
      "wsl.localhost",
    );
    return `file://${normalized}`.replace(/\/$/, "");
  }

  if (/^file:\/\/\/[a-zA-Z]:/i.test(cleaned)) {
    const suffix = cleaned.slice("file:///".length);
    return `file:///${normalizeWindowsPath(suffix)}`.replace(/\/$/, "");
  }

  return cleaned.replace(/\/$/, "");
}

function toFileUri(input) {
  const normalizedPath = normalizeWindowsPath(input);
  if (WINDOWS_DRIVE_REGEX.test(normalizedPath)) {
    return `file:///${normalizedPath}`.replace(/\/$/, "");
  }

  const unixLike = collapseSlashes(normalizedPath);
  return `file://${unixLike.startsWith("/") ? "" : "/"}${unixLike}`.replace(
    /\/$/,
    "",
  );
}

function normalizeWorkspaceUri(input) {
  if (!input) return null;

  const trimmed = trimDecorators(input);
  if (!trimmed) return null;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  if (/^file:\/\//i.test(decoded)) {
    return normalizeFileUriLike(decoded);
  }

  if (WINDOWS_DRIVE_REGEX.test(decoded)) {
    return toFileUri(decoded);
  }

  return collapseSlashes(decoded.replace(/\\/g, "/")).replace(/\/$/, "");
}

function extractWorkspaceNameFromUri(uri) {
  const normalized = normalizeWorkspaceUri(uri) || trimDecorators(uri);
  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || normalized;
  return last || normalized;
}

function uriMatchesWorkspaceRoot(candidate, workspaceRoot) {
  const normalizedCandidate = normalizeWorkspaceUri(candidate);
  const normalizedRoot = normalizeWorkspaceUri(workspaceRoot);

  if (!normalizedCandidate || !normalizedRoot) {
    return false;
  }

  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function findFileUrisInText(text) {
  const uris = new Set();
  for (const match of String(text || "").matchAll(FILE_URI_REGEX)) {
    const normalized = normalizeWorkspaceUri(match[0]);
    if (normalized) {
      uris.add(normalized);
    }
  }
  return Array.from(uris);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens || 0);
}

function formatRatio(ratio) {
  return `${Math.round((ratio || 0) * 100)}%`;
}

function relativeTime(dateValue) {
  if (!dateValue) return "unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "unknown";

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} min ago`;
  return "just now";
}

function assessHealth(estimatedTokens, bloatLimit) {
  const ratio = bloatLimit > 0 ? estimatedTokens / bloatLimit : 0;
  if (ratio > 1) return { status: "OVER", tone: "critical" };
  if (ratio > 0.8) return { status: "CRITICAL", tone: "critical" };
  if (ratio > 0.5) return { status: "WARNING", tone: "warning" };
  return { status: "HEALTHY", tone: "healthy" };
}

function explainWhyHeavy(
  estimatedPromptTokens,
  estimatedArtifactTokens,
  estimatedTotalTokens,
  bloatLimit,
) {
  if (estimatedTotalTokens === 0) {
    return "No estimated context recorded yet.";
  }

  const ratio = estimatedTotalTokens / bloatLimit;
  const artifactShare =
    estimatedTotalTokens > 0
      ? estimatedArtifactTokens / estimatedTotalTokens
      : 0;

  if (ratio >= 1 && artifactShare >= 0.35) {
    return "Estimated total is over the limit and artifact context is a material share of it.";
  }
  if (ratio >= 1) {
    return "Estimated conversation history is already over the configured warning limit.";
  }
  if (artifactShare >= 0.45) {
    return "Artifact context is a large share of the estimated total.";
  }
  if (ratio >= 0.8) {
    return "Estimated conversation history is close to the configured warning limit.";
  }
  return "Estimated conversation history is the dominant source of context growth.";
}

function estimateConversationMetrics(input) {
  const AVG_TOKENS_PER_MESSAGE = 500;
  const BRAIN_BYTES_PER_TOKEN = 4.0;
  const TOKENS_PER_RESOLVED_VERSION = 500;

  const messageBasedPromptTokens =
    input.messageCount !== null && input.messageCount !== undefined
      ? input.messageCount * AVG_TOKENS_PER_MESSAGE
      : 0;
  const pbBasedPromptTokens = Math.floor(
    input.pbFileBytes / input.bytesPerToken,
  );
  const estimatedPromptTokens =
    messageBasedPromptTokens > 0
      ? messageBasedPromptTokens
      : pbBasedPromptTokens;
  const artifactFromBrain = Math.floor(
    input.brainFolderBytes / BRAIN_BYTES_PER_TOKEN,
  );
  const artifactFromResolvedVersions =
    input.resolvedVersionCount * TOKENS_PER_RESOLVED_VERSION;
  const estimatedArtifactTokens =
    artifactFromBrain + artifactFromResolvedVersions;

  return {
    estimatedPromptTokens,
    estimatedArtifactTokens,
    estimatedTotalTokens: estimatedPromptTokens + estimatedArtifactTokens,
  };
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadMonitorConfig(configPath) {
  const defaults = {
    bloatLimit: 1_000_000,
    bytesPerToken: 3.5,
  };

  if (!configPath || !fs.existsSync(configPath)) {
    return defaults;
  }

  const parsed = safeReadJson(configPath);
  if (!parsed || typeof parsed !== "object") {
    return defaults;
  }

  return {
    bloatLimit:
      typeof parsed.bloatLimit === "number"
        ? parsed.bloatLimit
        : defaults.bloatLimit,
    bytesPerToken:
      typeof parsed.bytesPerToken === "number"
        ? parsed.bytesPerToken
        : defaults.bytesPerToken,
  };
}

function generateWorkspaceHash(uri) {
  return createHash("md5").update(String(uri)).digest("hex");
}

function parseStorageJson() {
  const storagePath = getStorageJsonPath();
  if (!fs.existsSync(storagePath)) {
    return { workspaces: [], sidebarWorkspaces: [], scratchWorkspaces: [] };
  }

  const raw = safeReadJson(storagePath);
  if (!raw || typeof raw !== "object") {
    return { workspaces: [], sidebarWorkspaces: [], scratchWorkspaces: [] };
  }

  const workspaces = [];
  const sidebarWorkspaces = [];
  const scratchWorkspaces = [];
  const profileAssociations = raw.profileAssociations;
  if (
    profileAssociations &&
    typeof profileAssociations === "object" &&
    profileAssociations.workspaces &&
    typeof profileAssociations.workspaces === "object"
  ) {
    for (const uri of Object.keys(profileAssociations.workspaces)) {
      const normalizedUri = normalizeWorkspaceUri(uri);
      if (!normalizedUri) continue;
      workspaces.push({
        hash: generateWorkspaceHash(uri),
        uri,
        normalizedUri,
        name: extractWorkspaceNameFromUri(uri),
      });
    }
  }

  const unifiedState = raw.antigravityUnifiedStateSync;
  if (unifiedState && typeof unifiedState === "object") {
    const sidebar =
      typeof unifiedState.sidebarWorkspaces === "string"
        ? safeJsonParse(unifiedState.sidebarWorkspaces)
        : unifiedState.sidebarWorkspaces;
    if (Array.isArray(sidebar)) {
      for (const entry of sidebar) {
        if (!entry || typeof entry !== "object" || !entry.uri) continue;
        sidebarWorkspaces.push({
          uri: String(entry.uri),
          name: extractWorkspaceNameFromUri(String(entry.uri)),
          isActive: Boolean(entry.isActive),
        });
      }
    }

    const scratch =
      typeof unifiedState.scratchWorkspaces === "string"
        ? safeJsonParse(unifiedState.scratchWorkspaces)
        : unifiedState.scratchWorkspaces;
    if (Array.isArray(scratch)) {
      for (const entry of scratch) {
        if (!entry || typeof entry !== "object" || !entry.uri) continue;
        scratchWorkspaces.push({
          uri: String(entry.uri),
          name: extractWorkspaceNameFromUri(String(entry.uri)),
        });
      }
    }
  }

  return { workspaces, sidebarWorkspaces, scratchWorkspaces };
}

function scanWorkspaceStorage() {
  const storageDir = getWorkspaceStorageDir();
  if (!fs.existsSync(storageDir)) return [];

  const entries = [];
  for (const dir of fs.readdirSync(storageDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const workspaceJsonPath = path.join(storageDir, dir.name, "workspace.json");
    if (!fs.existsSync(workspaceJsonPath)) continue;

    const parsed = safeReadJson(workspaceJsonPath);
    if (!parsed) continue;
    const uri = parsed.folder || parsed.workspace || parsed.uri || "";
    const normalizedUri = normalizeWorkspaceUri(uri);
    if (!normalizedUri) continue;

    entries.push({
      hash: dir.name,
      uri: String(uri),
      normalizedUri,
      name: extractWorkspaceNameFromUri(String(uri)),
    });
  }

  return entries;
}

function readAnnotation(conversationId) {
  const annotationPath = path.join(
    getAnnotationsDir(),
    `${conversationId}.pbtxt`,
  );
  if (!fs.existsSync(annotationPath)) return null;

  try {
    const content = fs.readFileSync(annotationPath, "utf-8");
    const nestedSeconds = content.match(
      /last_user_view_time\s*:\s*\{\s*seconds\s*:\s*(\d+)/,
    );
    const flatValue = content.match(/last_user_view_time\s*:\s*(\d+)/);
    let lastUserViewTime = null;
    if (nestedSeconds) {
      lastUserViewTime = parseInt(nestedSeconds[1], 10) * 1000;
    } else if (flatValue) {
      lastUserViewTime = parseInt(flatValue[1], 10) * 1000;
    }
    return { conversationId, lastUserViewTime };
  } catch {
    return null;
  }
}

function scanConversations() {
  const conversationsDir = getConversationsDir();
  if (!fs.existsSync(conversationsDir)) return [];

  const entries = [];
  for (const file of fs.readdirSync(conversationsDir)) {
    if (path.extname(file) !== ".pb") continue;
    const filePath = path.join(conversationsDir, file);
    const id = path.basename(file, ".pb");

    try {
      const stats = fs.statSync(filePath);
      const annotation = readAnnotation(id);
      entries.push({
        id,
        pbFilePath: filePath,
        pbFileBytes: stats.size,
        createdAt: stats.birthtime,
        lastModified: stats.mtime,
        annotationTimestamp: annotation ? annotation.lastUserViewTime : null,
      });
    } catch {
      continue;
    }
  }

  return entries.sort((left, right) => right.pbFileBytes - left.pbFileBytes);
}

function dirStats(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const nested = dirStats(fullPath);
        totalBytes += nested.totalBytes;
        fileCount += nested.fileCount;
      } else if (entry.isFile()) {
        try {
          totalBytes += fs.statSync(fullPath).size;
          fileCount += 1;
        } catch {
          continue;
        }
      }
    }
  } catch {
    return { totalBytes: 0, fileCount: 0 };
  }
  return { totalBytes, fileCount };
}

function countResolvedVersions(dirPath) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countResolvedVersions(fullPath);
      } else if (entry.isFile() && /\.resolved\.\d+$/i.test(entry.name)) {
        count += 1;
      }
    }
  } catch {
    return count;
  }
  return count;
}

function countArtifacts(dirPath) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countArtifacts(fullPath);
      } else if (
        entry.isFile() &&
        !entry.name.endsWith(".metadata.json") &&
        !/\.resolved\.\d+$/i.test(entry.name) &&
        entry.name !== "overview.txt"
      ) {
        count += 1;
      }
    }
  } catch {
    return count;
  }
  return count;
}

function extractWorkspaceUrisFromBrain(dirPath) {
  const uris = new Set();
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        for (const uri of extractWorkspaceUrisFromBrain(fullPath)) {
          uris.add(uri);
        }
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          for (const uri of findFileUrisInText(content)) {
            uris.add(uri);
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return Array.from(uris);
  }
  return Array.from(uris);
}

function extractBrainTitle(dirPath) {
  const preferredFiles = [
    "task.md",
    "walkthrough.md",
    "overview.txt",
    "task.md.metadata.json",
    "walkthrough.md.metadata.json",
  ];

  for (const fileName of preferredFiles) {
    const filePath = path.join(dirPath, fileName);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch && headingMatch[1]) {
        return headingMatch[1].trim();
      }
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(content);
        if (
          parsed &&
          typeof parsed.summary === "string" &&
          parsed.summary.trim().length >= 6
        ) {
          return parsed.summary.trim();
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function scanBrainFolders() {
  const brainDir = getBrainDir();
  if (!fs.existsSync(brainDir)) return [];

  const entries = [];
  for (const dir of fs.readdirSync(brainDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
    const brainPath = path.join(brainDir, dir.name);
    const stats = dirStats(brainPath);
    entries.push({
      conversationId: dir.name,
      totalBytes: stats.totalBytes,
      fileCount: stats.fileCount,
      artifactCount: countArtifacts(brainPath),
      resolvedVersionCount: countResolvedVersions(brainPath),
      workspaceUris: extractWorkspaceUrisFromBrain(brainPath),
      title: extractBrainTitle(brainPath),
      brainPath,
    });
  }

  return entries.sort((left, right) => right.totalBytes - left.totalBytes);
}

function findLatestLogFile() {
  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) return null;

  try {
    const dateDirs = fs
      .readdirSync(logDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        fullPath: path.join(logDir, entry.name),
      }))
      .sort((left, right) => right.name.localeCompare(left.name));

    for (const dateDir of dateDirs) {
      const found = findLogFileRecursive(dateDir.fullPath);
      if (found) {
        return found;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function findLogFileRecursive(dirPath) {
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile() && entry.name === "Antigravity.log") {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = findLogFileRecursive(fullPath);
        if (nested) return nested;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function parseLogLine(line) {
  const timestampMatch = line.match(TIMESTAMP_REGEX);
  const timestamp = timestampMatch ? timestampMatch[1] : null;

  const messageMatch = line.match(
    /planner_generator\.go:\d+\]\s*Requesting planner with (\d+) chat messages/i,
  );
  if (messageMatch) {
    return {
      type: "message_count",
      value: parseInt(messageMatch[1], 10),
      timestamp,
      raw: line,
    };
  }

  const conversationMatch =
    line.match(/interceptor\.go:\d+\].*?conversation\s+([0-9a-f-]{36})/i) ||
    line.match(LOG_CONVERSATION_REGEX);
  if (conversationMatch) {
    return {
      type: "conversation_id",
      value: conversationMatch[1],
      timestamp,
      raw: line,
    };
  }

  return null;
}

function scanLogText(text, filePath) {
  const messageCounts = new Map();
  const lastActivityAt = new Map();
  let activeConversationId = null;
  let activeAt = null;
  let currentConversationId = null;

  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLogLine(line);
    if (!parsed) continue;

    if (parsed.type === "conversation_id") {
      currentConversationId = String(parsed.value);
      activeConversationId = currentConversationId;
      activeAt = parsed.timestamp;
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
      }
      continue;
    }

    if (parsed.type === "message_count" && currentConversationId) {
      messageCounts.set(currentConversationId, parsed.value);
      if (parsed.timestamp) {
        lastActivityAt.set(currentConversationId, parsed.timestamp);
        activeConversationId = currentConversationId;
        activeAt = parsed.timestamp;
      }
    }
  }

  return {
    logFilePath: filePath || null,
    activeConversationId,
    activeAt,
    messageCounts,
    lastActivityAt,
  };
}

function scanLatestLogFile() {
  const logFilePath = findLatestLogFile();
  if (!logFilePath) {
    return {
      logFilePath: null,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map(),
      lastActivityAt: new Map(),
    };
  }

  try {
    return scanLogText(fs.readFileSync(logFilePath, "utf-8"), logFilePath);
  } catch {
    return {
      logFilePath,
      activeConversationId: null,
      activeAt: null,
      messageCounts: new Map(),
      lastActivityAt: new Map(),
    };
  }
}

function toIsoString(timestamp) {
  if (!timestamp) return null;
  const date = new Date(String(timestamp).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLikelyBase64(raw) {
  const trimmed = String(raw || "").trim();
  return (
    trimmed.length >= 16 &&
    trimmed.length % 4 === 0 &&
    /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
  );
}

function toPrintableText(input) {
  return String(input || "").replace(/[^\x20-\x7E\r\n\t]+/g, " ");
}

function decodeBase64Printable(candidate) {
  return toPrintableText(
    Buffer.from(candidate, "base64").toString("utf-8"),
  ).trim();
}

function scoreDecodedText(text) {
  let score = 0;
  score += (text.match(/file:\/\/\/|https?:\/\//g) || []).length * 20;
  score += (text.match(/[A-Za-z]{4,}/g) || []).length;
  if (/\{\".+/.test(text)) score += 10;
  return score;
}

function sanitizeTitle(title) {
  return String(title || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+\$?$/, "")
    .replace(/\s+[A-Za-z]$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isUsableTitle(title) {
  if (!title || title.length < 6) return false;
  if (UUID_REGEX.test(title)) {
    UUID_REGEX.lastIndex = 0;
    return false;
  }
  UUID_REGEX.lastIndex = 0;
  if (/notify_user/i.test(title)) return false;
  if (/^(mainR|masterR)/i.test(title)) return false;
  if (/tokens truncated/i.test(title)) return false;
  if (/[{}]/.test(title)) return false;
  const words = title.match(/[A-Za-z]{3,}/g) || [];
  return words.length >= 2;
}

function decodeNestedPayloads(segment) {
  const decoded = [];
  const seen = new Set();

  for (const match of String(segment || "").matchAll(BASE64_REGEX)) {
    const candidate = match[0];
    if (candidate.length < 24 || candidate.length > 16_000) continue;

    try {
      const variants = [candidate];
      if (candidate.length > 25) {
        variants.push(candidate.slice(1));
      }

      let printable = "";
      let bestScore = -1;
      for (const variant of variants) {
        const maybeText = decodeBase64Printable(variant);
        const score = scoreDecodedText(maybeText);
        if (score > bestScore) {
          printable = maybeText;
          bestScore = score;
        }
      }

      if (!printable || printable.length < 8) continue;
      if (
        !/(file:\/\/\/|https?:\/\/|[A-Za-z]{4,} [A-Za-z]{4,}|\{\".+)/.test(
          printable,
        )
      )
        continue;
      if (seen.has(printable)) continue;
      seen.add(printable);
      decoded.push(printable);
    } catch {
      continue;
    }
  }

  return decoded;
}

function extractTitle(segment, nestedPayloads, conversationId) {
  const sources = [...nestedPayloads, toPrintableText(segment)];
  for (const source of sources) {
    const prefix = source.split(conversationId)[0] || source;
    const quoteMatch = prefix.match(/"([^"]{6,120})"/);
    if (quoteMatch) {
      const title = sanitizeTitle(quoteMatch[1]);
      if (isUsableTitle(title) && !/^(file:\/\/|https?:\/\/)/i.test(title)) {
        return title;
      }
    }

    const titleMatch = prefix.match(TITLE_REGEX);
    if (titleMatch) {
      const title = sanitizeTitle(titleMatch[1]);
      if (isUsableTitle(title) && !/^(file:\/\/|https?:\/\/)/i.test(title)) {
        return title;
      }
    }
  }
  return undefined;
}

function extractMessageCount(text) {
  const directMatch = String(text || "").match(
    /(?:messageCount|chat messages?)["\s:=-]+(\d{1,5})/i,
  );
  return directMatch ? parseInt(directMatch[1], 10) : undefined;
}

function decodeStateValue(raw) {
  const parsedJson = tryParseJson(raw);
  if (parsedJson !== null) {
    return { raw, parsedJson, decodedText: raw, base64Decoded: false };
  }

  if (isLikelyBase64(raw)) {
    try {
      return {
        raw,
        parsedJson: null,
        decodedText: Buffer.from(raw, "base64").toString("utf-8"),
        base64Decoded: true,
      };
    } catch {
      return { raw, parsedJson: null, decodedText: raw, base64Decoded: false };
    }
  }

  return { raw, parsedJson: null, decodedText: raw, base64Decoded: false };
}

function extractTrajectoriesFromJson(value) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([key, entry]) => ({
          conversationId: key,
          ...(entry && typeof entry === "object" ? entry : {}),
        }))
      : [];

  const results = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const conversationId = String(entry.conversationId || entry.id || "");
    if (!conversationId) continue;
    const workspaceUri = normalizeWorkspaceUri(
      typeof entry.workspaceUri === "string" ? entry.workspaceUri : undefined,
    );
    results.push({
      conversationId,
      title: typeof entry.title === "string" ? entry.title : undefined,
      messageCount:
        typeof entry.messageCount === "number" ? entry.messageCount : undefined,
      lastActivity:
        typeof entry.lastActivity === "string" ? entry.lastActivity : undefined,
      workspaceUri: workspaceUri || undefined,
      workspaceUris: workspaceUri ? [workspaceUri] : [],
    });
  }
  return results;
}

function extractTrajectorySummariesFromEncodedText(text) {
  const matches = Array.from(String(text || "").matchAll(UUID_REGEX));
  const results = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const conversationId = current[0];
    const currentIndex = current.index || 0;
    const nextIndex = matches[index + 1]
      ? matches[index + 1].index
      : text.length;
    const previousBoundary = matches[index - 1]
      ? (matches[index - 1].index || 0) + matches[index - 1][0].length
      : 0;

    const start = Math.max(previousBoundary, currentIndex - 160);
    const end = Math.min(nextIndex || text.length, currentIndex + 4_000);
    const segment = text.slice(start, end);
    const nestedPayloads = decodeNestedPayloads(segment);
    const combinedText = [toPrintableText(segment), ...nestedPayloads].join(
      "\n",
    );
    const workspaceUris = findFileUrisInText(combinedText);
    const usefulWorkspaceUris = workspaceUris.filter(
      (uri) => !uri.includes("/.gemini/antigravity/brain/"),
    );
    const workspaceUri = usefulWorkspaceUris[0] || workspaceUris[0];

    results.push({
      conversationId,
      title: extractTitle(segment, nestedPayloads, conversationId),
      messageCount: extractMessageCount(combinedText),
      workspaceUri,
      workspaceUris:
        usefulWorkspaceUris.length > 0 ? usefulWorkspaceUris : workspaceUris,
    });
  }

  return results;
}

function extractChatSessions(value) {
  if (!value || typeof value !== "object") return [];
  const root = value;
  const rawEntries = Array.isArray(root.entries)
    ? root.entries
    : root.entries && typeof root.entries === "object"
      ? Object.values(root.entries)
      : Array.isArray(value)
        ? value
        : Object.values(root);

  const sessions = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object") continue;
    const sessionId = String(entry.sessionId || entry.id || "");
    if (!sessionId) continue;
    const workspaceUri = normalizeWorkspaceUri(
      typeof entry.workspaceUri === "string"
        ? entry.workspaceUri
        : typeof entry.workspaceFolder === "string"
          ? entry.workspaceFolder
          : typeof entry.folder === "string"
            ? entry.folder
            : undefined,
    );
    sessions.push({
      sessionId,
      workspaceUri: workspaceUri || undefined,
      title: typeof entry.title === "string" ? entry.title : undefined,
      lastModified:
        typeof entry.lastModified === "string"
          ? entry.lastModified
          : typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : undefined,
    });
  }
  return sessions;
}

function decodeObjectLikeValue(raw) {
  const decoded = decodeStateValue(raw);
  if (decoded.parsedJson && typeof decoded.parsedJson === "object") {
    return decoded.parsedJson;
  }
  const printable = toPrintableText(decoded.decodedText).trim();
  return printable || null;
}

function fileStamp(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return null;
  }
}

function buildWorkspaceRegistry(storageWorkspaces, workspaceStorageEntries) {
  const registry = new Map();

  function addWorkspace(entry) {
    if (!entry.normalizedUri || registry.has(entry.normalizedUri)) return;
    registry.set(entry.normalizedUri, {
      id: entry.hash,
      uri: entry.uri,
      normalizedUri: entry.normalizedUri,
      name: entry.name || extractWorkspaceNameFromUri(entry.uri),
    });
  }

  for (const workspace of storageWorkspaces) {
    addWorkspace(workspace);
  }
  for (const workspace of workspaceStorageEntries) {
    addWorkspace(workspace);
  }

  registry.set(UNMAPPED_WORKSPACE_URI, {
    id: UNMAPPED_WORKSPACE_ID,
    uri: UNMAPPED_WORKSPACE_URI,
    normalizedUri: UNMAPPED_WORKSPACE_URI,
    name: "[Unmapped]",
  });

  return registry;
}

function findWorkspaceMatch(
  candidateUris,
  registry,
  sourcePrefix,
  exactConfidence,
  prefixConfidence,
) {
  for (const candidate of candidateUris || []) {
    const normalizedCandidate = normalizeWorkspaceUri(candidate);
    if (!normalizedCandidate) continue;

    const exact = registry.get(normalizedCandidate);
    if (exact && exact.id !== UNMAPPED_WORKSPACE_ID) {
      return {
        workspaceId: exact.id,
        workspaceUri: exact.uri,
        mappingSource: `${sourcePrefix}_exact`,
        mappingConfidence: exactConfidence,
        mappingNote: `Matched normalized workspace URI from ${sourcePrefix}.`,
      };
    }

    for (const workspace of registry.values()) {
      if (workspace.id === UNMAPPED_WORKSPACE_ID) continue;
      if (
        uriMatchesWorkspaceRoot(normalizedCandidate, workspace.normalizedUri)
      ) {
        return {
          workspaceId: workspace.id,
          workspaceUri: workspace.uri,
          mappingSource: `${sourcePrefix}_prefix`,
          mappingConfidence: prefixConfidence,
          mappingNote: `Matched a file URI beneath the workspace root from ${sourcePrefix}.`,
        };
      }
    }
  }

  return null;
}

function findWorkspaceByTitleHint(titleCandidates, registry) {
  const matches = new Map();
  for (const rawTitle of titleCandidates || []) {
    const title = String(rawTitle || "").trim();
    if (!title) continue;
    const normalizedTitle = title.toLowerCase();
    for (const workspace of registry.values()) {
      if (workspace.id === UNMAPPED_WORKSPACE_ID) continue;
      const name = workspace.name.trim();
      if (name.length < 4) continue;
      if (normalizedTitle.includes(name.toLowerCase())) {
        matches.set(workspace.id, workspace);
      }
    }
  }

  if (matches.size !== 1) return null;
  const workspace = Array.from(matches.values())[0];
  return {
    workspaceId: workspace.id,
    workspaceUri: workspace.uri,
    mappingSource: "title_hint",
    mappingConfidence: 0.55,
    mappingNote:
      "Matched the workspace name from conversation or brain-title text because no URI signal was available.",
  };
}

function buildUnmappedReason(trajectory, brain) {
  const stateUriCount =
    trajectory && Array.isArray(trajectory.workspaceUris)
      ? trajectory.workspaceUris.length
      : 0;
  const brainUriCount =
    brain && Array.isArray(brain.workspaceUris)
      ? brain.workspaceUris.length
      : 0;
  const titleHints = [
    trajectory ? trajectory.title : null,
    brain ? brain.title : null,
  ].filter((value) => Boolean(String(value || "").trim()));

  if (stateUriCount === 0 && brainUriCount === 0 && titleHints.length === 0) {
    return "No workspace URI, brain URI, or usable title hint was found.";
  }

  const parts = [];
  if (stateUriCount > 0) {
    parts.push(
      `state.vscdb exposed ${stateUriCount} workspace URI${stateUriCount > 1 ? "s" : ""} but none matched a known workspace`,
    );
  }
  if (brainUriCount > 0) {
    parts.push(
      `brain artifacts exposed ${brainUriCount} workspace URI${brainUriCount > 1 ? "s" : ""} but none matched a known workspace`,
    );
  }
  if (titleHints.length > 0) {
    parts.push(
      `title hints (${titleHints.map((title) => `"${title}"`).join(", ")}) did not uniquely identify a workspace`,
    );
  }
  return `${parts.join("; ")}.`;
}

function chooseLastActive(conversationEntry, logSnapshot, liveState) {
  const candidates = [];
  const logTimestamp = logSnapshot.lastActivityAt.get(conversationEntry.id);
  if (logTimestamp) {
    const iso = toIsoString(logTimestamp);
    if (iso) candidates.push({ value: iso, source: "log" });
  }

  const recentPb = liveState.recentPbActivity.get(conversationEntry.id);
  if (recentPb) {
    candidates.push({ value: recentPb, source: "pb_write" });
  }

  if (conversationEntry.annotationTimestamp) {
    candidates.push({
      value: new Date(conversationEntry.annotationTimestamp).toISOString(),
      source: "annotation",
    });
  }
  if (conversationEntry.lastModified) {
    candidates.push({
      value: conversationEntry.lastModified.toISOString(),
      source: "filesystem",
    });
  }

  candidates.sort(
    (left, right) =>
      new Date(right.value).getTime() - new Date(left.value).getTime(),
  );
  return candidates[0] || { value: null, source: null };
}

function disambiguateWorkspaceDisplayNames(workspaces) {
  const counts = new Map();
  for (const workspace of workspaces) {
    counts.set(workspace.name, (counts.get(workspace.name) || 0) + 1);
  }

  return workspaces.map((workspace) => {
    if ((counts.get(workspace.name) || 0) <= 1) {
      return { ...workspace, displayName: workspace.name };
    }
    const suffix = workspace.uriHint || workspace.id.slice(0, 8);
    return { ...workspace, displayName: `${workspace.name} [${suffix}]` };
  });
}

function buildWorkspaceUriHint(uri, workspaceName) {
  const normalized = normalizeWorkspaceUri(uri);
  if (!normalized || normalized === "__unmapped__") return null;
  if (normalized.includes("/.gemini/antigravity/playground/"))
    return "playground";
  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1] || "";
  const parent = parts[parts.length - 2] || "";
  if (last.toLowerCase() === String(workspaceName || "").toLowerCase()) {
    return parent || last;
  }
  return parts.slice(-2).join("/");
}

function indexById(items) {
  const map = new Map();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

function chooseCurrentConversation(conversations, liveState, logSnapshot) {
  const conversationIndex = indexById(conversations);
  const mostRecent =
    [...conversations].sort((left, right) => {
      const leftDate = new Date(
        left.lastActiveAt || left.lastModified || 0,
      ).getTime();
      const rightDate = new Date(
        right.lastActiveAt || right.lastModified || 0,
      ).getTime();
      return rightDate - leftDate;
    })[0] || null;

  const freshLogId =
    logSnapshot &&
    logSnapshot.activeConversationId &&
    logSnapshot.activeAt &&
    Date.now() -
      new Date(String(logSnapshot.activeAt).replace(" ", "T")).getTime() <=
      ACTIVE_WINDOW_MS
      ? logSnapshot.activeConversationId
      : null;
  const activeLogId = liveState.activeLogConversationId || freshLogId;
  if (activeLogId && conversationIndex.has(activeLogId)) {
    const conversation = conversationIndex.get(activeLogId);
    return {
      conversation,
      resolutionState: "active_log",
      resolutionNote: "Detected from Antigravity runtime log activity.",
    };
  }

  const recentPbCandidate = [...liveState.recentPbActivity.entries()]
    .filter(
      ([, value]) => Date.now() - new Date(value).getTime() <= ACTIVE_WINDOW_MS,
    )
    .sort(
      (left, right) =>
        new Date(right[1]).getTime() - new Date(left[1]).getTime(),
    )[0];
  if (recentPbCandidate && conversationIndex.has(recentPbCandidate[0])) {
    return {
      conversation: conversationIndex.get(recentPbCandidate[0]),
      resolutionState: "active_pb_write",
      resolutionNote: "Detected from a recent conversation file write.",
    };
  }

  const liveConversationId = liveState.feed
    .map((event) => event.conversationId)
    .find((conversationId) => conversationIndex.has(conversationId));
  if (liveConversationId) {
    return {
      conversation: conversationIndex.get(liveConversationId),
      resolutionState: "active_pb_write",
      resolutionNote: "Detected from the most recent live monitor event.",
    };
  }

  if (activeLogId && !conversationIndex.has(activeLogId)) {
    return {
      conversation: mostRecent,
      resolutionState: "unresolved_log_uuid",
      resolutionNote: `Logs pointed to ${activeLogId}, but that conversation is not present in the local store. Showing the most recent local session instead.`,
    };
  }

  if (mostRecent) {
    return {
      conversation: mostRecent,
      resolutionState: "recent_fallback",
      resolutionNote:
        "No live active conversation could be confirmed, so the most recent session is shown instead.",
    };
  }

  return {
    conversation: null,
    resolutionState: "recent_fallback",
    resolutionNote: "No conversation data is available yet.",
  };
}

function sortWorkspacesForDisplay(workspaces, currentWorkspaceId) {
  return [...workspaces].sort((left, right) => {
    if (
      currentWorkspaceId &&
      left.id === currentWorkspaceId &&
      right.id !== currentWorkspaceId
    )
      return -1;
    if (
      currentWorkspaceId &&
      right.id === currentWorkspaceId &&
      left.id !== currentWorkspaceId
    )
      return 1;
    return right.estimatedTokens - left.estimatedTokens;
  });
}

function chooseWorkspaceDetail(
  workspaces,
  preferredWorkspacePath,
  currentConversation,
) {
  const preferredUri = normalizeWorkspaceUri(preferredWorkspacePath);
  if (preferredUri) {
    const directMatch = workspaces.find((workspace) => {
      const normalizedWorkspaceUri = normalizeWorkspaceUri(workspace.uri);
      return (
        normalizedWorkspaceUri &&
        (preferredUri === normalizedWorkspaceUri ||
          preferredUri.startsWith(`${normalizedWorkspaceUri}/`))
      );
    });
    if (directMatch) return directMatch;
  }

  if (currentConversation && currentConversation.workspaceId) {
    const currentMatch = workspaces.find(
      (workspace) => workspace.id === currentConversation.workspaceId,
    );
    if (currentMatch) return currentMatch;
  }

  return (
    workspaces.find((workspace) => workspace.id !== UNMAPPED_WORKSPACE_ID) ||
    workspaces[0] ||
    null
  );
}

class AgKernelMonitorRuntime {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.sqlPromise = null;
    this.refreshInFlight = null;
    this.lastSnapshot = null;
    this.onUpdate = null;
    this.onError = null;
    this.preferredWorkspacePath = null;
    this.configPath = null;
    this.fallbackRefreshMs = 20_000;
    this.liveState = {
      feed: [],
      recentPbActivity: new Map(),
      latestDeltas: new Map(),
      chatRuns: new Map(),
      pbSizes: new Map(),
      activeLogConversationId: null,
      unresolvedLogConversationId: null,
      logMessageCounts: new Map(),
      logFilePath: null,
      logOffset: 0,
      logCurrentConversationId: null,
      pollTimer: null,
      refreshTimer: null,
    };
    this.cache = {
      storageJson: { stamp: null, value: null },
      stateVscdb: { stamp: null, value: null },
    };
  }

  async start(options) {
    this.onUpdate = options.onUpdate || null;
    this.onError = options.onError || null;
    this.preferredWorkspacePath = options.preferredWorkspacePath || null;
    this.configPath = options.configPath || null;
    this.fallbackRefreshMs =
      Math.max(0, Number(options.autoRefreshSeconds || 0)) * 1000;

    await this.refresh();

    if (!this.liveState.pollTimer) {
      this.liveState.pollTimer = setInterval(() => {
        void this.pollLive();
      }, 1000);
    }

    if (this.liveState.refreshTimer) {
      clearInterval(this.liveState.refreshTimer);
      this.liveState.refreshTimer = null;
    }
    if (this.fallbackRefreshMs > 0) {
      this.liveState.refreshTimer = setInterval(() => {
        void this.refresh();
      }, this.fallbackRefreshMs);
    }
  }

  stop() {
    if (this.liveState.pollTimer) {
      clearInterval(this.liveState.pollTimer);
      this.liveState.pollTimer = null;
    }
    if (this.liveState.refreshTimer) {
      clearInterval(this.liveState.refreshTimer);
      this.liveState.refreshTimer = null;
    }
  }

  async refresh() {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.collectSnapshot()
      .then((snapshot) => {
        this.lastSnapshot = snapshot;
        if (this.onUpdate) {
          this.onUpdate(snapshot);
        }
        return snapshot;
      })
      .catch((error) => {
        if (this.onError) {
          this.onError(error);
        }
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }

  async pollLive() {
    try {
      const pbChanges = this.pollConversationFileSizes();
      const logChanges = this.pollLogFile();
      const now = new Date().toISOString();
      const quietFinalized = finalizeQuietTurns(this.liveState, now);
      if (pbChanges.length === 0 && !logChanges.changed && !quietFinalized) {
        return;
      }

      for (const change of pbChanges) {
        this.liveState.recentPbActivity.set(change.conversationId, now);
      }
      if (logChanges.activeConversationId) {
        this.liveState.activeLogConversationId =
          logChanges.activeConversationId;
      }
      for (const update of logChanges.messageUpdates) {
        this.liveState.logMessageCounts.set(
          update.conversationId,
          update.messageCount,
        );
      }

      const previousSnapshot = this.lastSnapshot;
      const freshSnapshot = await this.collectSnapshot();
      const nextIndex = indexById(freshSnapshot.allConversations || []);

      for (const update of logChanges.messageUpdates) {
        const conversation = nextIndex.get(update.conversationId);
        if (!conversation) continue;
        recordChatBoundary(
          this.liveState,
          update.conversationId,
          update.messageCount,
          conversation.estimatedTotalTokens,
          update.timestamp || new Date().toISOString(),
        );
      }

      for (const change of pbChanges) {
        const conversation = nextIndex.get(change.conversationId);
        if (!conversation) continue;
        const previousConversation = previousSnapshot
          ? indexById(previousSnapshot.allConversations || []).get(
              change.conversationId,
            )
          : null;
        const deltaTokens = previousConversation
          ? conversation.estimatedTotalTokens -
            previousConversation.estimatedTotalTokens
          : Math.round(change.deltaBytes / 3.5);
        recordChatProgress(
          this.liveState,
          change.conversationId,
          conversation.estimatedTotalTokens,
          deltaTokens,
          change.timestamp,
        );
      }

      const events = buildLiveEvents(
        previousSnapshot,
        freshSnapshot,
        pbChanges,
        logChanges,
      );
      if (events.length > 0) {
        for (const event of events) {
          this.liveState.latestDeltas.set(event.conversationId, {
            deltaTokens: event.deltaTokens,
            timestamp: event.timestamp,
          });
        }
        this.liveState.feed = [...events, ...this.liveState.feed].slice(
          0,
          LIVE_FEED_LIMIT,
        );
      }

      const decorated = this.decorateSnapshot(freshSnapshot);
      this.lastSnapshot = decorated;
      if (this.onUpdate) {
        this.onUpdate(decorated);
      }
    } catch (error) {
      if (this.onError) {
        this.onError(error);
      }
    }
  }

  decorateSnapshot(snapshot) {
    const liveFeed = this.liveState.feed.slice(0, LIVE_FEED_LIMIT);
    const latestDeltas = this.liveState.latestDeltas;

    const allConversations = snapshot.allConversations.map((conversation) => {
      const latestDelta = latestDeltas.get(conversation.id);
      return {
        ...conversation,
        deltaEstimatedTokens: latestDelta
          ? latestDelta.deltaTokens
          : conversation.deltaEstimatedTokens || 0,
        deltaEstimatedTokensFormatted: `${(latestDelta ? latestDelta.deltaTokens : conversation.deltaEstimatedTokens || 0) >= 0 ? "+" : "-"}${formatTokens(Math.abs(latestDelta ? latestDelta.deltaTokens : conversation.deltaEstimatedTokens || 0))}`,
      };
    });

    const conversationIndex = indexById(allConversations);
    const currentConversationState = snapshot.currentConversation.conversation
      ? this.liveState.chatRuns.get(
          snapshot.currentConversation.conversation.id,
        ) || null
      : null;
    const currentConversationView = snapshot.currentConversation.conversation
      ? conversationIndex.get(snapshot.currentConversation.conversation.id) ||
        snapshot.currentConversation.conversation
      : null;
    const currentConversationMessageCount =
      currentConversationView &&
      currentConversationView.messageCount !== null &&
      currentConversationView.messageCount !== undefined
        ? currentConversationView.messageCount
        : currentConversationState &&
            currentConversationState.lastMessageCount !== null &&
            currentConversationState.lastMessageCount !== undefined
          ? currentConversationState.lastMessageCount
          : null;
    const currentConversationMessageCountSource =
      currentConversationView &&
      currentConversationView.messageCount !== null &&
      currentConversationView.messageCount !== undefined
        ? currentConversationView.messageCountSource || null
        : currentConversationMessageCount !== null
          ? "live"
          : null;
    const observedTurnCount = currentConversationState
      ? currentConversationState.observedCompletedTurns
      : 0;
    const avgTokensPerObservedTurn =
      observedTurnCount > 0
        ? Math.round(
            currentConversationState.observedTokensAdded / observedTurnCount,
          )
        : null;
    const avgDirectMessagesPerObservedTurn =
      currentConversationState &&
      currentConversationState.observedTurnsWithDirectMessages > 0
        ? currentConversationState.observedDirectMessages /
          currentConversationState.observedTurnsWithDirectMessages
        : null;
    const hasActiveObservedTurn =
      currentConversationState &&
      currentConversationState.currentRunDeltaTokens > 0;
    const currentTurnDirectMessages =
      currentConversationView &&
      currentConversationState &&
      hasActiveObservedTurn &&
      currentConversationMessageCount !== null &&
      currentConversationState.currentRunStartMessageCount !== null
        ? Math.max(
            0,
            currentConversationMessageCount -
              currentConversationState.currentRunStartMessageCount,
          )
        : null;
    const lastObservedTurn =
      currentConversationState && currentConversationState.recentRuns.length > 0
        ? currentConversationState.recentRuns[0]
        : null;
    const lastFiveTurnsTokens = currentConversationState
      ? currentConversationState.recentRuns.reduce(
          (sum, run) => sum + run.deltaTokens,
          0,
        )
      : 0;
    const currentConversation = snapshot.currentConversation.conversation
      ? {
          ...currentConversationView,
          messageCount: currentConversationMessageCount,
          messageCountSource: currentConversationMessageCountSource,
          resolutionState: snapshot.currentConversation.resolutionState,
          resolutionNote: snapshot.currentConversation.resolutionNote,
          latestDelta:
            latestDeltas.get(snapshot.currentConversation.conversation.id)
              ?.deltaTokens || 0,
          deltaEstimatedTokens: currentConversationState
            ? currentConversationState.currentRunDeltaTokens
            : currentConversationView.deltaEstimatedTokens || 0,
          deltaEstimatedTokensFormatted: `${
            (currentConversationState
              ? currentConversationState.currentRunDeltaTokens
              : currentConversationView.deltaEstimatedTokens || 0) >= 0
              ? "+"
              : "-"
          }${formatTokens(
            Math.abs(
              currentConversationState
                ? currentConversationState.currentRunDeltaTokens
                : currentConversationView.deltaEstimatedTokens || 0,
            ),
          )}`,
          currentChatRun: currentConversationState
            ? {
                chatIndex: currentConversationState.nextChatIndex,
                fromTokens: currentConversationState.currentRunStartTokens,
                toTokens: currentConversationView.estimatedTotalTokens,
                deltaTokens: currentConversationState.currentRunDeltaTokens,
                startedAt: currentConversationState.currentRunStartedAt,
              }
            : null,
          recentChatRuns: currentConversationState?.recentRuns || [],
          observedTurnCount,
          currentTurnDirectMessages,
          avgTokensPerObservedTurn,
          avgTokensPerObservedTurnFormatted:
            avgTokensPerObservedTurn !== null
              ? formatTokens(avgTokensPerObservedTurn)
              : "unknown",
          avgDirectMessagesPerObservedTurn,
          avgDirectMessagesPerObservedTurnFormatted:
            avgDirectMessagesPerObservedTurn !== null
              ? avgDirectMessagesPerObservedTurn.toFixed(
                  avgDirectMessagesPerObservedTurn >= 10 ? 0 : 1,
                )
              : "unknown",
          lastObservedTurnTokens: lastObservedTurn
            ? lastObservedTurn.deltaTokens
            : null,
          lastObservedTurnTokensFormatted: lastObservedTurn
            ? `${lastObservedTurn.deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(lastObservedTurn.deltaTokens))}`
            : "none",
          lastFiveTurnsTokens,
          lastFiveTurnsTokensFormatted: `${lastFiveTurnsTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(lastFiveTurnsTokens))}`,
        }
      : null;

    const workspaceDetail = snapshot.workspaceDetail
      ? {
          ...snapshot.workspaceDetail,
          conversations: snapshot.workspaceDetail.conversations.map(
            (conversation) =>
              conversationIndex.get(conversation.id) || conversation,
          ),
          currentSessionShareFormatted:
            currentConversation &&
            snapshot.workspaceDetail.estimatedTokens > 0 &&
            snapshot.workspaceDetail.id === currentConversation.workspaceId
              ? formatRatio(
                  currentConversation.estimatedTotalTokens /
                    snapshot.workspaceDetail.estimatedTokens,
                )
              : null,
          currentSessionLastTurnTokensFormatted:
            currentConversation &&
            snapshot.workspaceDetail.id === currentConversation.workspaceId
              ? currentConversation.lastObservedTurnTokensFormatted
              : null,
          currentSessionLastFiveTurnsTokensFormatted:
            currentConversation &&
            snapshot.workspaceDetail.id === currentConversation.workspaceId
              ? currentConversation.lastFiveTurnsTokensFormatted
              : null,
        }
      : null;

    return {
      ...snapshot,
      liveFeed,
      allConversations,
      currentConversation: {
        ...snapshot.currentConversation,
        conversation: currentConversation,
      },
      workspaceDetail,
      cleanupSummary: {
        ...snapshot.cleanupSummary,
        largestSessions: snapshot.cleanupSummary.largestSessions.map(
          (conversation) =>
            conversationIndex.get(conversation.id) || conversation,
        ),
        unmappedConversations:
          snapshot.cleanupSummary.unmappedConversations.map(
            (conversation) =>
              conversationIndex.get(conversation.id) || conversation,
          ),
        recommendedCleanupTargets:
          snapshot.cleanupSummary.recommendedCleanupTargets.map(
            (conversation) =>
              conversationIndex.get(conversation.id) || conversation,
          ),
      },
    };
  }

  pollConversationFileSizes() {
    const conversationsDir = getConversationsDir();
    if (!fs.existsSync(conversationsDir)) return [];

    const nextSizes = new Map();
    const changes = [];
    const isInitialPrime = this.liveState.pbSizes.size === 0;

    for (const file of fs.readdirSync(conversationsDir)) {
      if (path.extname(file) !== ".pb") continue;
      const filePath = path.join(conversationsDir, file);
      const conversationId = path.basename(file, ".pb");
      try {
        const size = fs.statSync(filePath).size;
        nextSizes.set(conversationId, size);
        const previousSize = this.liveState.pbSizes.get(conversationId);
        if (isInitialPrime && previousSize === undefined) {
          continue;
        }
        if (previousSize !== undefined && previousSize !== size) {
          changes.push({
            conversationId,
            deltaBytes: size - previousSize,
            nextSize: size,
            timestamp: new Date().toISOString(),
          });
        } else if (previousSize === undefined) {
          changes.push({
            conversationId,
            deltaBytes: size,
            nextSize: size,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        continue;
      }
    }

    this.liveState.pbSizes = nextSizes;
    return changes;
  }

  pollLogFile() {
    const latestPath = findLatestLogFile();
    const result = {
      changed: false,
      activeConversationId: this.liveState.activeLogConversationId,
      messageUpdates: [],
    };

    if (!latestPath || !fs.existsSync(latestPath)) {
      this.liveState.logFilePath = latestPath;
      this.liveState.logOffset = 0;
      this.liveState.logCurrentConversationId = null;
      return result;
    }

    if (this.liveState.logFilePath !== latestPath) {
      this.liveState.logFilePath = latestPath;
      this.liveState.logOffset = 0;
      this.liveState.logCurrentConversationId = null;
      result.changed = true;
    }

    let stats;
    try {
      stats = fs.statSync(latestPath);
    } catch {
      return result;
    }

    if (stats.size < this.liveState.logOffset) {
      this.liveState.logOffset = 0;
    }
    if (stats.size <= this.liveState.logOffset) {
      return result;
    }

    let newContent;
    try {
      newContent = readAppendedText(
        latestPath,
        this.liveState.logOffset,
        stats.size,
      );
    } catch {
      return result;
    }

    this.liveState.logOffset = stats.size;

    for (const line of newContent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseLogLine(line);
      if (!parsed) continue;
      result.changed = true;

      if (parsed.type === "conversation_id") {
        this.liveState.logCurrentConversationId = String(parsed.value);
        result.activeConversationId = String(parsed.value);
        continue;
      }

      if (parsed.type === "message_count") {
        const timestampIso = parsed.timestamp
          ? toIsoString(parsed.timestamp)
          : new Date().toISOString();
        const inferredConversationId = inferLikelyConversationId(
          this.liveState,
          timestampIso,
        );

        let targetId = this.liveState.logCurrentConversationId;

        // If the log's sticky ID points to a conversation that hasn't grown in 10s,
        // but inference detects a new active conversation, proactively override the sticky ID.
        if (
          targetId &&
          inferredConversationId &&
          targetId !== inferredConversationId
        ) {
          const stickySeen = this.liveState.recentPbActivity.get(targetId);
          if (
            !stickySeen ||
            new Date().getTime() - new Date(stickySeen).getTime() > 10000
          ) {
            targetId = inferredConversationId;
          }
        }

        targetId = targetId || inferredConversationId;

        if (!targetId) {
          continue;
        }
        this.liveState.logCurrentConversationId = targetId;
        result.activeConversationId = targetId;
        result.messageUpdates.push({
          conversationId: targetId,
          messageCount: parsed.value,
          timestamp: timestampIso,
        });
      }
    }

    return result;
  }

  async getSqlJs() {
    if (!this.sqlPromise) {
      const wasmDir = path.join(
        this.extensionPath,
        "node_modules",
        "sql.js",
        "dist",
      );
      this.sqlPromise = initSqlJs({
        locateFile: (file) => path.join(wasmDir, file),
      });
    }
    return this.sqlPromise;
  }

  async parseStateVscdb() {
    const dbPath = getGlobalStateDbPath();
    const stamp = fileStamp(dbPath);
    if (!stamp || !fs.existsSync(dbPath)) {
      return {
        chatSessions: [],
        trajectories: [],
        modelCredits: null,
        modelPreferences: null,
        sessionToWorkspace: new Map(),
      };
    }

    if (this.cache.stateVscdb.stamp === stamp && this.cache.stateVscdb.value) {
      return this.cache.stateVscdb.value;
    }

    const SQL = await this.getSqlJs();
    let bytes;
    try {
      bytes = new Uint8Array(fs.readFileSync(dbPath));
    } catch {
      return (
        this.cache.stateVscdb.value || {
          chatSessions: [],
          trajectories: [],
          modelCredits: null,
          modelPreferences: null,
          sessionToWorkspace: new Map(),
        }
      );
    }
    const db = new SQL.Database(bytes);

    try {
      const sessionToWorkspace = new Map();
      const chatIndexRaw = readItemTableRawValue(
        db,
        "chat.ChatSessionStore.index",
      );
      const chatSessions = chatIndexRaw
        ? extractChatSessions(decodeStateValue(chatIndexRaw).parsedJson)
        : [];
      for (const session of chatSessions) {
        if (session.workspaceUri) {
          sessionToWorkspace.set(session.sessionId, session.workspaceUri);
        }
      }

      const trajectoriesRaw = readItemTableRawValue(
        db,
        "antigravityUnifiedStateSync.trajectorySummaries",
      );
      let trajectories = [];
      if (trajectoriesRaw) {
        const decoded = decodeStateValue(trajectoriesRaw);
        trajectories =
          decoded.parsedJson !== null
            ? extractTrajectoriesFromJson(decoded.parsedJson)
            : extractTrajectorySummariesFromEncodedText(decoded.decodedText);
      }
      for (const trajectory of trajectories) {
        if (trajectory.workspaceUri) {
          sessionToWorkspace.set(
            trajectory.conversationId,
            trajectory.workspaceUri,
          );
        }
      }

      const creditsRaw = readItemTableRawValue(
        db,
        "antigravityUnifiedStateSync.modelCredits",
      );
      const creditsValue = creditsRaw
        ? decodeObjectLikeValue(creditsRaw)
        : null;
      let modelCredits = null;
      if (creditsValue && typeof creditsValue === "object") {
        modelCredits = {
          used: typeof creditsValue.used === "number" ? creditsValue.used : 0,
          total:
            typeof creditsValue.total === "number" ? creditsValue.total : 0,
          resetDate:
            typeof creditsValue.resetDate === "string"
              ? creditsValue.resetDate
              : undefined,
          raw: creditsValue,
        };
      } else if (creditsValue) {
        modelCredits = { used: 0, total: 0, raw: creditsValue };
      }

      const modelPreferencesRaw = readItemTableRawValue(
        db,
        "antigravityUnifiedStateSync.modelPreferences",
      );
      const modelPreferences = modelPreferencesRaw
        ? decodeObjectLikeValue(modelPreferencesRaw)
        : null;

      const result = {
        chatSessions,
        trajectories,
        modelCredits,
        modelPreferences,
        sessionToWorkspace,
      };
      this.cache.stateVscdb = { stamp, value: result };
      return result;
    } finally {
      db.close();
    }
  }

  async collectSnapshot() {
    const monitorConfig = loadMonitorConfig(this.configPath);
    const settingsSummary = {
      autoRefreshSeconds: Math.max(
        0,
        Math.round(this.fallbackRefreshMs / 1000),
      ),
      cliConfigPath: this.configPath || "",
      bunPath: "deprecated",
      preferActiveEditorWorkspace: true,
    };

    const storageStamp = fileStamp(getStorageJsonPath());
    let storageResult;
    if (
      storageStamp &&
      this.cache.storageJson.stamp === storageStamp &&
      this.cache.storageJson.value
    ) {
      storageResult = this.cache.storageJson.value;
    } else {
      storageResult = parseStorageJson();
      this.cache.storageJson = { stamp: storageStamp, value: storageResult };
    }

    const workspaceStorageEntries = scanWorkspaceStorage();
    const workspaceRegistry = buildWorkspaceRegistry(
      storageResult.workspaces,
      workspaceStorageEntries,
    );
    const stateResult = await this.parseStateVscdb();
    const logSnapshot = scanLatestLogFile();

    if (this.liveState.activeLogConversationId) {
      logSnapshot.activeConversationId = this.liveState.activeLogConversationId;
    }
    for (const [
      conversationId,
      messageCount,
    ] of this.liveState.logMessageCounts.entries()) {
      logSnapshot.messageCounts.set(conversationId, messageCount);
    }

    const conversations = scanConversations();
    const brainEntries = scanBrainFolders();
    const brainByConversation = new Map(
      brainEntries.map((entry) => [entry.conversationId, entry]),
    );
    const trajectoryByConversation = new Map(
      (stateResult.trajectories || []).map((entry) => [
        entry.conversationId,
        entry,
      ]),
    );

    const mappedStats = {
      conversationsTotal: conversations.length,
      conversationsMapped: 0,
      conversationsUnmapped: 0,
      orphanBrainFolders: 0,
    };

    const allConversations = [];
    const conversationIds = new Set();
    for (const conversationEntry of conversations) {
      conversationIds.add(conversationEntry.id);
      const brain = brainByConversation.get(conversationEntry.id);
      const trajectory = trajectoryByConversation.get(conversationEntry.id);
      const stateUris =
        trajectory && trajectory.workspaceUris
          ? [...trajectory.workspaceUris]
          : trajectory && trajectory.workspaceUri
            ? [trajectory.workspaceUri]
            : [];
      const vscdbSessionUri = stateResult.sessionToWorkspace.get(
        conversationEntry.id,
      );
      if (vscdbSessionUri && !stateUris.includes(vscdbSessionUri)) {
        stateUris.unshift(vscdbSessionUri);
      }
      const brainUris = brain ? brain.workspaceUris : [];

      const mapping = findWorkspaceMatch(
        stateUris,
        workspaceRegistry,
        "state_vscdb",
        1.0,
        0.92,
      ) ||
        findWorkspaceMatch(
          brainUris,
          workspaceRegistry,
          "brain_artifact",
          0.8,
          0.72,
        ) ||
        findWorkspaceByTitleHint(
          [trajectory ? trajectory.title : null, brain ? brain.title : null],
          workspaceRegistry,
        ) || {
          workspaceId: UNMAPPED_WORKSPACE_ID,
          workspaceUri: UNMAPPED_WORKSPACE_URI,
          mappingSource: "unmapped",
          mappingConfidence: 0,
          mappingNote: buildUnmappedReason(trajectory, brain),
        };

      if (mapping.workspaceId === UNMAPPED_WORKSPACE_ID) {
        mappedStats.conversationsUnmapped += 1;
      } else {
        mappedStats.conversationsMapped += 1;
      }

      const directMessageCount = logSnapshot.messageCounts.get(
        conversationEntry.id,
      );
      const messageCount =
        directMessageCount !== undefined
          ? directMessageCount
          : trajectory && trajectory.messageCount !== undefined
            ? trajectory.messageCount
            : null;
      const messageCountSource =
        directMessageCount !== undefined
          ? "log"
          : trajectory && trajectory.messageCount !== undefined
            ? "state_vscdb"
            : null;

      const activity = chooseLastActive(
        conversationEntry,
        logSnapshot,
        this.liveState,
      );
      const metrics = estimateConversationMetrics({
        pbFileBytes: conversationEntry.pbFileBytes,
        brainFolderBytes: brain ? brain.totalBytes : 0,
        messageCount,
        resolvedVersionCount: brain ? brain.resolvedVersionCount : 0,
        bytesPerToken: monitorConfig.bytesPerToken,
      });
      const health = assessHealth(
        metrics.estimatedTotalTokens,
        monitorConfig.bloatLimit,
      );
      const chatRun = this.liveState.chatRuns.get(conversationEntry.id);
      const latestDelta = this.liveState.latestDeltas.get(conversationEntry.id);
      const workspace =
        workspaceRegistry.get(mapping.workspaceUri) ||
        Array.from(workspaceRegistry.values()).find(
          (entry) => entry.id === mapping.workspaceId,
        ) ||
        workspaceRegistry.get(UNMAPPED_WORKSPACE_URI);

      allConversations.push({
        id: conversationEntry.id,
        title:
          trajectory && trajectory.title
            ? trajectory.title
            : brain && brain.title
              ? brain.title
              : null,
        workspaceId: mapping.workspaceId,
        workspaceName: workspace ? workspace.name : "[Unmapped]",
        workspaceUri: workspace ? workspace.uri : UNMAPPED_WORKSPACE_URI,
        pbFileBytes: conversationEntry.pbFileBytes,
        pbSizeFormatted: formatBytes(conversationEntry.pbFileBytes),
        brainFolderBytes: brain ? brain.totalBytes : 0,
        brainSizeFormatted: formatBytes(brain ? brain.totalBytes : 0),
        messageCount,
        messageCountSource,
        lastActiveAt: activity.value,
        lastActiveRelative: relativeTime(activity.value),
        lastModified: conversationEntry.lastModified.toISOString(),
        mappingSource: mapping.mappingSource,
        mappingConfidence: mapping.mappingConfidence,
        mappingNote: mapping.mappingNote,
        estimatedPromptTokens: metrics.estimatedPromptTokens,
        estimatedArtifactTokens: metrics.estimatedArtifactTokens,
        estimatedTotalTokens: metrics.estimatedTotalTokens,
        estimatedTotalTokensFormatted: formatTokens(
          metrics.estimatedTotalTokens,
        ),
        contextRatio: metrics.estimatedTotalTokens / monitorConfig.bloatLimit,
        contextRatioFormatted: formatRatio(
          metrics.estimatedTotalTokens / monitorConfig.bloatLimit,
        ),
        whyHeavy: explainWhyHeavy(
          metrics.estimatedPromptTokens,
          metrics.estimatedArtifactTokens,
          metrics.estimatedTotalTokens,
          monitorConfig.bloatLimit,
        ),
        health: health.status,
        healthTone: health.tone,
        deltaEstimatedTokens: chatRun
          ? chatRun.currentRunDeltaTokens
          : latestDelta
            ? latestDelta.deltaTokens
            : 0,
        deltaEstimatedTokensFormatted: `+${formatTokens(Math.abs(chatRun ? chatRun.currentRunDeltaTokens : latestDelta ? latestDelta.deltaTokens : 0))}`,
        historicalRuns: chatRun
          ? chatRun.recentRuns.map((r) => ({
              chatIndex: r.chatIndex,
              messageCount: r.messageCount,
              directMessages: r.directMessages,
              deltaTokensFormatted: `${r.deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(r.deltaTokens))}`,
              fromTokensFormatted: formatTokens(r.fromTokens),
              toTokensFormatted: formatTokens(r.toTokens),
              completedAtRelative: relativeTime(r.completedAt),
            }))
          : [],
        isActive: logSnapshot.activeConversationId === conversationEntry.id,
      });
    }

    for (const brainEntry of brainEntries) {
      if (!conversationIds.has(brainEntry.conversationId)) {
        mappedStats.orphanBrainFolders += 1;
      }
    }

    if (
      logSnapshot.activeConversationId &&
      !conversationIds.has(logSnapshot.activeConversationId)
    ) {
      this.liveState.unresolvedLogConversationId =
        logSnapshot.activeConversationId;
    } else {
      this.liveState.unresolvedLogConversationId = null;
    }

    const workspaceBuckets = new Map();
    for (const conversation of allConversations) {
      if (!workspaceBuckets.has(conversation.workspaceId)) {
        const workspaceEntry = Array.from(workspaceRegistry.values()).find(
          (entry) => entry.id === conversation.workspaceId,
        ) || {
          id: conversation.workspaceId,
          uri: conversation.workspaceUri,
          name: conversation.workspaceName,
        };
        workspaceBuckets.set(conversation.workspaceId, {
          id: workspaceEntry.id,
          name: workspaceEntry.name,
          uri: workspaceEntry.uri,
          uriHint: buildWorkspaceUriHint(
            workspaceEntry.uri,
            workspaceEntry.name,
          ),
          conversations: [],
        });
      }
      workspaceBuckets
        .get(conversation.workspaceId)
        .conversations.push(conversation);
    }

    let workspaces = Array.from(workspaceBuckets.values()).map((workspace) => {
      const conversationsForWorkspace = workspace.conversations.sort(
        (left, right) => right.estimatedTotalTokens - left.estimatedTotalTokens,
      );
      const largestConversation = conversationsForWorkspace[0] || null;
      const totalEstimatedTokens = conversationsForWorkspace.reduce(
        (sum, conversation) => sum + conversation.estimatedTotalTokens,
        0,
      );
      const health = assessHealth(
        largestConversation ? largestConversation.estimatedTotalTokens : 0,
        monitorConfig.bloatLimit,
      );
      return {
        id: workspace.id,
        name: workspace.name,
        displayName: workspace.name,
        uri: workspace.uri,
        uriHint: workspace.uriHint,
        estimatedTokens: totalEstimatedTokens,
        estimatedTokensFormatted: formatTokens(totalEstimatedTokens),
        conversationCount: conversationsForWorkspace.length,
        activeConversationCount: conversationsForWorkspace.filter(
          (conversation) => conversation.isActive,
        ).length,
        largestConversationId: largestConversation
          ? largestConversation.id
          : null,
        largestConversationTokens: largestConversation
          ? largestConversation.estimatedTotalTokens
          : 0,
        largestConversationTokensFormatted: largestConversation
          ? largestConversation.estimatedTotalTokensFormatted
          : "0",
        mappedConversationCount: conversationsForWorkspace.filter(
          (conversation) => conversation.mappingSource !== "unmapped",
        ).length,
        unmappedConversationCount: conversationsForWorkspace.filter(
          (conversation) => conversation.mappingSource === "unmapped",
        ).length,
        brainSizeBytes: conversationsForWorkspace.reduce(
          (sum, conversation) => sum + conversation.brainFolderBytes,
          0,
        ),
        brainSizeFormatted: formatBytes(
          conversationsForWorkspace.reduce(
            (sum, conversation) => sum + conversation.brainFolderBytes,
            0,
          ),
        ),
        pbSizeBytes: conversationsForWorkspace.reduce(
          (sum, conversation) => sum + conversation.pbFileBytes,
          0,
        ),
        pbSizeFormatted: formatBytes(
          conversationsForWorkspace.reduce(
            (sum, conversation) => sum + conversation.pbFileBytes,
            0,
          ),
        ),
        health: health.status,
        healthTone: health.tone,
        conversations: conversationsForWorkspace,
      };
    });

    workspaces = disambiguateWorkspaceDisplayNames(workspaces);
    const currentConversation = chooseCurrentConversation(
      allConversations,
      this.liveState,
      logSnapshot,
    );
    workspaces = sortWorkspacesForDisplay(
      workspaces,
      currentConversation.conversation
        ? currentConversation.conversation.workspaceId
        : null,
    );

    const selectedWorkspace = chooseWorkspaceDetail(
      workspaces,
      this.preferredWorkspacePath,
      currentConversation.conversation,
    );
    const orphanAnnotations = [];
    const annotationsDir = getAnnotationsDir();
    if (fs.existsSync(annotationsDir)) {
      for (const file of fs.readdirSync(annotationsDir)) {
        if (!file.endsWith(".pbtxt")) continue;
        const id = path.basename(file, ".pbtxt");
        if (!conversationIds.has(id)) {
          orphanAnnotations.push(id);
        }
      }
    }

    return this.decorateSnapshot({
      loadedAt: new Date().toISOString(),
      overview: {
        totalConversations: mappedStats.conversationsTotal,
        mappedConversations: mappedStats.conversationsMapped,
        unmappedConversations: mappedStats.conversationsUnmapped,
        orphanBrainFolders: mappedStats.orphanBrainFolders,
        modelCredits: stateResult.modelCredits,
        warningLimit: monitorConfig.bloatLimit,
        currentWorkspaceName: currentConversation.conversation
          ? currentConversation.conversation.workspaceName
          : "None",
        currentContextFormatted: currentConversation.conversation
          ? currentConversation.conversation.estimatedTotalTokensFormatted
          : "0",
        currentContextRatio: currentConversation.conversation
          ? currentConversation.conversation.contextRatioFormatted
          : "0%",
        resolutionState: currentConversation.resolutionState,
        resolutionNote: currentConversation.resolutionNote,
      },
      currentConversation,
      workspaceDetail: selectedWorkspace
        ? {
            ...selectedWorkspace,
            conversations: selectedWorkspace.conversations.slice(0, 8),
          }
        : null,
      workspaces,
      cleanupSummary: {
        largestSessions: [...allConversations]
          .sort(
            (left, right) =>
              right.estimatedTotalTokens - left.estimatedTotalTokens,
          )
          .slice(0, 8),
        unmappedConversations: allConversations.filter(
          (conversation) => conversation.mappingSource === "unmapped",
        ),
        recommendedCleanupTargets: [...allConversations]
          .sort(
            (left, right) =>
              right.estimatedTotalTokens - left.estimatedTotalTokens,
          )
          .filter(
            (conversation) =>
              conversation.contextRatio >= 0.8 ||
              conversation.mappingSource === "unmapped",
          )
          .slice(0, 5),
        orphanBrainFolders: brainEntries
          .filter((entry) => !conversationIds.has(entry.conversationId))
          .map((entry) => entry.conversationId),
        orphanAnnotations,
      },
      settingsSummary,
      liveFeed: this.liveState.feed.slice(0, LIVE_FEED_LIMIT),
      allConversations,
    });
  }
}

function readItemTableRawValue(db, key) {
  const statement = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
  try {
    statement.bind([key]);
    if (!statement.step()) return null;
    const row = statement.getAsObject();
    const value = row.value;
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array)
      return Buffer.from(value).toString("utf-8");
    if (value && value.buffer instanceof ArrayBuffer)
      return Buffer.from(value).toString("utf-8");
    return value === null || value === undefined ? null : String(value);
  } finally {
    statement.free();
  }
}

function buildLiveEvents(
  previousSnapshot,
  nextSnapshot,
  pbChanges,
  logChanges,
) {
  const previousIndex = indexById(
    previousSnapshot ? previousSnapshot.allConversations || [] : [],
  );
  const nextIndex = indexById(
    nextSnapshot ? nextSnapshot.allConversations || [] : [],
  );
  const events = [];

  for (const change of pbChanges) {
    const nextConversation = nextIndex.get(change.conversationId);
    const previousConversation = previousIndex.get(change.conversationId);
    if (!nextConversation) continue;
    const deltaTokens = previousConversation
      ? nextConversation.estimatedTotalTokens -
        previousConversation.estimatedTotalTokens
      : Math.round(change.deltaBytes / 3.5);

    events.push({
      id: `${change.timestamp}-${change.conversationId}-pb`,
      type: "pb_growth",
      source: "pb",
      timestamp: change.timestamp,
      conversationId: change.conversationId,
      title: nextConversation.title || "Untitled",
      workspaceName: nextConversation.workspaceName,
      deltaBytes: change.deltaBytes,
      deltaBytesFormatted: `${change.deltaBytes >= 0 ? "+" : "-"}${formatBytes(Math.abs(change.deltaBytes))}`,
      deltaTokens,
      deltaTokensFormatted: `${deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(deltaTokens))}`,
      totalTokens: nextConversation.estimatedTotalTokens,
      totalTokensFormatted: nextConversation.estimatedTotalTokensFormatted,
      contextRatioFormatted: nextConversation.contextRatioFormatted,
    });
  }

  for (const update of logChanges.messageUpdates) {
    const nextConversation = nextIndex.get(update.conversationId);
    const previousConversation = previousIndex.get(update.conversationId);
    if (!nextConversation) continue;
    const nextCount = nextConversation.messageCount;
    const previousCount = previousConversation
      ? previousConversation.messageCount
      : null;
    const deltaMessages =
      nextCount !== null && previousCount !== null
        ? nextCount - previousCount
        : null;
    const deltaTokens = previousConversation
      ? nextConversation.estimatedTotalTokens -
        previousConversation.estimatedTotalTokens
      : 0;

    events.push({
      id: `${update.timestamp}-${update.conversationId}-log`,
      type: "message_count",
      source: "log",
      timestamp: update.timestamp || new Date().toISOString(),
      conversationId: update.conversationId,
      title: nextConversation.title || "Untitled",
      workspaceName: nextConversation.workspaceName,
      deltaBytes: 0,
      deltaBytesFormatted: "+0 B",
      deltaTokens,
      deltaTokensFormatted: `${deltaTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(deltaTokens))}`,
      totalTokens: nextConversation.estimatedTotalTokens,
      totalTokensFormatted: nextConversation.estimatedTotalTokensFormatted,
      contextRatioFormatted: nextConversation.contextRatioFormatted,
      messageCount: nextConversation.messageCount,
      deltaMessages,
    });
  }

  return events
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    )
    .slice(0, LIVE_FEED_LIMIT);
}

function readAppendedText(filePath, offset, nextSize) {
  const length = Math.max(0, nextSize - offset);
  if (length === 0) {
    return "";
  }

  const fileHandle = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fileHandle, buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } finally {
    fs.closeSync(fileHandle);
  }
}

function inferLikelyConversationId(liveState, timestamp) {
  const now = new Date(timestamp).getTime();
  const candidates = Array.from(liveState.recentPbActivity.entries())
    .map(([conversationId, seenAt]) => ({
      conversationId,
      ageMs: now - new Date(seenAt).getTime(),
    }))
    .filter(
      (candidate) =>
        Number.isFinite(candidate.ageMs) &&
        candidate.ageMs >= 0 &&
        candidate.ageMs <= 20000,
    )
    .sort((left, right) => left.ageMs - right.ageMs);

  if (candidates.length === 0) {
    return liveState.activeLogConversationId || null;
  }

  if (
    candidates.length > 1 &&
    candidates[1].ageMs - candidates[0].ageMs < 1500
  ) {
    return null;
  }

  return candidates[0].conversationId;
}

function ensureChatRunState(liveState, conversationId, currentTokens) {
  const existing = liveState.chatRuns.get(conversationId);
  if (existing) {
    return existing;
  }

  const created = {
    nextChatIndex: 0,
    currentRunStartTokens: currentTokens,
    currentRunStartMessageCount: null,
    currentRunDeltaTokens: 0,
    currentRunStartedAt: null,
    lastProgressAt: null,
    lastMessageCount: null,
    recentRuns: [],
    observedCompletedTurns: 0,
    observedTokensAdded: 0,
    observedDirectMessages: 0,
    observedTurnsWithDirectMessages: 0,
  };
  liveState.chatRuns.set(conversationId, created);
  return created;
}

function recordChatProgress(
  liveState,
  conversationId,
  totalTokens,
  deltaTokens,
  timestamp,
) {
  const state = ensureChatRunState(
    liveState,
    conversationId,
    totalTokens - deltaTokens,
  );
  if (!state.currentRunStartedAt) {
    state.currentRunStartedAt = timestamp;
  }
  if (
    state.lastMessageCount === null &&
    state.currentRunStartTokens === totalTokens
  ) {
    state.currentRunStartTokens = totalTokens - deltaTokens;
  }
  state.currentRunDeltaTokens = totalTokens - state.currentRunStartTokens;
  state.lastProgressAt = timestamp;
}

function recordChatBoundary(
  liveState,
  conversationId,
  messageCount,
  totalTokens,
  timestamp,
) {
  const state = ensureChatRunState(liveState, conversationId, totalTokens);

  if (state.lastMessageCount === null) {
    state.lastMessageCount = messageCount;
    state.currentRunStartTokens = totalTokens;
    state.currentRunStartMessageCount = messageCount;
    state.currentRunDeltaTokens = 0;
    state.currentRunStartedAt = timestamp;
    state.lastProgressAt = timestamp;
    return null;
  }

  if (messageCount <= state.lastMessageCount) {
    state.lastMessageCount = messageCount;
    state.currentRunStartMessageCount = messageCount;
    state.currentRunStartTokens = totalTokens;
    state.currentRunDeltaTokens = 0;
    state.currentRunStartedAt = timestamp;
    state.lastProgressAt = timestamp;
    return null;
  }

  if (
    state.currentRunDeltaTokens === 0 &&
    state.currentRunStartTokens === totalTokens
  ) {
    state.lastMessageCount = messageCount;
    state.currentRunStartMessageCount = messageCount;
    state.currentRunStartedAt = timestamp;
    state.lastProgressAt = timestamp;
    return null;
  }

  const directMessages =
    state.currentRunStartMessageCount !== null
      ? Math.max(0, messageCount - state.currentRunStartMessageCount)
      : Math.max(0, messageCount - state.lastMessageCount);
  const completed = {
    chatIndex: state.nextChatIndex,
    startedAt: state.currentRunStartedAt,
    completedAt: timestamp,
    fromTokens: state.currentRunStartTokens,
    toTokens: totalTokens,
    deltaTokens: totalTokens - state.currentRunStartTokens,
    messageCount,
    directMessages,
  };

  state.recentRuns = [completed, ...state.recentRuns].slice(0, 5);
  state.observedCompletedTurns += 1;
  state.observedTokensAdded += completed.deltaTokens;
  state.observedDirectMessages += directMessages;
  state.observedTurnsWithDirectMessages += 1;
  state.nextChatIndex += 1;
  state.lastMessageCount = messageCount;
  state.currentRunStartTokens = totalTokens;
  state.currentRunStartMessageCount = messageCount;
  state.currentRunDeltaTokens = 0;
  state.currentRunStartedAt = timestamp;
  state.lastProgressAt = timestamp;
  return completed;
}

function finalizeQuietTurns(liveState, timestamp) {
  const nowMs = new Date(timestamp).getTime();
  let finalized = false;

  for (const state of liveState.chatRuns.values()) {
    if (!state.currentRunStartedAt || !state.lastProgressAt) {
      continue;
    }
    if (state.currentRunDeltaTokens <= 0) {
      continue;
    }

    const idleMs = nowMs - new Date(state.lastProgressAt).getTime();
    if (!Number.isFinite(idleMs) || idleMs < QUIET_TURN_FINALIZE_MS) {
      continue;
    }

    const directMessages =
      state.currentRunStartMessageCount !== null &&
      state.lastMessageCount !== null
        ? Math.max(
            0,
            state.lastMessageCount - state.currentRunStartMessageCount,
          )
        : null;
    const completed = {
      chatIndex: state.nextChatIndex,
      startedAt: state.currentRunStartedAt,
      completedAt: timestamp,
      fromTokens: state.currentRunStartTokens,
      toTokens: state.currentRunStartTokens + state.currentRunDeltaTokens,
      deltaTokens: state.currentRunDeltaTokens,
      messageCount: state.lastMessageCount,
      directMessages,
    };

    state.recentRuns = [completed, ...state.recentRuns].slice(0, 5);
    state.observedCompletedTurns += 1;
    state.observedTokensAdded += completed.deltaTokens;
    if (directMessages !== null) {
      state.observedDirectMessages += directMessages;
      state.observedTurnsWithDirectMessages += 1;
    }
    state.nextChatIndex += 1;
    state.currentRunStartTokens = completed.toTokens;
    state.currentRunDeltaTokens = 0;
    state.currentRunStartedAt = timestamp;
    state.lastProgressAt = timestamp;
    if (state.lastMessageCount !== null) {
      state.currentRunStartMessageCount = state.lastMessageCount;
    }
    finalized = true;
  }

  return finalized;
}

module.exports = {
  AgKernelMonitorRuntime,
};
