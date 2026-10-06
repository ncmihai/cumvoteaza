import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { dossierItemsFromLists, planDossierFetch } from "../coverage/fetch-bill-dossiers";
import { RawCache } from "../coverage/raw-cache";
import { COVERAGE_RAW_DIR, runCoverageFetch } from "../coverage/run-fetch";
import { runBillDossierFetch, runBillListFetch } from "../coverage/run-bills-seats";
import { runVoteBackfill } from "../coverage/run-vote-backfill";
import { fillGazetteNumbers } from "../dossiers/gazette-fill";
import { legislatieToken, searchByTitle } from "../dossiers/gazette-lookup";
import { importBillDossiers } from "../dossiers/import";
import { applyBillMergePlan, loadBillRecords, planBillMerges } from "../identity/bill-merge";
import { cabinetDecrees, diffDossier, pickBillPagesToRefresh, type BillPageState, type DossierSnapshot, type HeldItem, type StepResult } from "./plan";
import { insertRevisions, seenEntities, type NewRevision } from "./store";

export interface Limits {
  /** Requests to each official source in one run (the Chamber's bot protection answers a captcha after about 230). */
  requestsPerSource: number;
  delayMs: number;
  /** Bill pages asked for in one run: new ones, those a new vote touched, then the in-progress ones read longest ago. */
  billPagesPerRun: number;
  votesPerRun: number;
}

export const DEFAULT_LIMITS: Limits = { requestsPerSource: 150, delayMs: 3000, billPagesPerRun: 60, votesPerRun: 100 };

export interface RunState {
  maxVoteNumBefore: number;
  newVotes: Array<{ id: string; title: string; url?: string }>;
  fetchedPageKeys: string[];
  revisions: NewRevision[];
  /** Things that changed in the data: new votes, bills whose file changed, gazette numbers filled, records merged. */
  changes: number;
}

export interface StepContext {
  repoRoot: string;
  db: DbClient;
  persist: boolean;
  runId: string;
  window: { from: string; to: string };
  today: string;
  limits: Limits;
  state: RunState;
  log: (line: string) => void;
}

const now = () => new Date().toISOString();
const stepResult = (step: string, startedAt: string, status: StepResult["status"], extra: Partial<StepResult> = {}): StepResult => ({ step, status, startedAt, endedAt: now(), ...extra });

/** A page's name in the raw cache, from the address a dossier row remembers it by. */
export function pageKeyOf(source: "cdep" | "senate", url: string): string | undefined {
  if (source === "cdep") return url.match(/[?&]idp=(\d+)/)?.[1] ? `idp-${url.match(/[?&]idp=(\d+)/)![1]}` : undefined;
  const match = url.match(/an_cls=(\d{4}).*nr_cls=([A-Za-z]+\d+)/);
  return match ? `${match[2]!.toUpperCase()}-${match[1]}` : undefined;
}

export const maxVoteNum = async (db: DbClient) => [...(await db.execute<{ n: number }>(sql`select coalesce(max(num), 0)::int as n from votes`))][0]?.n ?? 0;

async function dossierSnapshots(db: DbClient): Promise<Map<string, DossierSnapshot & { sources: unknown }>> {
  const rows = await db.execute<{ bill_id: string; outcome: string; stage: string | null; law_number: string | null; law_year: number | null; decree_number: string | null; gazette_number: string | null; gazette_on: string | null; origin: string | null; decision: string | null; steps: number; sources: unknown }>(sql`
    select d.bill_id, d.outcome, d.stage_text as stage, d.law_number, d.law_year, d.decree_number, d.gazette_number, d.gazette_on::text as gazette_on,
           b.chamber_of_origin::text as origin, b.decision_chamber::text as decision, (select count(*)::int from bill_procedure_steps s where s.bill_id = d.bill_id) as steps, d.sources
    from bill_dossiers d join bills b on b.id = d.bill_id`);
  return new Map([...rows].map((row) => [row.bill_id, { outcome: row.outcome, stage: row.stage, lawNumber: row.law_number, lawYear: row.law_year, decreeNumber: row.decree_number, gazetteNumber: row.gazette_number, gazetteOn: row.gazette_on, chamberOfOrigin: row.origin, decisionChamber: row.decision, steps: row.steps, sources: row.sources }]));
}

const budgetSpent = (message?: string) => Boolean(message && /budget|request cap|max.?requests/i.test(message));

/** 1. The official vote lists of the days in the window (a chamber may publish a list late, so the last days are asked for again). */
export async function stepVoteLists(ctx: StepContext): Promise<StepResult> {
  const started = now();
  const results = await runCoverageFetch({ repoRoot: ctx.repoRoot, from: ctx.window.from, to: ctx.window.to, sources: ["cdep", "senate"], live: true, maxRequests: ctx.limits.requestsPerSource, delayMs: ctx.limits.delayMs, refreshSince: ctx.window.from, log: ctx.log });
  const counts = { requested: 0, cached: 0, failures: 0 };
  const notes: string[] = [];
  let blocked = false;
  for (const result of Object.values(results)) {
    counts.requested += result.requested;
    counts.cached += result.cached;
    counts.failures += result.failures.length;
    if (result.stopped) {
      notes.push(`${result.source}: ${result.stopped}`);
      if (!budgetSpent(result.stopped)) blocked = true;
    }
  }
  return stepResult("vote-lists", started, blocked ? "failed" : "ok", { counts, notes });
}

