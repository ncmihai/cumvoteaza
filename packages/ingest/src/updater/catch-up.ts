import { execFileSync } from "node:child_process";
import os from "node:os";
import { createDbSession } from "@cumsevoteaza/db";
import { publishCoverage } from "../coverage/publish";
import { runIntegrityChecks } from "../integrity/checks";
import { refreshReadModels } from "../read-models";
import { revalidateSite } from "../site-revalidate";
import { reportToGitHub } from "./github";
import { catchUpWindow, decideRunStatus, integrityVerdict, issueFor, type HeldItem, type IntegrityCount, type RunReport, type StepResult } from "./plan";
import { DEFAULT_LIMITS, stepBillImport, stepBillPages, stepDecrees, stepRosters, stepVoteLists, stepVotes, type Limits, type RunState, type StepContext } from "./steps";
import { beat, finishRun, insertRevisions, lastCompleted, newRunId, recoverStaleRuns, runInProgress, startRun } from "./store";

export class RunInProgressError extends Error {
  constructor(readonly runId: string, readonly since: string) {
    super(`another catch-up is running (${runId}, started ${since})`);
  }
}

export interface CatchUpOptions {
  repoRoot: string;
  /** Without it, the run fetches and checks but writes nothing to the database and records nothing. */
  persist: boolean;
  trigger: "manual" | "schedule" | "request";
  /** Steps to leave out: vote-lists, rosters, votes, bill-pages, bill-import, decrees. */
  skip?: string[];
  openIssue?: boolean;
  /** Purge the public site's caches when publishing (default); off for a rehearsal on a copy. */
  purge?: boolean;
  limits?: Partial<Limits>;
  today?: string;
  log?: (line: string) => void;
}

const gitSha = (repoRoot: string) => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
};

const countsOf = (results: Awaited<ReturnType<typeof runIntegrityChecks>>): IntegrityCount[] => results.map((item) => ({ name: item.name, severity: item.severity as "error" | "warning", count: item.count }));

/**
 * One catch-up (D-027): the steps in order, each recorded; after the writes the integrity checks may not be worse than before; if they pass and
 * something changed, the read models are rebuilt, the coverage numbers published and the site's caches purged ("publish"); otherwise the run is
 * held or failed and a GitHub issue says why.
 */
