import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MonitorDB, type Conversation } from "./db/schema";
import {
  buildConversationViewModel,
  buildWorkspaceViewModel,
  getCurrentConversationView,
} from "./view-models";

const config = {
  bloatLimit: 1_000_000,
  bytesPerToken: 3.5,
  dbPath: "",
  logLevel: "info" as const,
};

describe("view-models", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("builds enriched conversation and workspace models", () => {
    const dir = mkdtempSync(join(tmpdir(), "agk-db-"));
    tempDirs.push(dir);

    const db = new MonitorDB(join(dir, "monitor.db"));
    db.upsertWorkspace({
      id: "ws-1",
      uri: "file:///c:/Users/example/Desktop/Hiring-Trend-Tracker",
      name: "Hiring-Trend-Tracker",
      last_seen: "2026-03-28T00:00:00.000Z",
    });

    const conversation: Conversation = {
      id: "conv-1",
      workspace_id: "ws-1",
      title: "Implementing Job Diff System",
      pb_file_bytes: 2048,
      brain_folder_bytes: 1024,
      brain_artifact_count: 3,
      resolved_version_count: 2,
      message_count: 12,
      message_count_source: "log",
      estimated_prompt_tokens: 18_000,
      estimated_artifact_tokens: 1_256,
      estimated_tokens: 19_256,
      annotation_timestamp: null,
      created_at: "2026-03-28T00:00:00.000Z",
      last_modified: "2026-03-28T00:00:00.000Z",
      last_active_at: "2026-03-28T00:01:00.000Z",
      activity_source: "log",
      mapping_source: "state_vscdb_exact",
      mapping_confidence: 1,
      is_active: 1,
    };
    db.upsertConversation(conversation);
    db.insertSnapshot({
      conversation_id: "conv-1",
      timestamp: "2026-03-28T00:00:00.000Z",
      pb_file_bytes: 1024,
      estimated_tokens: 10_000,
      message_count: 8,
      delta_bytes: 0,
    });
    db.insertSnapshot({
      conversation_id: "conv-1",
      timestamp: "2026-03-28T00:01:00.000Z",
      pb_file_bytes: 2048,
      estimated_tokens: 19_256,
      message_count: 12,
      delta_bytes: 1024,
    });
    db.updateWorkspaceAggregates("ws-1");

    const conversationView = buildConversationViewModel(db, config, conversation);
    expect(conversationView.workspaceName).toBe("Hiring-Trend-Tracker");
    expect(conversationView.isActive).toBe(true);
    expect(conversationView.deltaEstimatedTokens).toBe(9_256);
    expect(conversationView.estimatedTotalTokens).toBe(19_256);

    const workspaceView = buildWorkspaceViewModel(db, config, db.getWorkspaceById("ws-1")!);
    expect(workspaceView.conversationCount).toBe(1);
    expect(workspaceView.activeConversationCount).toBe(1);
    expect(workspaceView.largestConversationId).toBe("conv-1");

    const current = getCurrentConversationView(db, config);
    expect(current.mode).toBe("active");
    expect(current.conversation?.id).toBe("conv-1");

    db.close();
  });
});
