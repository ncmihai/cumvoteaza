import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import { runIntegrityChecks } from "../integrity/checks";
import { canonicalizeOfficialUrl } from "../official-urls";
import { parseChamberNominalVote } from "../parsers/chamber-vote";
import * as cheerio from "cheerio";
import { parseSenateVote } from "../parsers/senate-vote";
import { persistChamberVote, persistSenateVote } from "../persist";
import { refreshReadModels } from "../read-models";
import { summariseJointSittings } from "./joint-amendments";
import { loadOfficialVotes } from "./load-official-votes";
import { FetchStoppedError, PoliteFetcher } from "./polite-fetcher";
import { decodeOfficialBytes, RawCache } from "./raw-cache";
import { exceptionKey, readNameListExceptions } from "../vote-name-list-exceptions";
import { loadStoredVotes } from "./run-report";
import { mergeUnsupportedRegistry, readUnsupportedRegistry, unsupportedKeys } from "./unsupported-registry";
import { COVERAGE_RAW_DIR } from "./run-fetch";
import { checkVoteGate, officialVoteUrl, planVoteBackfill } from "./vote-backfill";
import type { OfficialVoteRecord } from "./vote-coverage";

export interface VoteBackfillOptions {
  repoRoot: string;
  from: string;
  to: string;
  sources: Array<"cdep" | "senate">;
  /** Votes taken from the top of the queue (newest first) in this run. */
  limit: number;
  /** Votes written between two integrity checks. */
  batch: number;
  /** The run ends after this many votes fail a gate. */
  maxHeld: number;
  maxRequests: number;
  delayMs: number;
  persist: boolean;
  /** Use saved pages only; never ask the sources. */
  offline: boolean;
  /** Queue votes we already hold whose totals differ from the official list, instead of the missing ones. */
  refreshMismatched?: boolean;
  log?: (line: string) => void;
}

export interface VoteBackfillResult {
  persisted: boolean;
  plan: { eligible: number; inThisRun: number; alreadyHeld: number; summarised: number; tests: number; knownWithoutNames: number };
  fetched: number;
  fromCache: number;
  passedGates: number;
  written: number;
  held: Array<{ source: string; officialId: string; date: string; url: string; reasons: string[] }>;
  /** Pages that cannot be imported as votes because the source publishes no per-member choices (attendance checks). */
  /** Votes written with totals only: the source page publishes no names (empty tables). */
  totalsOnly: Array<{ source: string; officialId: string; date: string; label: string }>;
  unsupported: Array<{ source: string; officialId: string; date: string; url: string; reason: string; officialTotals: OfficialVoteRecord["totals"]; label: string }>;
  stopped?: string;
  integrity?: { before: Record<string, number>; after: Record<string, number>; worse: string[]; grew: string[] };
  summaries: number;
  reportFile: string;
}

/**
 * Checks that may grow during a backfill without meaning the data is wrong: a vote on a bill we do not hold yet
 * (the bill gap closes in Sprint 7) is reported, not blocking. Every other check getting worse stops the run.
 */
const MAY_GROW = new Set(["final_vote_without_bill"]);

const countsOf = (results: Array<{ name: string; count: number }>) => Object.fromEntries(results.map((result) => [result.name, result.count]));

/**
 * Imports the official votes we do not hold, newest first, from the saved official lists. Every page is saved raw,
 * must agree with the official list (date, chamber, totals, name list) before it is written, and every `batch`
 * writes are followed by the integrity checks; the run stops at the first batch that makes them worse.
 */