/** 2. The votes we lack, through the gates of the vote backfill (each page must agree with the official list before it is written). */
export async function stepVotes(ctx: StepContext): Promise<StepResult> {
  const started = now();
  ctx.state.maxVoteNumBefore = await maxVoteNum(ctx.db);
  const result = await runVoteBackfill({ repoRoot: ctx.repoRoot, from: ctx.window.from, to: ctx.window.to, sources: ["cdep", "senate"], limit: ctx.limits.votesPerRun, batch: 25, maxHeld: 3, maxRequests: ctx.limits.requestsPerSource, delayMs: ctx.limits.delayMs, persist: ctx.persist, offline: false, log: ctx.log });
  const held: HeldItem[] = result.held.map((item) => ({ kind: "vote" as const, id: `${item.source}:${item.officialId}`, reasons: item.reasons, url: item.url }));
  const notes: string[] = [];
  if (result.stopped) notes.push(result.stopped);
  if (result.integrity?.grew.length) notes.push(`checks that grew: ${result.integrity.grew.join(", ")}`);
  if (result.totalsOnly.length) notes.push(`${result.totalsOnly.length} written with totals only (the source lists no names)`);
  if (ctx.persist && result.written > 0) {
    const created = await ctx.db.execute<{ id: string; title: string; url: string | null }>(sql`
      select v.id, v.title, s.source_url as url from votes v left join source_snapshots s on s.id = v.source_snapshot_id where v.num > ${ctx.state.maxVoteNumBefore}`);
    for (const vote of created) {
      ctx.state.newVotes.push({ id: vote.id, title: vote.title, url: vote.url ?? undefined });
      ctx.state.revisions.push({ entityType: "vote", entityId: vote.id, field: "created", oldValue: null, newValue: vote.title.slice(0, 300), sourceUrl: vote.url ?? undefined });
    }
    ctx.state.changes += result.written;
  }
  const failed = Boolean(result.stopped) && !result.held.length && !result.stopped!.startsWith("integrity") && !budgetSpent(result.stopped);
  const worse = result.stopped?.startsWith("integrity") ? [{ kind: "integrity" as const, id: "vote-backfill", reasons: [result.stopped] }] : [];
  return stepResult("votes", started, failed ? "failed" : held.length || worse.length ? "held" : "ok", { counts: { eligible: result.plan.eligible, inThisRun: result.plan.inThisRun, fetched: result.fetched, fromCache: result.fromCache, passedGates: result.passedGates, written: ctx.persist ? result.written : 0, wouldWrite: ctx.persist ? 0 : result.passedGates }, notes, held: [...held, ...worse] });
}

/** 3. New bills (the yearly lists of this year) and the bill pages that may have changed. */
export async function stepBillPages(ctx: StepContext): Promise<StepResult> {
  const started = now();
  const year = Number(ctx.today.slice(0, 4));
  const lists = await runBillListFetch({ repoRoot: ctx.repoRoot, years: [year], sources: ["cdep", "senate"], live: true, maxRequests: ctx.limits.requestsPerSource, delayMs: ctx.limits.delayMs, refresh: true, log: ctx.log });
  const cache = new RawCache(COVERAGE_RAW_DIR(ctx.repoRoot));
  const years = Array.from({ length: year - 2023 }, (_, index) => 2024 + index);
  const { items } = await dossierItemsFromLists(cache, years, ["cdep", "senate"]);
  const saved = { cdep: new Set(await cache.keys("cdep-bill")), senate: new Set(await cache.keys("senate-bill")) };
  const newKeys = planDossierFetch({ items, saved, limit: ctx.limits.billPagesPerRun }).queue.map((item) => item.key);

  const dossiers = await ctx.db.execute<{ bill_id: string; outcome: string; sources: Record<string, { url?: string; fetchedAt?: string }> }>(sql`select bill_id, outcome, sources from bill_dossiers`);
  const pages: BillPageState[] = [];
  const keysByBill = new Map<string, string[]>();
  for (const row of dossiers) {
    for (const [source, info] of Object.entries(row.sources ?? {})) {
      if ((source !== "cdep" && source !== "senate") || !info.url) continue;
      const key = pageKeyOf(source, info.url);
      if (!key) continue;
      pages.push({ key, readAt: info.fetchedAt, inProgress: row.outcome === "in_progress" });
      keysByBill.set(row.bill_id, [...(keysByBill.get(row.bill_id) ?? []), key]);
    }
  }
  const touchedKeys = ctx.state.newVotes.length ? [...(await ctx.db.execute<{ bill_id: string }>(sql`select distinct bill_id from votes where num > ${ctx.state.maxVoteNumBefore} and bill_id is not null`))].flatMap((row) => keysByBill.get(row.bill_id) ?? []) : [];
  const picked = pickBillPagesToRefresh({ newKeys, touchedKeys, pages, max: ctx.limits.billPagesPerRun });
  const fetched = picked.length
    ? await runBillDossierFetch({ repoRoot: ctx.repoRoot, years, sources: ["cdep", "senate"], live: true, maxRequests: ctx.limits.billPagesPerRun, delayMs: ctx.limits.delayMs, only: picked, refresh: true, log: ctx.log })
    : undefined;
  const failures = (fetched?.failures ?? []).map((failure): HeldItem => ({ kind: "dossier", id: failure.key, reasons: [failure.error] }));
  if (fetched && fetched.saved > 0) ctx.state.fetchedPageKeys.push(...picked);
  const notes: string[] = [];
  if (fetched?.stopped) notes.push(fetched.stopped);
  if (lists.stopped) notes.push(`lists: ${lists.stopped}`);
  const blocked = fetched?.stoppedReason === "blocked" || (fetched?.stoppedReason === "failures");
  return stepResult("bill-pages", started, blocked ? "failed" : failures.length ? "held" : "ok", { counts: { newPages: newKeys.length, touched: touchedKeys.length, asked: picked.length, saved: fetched?.saved ?? 0, requested: (fetched?.requested ?? 0) + lists.requested }, notes, held: failures });
}

