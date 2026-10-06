import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import type { HeldItem, RunStatus, StepResult } from "./plan";

/** The updater's records (D-027): runs, worker heartbeats, queued requests and what changed. */

const stamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

export const newRunId = (now = new Date()) => `run-${stamp(now)}`;
export const newJobId = (now = new Date()) => `job-${stamp(now)}-${Math.random().toString(36).slice(2, 6)}`;

/** A run still "running" after this long was cut off (the machine slept, the process died): it is marked failed so it cannot block the next one. */
export const STALE_AFTER_HOURS = 3;

export async function recoverStaleRuns(db: DbClient): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    update updater_runs set status = 'failed', finished_at = now(), note = coalesce(note || '; ', '') || 'cut off: still running after ${sql.raw(String(STALE_AFTER_HOURS))} hours'
    where status = 'running' and started_at < now() - make_interval(hours => ${STALE_AFTER_HOURS}) returning id`);
  return [...rows].length;
}

export async function runInProgress(db: DbClient): Promise<{ id: string; startedAt: string } | undefined> {
  const rows = [...(await db.execute<{ id: string; started_at: string }>(sql`select id, started_at::text from updater_runs where status = 'running' order by started_at desc limit 1`))];
  return rows[0] ? { id: rows[0].id, startedAt: rows[0].started_at } : undefined;
}

export async function lastSuccess(db: DbClient): Promise<string | undefined> {
  const rows = [...(await db.execute<{ finished_at: string }>(sql`select finished_at::text from updater_runs where status in ('published', 'nothing_new') and finished_at is not null order by finished_at desc limit 1`))];
  return rows[0]?.finished_at;
}

/** The last run that got to the end (published, nothing new, or held back some items; not a failed one), with what it held. */
export async function lastCompleted(db: DbClient): Promise<{ finishedAt: string; held: HeldItem[] } | undefined> {
  const rows = [...(await db.execute<{ finished_at: string; held: HeldItem[] }>(sql`select finished_at::text, held from updater_runs where status in ('published', 'nothing_new', 'held') and finished_at is not null order by finished_at desc limit 1`))];
  return rows[0] ? { finishedAt: rows[0].finished_at, held: rows[0].held ?? [] } : undefined;
}

export async function startRun(db: DbClient, run: { id: string; trigger: string; workerId: string; gitSha?: string }) {
  await db.execute(sql`insert into updater_runs (id, trigger, worker_id, git_sha) values (${run.id}, ${run.trigger}, ${run.workerId}, ${run.gitSha ?? null})`);
}

export async function finishRun(db: DbClient, run: { id: string; status: RunStatus; steps: StepResult[]; held: HeldItem[]; counts: Record<string, number>; issueUrl?: string; note?: string }) {
  await db.execute(sql`
    update updater_runs set status = ${run.status}, finished_at = now(), steps = ${JSON.stringify(run.steps)}::jsonb, held = ${JSON.stringify(run.held)}::jsonb,
      counts = ${JSON.stringify(run.counts)}::jsonb, issue_url = ${run.issueUrl ?? null}, note = ${run.note ?? null} where id = ${run.id}`);
}

export async function beat(db: DbClient, worker: { workerId: string; host: string; version?: string; state: "idle" | "running"; currentRunId?: string }) {
  await db.execute(sql`
    insert into worker_heartbeats (worker_id, host, version, state, current_run_id, last_seen_at)
    values (${worker.workerId}, ${worker.host}, ${worker.version ?? null}, ${worker.state}, ${worker.currentRunId ?? null}, now())
    on conflict (worker_id) do update set host = excluded.host, version = excluded.version, state = excluded.state, current_run_id = excluded.current_run_id, last_seen_at = now()`);
}

export interface NewRevision { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; sourceUrl?: string }

export async function insertRevisions(db: DbClient, runId: string, revisions: NewRevision[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < revisions.length; i += 200) {
    const part = revisions.slice(i, i + 200);
    await db.execute(sql`
      insert into data_revisions (id, run_id, entity_type, entity_id, field, old_value, new_value, source_url)
      values ${sql.join(part.map((item, index) => sql`(${`${runId}-${i + index}`}, ${runId}, ${item.entityType}, ${item.entityId}, ${item.field}, ${item.oldValue}, ${item.newValue}, ${item.sourceUrl ?? null})`), sql`, `)}`);
    written += part.length;
  }
  return written;
}

export async function seenEntities(db: DbClient, entityType: string): Promise<Set<string>> {
  const rows = await db.execute<{ entity_id: string }>(sql`select distinct entity_id from data_revisions where entity_type = ${entityType}`);
  return new Set([...rows].map((row) => row.entity_id));
}

export async function requestJob(db: DbClient, request: { requestedBy: string; payload?: Record<string, unknown> }): Promise<string> {
  const id = newJobId();
  await db.execute(sql`insert into updater_jobs (id, kind, requested_by, payload) values (${id}, 'catch_up', ${request.requestedBy}, ${JSON.stringify(request.payload ?? {})}::jsonb)`);
  return id;
}

/** Takes the oldest queued request (two workers cannot take the same one). */
export async function claimJob(db: DbClient): Promise<{ id: string; payload: Record<string, unknown> } | undefined> {
  const rows = [...(await db.execute<{ id: string; payload: Record<string, unknown> }>(sql`
    update updater_jobs set status = 'running', started_at = now()
    where id = (select id from updater_jobs where status = 'queued' order by requested_at limit 1 for update skip locked) returning id, payload`))];
  return rows[0];
}

export async function finishJob(db: DbClient, job: { id: string; ok: boolean; runId?: string; error?: string }) {
  await db.execute(sql`update updater_jobs set status = ${job.ok ? "done" : "failed"}, finished_at = now(), run_id = ${job.runId ?? null}, error = ${job.error ?? null} where id = ${job.id}`);
}

export async function status(db: DbClient) {
  const runs = [...(await db.execute<{ id: string; trigger: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, number>; issue_url: string | null }>(sql`select id, trigger, status, started_at::text, finished_at::text, counts, issue_url from updater_runs order by started_at desc limit 8`))];
  const workers = [...(await db.execute<{ worker_id: string; host: string; state: string; last_seen_at: string }>(sql`select worker_id, host, state, last_seen_at::text from worker_heartbeats order by last_seen_at desc limit 5`))];
  const queued = [...(await db.execute<{ n: number }>(sql`select count(*)::int as n from updater_jobs where status = 'queued'`))][0]?.n ?? 0;
  return { runs, workers, queued };
}
