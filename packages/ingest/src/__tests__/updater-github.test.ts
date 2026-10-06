import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[][] = [];
let existing: Array<{ number: number; title: string; url: string }> = [];
let failWith: string | undefined;

vi.mock("node:child_process", () => ({
  execFile: (_command: string, args: string[], _options: unknown, callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
    calls.push(args);
    if (failWith) return callback(new Error(failWith));
    if (args[0] === "issue" && args[1] === "list") return callback(null, { stdout: JSON.stringify(existing), stderr: "" });
    if (args[0] === "issue" && args[1] === "create") return callback(null, { stdout: "https://github.com/o/r/issues/9\n", stderr: "" });
    return callback(null, { stdout: "", stderr: "" });
  }
}));

import { reportToGitHub } from "../updater/github";

const issue = { title: "[updater] held batch 2026-10-07", body: "body text", key: "[updater] held batch" };

describe("reportToGitHub", () => {
  beforeEach(() => { calls.length = 0; existing = []; failWith = undefined; });

  it("opens an issue labelled updater when none is open", async () => {
    const result = await reportToGitHub(issue, "/repo");
    expect(result).toEqual({ url: "https://github.com/o/r/issues/9" });
    const create = calls.find((args) => args[0] === "issue" && args[1] === "create")!;
    expect(create).toContain("--label");
    expect(create).toContain(issue.title);
  });

  it("comments on the open issue with the same key instead of opening another", async () => {
    existing = [{ number: 4, title: "[updater] held batch 2026-10-05", url: "https://github.com/o/r/issues/4" }];
    const result = await reportToGitHub(issue, "/repo");
    expect(result).toEqual({ url: "https://github.com/o/r/issues/4" });
    expect(calls.some((args) => args[0] === "issue" && args[1] === "create")).toBe(false);
    expect(calls.find((args) => args[1] === "comment")).toEqual(["issue", "comment", "4", "--body", "body text"]);
  });

  it("returns the reason, not an exception, when GitHub cannot be reached", async () => {
    failWith = "gh: not logged in";
    expect(await reportToGitHub(issue, "/repo")).toEqual({ error: "gh: not logged in" });
  });
});