export async function runVoteBackfill(options: VoteBackfillOptions): Promise<VoteBackfillResult> {
  const log = options.log ?? (() => {});
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const official = await loadOfficialVotes(cache, options.from, options.to);
  const stored = await loadStoredVotes(options.from, options.to);
  const known = await readUnsupportedRegistry(options.repoRoot);
  const plan = planVoteBackfill({ official: official.records, stored, range: { from: options.from, to: options.to }, sources: options.sources, limit: options.limit, unsupported: unsupportedKeys(known), mode: options.refreshMismatched ? "mismatched" : "missing" });
  log(`Queue: ${plan.queue.length} of ${plan.eligible} missing votes (${plan.alreadyHeld} already held, ${plan.summarised} summarised, ${plan.tests} test ballots).`);

  const result: VoteBackfillResult = {
    persisted: options.persist,
    plan: { eligible: plan.eligible, inThisRun: plan.queue.length, alreadyHeld: plan.alreadyHeld, summarised: plan.summarised, tests: plan.tests, knownWithoutNames: plan.unsupported },
    fetched: 0,
    fromCache: 0,
    passedGates: 0,
    written: 0,
    held: [],
    totalsOnly: [],
    unsupported: [],
    summaries: 0,
    reportFile: ""
  };
  const exceptions = new Map(readNameListExceptions().map((item) => [exceptionKey(item.source, item.officialId), item.shortBy]));
  const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs });
  let integrityBefore = options.persist ? countsOf(await runIntegrityChecks()) : undefined;
  let writtenSinceCheck = 0;

  const checkIntegrity = async () => {
    const after = countsOf(await runIntegrityChecks());
    const grown = Object.keys(after).filter((name) => after[name]! > (integrityBefore?.[name] ?? 0));
    const worse = grown.filter((name) => !MAY_GROW.has(name));
    result.integrity = { before: result.integrity?.before ?? integrityBefore!, after, worse, grew: [...new Set([...(result.integrity?.grew ?? []), ...grown.filter((name) => MAY_GROW.has(name))])] };
    if (worse.length) result.stopped = `integrity checks got worse after ${result.written} writes: ${worse.join(", ")}`;
    integrityBefore = after;
    writtenSinceCheck = 0;
  };

  try {
    for (const record of plan.queue) {
      if (result.stopped) break;
      const url = officialVoteUrl(record);
      const key = `${record.source}-${record.officialId}`;
      let body = await cache.read("vote-page", key);
      if (body) {
        result.fromCache += 1;
      } else if (options.offline) {
        continue;
      } else {
        const response = await fetcher.get(url);
        if (response.status !== 200) {
          result.held.push({ source: record.source, officialId: record.officialId, date: record.date, url, reasons: [`HTTP ${response.status}`] });
        } else {
          body = response.body;
          result.fetched += 1;
          await cache.write("vote-page", key, body, { url, status: response.status });
        }
        if (!body) {
          if (result.held.length >= options.maxHeld) result.stopped = `${result.held.length} votes held back`;
          continue;
        }
      }

      const reasons: string[] = [];
      let write: (() => Promise<unknown>) | undefined;
      try {
        const html = decodeOfficialBytes(body);
        const prepared = prepare(record, html, url, exceptions.get(exceptionKey(record.source, record.officialId)));
        if (prepared.unsupported) {
          result.unsupported.push({ source: record.source, officialId: record.officialId, date: record.date, url, reason: prepared.unsupported, officialTotals: record.totals, label: record.label });
          log(`UNSUPPORTED ${record.source} ${record.officialId} ${record.date}: ${prepared.unsupported}`);
          continue;
        }
        reasons.push(...prepared.reasons);
        write = prepared.write;
        if (!prepared.reasons.length && prepared.totalsOnly) result.totalsOnly.push({ source: record.source, officialId: record.officialId, date: record.date, label: record.label });
      } catch (error) {
        reasons.push(`page could not be read: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (reasons.length) {
        result.held.push({ source: record.source, officialId: record.officialId, date: record.date, url, reasons });
        log(`HELD ${record.source} ${record.officialId} ${record.date}: ${reasons.join("; ")}`);
        if (result.held.length >= options.maxHeld) result.stopped = `${result.held.length} votes held back`;
        continue;
      }
      result.passedGates += 1;
      if (options.persist && write) {
        await write();
        result.written += 1;
        writtenSinceCheck += 1;
        log(`WROTE ${record.source} ${record.officialId} ${record.date} (${result.written})`);
        if (writtenSinceCheck >= options.batch) await checkIntegrity();
      } else {
        log(`OK ${record.source} ${record.officialId} ${record.date}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stopped = error.message;
  }

  if (result.unsupported.length) {
    await mergeUnsupportedRegistry(options.repoRoot, result.unsupported.map((item) => ({ source: item.source as "cdep" | "senate", officialId: item.officialId, date: item.date, reason: item.reason, label: item.label, officialTotals: item.officialTotals, url: item.url })));
  }
  if (options.persist && writtenSinceCheck > 0 && !result.stopped?.startsWith("integrity")) await checkIntegrity();
  if (options.persist) {
    result.summaries = await upsertSittingSummaries(official.records);
    if (result.written > 0) await refreshReadModels();
  }

  const dir = path.join(options.repoRoot, "data", "coverage", "reports");
  await mkdir(dir, { recursive: true });
  result.reportFile = path.join(dir, `vote-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(result.reportFile, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/** Parses one saved page and says what is wrong with it, or how to write it. */
function prepare(record: OfficialVoteRecord, html: string, url: string, nameListShortBy?: { for?: number; against?: number; abstention?: number }): { reasons: string[]; write?: () => Promise<unknown>; unsupported?: string; totalsOnly?: boolean } {
  if (record.source === "cdep") {
    const parsed = parseChamberNominalVote(html, canonicalizeOfficialUrl(url));
    if (parsed.individualVotes.length === 0 && parsed.warnings.some((warning) => /^Attendance check lists names without votes/.test(warning))) {
      return { reasons: [], unsupported: "attendance check: the page lists who was present, with no vote choices" };
    }
    const reasons = checkVoteGate({
      official: record,
      nameListShortBy,
      parsedStatus: parsed.sourceSnapshot.status,
      parsed: { chamber: parsed.vote.chamber, heldOn: parsed.vote.heldOn, totals: parsed.vote.totals, choices: parsed.individualVotes.map((vote) => vote.choice), warnings: parsed.warnings }
    });
    return { reasons, write: () => persistChamberVote(parsed) };
  }
  const parsed = parseSenateVote(html, url);
  // A page whose name tables have no body rows at all publishes no names (observed: a simple motion and an ANI appointment).
  const $ = cheerio.load(html);
  const sourcePublishesNoNames = $(".plenary-votes table").length > 0 && $(".plenary-votes table tbody tr").length === 0;
  const reasons = checkVoteGate({
    official: record,
    nameListShortBy,
    sourcePublishesNoNames,
    parsedStatus: parsed.sourceSnapshot.status,
    parsed: { chamber: parsed.vote.chamber, heldOn: parsed.vote.heldOn, totals: parsed.vote.totals, choices: parsed.individualVotes.map((vote) => vote.choice), warnings: [] }
  });
  return { reasons, write: () => persistSenateVote(parsed), totalsOnly: sourcePublishesNoNames && parsed.individualVotes.length === 0 };
}

/** One summary row per joint sitting that has summarised votes (D-022); recomputed from the official lists every time. */
export async function upsertSittingSummaries(records: OfficialVoteRecord[]): Promise<number> {
  const summaries = summariseJointSittings(records);
  if (summaries.length === 0) return 0;
  const session = createDbSession();
  try {
    const now = new Date();
    for (const summary of summaries) {
      const row = {
        id: `sitting-joint-${summary.date}-amendment-votes`,
        chamber: "joint" as const,
        heldOn: summary.date,
        kind: "amendment_votes",
        voteCount: summary.voteCount,
        firstOfficialId: summary.firstOfficialId,
        lastOfficialId: summary.lastOfficialId,
        officialUrl: summary.officialUrl,
        updatedAt: now
      };
      await session.db.insert(schema.voteSittingSummaries).values(row).onConflictDoUpdate({ target: schema.voteSittingSummaries.id, set: row });
    }
    return summaries.length;
  } finally {
    await session.close();
  }
}
