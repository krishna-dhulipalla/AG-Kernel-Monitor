/**
 * Shared helpers for normalizing Antigravity workspace URIs.
 *
 * Antigravity stores workspace identifiers in several shapes:
 * - Percent-encoded file URIs from storage.json
 * - Decoded file URIs extracted from brain artifacts
 * - WSL file URIs from workspace storage
 * - Raw Windows paths in some fallback metadata
 *
 * These helpers collapse those variants into a canonical form so mapping can
 * rely on exact or prefix matching instead of fuzzy workspace-name guesses.
 */

const WINDOWS_DRIVE_REGEX = /^([a-zA-Z]):[\\/]/;
const FILE_URI_REGEX = /file:\/\/(?:\/(?:[a-zA-Z]:|[a-zA-Z]%3A)|wsl\.localhost\/)[^\s"'<>)\]}]+/gi;

function trimDecorators(input: string): string {
  return input
    .trim()
    .replace(/^[>\s"'`]+/, "")
    .replace(/[>\s"'`,.;:!?]+$/, "");
}

function collapseSlashes(input: string): string {
  return input.replace(/\/{2,}/g, "/");
}

function normalizeWindowsPath(pathValue: string): string {
  const forward = pathValue.replace(/\\/g, "/");
  return forward.replace(WINDOWS_DRIVE_REGEX, (_, drive: string) => `${drive.toLowerCase()}:/`);
}

function normalizeFileUriLike(uri: string): string {
  const cleaned = trimDecorators(uri).replace(/\\/g, "/");

  if (/^file:\/\/wsl\.localhost\//i.test(cleaned)) {
    const suffix = cleaned.slice("file://".length);
    const normalized = collapseSlashes(suffix).replace(/^wsl\.localhost/i, "wsl.localhost");
    return `file://${normalized}`.replace(/\/$/, "");
  }

  if (/^file:\/\/\/[a-zA-Z]:/i.test(cleaned)) {
    const suffix = cleaned.slice("file:///".length);
    return `file:///${normalizeWindowsPath(suffix)}`.replace(/\/$/, "");
  }

  return cleaned.replace(/\/$/, "");
}

function toFileUri(pathValue: string): string {
  const normalizedPath = normalizeWindowsPath(pathValue);
  if (WINDOWS_DRIVE_REGEX.test(normalizedPath)) {
    return `file:///${normalizedPath}`.replace(/\/$/, "");
  }

  const unixLike = collapseSlashes(normalizedPath);
  return `file://${unixLike.startsWith("/") ? "" : "/"}${unixLike}`.replace(/\/$/, "");
}

/**
 * Normalize any workspace URI or path into a canonical comparable form.
 */
export function normalizeWorkspaceUri(uri: string | null | undefined): string | null {
  if (!uri) return null;

  const trimmed = trimDecorators(uri);
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

/**
 * Extract workspace name from the last path segment of a normalized URI.
 */
export function extractWorkspaceNameFromUri(uri: string): string {
  const normalized = normalizeWorkspaceUri(uri) ?? trimDecorators(uri);
  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? normalized;
  return last || normalized;
}

/**
 * Match file:// URIs inside text and return normalized unique values.
 */
export function findFileUrisInText(text: string): string[] {
  const uris = new Set<string>();

  for (const match of text.matchAll(FILE_URI_REGEX)) {
    const normalized = normalizeWorkspaceUri(match[0]);
    if (normalized) {
      uris.add(normalized);
    }
  }

  return Array.from(uris);
}

/**
 * True when the URI points at an Antigravity scratch workspace.
 */
export function isPlaygroundUri(uri: string | null | undefined): boolean {
  const normalized = normalizeWorkspaceUri(uri);
  if (!normalized) return false;
  return normalized.includes("/.gemini/antigravity/playground/");
}

/**
 * True when URIs refer to the same workspace after normalization.
 */
export function workspaceUrisEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeWorkspaceUri(left);
  const normalizedRight = normalizeWorkspaceUri(right);
  return normalizedLeft !== null && normalizedLeft === normalizedRight;
}

/**
 * Prefix-match a candidate file URI against a workspace root.
 */
export function uriMatchesWorkspaceRoot(candidate: string | null | undefined, workspaceRoot: string | null | undefined): boolean {
  const normalizedCandidate = normalizeWorkspaceUri(candidate);
  const normalizedRoot = normalizeWorkspaceUri(workspaceRoot);

  if (!normalizedCandidate || !normalizedRoot) {
    return false;
  }

  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}
