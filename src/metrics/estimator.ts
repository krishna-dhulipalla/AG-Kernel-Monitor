/**
 * Estimated token metrics.
 *
 * This project intentionally uses "estimated" language unless a runtime source
 * provides a direct count. File sizes and artifact sizes are still valuable, but
 * the CLI should surface them as estimates rather than exact token telemetry.
 */

export interface TokenEstimationInput {
  pbFileBytes: number;
  brainFolderBytes: number;
  messageCount: number | null;
  resolvedVersionCount: number;
  bytesPerToken: number;
}

export interface EstimatedConversationMetrics {
  estimatedPromptTokens: number;
  estimatedArtifactTokens: number;
  estimatedTotalTokens: number;
  promptEstimateSource: "message_count" | "pb_size";
}

const AVG_TOKENS_PER_MESSAGE = 1500;
const BRAIN_BYTES_PER_TOKEN = 4.0;
const TOKENS_PER_RESOLVED_VERSION = 500;

export function estimateConversationMetrics(input: TokenEstimationInput): EstimatedConversationMetrics {
  const { pbFileBytes, brainFolderBytes, messageCount, resolvedVersionCount, bytesPerToken } = input;

  const messageBasedPromptTokens = messageCount !== null
    ? messageCount * AVG_TOKENS_PER_MESSAGE
    : 0;

  const pbBasedPromptTokens = Math.floor(pbFileBytes / bytesPerToken);
  const estimatedPromptTokens = messageCount !== null && messageBasedPromptTokens > 0
    ? messageBasedPromptTokens
    : pbBasedPromptTokens;

  const artifactFromBrain = Math.floor(brainFolderBytes / BRAIN_BYTES_PER_TOKEN);
  const artifactFromResolvedVersions = resolvedVersionCount * TOKENS_PER_RESOLVED_VERSION;
  const estimatedArtifactTokens = artifactFromBrain + artifactFromResolvedVersions;

  return {
    estimatedPromptTokens,
    estimatedArtifactTokens,
    estimatedTotalTokens: estimatedPromptTokens + estimatedArtifactTokens,
    promptEstimateSource: messageCount !== null && messageBasedPromptTokens > 0 ? "message_count" : "pb_size",
  };
}

export function estimateTokens(input: TokenEstimationInput): number {
  return estimateConversationMetrics(input).estimatedTotalTokens;
}

export function calculateBloatScore(
  estimatedTokens: number,
  bloatLimit: number,
  messageCount: number | null,
  brainFolderBytes: number,
  pbFileBytes: number,
): number {
  const tokenRatio = Math.min(estimatedTokens / bloatLimit, 2.0);
  const tokenScore = tokenRatio * 50;

  const messageScore = messageCount !== null
    ? Math.min((messageCount / 200) * 100, 100) * 0.3
    : 0;

  const brainRatio = pbFileBytes > 0 ? brainFolderBytes / pbFileBytes : 0;
  const brainScore = Math.min(brainRatio * 100, 100) * 0.2;

  return Math.min(Math.round(tokenScore + messageScore + brainScore), 100);
}

export function explainWhyHeavy(
  estimatedPromptTokens: number,
  estimatedArtifactTokens: number,
  estimatedTotalTokens: number,
  bloatLimit: number,
): string {
  if (estimatedTotalTokens === 0) {
    return "No estimated context recorded yet.";
  }

  const ratio = estimatedTotalTokens / bloatLimit;
  const artifactShare = estimatedArtifactTokens / estimatedTotalTokens;

  if (ratio >= 1 && artifactShare >= 0.35) {
    return "Estimated total is over the limit and artifact context is a material share of it.";
  }

  if (ratio >= 1) {
    return "Estimated conversation history is already over the configured context limit.";
  }

  if (artifactShare >= 0.45) {
    return "Artifact context is a large share of the estimated total.";
  }

  if (ratio >= 0.8) {
    return "Estimated conversation history is close to the configured context limit.";
  }

  return "Estimated conversation history is the dominant source of context growth.";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return `${tokens}`;
}

export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
