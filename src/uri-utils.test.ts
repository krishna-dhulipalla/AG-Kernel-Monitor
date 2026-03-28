import { describe, expect, it } from "bun:test";
import {
  extractWorkspaceNameFromUri,
  isPlaygroundUri,
  normalizeWorkspaceUri,
  uriMatchesWorkspaceRoot,
  workspaceUrisEqual,
} from "./uri-utils";

describe("uri-utils", () => {
  it("normalizes percent-encoded windows file uris", () => {
    expect(
      normalizeWorkspaceUri("file:///c%3A/Users/example/Desktop/Hiring-Trend-Tracker")
    ).toBe("file:///c:/Users/example/Desktop/Hiring-Trend-Tracker");
  });

  it("normalizes raw windows paths into file uris", () => {
    expect(normalizeWorkspaceUri("C:\\Users\\example\\Desktop\\ChatBot")).toBe(
      "file:///c:/Users/example/Desktop/ChatBot",
    );
  });

  it("preserves WSL workspace uris", () => {
    expect(
      normalizeWorkspaceUri("file://wsl.localhost/Ubuntu/home/example/project")
    ).toBe("file://wsl.localhost/Ubuntu/home/example/project");
  });

  it("matches file paths beneath a workspace root", () => {
    expect(
      uriMatchesWorkspaceRoot(
        "file:///c:/Users/example/Desktop/Project/src/main.ts",
        "file:///c:/Users/example/Desktop/Project",
      )
    ).toBe(true);
  });

  it("detects playground uris and extracts names", () => {
    expect(
      isPlaygroundUri("file:///c:/Users/example/.gemini/antigravity/playground/vector-cosmic")
    ).toBe(true);
    expect(
      extractWorkspaceNameFromUri("file:///c%3A/Users/example/Desktop/OutreachOps")
    ).toBe("OutreachOps");
    expect(
      workspaceUrisEqual(
        "file:///c%3A/Users/example/Desktop/OutreachOps",
        "file:///c:/Users/example/Desktop/OutreachOps",
      )
    ).toBe(true);
  });
});
