import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import { fetchOfficialSource } from "./fetch-source";
import { parseMotionDetail, parseMotionsList, type MotionKind, type ParsedMotionDetail } from "./parsers/motions";

const LISTS: Array<{ kind: MotionKind; chamber: "joint" | "deputies"; url: string }> = [
  { kind: "censure", chamber: "joint", url: "https://www.cdep.ro/ords/pls/parlam/motiuni2015.lista?cam=0" },
  { kind: "simple", chamber: "deputies", url: "https://www.cdep.ro/ords/pls/parlam/motiuni2015.lista?cam=2" }
];

export type MotionImportItem = {
  id: string;
  kind: MotionKind;
  chamber: "joint" | "deputies";
  number: number;
  filedOn: string;
  title: string;
  outcome: ParsedMotionDetail["outcome"];
  votesFor?: number;
  votesAgainst?: number;
  signatories: number;
  resolvedSignatories: number;
  unresolved: Array<{ officialId: string; chamber: string; displayName: string }>;
  detail: ParsedMotionDetail;
  sourceUrl: string;
};

export function motionId(kind: MotionKind, chamber: string, filedOn: string, number: number): string {
  return `motion-${kind}-${chamber}-${filedOn.slice(0, 4)}-${number}`;
}

/**
 * Reads CDEP's censure and simple motions of the current legislature (list pages, then each motion's page).
 * Fetching is sequential and delayed; nothing is written unless `persist` is set.
 */
export async function importMotions(
  db: DbClient,
  options: { persist: boolean; delayMs: number; fetchPage?: (url: string) => Promise<string> }
): Promise<MotionImportItem[]> {
  const fetchPage = options.fetchPage ?? fetchOfficialSource;
  const pause = () => new Promise((resolve) => setTimeout(resolve, options.delayMs));
  const memberBySource = await loadMembersBySourceId(db);
  const items: MotionImportItem[] = [];

  for (const list of LISTS) {
    const rows = parseMotionsList(await fetchPage(list.url), list.url);
    for (const row of rows) {
      if (!row.detailUrl) continue;
      await pause();
      const detail = parseMotionDetail(await fetchPage(row.detailUrl), row.detailUrl);
      if (!detail) continue;
      const resolved = detail.signatories.map((person) => ({ person, memberId: memberBySource.get(`${person.chamber}:${person.legislatureYear}:${person.officialId}`) }));
      items.push({
        id: motionId(detail.kind, list.chamber, detail.filedOn, detail.number),
        kind: detail.kind,
        chamber: list.chamber,
        number: detail.number,
        filedOn: detail.filedOn,
        title: detail.title,
        outcome: detail.outcome === "unknown" ? row.outcome : detail.outcome,
        votesFor: detail.votesFor,
        votesAgainst: detail.votesAgainst,
        signatories: detail.signatories.length,
        resolvedSignatories: resolved.filter((entry) => entry.memberId).length,
        unresolved: resolved.filter((entry) => !entry.memberId).map((entry) => ({ officialId: entry.person.officialId, chamber: entry.person.chamber, displayName: entry.person.displayName })),
        detail: { ...detail, documentUrl: detail.documentUrl ?? row.documentUrl },
        sourceUrl: row.detailUrl
      });
    }
    await pause();
  }

  if (options.persist) await persistMotions(db, items, memberBySource);
  return items;
}

async function loadMembersBySourceId(db: DbClient): Promise<Map<string, string>> {
  const rows = await db.execute<{ id: string; source_ids: Record<string, string> | null }>(sql`select id, source_ids from members`);
  const map = new Map<string, string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.source_ids ?? {})) {
      const match = key.match(/^(deputies|senate):(\d{4})$/);
      if (match && value) map.set(`${match[1]}:${match[2]}:${value}`, row.id);
    }
  }
  return map;
}

const officialResultsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/curated/motion-official-results.json");

/** Verified counts from the joint sitting's proces-verbal that the motion page itself does not state. */
function officialResults(): Map<string, { votesVoid?: number; presentCount?: number }> {
  try {
    const file = JSON.parse(readFileSync(officialResultsPath, "utf8")) as { results: Array<{ motionId: string; votesVoid?: number; presentCount?: number }> };
    return new Map(file.results.map((row) => [row.motionId, row]));
  } catch {
    return new Map();
  }
}

async function persistMotions(db: DbClient, items: MotionImportItem[], memberBySource: Map<string, string>) {
  const official = officialResults();
  await db.transaction(async (tx) => {
    for (const item of items) {
      const [legislature] = await tx.execute<{ id: string }>(sql`select id from legislatures where starts_on <= ${item.filedOn}::date and ends_on >= ${item.filedOn}::date limit 1`);
      const [government] = item.kind === "censure"
        ? await tx.execute<{ id: string }>(sql`select id from governments where starts_on <= ${item.filedOn}::date and (ends_on is null or ends_on >= ${item.filedOn}::date) order by starts_on desc limit 1`)
        : [];
      const values = {
        id: item.id,
        kind: item.kind,
        chamber: item.chamber,
        legislatureId: legislature?.id,
        number: item.number,
        filedOn: item.filedOn,
        presentedOn: item.detail.presentedOn ?? null,
        votedOn: item.detail.votedOn ?? null,
        title: item.title,
        initiators: item.detail.initiators || null,
        outcome: item.outcome,
        votesFor: item.votesFor ?? null,
        votesAgainst: item.votesAgainst ?? null,
        votesAbstain: item.detail.votesAbstain ?? null,
        votesVoid: official.get(item.id)?.votesVoid ?? null,
        presentCount: official.get(item.id)?.presentCount ?? null,
        signatoriesDeputies: item.detail.signatoriesDeputies ?? null,
        signatoriesSenators: item.detail.signatoriesSenators ?? null,
        targetGovernmentId: government?.id ?? null,
        sourceUrl: item.sourceUrl,
        documentUrl: item.detail.documentUrl ?? null
      };
      await tx.insert(schema.parliamentaryMotions).values(values).onConflictDoUpdate({ target: schema.parliamentaryMotions.id, set: { ...values, id: undefined } });
      await tx.execute(sql`delete from motion_signatories where motion_id = ${item.id}`);
      const signatories = item.detail.signatories.flatMap((person) => {
        const memberId = memberBySource.get(`${person.chamber}:${person.legislatureYear}:${person.officialId}`);
        return memberId ? [{ motionId: item.id, memberId, groupLabel: person.groupLabel }] : [];
      });
      const unique = [...new Map(signatories.map((row) => [row.memberId, row])).values()];
      for (let index = 0; index < unique.length; index += 200) {
        await tx.insert(schema.motionSignatories).values(unique.slice(index, index + 200)).onConflictDoNothing();
      }
    }
  });
}