/** 4. The pages that changed become dossiers; duplicate records are merged; gazette numbers that have appeared are filled in. What changed is recorded. */
export async function stepBillImport(ctx: StepContext): Promise<StepResult> {
  const started = now();
  if (ctx.state.fetchedPageKeys.length === 0) return stepResult("bill-import", started, "skipped", { notes: ["no bill page was read again"] });
  const before = ctx.persist ? await dossierSnapshots(ctx.db) : undefined;
  const imported = await importBillDossiers({ repoRoot: ctx.repoRoot, persist: ctx.persist, only: ctx.state.fetchedPageKeys, batch: 20, log: ctx.log });
  const notes: string[] = [];
  const held: HeldItem[] = imported.unreadable.map((item) => ({ kind: "dossier" as const, id: item.key, reasons: [item.error] }));
  if (imported.summary.collidingDossiers.length) notes.push(`${imported.summary.collidingDossiers.length} dossiers left out because another one took the same bill`);
  if (imported.summary.unrecognisedWording.length) notes.push(`${imported.summary.unrecognisedWording.length} step wordings the typing does not know yet (see the import report)`);
  let merged = 0;
  let gazette = 0;
  let revisions = 0;
  if (ctx.persist) {
    const plan = planBillMerges(await loadBillRecords(ctx.db));
    if (plan.merges.length) {
      await ctx.db.transaction((tx) => applyBillMergePlan(tx as unknown as typeof ctx.db, plan));
      merged = plan.merges.reduce((total, merge) => total + merge.from.length, 0);
    }
    const filled = await fillGazetteNumbers(ctx.db, { persist: true, delayMs: 1500 });
    gazette = filled.found.length;
    const after = await dossierSnapshots(ctx.db);
    for (const [billId, snapshot] of after) {
      for (const change of diffDossier(before?.get(billId), snapshot)) {
        const url = (snapshot.sources as Record<string, { url?: string }> | undefined)?.senate?.url ?? (snapshot.sources as Record<string, { url?: string }> | undefined)?.cdep?.url;
        ctx.state.revisions.push({ entityType: "bill", entityId: billId, field: change.field, oldValue: change.oldValue, newValue: change.newValue, sourceUrl: url });
        if (change.field !== "steps") revisions += 1;
      }
    }
    ctx.state.changes += revisions + merged + gazette;
  }
  return stepResult("bill-import", started, held.length ? "held" : "ok", { counts: { bills: imported.summary.bills, newBills: imported.summary.newBills, steps: imported.summary.steps, changedFields: revisions, merged, gazetteFilled: gazette }, notes, held });
}

/** 6. A look at the presidential decrees that mention ministers or the Government: reported, never applied (the cabinet pages are curated). */
export async function stepDecrees(ctx: StepContext): Promise<StepResult> {
  const started = now();
  const seen = await seenEntities(ctx.db, "decree");
  const token = await legislatieToken();
  const year = Number(ctx.today.slice(0, 4));
  const acts = [];
  for (const word of ["ministru", "prim-ministru", "viceprim-ministru", "Guvernului"]) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    acts.push(...(await searchByTitle(token, year, word)));
  }
  const found = cabinetDecrees(acts, seen);
  if (ctx.persist && found.length) {
    for (const decree of found) ctx.state.revisions.push({ entityType: "decree", entityId: decree.id, field: "created", oldValue: null, newValue: decree.title, sourceUrl: decree.link });
  }
  // The first look records what the year already holds as the starting point and reports nothing: the cabinet pages are curated up to today.
  const baseline = seen.size === 0;
  const held = baseline ? [] : found.map((decree): HeldItem => ({ kind: "decree", id: decree.id, reasons: [`a decree that may change the cabinet: ${decree.title}`], url: decree.link }));
  return stepResult("decrees", started, "ok", { counts: { looked: acts.length, new: found.length }, notes: baseline ? [`first look: ${found.length} decrees of ${year} recorded as the starting point`] : [], held });
}
