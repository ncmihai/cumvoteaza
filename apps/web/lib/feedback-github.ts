import type { FeedbackInput } from "./feedback";

/**
 * Each feedback report is also opened as a GitHub issue (D-048), so it lands where the work is tracked. The database row stays the source of truth.
 * What leaves the site: the kind, the message, the page and the language. The visitor's contact detail never does (it is kept in the database only),
 * and the message goes into a code block so GitHub does not turn it into mentions, references, images or links.
 */
export interface GithubIssue { title: string; body: string; labels: string[] }

const KIND_LABEL = { mistake: "data mistake", suggestion: "suggestion", bug: "bug" } as const;

/** A fence longer than any run of backticks in the text, so the text cannot close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

function titleOf(message: string, kind: FeedbackInput["kind"]): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  const cut = oneLine.length > 70 ? `${oneLine.slice(0, 69).trimEnd()}…` : oneLine;
  // The title is plain text on GitHub, but a mention in it still notifies: break any "@name".
  return `[${KIND_LABEL[kind]}] ${cut.replace(/@(?=\w)/g, "@​")}`;
}

export function feedbackIssue(report: { id: string; value: FeedbackInput }, siteUrl: string): GithubIssue {
  const { kind, message, pagePath, locale, contact } = report.value;
  const page = pagePath ? `${siteUrl.replace(/\/$/, "")}${pagePath}` : undefined;
  const lines = [
    `**Kind:** ${KIND_LABEL[kind]}`,
    page ? `**Page:** ${page}` : undefined,
    locale ? `**Language:** ${locale}` : undefined,
    `**Report:** \`${report.id}\``,
    contact ? "**Contact left:** yes (kept in the database only)" : undefined,
    "",
    fenced(message),
    "",
    "_Sent through the site's feedback form._"
  ].filter((line): line is string => line !== undefined);
  return { title: titleOf(message, kind), body: lines.join("\n"), labels: ["feedback", `feedback:${kind}`] };
}

export interface GithubTarget { token: string; repo: string }

/** The target from the environment, or nothing when the token is not set (then reports are only stored). */
export function githubTargetFromEnv(env: Record<string, string | undefined> = process.env): GithubTarget | undefined {
  const token = env.GITHUB_FEEDBACK_TOKEN?.trim();
  const repo = (env.GITHUB_FEEDBACK_REPO?.trim() || "ncmihai/cumvoteaza");
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return undefined;
  return { token, repo };
}

/** Opens the issue. Never throws: a failure here must not touch what the visitor sees, and the report is already stored. */
export async function postFeedbackIssue(issue: GithubIssue, target: GithubTarget, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; url?: string }> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${target.repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "cumvoteaza-feedback"
      },
      body: JSON.stringify(issue),
      signal: AbortSignal.timeout(8000)
    });
    const json = response.ok ? ((await response.json().catch(() => undefined)) as { html_url?: string } | undefined) : undefined;
    return { ok: response.ok, status: response.status, ...(json?.html_url ? { url: json.html_url } : {}) };
  } catch {
    return { ok: false, status: 0 };
  }
}
