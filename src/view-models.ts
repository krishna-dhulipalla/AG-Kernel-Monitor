import type { AgKernelConfig } from "./config";
import { type Conversation, MonitorDB, type Workspace } from "./db/schema";
import { explainWhyHeavy, formatBytes, formatRatio, formatTokens } from "./metrics/estimator";
import { assessHealth, assessWorkspaceHealth } from "./metrics/health";
import { getLatestDeltaTokens } from "./metrics/snapshotter";
import { isPlaygroundUri, normalizeWorkspaceUri } from "./uri-utils";

export interface ConversationViewModel {
  id: string;
  title: string | null;
  workspaceId: string | null;
  workspaceName: string;
  workspaceUri: string | null;
  pbFileBytes: number;
  pbSizeFormatted: string;
  brainSizeBytes: number;
  brainSizeFormatted: string;
  messageCount: number | null;
  messageCountSource: string | null;
  isActive: boolean;
  lastActiveAt: string | null;
  lastActiveRelative: string;
  mappingSource: string | null;
  mappingConfidence: number | null;
  mappingNote: string | null;
  estimatedPromptTokens: number;
  estimatedArtifactTokens: number;
  estimatedTotalTokens: number;
  estimatedTokens: number;
  estimatedTotalTokensFormatted: string;
  contextRatio: number;
  contextRatioFormatted: string;
  deltaEstimatedTokens: number;
  deltaEstimatedTokensFormatted: string;
  whyHeavy: string;
  health: string;
  healthEmoji: string;
}

export interface WorkspaceViewModel {
  id: string;
  name: string;
  displayName: string;
  uri: string;
  uriHint: string | null;
  estimatedTokens: number;
  estimatedTokensFormatted: string;
  conversationCount: number;
  activeConversationCount: number;
  largestConversationId: string | null;
  largestConversationTokens: number;
  largestConversationTokensFormatted: string;
  mappedConversationCount: number;
  unmappedConversationCount: number;
  messageCount: number | null;
  hasUnknownMessages: boolean;
  brainSizeBytes: number;
  brainSizeFormatted: string;
  pbSizeBytes: number;
  pbSizeFormatted: string;
  health: string;
  healthEmoji: string;
}

export interface CurrentConversationResult {
  mode: "active" | "recent" | "none";
  detectionSource: "log" | "active_flag" | "recent_fallback" | "none";
  detectionNote: string;
  conversation: ConversationViewModel | null;
}

function relativeTime(dateValue: string | null): string {
  if (!dateValue) return "unknown";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

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

function workspaceLookup(db: MonitorDB): Map<string, Workspace> {
  const map = new Map<string, Workspace>();
  for (const workspace of db.getAllWorkspaces()) {
    map.set(workspace.id, workspace);
  }
  return map;
}

function buildWorkspaceUriHint(uri: string, workspaceName: string): string | null {
  const normalized = normalizeWorkspaceUri(uri);
  if (!normalized || normalized === "__unmapped__") return null;
  if (isPlaygroundUri(normalized)) return "playground";

  const withoutScheme = normalized.replace(/^file:\/\/\/?/i, "");
  const parts = withoutScheme.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1] ?? "";
  const parent = parts[parts.length - 2] ?? "";
  if (last.toLowerCase() === workspaceName.toLowerCase()) {
    return parent || last;
  }

  return parts.slice(-2).join("/");
}

export function buildConversationViewModel(
  db: MonitorDB,
  config: AgKernelConfig,
  conversation: Conversation,
  workspaces = workspaceLookup(db),
): ConversationViewModel {
  const workspace = conversation.workspace_id ? workspaces.get(conversation.workspace_id) ?? null : null;
  const health = assessHealth(conversation.estimated_tokens, config.bloatLimit);
  const deltaEstimatedTokens = getLatestDeltaTokens(db, conversation.id);

  return {
    id: conversation.id,
    title: conversation.title,
    workspaceId: conversation.workspace_id,
    workspaceName: workspace?.name ?? "[Unknown]",
    workspaceUri: workspace?.uri ?? null,
    pbFileBytes: conversation.pb_file_bytes,
    pbSizeFormatted: formatBytes(conversation.pb_file_bytes),
    brainSizeBytes: conversation.brain_folder_bytes,
    brainSizeFormatted: formatBytes(conversation.brain_folder_bytes),
    messageCount: conversation.message_count,
    messageCountSource: conversation.message_count_source,
    isActive: conversation.is_active === 1,
    lastActiveAt: conversation.last_active_at,
    lastActiveRelative: relativeTime(conversation.last_active_at),
    mappingSource: conversation.mapping_source,
    mappingConfidence: conversation.mapping_confidence,
    mappingNote: conversation.mapping_notes,
    estimatedPromptTokens: conversation.estimated_prompt_tokens,
    estimatedArtifactTokens: conversation.estimated_artifact_tokens,
    estimatedTotalTokens: conversation.estimated_tokens,
    estimatedTokens: conversation.estimated_tokens,
    estimatedTotalTokensFormatted: formatTokens(conversation.estimated_tokens),
    contextRatio: config.bloatLimit > 0 ? conversation.estimated_tokens / config.bloatLimit : 0,
    contextRatioFormatted: formatRatio(config.bloatLimit > 0 ? conversation.estimated_tokens / config.bloatLimit : 0),
    deltaEstimatedTokens,
    deltaEstimatedTokensFormatted: `${deltaEstimatedTokens >= 0 ? "+" : "-"}${formatTokens(Math.abs(deltaEstimatedTokens))}`,
    whyHeavy: explainWhyHeavy(
      conversation.estimated_prompt_tokens,
      conversation.estimated_artifact_tokens,
      conversation.estimated_tokens,
      config.bloatLimit,
    ),
    health: health.status,
    healthEmoji: health.emoji,
  };
}