export async function catchUp(options: CatchUpOptions): Promise<RunReport> {
  const log = options.log ?? (() => {});
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const session = createDbSession();
  const db = session.db;
  const workerId = `${os.hostname()}`;
  const startedAt = new Date().toISOString();
  const runId = newRunId();
  const steps: StepResult[] = [];
  const state: RunState = { maxVoteNumBefore: 0, newVotes: [], fetchedPageKeys: [], revisions: [], changes: 0 };
  try {
    if (options.persist) {
      await recoverStaleRuns(db);
      const running = await runInProgress(db);
      if (running) throw new RunInProgressError(running.id, running.startedAt);
    }
    const last = await lastCompleted(db);
    const window = catchUpWindow({ lastSuccessAt: last?.finishedAt, today, heldDates: (last?.held ?? []).filter((item) => item.kind === "vote" && item.date).map((item) => item.date!) });
    log(`Run ${runId} (${options.trigger}${options.persist ? "" : ", dry run"}): looking at ${window.from} to ${window.to}.`);
    if (options.persist) {
      await startRun(db, { id: runId, trigger: options.trigger, workerId, gitSha: gitSha(options.repoRoot) });
      await beat(db, { workerId, host: os.hostname(), version: gitSha(options.repoRoot), state: "running", currentRunId: runId });
    }
    const integrityBefore = countsOf(await runIntegrityChecks(db));
    const ctx: StepContext = { repoRoot: options.repoRoot, db, persist: options.persist, runId, window, today, limits: { ...DEFAULT_LIMITS, ...options.limits }, state, log };

    const plan: Array<[string, (context: StepContext) => Promise<StepResult>]> = [["vote-lists", stepVoteLists], ["rosters", stepRosters], ["votes", stepVotes], ["bill-pages", stepBillPages], ["bill-import", stepBillImport], ["decrees", stepDecrees]];
    for (const [name, step] of plan) {
      if (options.skip?.includes(name)) {
        steps.push({ step: name, status: "skipped", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), notes: ["left out on request"] });
        continue;
      }
      const began = new Date().toISOString();
      try {
        steps.push(await step(ctx));
      } catch (error) {
        steps.push({ step: name, status: "failed", startedAt: began, endedAt: new Date().toISOString(), notes: [error instanceof Error ? error.message : String(error)] });
      }
      const last = steps.at(-1)!;
      log(`${last.step}: ${last.status}${last.counts ? ` ${JSON.stringify(last.counts)}` : ""}`);
    }

    // After the writes: the checks may not be worse than before.
    let integrity = { worse: [] as string[], grew: [] as string[] };
    if (options.persist && state.changes > 0) {
      const tolerated = new Set(["final_vote_without_bill"]); // a vote on a bill we do not hold yet is reported, not blocking (as in the vote backfill)
      integrity = integrityVerdict(integrityBefore, countsOf(await runIntegrityChecks(db)), tolerated);
    }
    const publishing = options.persist && state.changes > 0 && integrity.worse.length === 0;
    if (publishing) {
      const began = new Date().toISOString();
      const notes: string[] = [];
      try {
        const read = await refreshReadModels();
        await publishCoverage({ repoRoot: options.repoRoot, today, from: "2024-12-21", years: Array.from({ length: Number(today.slice(0, 4)) - 2023 }, (_, index) => 2024 + index), persist: true });
        const purge = options.purge === false ? undefined : await revalidateSite({ repoRoot: options.repoRoot });
        notes.push(`read models ${JSON.stringify(read)}`, purge ? `site purge ${purge.status}` : "site purge left out on request");
        steps.push({ step: "publish", status: purge && !purge.ok ? "failed" : "ok", startedAt: began, endedAt: new Date().toISOString(), notes });
      } catch (error) {
        steps.push({ step: "publish", status: "failed", startedAt: began, endedAt: new Date().toISOString(), notes: [...notes, error instanceof Error ? error.message : String(error)] });
      }
    }
    if (options.persist && state.revisions.length) await insertRevisions(db, runId, state.revisions);

    const held: HeldItem[] = [...steps.flatMap((step) => step.held ?? []), ...integrity.worse.map((item): HeldItem => ({ kind: "integrity", id: item.split(":")[0]!, reasons: [item] }))];
    const status = decideRunStatus({ steps, integrityWorse: integrity.worse, changes: state.changes });
    const report: RunReport = { id: runId, status, startedAt, trigger: options.trigger, steps, held, integrity, counts: { votesWritten: state.newVotes.length, changes: state.changes, revisions: state.revisions.length, held: held.length } };

    let issueUrl: string | undefined;
    if (options.persist && (status === "held" || status === "failed" || held.some((item) => item.kind === "decree")) && options.openIssue !== false) {
      const issue = issueFor(report);
      const reported = await reportToGitHub(issue, options.repoRoot);
      issueUrl = reported.url;
      if (reported.error) log(`Could not report to GitHub: ${reported.error}`);
    }
    if (options.persist) {
      await finishRun(db, { id: runId, status, steps, held, counts: report.counts, issueUrl });
      await beat(db, { workerId, host: os.hostname(), version: gitSha(options.repoRoot), state: "idle" });
    }
    return report;
  } catch (error) {
    if (error instanceof RunInProgressError) throw error;
    const report: RunReport = { id: runId, status: "failed", startedAt, trigger: options.trigger, steps, held: [], integrity: { worse: [], grew: [] }, counts: {}, error: error instanceof Error ? error.message : String(error) };
    if (options.persist) {
      let issueUrl: string | undefined;
      if (options.openIssue !== false) issueUrl = (await reportToGitHub(issueFor(report), options.repoRoot)).url;
      await finishRun(db, { id: runId, status: "failed", steps, held: [], counts: {}, issueUrl, note: report.error }).catch(() => undefined);
      await beat(db, { workerId, host: os.hostname(), state: "idle" }).catch(() => undefined);
    }
    return report;
  } finally {
    await session.close();
  }
}
