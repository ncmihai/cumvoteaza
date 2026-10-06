import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Reports a held or failed run (D-011) as a GitHub issue, or as a comment on the open one with the same title key so a bad week is one
 * thread and not seven. Uses the `gh` command of the machine the updater runs on (already signed in for the owner). Returns the issue's URL,
 * or undefined with the reason when GitHub could not be reached: the run is recorded either way.
 */
export async function reportToGitHub(issue: { title: string; body: string; key: string }, cwd: string): Promise<{ url?: string; error?: string }> {
  try {
    const list = await run("gh", ["issue", "list", "--state", "open", "--label", "updater", "--limit", "20", "--json", "number,title,url"], { cwd });
    const open = (JSON.parse(list.stdout) as Array<{ number: number; title: string; url: string }>).find((item) => item.title.startsWith(issue.key));
    if (open) {
      await run("gh", ["issue", "comment", String(open.number), "--body", issue.body], { cwd });
      return { url: open.url };
    }
    await run("gh", ["label", "create", "updater", "--description", "Reported by the updater", "--color", "BFD4F2"], { cwd }).catch(() => undefined);
    const created = await run("gh", ["issue", "create", "--title", issue.title, "--body", issue.body, "--label", "updater"], { cwd });
    return { url: created.stdout.trim().split("\n").at(-1) };
  } catch (error) {
    return { error: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  }
}
