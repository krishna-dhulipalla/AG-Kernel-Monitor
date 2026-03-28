import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readAnnotation } from "./conversation-scanner";

describe("conversation-scanner annotations", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("parses nested seconds timestamps from pbtxt annotations", () => {
    const dir = mkdtempSync(join(tmpdir(), "agk-ann-"));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, "123.pbtxt"),
      "last_user_view_time:{seconds:1769817543 nanos:895000000}",
      "utf-8",
    );

    const annotation = readAnnotation("123", dir);
    expect(annotation?.lastUserViewTime).toBe(1769817543_000);
  });

  it("parses flat timestamps as a fallback", () => {
    const dir = mkdtempSync(join(tmpdir(), "agk-ann-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "456.pbtxt"), "last_user_view_time:1769817543", "utf-8");

    const annotation = readAnnotation("456", dir);
    expect(annotation?.lastUserViewTime).toBe(1769817543_000);
  });
});
