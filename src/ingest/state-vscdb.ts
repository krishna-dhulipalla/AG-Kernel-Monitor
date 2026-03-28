/**
 * Query and decode the global state.vscdb (SQLite) for Antigravity state data.
 *
 * The important keys are not plain JSON on current Antigravity builds. Some are
 * JSON, while others are base64-wrapped binary payloads that still contain
 * recoverable human-readable strings such as conversation titles and workspace
 * URIs. This module intentionally uses a deterministic extractor instead of
 * assuming one fixed serialization format.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { getGlobalStateDbPath } from "../paths";
import { findFileUrisInText, normalizeWorkspaceUri } from "../uri-utils";

export interface ChatSessionEntry {
  sessionId: string;
  workspaceUri?: string;
  title?: string;
  lastModified?: string;
}

export interface TrajectorySummary {
  conversationId: string;
  title?: string;
  messageCount?: number;
  lastActivity?: string;
  workspaceUri?: string;
  workspaceUris: string[];
  rawSnippet?: string;
}

export interface ModelCredits {
  used: number;
  total: number;
  resetDate?: string;
  raw: unknown;
}

export interface DecodedStateValue {
  raw: string;
  parsedJson: unknown | null;
  decodedText: string;
  base64Decoded: boolean;
}

export interface StateVscdbResult {
  chatSessions: ChatSessionEntry[];
  trajectories: TrajectorySummary[];
  modelCredits: ModelCredits | null;
  modelPreferences: Record<string, unknown> | string | null;
  sessionToWorkspace: Map<string, string>;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
const BASE64_REGEX = /(?:[A-Za-z0-9+/]{24,}={0,2})/g;
const TITLE_REGEX = /([A-Z][A-Za-z0-9&/()'.,:_-]*(?: [A-Za-z0-9&/()'.,:_-]+){1,12})/;

function readItemTableRawValue(db: Database, key: string): string | null {
  try {
    const row = db.query("SELECT value FROM ItemTable WHERE key = ?1").get(key) as { value: Buffer | string | Uint8Array } | null;
    if (!row) return null;

    if (typeof row.value === "string") return row.value;
    if (Buffer.isBuffer(row.value)) return row.value.toString("utf-8");
    if (row.value instanceof Uint8Array) return new TextDecoder().decode(row.value);
    return null;
  } catch {
    return null;
  }
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLikelyBase64(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 16
    && trimmed.length % 4 === 0
    && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed);
}

function toPrintableText(input: string): string {
  return input.replace(/[^\x20-\x7E\r\n\t]+/g, " ");
}

function decodeBase64Printable(candidate: string): string {
  return toPrintableText(Buffer.from(candidate, "base64").toString("utf-8")).trim();
}

function scoreDecodedText(text: string): number {
  let score = 0;
  score += (text.match(/file:\/\/\/|https?:\/\//g) ?? []).length * 20;
  score += (text.match(/[A-Za-z]{4,}/g) ?? []).length;
  if (/\{\".+/.test(text)) score += 10;
  return score;
}

function sanitizeTitle(title: string): string {
  return title
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+\$?$/, "")
    .replace(/\s+[A-Za-z]$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isUsableTitle(title: string): boolean {
  if (title.length < 6) return false;
  if (UUID_REGEX.test(title)) return false;
  UUID_REGEX.lastIndex = 0;
  if (/notify_user/i.test(title)) return false;
  if (/^(mainR|masterR)/i.test(title)) return false;
  if (/tokens truncated/i.test(title)) return false;
  if (/[{}]/.test(title)) return false;

  const words = title.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length >= 2;
}

function decodeNestedPayloads(segment: string): string[] {
  const decoded: string[] = [];
  const seen = new Set<string>();

  for (const match of segment.matchAll(BASE64_REGEX)) {
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
        const decoded = decodeBase64Printable(variant);
        const score = scoreDecodedText(decoded);
        if (score > bestScore) {
          printable = decoded;
          bestScore = score;
        }
      }

      if (!printable || printable.length < 8) continue;
      if (!/(file:\/\/\/|https?:\/\/|[A-Za-z]{4,} [A-Za-z]{4,}|\{\".+)/.test(printable)) continue;
      if (seen.has(printable)) continue;
      seen.add(printable);
      decoded.push(printable);
    } catch {
      continue;
    }
  }

  return decoded;
}

function extractTitle(segment: string, nestedPayloads: string[], conversationId: string): string | undefined {
  const sources = [...nestedPayloads, toPrintableText(segment)];

  for (const source of sources) {
    const prefix = source.split(conversationId)[0] ?? source;
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

function extractMessageCount(text: string): number | undefined {
  const directMatch = text.match(/(?:messageCount|chat messages?)["\s:=-]+(\d{1,5})/i);
  if (directMatch) {
    return parseInt(directMatch[1], 10);
  }

  return undefined;
}

export function decodeStateValue(raw: string): DecodedStateValue {
  const parsedJson = tryParseJson(raw);
  if (parsedJson !== null) {
    return {
      raw,
      parsedJson,
      decodedText: raw,
      base64Decoded: false,
    };
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
      // Fall through to raw text.
    }
  }

  return {
    raw,
    parsedJson: null,
    decodedText: raw,
    base64Decoded: false,
  };
}

function extractTrajectoriesFromJson(value: unknown): TrajectorySummary[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
      ? Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
          conversationId: key,
          ...(typeof entry === "object" && entry !== null ? entry : {}),
        }))
      : [];

  const results: TrajectorySummary[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const conversationId = String(record.conversationId || record.id || "");
    if (!conversationId) continue;

    const workspaceUri = normalizeWorkspaceUri(
      typeof record.workspaceUri === "string" ? record.workspaceUri : undefined
    );

    results.push({
      conversationId,
      title: typeof record.title === "string" ? record.title : undefined,
      messageCount: typeof record.messageCount === "number" ? record.messageCount : undefined,
      lastActivity: typeof record.lastActivity === "string" ? record.lastActivity : undefined,
      workspaceUri: workspaceUri ?? undefined,
      workspaceUris: workspaceUri ? [workspaceUri] : [],
      rawSnippet: undefined,
    });
  }

  return results;
}

export function extractTrajectorySummariesFromEncodedText(text: string): TrajectorySummary[] {
  const matches = Array.from(text.matchAll(UUID_REGEX));
  const results: TrajectorySummary[] = [];

  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const conversationId = current[0];
    const currentIndex = current.index ?? 0;
    const nextIndex = matches[index + 1]?.index ?? text.length;
    const previousBoundary = matches[index - 1]
      ? ((matches[index - 1].index ?? 0) + matches[index - 1][0].length)
      : 0;

    const start = Math.max(previousBoundary, currentIndex - 160);
    const end = Math.min(nextIndex, currentIndex + 4_000);
    const segment = text.slice(start, end);
    const nestedPayloads = decodeNestedPayloads(segment);
    const combinedText = [toPrintableText(segment), ...nestedPayloads].join("\n");
    const workspaceUris = findFileUrisInText(combinedText);
    const usefulWorkspaceUris = workspaceUris.filter((uri) => !uri.includes("/.gemini/antigravity/brain/"));
    const workspaceUri = usefulWorkspaceUris[0] ?? workspaceUris[0];
    const title = extractTitle(segment, nestedPayloads, conversationId);
    const messageCount = extractMessageCount(combinedText);

    results.push({
      conversationId,
      title,
      messageCount,
      workspaceUri,
      workspaceUris: usefulWorkspaceUris.length > 0 ? usefulWorkspaceUris : workspaceUris,
      rawSnippet: combinedText.slice(0, 800),
    });
  }

  return results;
}

function extractChatSessions(value: unknown): ChatSessionEntry[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const root = value as Record<string, unknown>;
  const rawEntries = Array.isArray(root.entries)
    ? root.entries
    : root.entries && typeof root.entries === "object"
      ? Object.values(root.entries as Record<string, unknown>)
      : Array.isArray(value)
        ? (value as unknown[])
        : Object.values(root);

  const sessions: ChatSessionEntry[] = [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const sessionId = String(record.sessionId || record.id || "");
    if (!sessionId) continue;

    const workspaceUri = normalizeWorkspaceUri(
      typeof record.workspaceUri === "string"
        ? record.workspaceUri
        : typeof record.workspaceFolder === "string"
          ? record.workspaceFolder
          : typeof record.folder === "string"
            ? record.folder
            : undefined
    );

    sessions.push({
      sessionId,
      workspaceUri: workspaceUri ?? undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      lastModified: typeof record.lastModified === "string"
        ? record.lastModified
        : typeof record.updatedAt === "string"
          ? record.updatedAt
          : undefined,
    });
  }

  return sessions;
}

function decodeObjectLikeValue(raw: string): Record<string, unknown> | string | null {
  const decoded = decodeStateValue(raw);
  if (decoded.parsedJson && typeof decoded.parsedJson === "object") {
    return decoded.parsedJson as Record<string, unknown>;
  }

  const printable = toPrintableText(decoded.decodedText).trim();
  return printable || null;
}

export function listStateKeys(customPath?: string): string[] {
  const dbPath = customPath || getGlobalStateDbPath();
  if (!existsSync(dbPath)) return [];

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.query("SELECT key FROM ItemTable ORDER BY key").all() as { key: string }[];
    return rows.map((row) => row.key);
  } finally {
    db.close();
  }
}

export function parseStateVscdb(customPath?: string): StateVscdbResult | null {
  const dbPath = customPath || getGlobalStateDbPath();

  if (!existsSync(dbPath)) {
    console.warn(`⚠️  state.vscdb not found at: ${dbPath}`);
    return null;
  }

  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (err) {
    console.error("❌ Failed to open state.vscdb:", err);
    return null;
  }

  try {
    const sessionToWorkspace = new Map<string, string>();

    const chatIndexRaw = readItemTableRawValue(db, "chat.ChatSessionStore.index");
    const chatSessions = chatIndexRaw ? extractChatSessions(decodeStateValue(chatIndexRaw).parsedJson) : [];
    for (const session of chatSessions) {
      if (session.workspaceUri) {
        sessionToWorkspace.set(session.sessionId, session.workspaceUri);
      }
    }

    const trajectoriesRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.trajectorySummaries");
    let trajectories: TrajectorySummary[] = [];
    if (trajectoriesRaw) {
      const decoded = decodeStateValue(trajectoriesRaw);
      trajectories = decoded.parsedJson !== null
        ? extractTrajectoriesFromJson(decoded.parsedJson)
        : extractTrajectorySummariesFromEncodedText(decoded.decodedText);
    }

    for (const trajectory of trajectories) {
      if (trajectory.workspaceUri) {
        sessionToWorkspace.set(trajectory.conversationId, trajectory.workspaceUri);
      }
    }

    const creditsRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.modelCredits");
    const creditsValue = creditsRaw ? decodeObjectLikeValue(creditsRaw) : null;
    let modelCredits: ModelCredits | null = null;
    if (creditsValue && typeof creditsValue === "object") {
      const record = creditsValue as Record<string, unknown>;
      modelCredits = {
        used: typeof record.used === "number" ? record.used : 0,
        total: typeof record.total === "number" ? record.total : 0,
        resetDate: typeof record.resetDate === "string" ? record.resetDate : undefined,
        raw: creditsValue,
      };
    } else if (creditsValue) {
      modelCredits = {
        used: 0,
        total: 0,
        raw: creditsValue,
      };
    }

    const modelPreferencesRaw = readItemTableRawValue(db, "antigravityUnifiedStateSync.modelPreferences");
    const modelPreferences = modelPreferencesRaw ? decodeObjectLikeValue(modelPreferencesRaw) : null;

    return {
      chatSessions,
      trajectories,
      modelCredits,
      modelPreferences,
      sessionToWorkspace,
    };
  } finally {
    db.close();
  }
}
