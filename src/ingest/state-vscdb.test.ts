import { describe, expect, it } from "bun:test";
import { decodeStateValue, extractTrajectorySummariesFromEncodedText } from "./state-vscdb";

describe("state-vscdb decoding", () => {
  it("parses plain JSON payloads when present", () => {
    const decoded = decodeStateValue('{"version":1,"entries":{"a":{"id":"123"}}}');
    expect(decoded.parsedJson).toEqual({
      version: 1,
      entries: {
        a: { id: "123" },
      },
    });
    expect(decoded.base64Decoded).toBe(false);
  });

  it("extracts trajectory title and workspace uri from nested base64 payloads", () => {
    const conversationId = "dfa8f7cd-be13-4fe3-868b-e2ed7f4c1207";
    const innerPayload = [
      "Implementing Job Diff System",
      "file:///c%3A/Users/example/Desktop/Hiring-Trend-Tracker/src/main.py",
      "https://github.com/example/Hiring-Trend-Tracker.git",
    ].join("\n");
    const outerPayload = `noise\n$${conversationId}\n 7${Buffer.from(innerPayload).toString("base64")}\n`;

    const summaries = extractTrajectorySummariesFromEncodedText(outerPayload);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.conversationId).toBe(conversationId);
    expect(summaries[0]?.title).toBe("Implementing Job Diff System");
    expect(summaries[0]?.workspaceUri).toBe(
      "file:///c:/Users/example/Desktop/Hiring-Trend-Tracker/src/main.py",
    );
  });

  it("does not throw on empty or corrupt payloads", () => {
    expect(extractTrajectorySummariesFromEncodedText("")).toEqual([]);
    expect(() =>
      extractTrajectorySummariesFromEncodedText(
        "$12345678-1234-1234-1234-123456789abc\n ???notbase64???",
      ),
    ).not.toThrow();
  });
});