export function listConversationViewModels(
  db: MonitorDB,
  config: AgKernelConfig,
  conversations: Conversation[],
): ConversationViewModel[] {
  const workspaces = workspaceLookup(db);
  return conversations.map((conversation) => buildConversationViewModel(db, config, conversation, workspaces));
}

export function buildWorkspaceViewModel(
  db: MonitorDB,
  config: AgKernelConfig,
  workspace: Workspace,
  conversations = db.getConversationsByWorkspace(workspace.id),
): WorkspaceViewModel {
  const views = listConversationViewModels(db, config, conversations);
  const largestConversation = [...views].sort((left, right) => right.estimatedTotalTokens - left.estimatedTotalTokens)[0] ?? null;
  const totalEstimatedTokens = views.reduce((sum, view) => sum + view.estimatedTotalTokens, 0);
  const directMessageCounts = views.filter((view) => view.messageCount !== null).map((view) => view.messageCount as number);
  const hasUnknownMessages = views.some((view) => view.messageCount === null);
  const health = assessWorkspaceHealth(views.map((view) => view.estimatedTotalTokens), config.bloatLimit);

  return {
    id: workspace.id,
    name: workspace.name,
    displayName: workspace.name,
    uri: workspace.uri,
    uriHint: buildWorkspaceUriHint(workspace.uri, workspace.name),
    estimatedTokens: totalEstimatedTokens,
    estimatedTokensFormatted: formatTokens(totalEstimatedTokens),
    conversationCount: views.length,
    activeConversationCount: views.filter((view) => view.isActive).length,
    largestConversationId: largestConversation?.id ?? null,
    largestConversationTokens: largestConversation?.estimatedTotalTokens ?? 0,
    largestConversationTokensFormatted: largestConversation ? formatTokens(largestConversation.estimatedTotalTokens) : "0",
    mappedConversationCount: views.filter((view) => view.mappingSource !== "unmapped").length,
    unmappedConversationCount: views.filter((view) => view.mappingSource === "unmapped").length,
    messageCount: hasUnknownMessages ? null : directMessageCounts.reduce((sum, value) => sum + value, 0),
    hasUnknownMessages,
    brainSizeBytes: workspace.total_brain_bytes,
    brainSizeFormatted: formatBytes(workspace.total_brain_bytes),
    pbSizeBytes: workspace.total_pb_bytes,
    pbSizeFormatted: formatBytes(workspace.total_pb_bytes),
    health: health.status,
    healthEmoji: health.emoji,
  };
}

export function listWorkspaceViewModels(db: MonitorDB, config: AgKernelConfig): WorkspaceViewModel[] {
  const views = db.getAllWorkspaces()
    .map((workspace) => buildWorkspaceViewModel(db, config, workspace))
    .sort((left, right) => right.estimatedTokens - left.estimatedTokens);

  const duplicateCounts = new Map<string, number>();
  for (const view of views) {
    duplicateCounts.set(view.name, (duplicateCounts.get(view.name) ?? 0) + 1);
  }

  return views.map((view) => {
    if ((duplicateCounts.get(view.name) ?? 0) <= 1) {
      return view;
    }

    const suffix = view.uriHint ?? view.id.slice(0, 8);
    return {
      ...view,
      displayName: `${view.name} [${suffix}]`,
    };
  });
}

export function getCurrentConversationView(db: MonitorDB, config: AgKernelConfig): CurrentConversationResult {
  const activeConversation = db.getAllConversations().find((conversation) => conversation.is_active === 1) ?? null;
  if (activeConversation) {
    return {
      mode: "active",
      detectionSource: activeConversation.activity_source === "log" ? "log" : "active_flag",
      detectionNote: activeConversation.activity_source === "log"
        ? "Detected from Antigravity runtime log activity."
        : "Marked active from the latest runtime signal.",
      conversation: buildConversationViewModel(db, config, activeConversation),
    };
  }

  const mostRecentConversation = db.getCurrentConversation();
  if (mostRecentConversation) {
    return {
      mode: "recent",
      detectionSource: "recent_fallback",
      detectionNote: "No live active conversation could be confirmed from logs, so the most recent session is shown instead.",
      conversation: buildConversationViewModel(db, config, mostRecentConversation),
    };
  }

  return {
    mode: "none",
    detectionSource: "none",
    detectionNote: "No conversation data is available yet.",
    conversation: null,
  };
}
