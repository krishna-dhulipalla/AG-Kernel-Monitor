/**
 * Multi-signal token estimation engine.
 *
 * Signals:
 *   1. message_count × avg_tokens_per_message
 *   2. .pb file size ÷ bytesPerToken (coarse fallback)
 *   3. brain_folder_bytes ÷ 4.0 (artifact context overhead)
 *   4. resolved_version_count (model turn count indicator)
 */

export interface TokenEstimationInput {
  pbFileBytes: number;
  brainFolderBytes: number;
  messageCount: number | null;
  resolvedVersionCount: number;
  bytesPerToken: number;
}

/** Average tokens per chat message (user + assistant turns combined) */
const AVG_TOKENS_PER_MESSAGE = 1500;

/** Context overhead per token from brain artifacts */
const BRAIN_BYTES_PER_TOKEN = 4.0;

/** Each resolved version represents roughly this many additional context tokens */
const TOKENS_PER_RESOLVED_VERSION = 500;

/**
 * Estimate total token consumption for a conversation.
 *
 * Uses a weighted multi-signal approach:
 *   - If message_count is known, it's the primary signal
 *   - .pb file size is a reliable secondary signal
 *   - Brain folder adds artifact context overhead
 *   - Resolved versions add model turn overhead
 */
export function estimateTokens(input: TokenEstimationInput): number {
  const { pbFileBytes, brainFolderBytes, messageCount, resolvedVersionCount, bytesPerToken } = input;

  // Signal 1: Message-count based estimation (most accurate when available)
  const messageBasedTokens = messageCount !== null
    ? messageCount * AVG_TOKENS_PER_MESSAGE
    : 0;

  // Signal 2: .pb file size based estimation (reliable fallback)
  const pbBasedTokens = Math.floor(pbFileBytes / bytesPerToken);

  // Signal 3: Brain artifact context overhead
  const brainOverhead = Math.floor(brainFolderBytes / BRAIN_BYTES_PER_TOKEN);

  // Signal 4: Resolved version turns
  const resolvedOverhead = resolvedVersionCount * TOKENS_PER_RESOLVED_VERSION;

  // Primary estimate: use message count if available, otherwise .pb size
  const primaryEstimate = messageCount !== null && messageBasedTokens > 0
    ? messageBasedTokens
    : pbBasedTokens;

  // Total: primary + artifact overhead + turn overhead
  return primaryEstimate + brainOverhead + resolvedOverhead;
}

/**
 * Calculate bloat score (0-100) for a conversation.
 *
 * Components:
 *   - Token usage vs. bloat limit (60% weight)
 *   - Message count growth rate (20% weight)
 *   - Brain folder weight relative to .pb file (20% weight)
 */
export function calculateBloatScore(
  estimatedTokens: number,
  bloatLimit: number,
  messageCount: number | null,
  brainFolderBytes: number,
  pbFileBytes: number,
): number {
  // Token saturation (60% weight)
  const tokenRatio = Math.min(estimatedTokens / bloatLimit, 2.0); // cap at 2x
  const tokenScore = tokenRatio * 50; // 0-100 scale

  // Message density (20% weight) — more messages = more context overhead
  const msgScore = messageCount !== null
    ? Math.min((messageCount / 200) * 100, 100) * 0.3
    : 0;

  // Brain-to-pb ratio (20% weight) — large brain relative to .pb means many artifacts
  const brainRatio = pbFileBytes > 0 ? brainFolderBytes / pbFileBytes : 0;
  const brainScore = Math.min(brainRatio * 100, 100) * 0.2;

  return Math.min(Math.round(tokenScore + msgScore + brainScore), 100);
}

/**
 * Format a byte count into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * Format a token count into a human-readable string.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return `${tokens}`;
}
