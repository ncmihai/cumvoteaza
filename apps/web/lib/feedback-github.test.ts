import { describe, expect, it, vi } from "vitest";
import { feedbackIssue, githubTargetFromEnv, postFeedbackIssue } from "./feedback-github";

const report = { id: "fb-1", value: { kind: "mistake" as const, message: "Votul din 5 octombrie arată un senator la PNL, dar e la PSD.", pagePath: "/ro/votes/abc", locale: "ro" as const } };

describe("feedbackIssue", () => {
  it("carries the kind, the page, the language and the report id, with labels for the kind", () => {
    const issue = feedbackIssue(report, "https://cumvoteaza.vercel.app/");
    expect(issue.title).toBe("[data mistake] Votul din 5 octombrie arată un senator la PNL, dar e la PSD.");
    expect(issue.body).toContain("**Page:** https://cumvoteaza.vercel.app/ro/votes/abc");
    expect(issue.body).toContain("**Language:** ro");
    expect(issue.body).toContain("`fb-1`");
    expect(issue.labels).toEqual(["feedback", "feedback:mistake"]);
  });

  it("never sends the contact, only that one was left", () => {
    const issue = feedbackIssue({ ...report, value: { ...report.value, contact: "ana@example.com" } }, "https://x.example");
    expect(JSON.stringify(issue)).not.toContain("ana@example.com");
    expect(issue.body).toContain("Contact left:** yes");
  });

  it("puts the message in a code block no backtick run can close, and breaks mentions in the title", () => {
    const message = "Vezi ```cod``` și @cineva, #123 ![x](http://evil.example/p.png)";
    const issue = feedbackIssue({ ...report, value: { ...report.value, message } }, "https://x.example");
    expect(issue.body).toContain("````text\n" + message + "\n````");
    expect(issue.title).not.toMatch(/@\w/);
    expect(feedbackIssue({ ...report, value: { ...report.value, message: "x".repeat(200) } }, "https://x.example").title.length).toBeLessThan(90);
  });

  it("leaves the page out when the report has none", () => {
    const { pagePath: _unused, ...rest } = report.value;
    expect(feedbackIssue({ id: "fb-2", value: rest }, "https://x.example").body).not.toContain("**Page:**");
  });
});

describe("githubTargetFromEnv", () => {
  it("is off without a token, defaults to the project repository, and refuses a malformed repository", () => {
    expect(githubTargetFromEnv({})).toBeUndefined();
    expect(githubTargetFromEnv({ GITHUB_FEEDBACK_TOKEN: " t " })).toEqual({ token: "t", repo: "ncmihai/cumvoteaza" });
    expect(githubTargetFromEnv({ GITHUB_FEEDBACK_TOKEN: "t", GITHUB_FEEDBACK_REPO: "a/b" })).toEqual({ token: "t", repo: "a/b" });
    expect(githubTargetFromEnv({ GITHUB_FEEDBACK_TOKEN: "t", GITHUB_FEEDBACK_REPO: "../../x" })).toBeUndefined();
  });
});

describe("postFeedbackIssue", () => {
  const issue = feedbackIssue(report, "https://x.example");
  it("posts to the repository's issues with the token and returns the issue address", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ html_url: "https://github.com/a/b/issues/7" }), { status: 201 }));
    const result = await postFeedbackIssue(issue, { token: "secret", repo: "a/b" }, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, status: 201, url: "https://github.com/a/b/issues/7" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/a/b/issues");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body as string)).toEqual(issue);
  });

  it("reports a refusal or a network failure without throwing", async () => {
    expect(await postFeedbackIssue(issue, { token: "t", repo: "a/b" }, (async () => new Response("no", { status: 404 })) as unknown as typeof fetch)).toEqual({ ok: false, status: 404 });
    expect(await postFeedbackIssue(issue, { token: "t", repo: "a/b" }, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual({ ok: false, status: 0 });
  });
});
