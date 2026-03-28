/**
 * Health assessment engine.
 *
 * Per-conversation health:
 *   🟢 HEALTHY:  < 50% of bloat limit
 *   🟡 WARNING:  50–80% of bloat limit
 *   🔴 CRITICAL: > 80% of bloat limit
 *   💀 OVER:     exceeds bloat limit
 */

export enum HealthStatus {
  HEALTHY = "HEALTHY",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
  OVER = "OVER",
}

export interface HealthAssessment {
  status: HealthStatus;
  emoji: string;
  label: string;
  ratio: number;
  estimatedTokens: number;
  bloatLimit: number;
}

/**
 * Assess health for a single conversation.
 */
export function assessHealth(estimatedTokens: number, bloatLimit: number): HealthAssessment {
  const ratio = estimatedTokens / bloatLimit;

  let status: HealthStatus;
  let emoji: string;
  let label: string;

  if (ratio > 1.0) {
    status = HealthStatus.OVER;
    emoji = "💀";
    label = "OVER LIMIT";
  } else if (ratio > 0.8) {
    status = HealthStatus.CRITICAL;
    emoji = "🔴";
    label = "CRITICAL";
  } else if (ratio > 0.5) {
    status = HealthStatus.WARNING;
    emoji = "🟡";
    label = "WARNING";
  } else {
    status = HealthStatus.HEALTHY;
    emoji = "🟢";
    label = "HEALTHY";
  }

  return { status, emoji, label, ratio, estimatedTokens, bloatLimit };
}

/**
 * Assess aggregate health for a workspace (worst conversation wins).
 */
export function assessWorkspaceHealth(
  conversationTokens: number[],
  bloatLimit: number,
): HealthAssessment {
  if (conversationTokens.length === 0) {
    return assessHealth(0, bloatLimit);
  }

  const totalTokens = conversationTokens.reduce((sum, t) => sum + t, 0);
  const worstConversation = Math.max(...conversationTokens);

  // Workspace health is driven by its worst conversation
  return assessHealth(worstConversation, bloatLimit);
}

/**
 * Get a colored health string for terminal display.
 */
export function healthToString(health: HealthAssessment): string {
  return `${health.emoji} ${health.label}`;
}
