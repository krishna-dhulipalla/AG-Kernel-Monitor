import { describe, expect, it } from "bun:test";
import { parseLogLine, scanLogText } from "./log-signals";

describe("log-signals", () => {
  it("parses conversation ids and direct message counts", () => {
    const line = "2026-03-27 13:11:35.140 [info] I0327 13:11:35.140558   636 planner_generator.go:283] Requesting planner with 6 chat messages";
    const parsed = parseLogLine(line);
    expect(parsed?.type).toBe("message_count");
    expect(parsed?.value).toBe(6);
  });

  it("tracks the latest active conversation and message counts from log text", () => {
    const logText = [
      "2026-03-27 19:35:00.000 [info] E0327 19:35:00.000000   636 interceptor.go:74] agent state for conversation ad22dd5a-4813-4cc3-854d-24c8fccd9e44 not found",
      "2026-03-27 19:35:01.000 [info] I0327 19:35:01.000000   636 planner_generator.go:283] Requesting planner with 121 chat messages",
      "2026-03-27 19:35:11.454 [info] I0327 19:35:11.454000   636 planner_generator.go:283] Requesting planner with 123 chat messages",
    ].join("\n");

    const snapshot = scanLogText(logText, "Antigravity.log");
    expect(snapshot.activeConversationId).toBe("ad22dd5a-4813-4cc3-854d-24c8fccd9e44");
    expect(snapshot.messageCounts.get("ad22dd5a-4813-4cc3-854d-24c8fccd9e44")).toBe(123);
    expect(snapshot.activeAt).toBe("2026-03-27 19:35:11.454");
  });
});
