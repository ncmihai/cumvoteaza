import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inArray, sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import type { SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { storedOfficialKey } from "../coverage/vote-coverage";
import { COVERAGE_RAW_DIR } from "../coverage/run-fetch";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { snapshotFor } from "../parsers/utils";
import { parseCdepDossier } from "./cdep-dossier";
import { combineGroups, groupPages, mergeDossiers, type PageGroup } from "./merge";
import type { NameCandidate } from "./member-match";
import { documentKey, indexExistingBills, planBill, summarisePlans, type BillPlan, type ExistingBill, type PlanContext, type PlanSummary } from "./plan";
import { parseSenateDossier } from "./senate-dossier";
import type { ParsedDossier } from "./types";

type Db = ReturnType<typeof createDbSession>["db"];

export const CDEP_DOSSIER_PARSER = "cdep-dossier";
export const SENATE_DOSSIER_PARSER = "senate-dossier";

export interface DossierImportOptions {
  repoRoot: string;
  persist: boolean;
  /** Plan and write only the bills whose official numbers or cache keys are listed ("PL-x 56/2026", "L316/2025", "idp-22923"). */
  only?: string[];
  limit?: number;
  /** Bills written per transaction. */
  batch?: number;
  log?: (line: string) => void;
}

export interface DossierImportResult {
  persisted: boolean;
  pagesRead: { cdep: number; senate: number };
  unreadable: Array<{ key: string; error: string }>;
  summary: PlanSummary;
  written?: { bills: number; steps: number; sponsors: number; documents: number; votesLinked: number; placeholdersRemoved: number };
  files?: { json: string; markdown: string };
}

interface LoadedPage {
  parsed: ParsedDossier;
  snapshot: SourceSnapshot;
  fetchedAt?: string;
  key: string;
}

async function loadPages(cache: RawCache, only: Set<string> | undefined): Promise<{ pages: LoadedPage[]; unreadable: Array<{ key: string; error: string }> }> {
  const pages: LoadedPage[] = [];
  const unreadable: Array<{ key: string; error: string }> = [];
  for (const source of ["cdep", "senate"] as const) {
    const kind = source === "cdep" ? "cdep-bill" : "senate-bill";
    const entries = await cache.entries(kind);
    for (const key of await cache.keys(kind)) {
      const body = await cache.read(kind, key);
      if (!body) continue;
      const entry = entries.get(key);
      const url = entry?.url ?? "";
      try {
        const html = decodeOfficialBytes(body);
        const parsed = source === "cdep" ? parseCdepDossier(html, url) : parseSenateDossier(html, url);
        const snapshot = snapshotFor(source === "cdep" ? CDEP_DOSSIER_PARSER : SENATE_DOSSIER_PARSER, url, html, "parsed");
        snapshot.fetchedAt = entry?.fetchedAt ?? snapshot.fetchedAt;
        pages.push({ parsed, snapshot, fetchedAt: entry?.fetchedAt, key });
      } catch (error) {
        unreadable.push({ key: `${source} ${key}`, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (!only) return { pages, unreadable };
  const wanted = (page: LoadedPage) => only.has(page.key.toLowerCase()) || (page.parsed.selfId && only.has(page.parsed.selfId.toLowerCase().replace(/\s+/g, "")));
  const direct = pages.filter(wanted);
  // A bill is read from both of its pages: keep every page that shares an identifier with a wanted one.
  const groups = groupPages(pages.map((page) => page.parsed));
  const keep = new Set<ParsedDossier>();
  for (const group of groups) if (group.pages.some((page) => direct.some((item) => item.parsed === page))) for (const page of group.pages) keep.add(page);
  return { pages: pages.filter((page) => keep.has(page.parsed)), unreadable };
}

async function loadContext(db: Db): Promise<PlanContext> {
  const bills = await db.execute<{ id: string; slug: string; title: string; identifiers: Record<string, string>; chamber_of_origin: string; decision_chamber: string | null; law_type: string | null; source_snapshot_ids: string[] }>(
    sql`select id, slug, title, identifiers, chamber_of_origin, decision_chamber::text as decision_chamber, law_type, source_snapshot_ids from bills`
  );
  const existingBills: ExistingBill[] = [...bills].map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    identifiers: row.identifiers ?? {},
    chamberOfOrigin: row.chamber_of_origin,
    decisionChamber: row.decision_chamber,
    lawType: row.law_type,
    sourceSnapshotIds: row.source_snapshot_ids ?? []
  }));

  const profileKeyToMember = new Map<string, string>();
  for (const row of await db.execute<{ id: string; pk: string }>(sql`select id, source_ids->>'cdepProfileKey' as pk from members where source_ids ? 'cdepProfileKey'`)) profileKeyToMember.set(row.pk, row.id);

  const candidatesByChamber: PlanContext["candidatesByChamber"] = { deputies: [], senate: [] };
  const mandates = await db.execute<{ id: string; name: string; chamber: "deputies" | "senate"; starts_on: string; ends_on: string }>(sql`
    select m.id, m.display_name as name, mm.chamber::text as chamber, mm.starts_on::text as starts_on, coalesce(mm.ends_on, l.ends_on)::text as ends_on
    from members m join member_mandates mm on mm.member_id = m.id join legislatures l on l.id = mm.legislature_id`);
  for (const row of mandates) candidatesByChamber[row.chamber].push({ id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on } satisfies NameCandidate);

  const voteByRef = new Map<string, { id: string; billId: string | null }>();
  const votes = await db.execute<{ id: string; chamber: string; bill_id: string | null; source_url: string | null }>(
    sql`select v.id, v.chamber::text as chamber, v.bill_id, s.source_url from votes v left join source_snapshots s on s.id = v.source_snapshot_id`
  );
  for (const row of votes) {
    const key = storedOfficialKey({ id: row.id, chamber: row.chamber, sourceUrl: row.source_url } as Parameters<typeof storedOfficialKey>[0]);
    if (key) voteByRef.set(`${key.source}:${key.officialId}`, { id: row.id, billId: row.bill_id });
  }

  const slugs = await db.execute<{ slug: string }>(sql`select slug from bills`);
  return { existingBills, profileKeyToMember, candidatesByChamber, voteByRef, slugsTaken: new Set([...slugs].map((row) => row.slug)) };
}

export async function planDossierImport(db: Db, repoRoot: string, options: { only?: string[]; limit?: number }): Promise<{ plans: BillPlan[]; summary: PlanSummary; pagesRead: { cdep: number; senate: number }; unreadable: Array<{ key: string; error: string }> }> {
  const cache = new RawCache(COVERAGE_RAW_DIR(repoRoot));
  const only = options.only?.length ? new Set(options.only.map((value) => value.toLowerCase().replace(/\s+/g, ""))) : undefined;
  const { pages, unreadable } = await loadPages(cache, only);
  const context = await loadContext(db);
  const existingIndex = indexExistingBills(context.existingBills);
  const byParsed = new Map(pages.map((page) => [page.parsed, page]));
  let groups = groupPages(pages.map((page) => page.parsed));
  if (options.limit !== undefined) groups = groups.slice(0, options.limit);
  const planGroup = (group: PageGroup) => {
    const members = group.pages.map((page) => byParsed.get(page)!);
    const fetchedAt: Partial<Record<"cdep" | "senate", string>> = {};
    for (const member of members) fetchedAt[member.parsed.source] = member.fetchedAt;
    return planBill({ merged: mergeDossiers(group), snapshots: members.map((member) => member.snapshot), fetchedAt, context, existingIndex });
  };
  let planned = groups.map((group) => ({ group, plan: planGroup(group) }));
  // Pages that name no identifier in common can still be one stored bill (the Chamber page names no Senate number, the Senate page no Chamber number):
  // when the stored bill says so, its pages are read together instead of one overwriting the other.
  const readTogether: Array<{ bill: string; pages: string[] }> = [];
  const byStoredBill = new Map<string, Array<(typeof planned)[number]>>();
  for (const item of planned) if (!item.plan.isNew) byStoredBill.set(item.plan.billId, [...(byStoredBill.get(item.plan.billId) ?? []), item]);
  const combinedFor = new Map<(typeof planned)[number], (typeof planned)[number] | null>();
  for (const [billId, items] of byStoredBill) {
    if (items.length < 2) continue;
    const group = combineGroups(items.map((item) => item.group));
    combinedFor.set(items[0]!, { group, plan: planGroup(group) });
    for (const item of items.slice(1)) combinedFor.set(item, null);
    readTogether.push({ bill: billId, pages: group.pages.map((page) => page.selfId ?? page.sourceUrl) });
  }
  planned = planned.flatMap((item) => (combinedFor.has(item) ? (combinedFor.get(item) ? [combinedFor.get(item)!] : []) : [item]));
  const plans = planned.map((item) => item.plan);
  // Two dossiers that still resolve to one bill id (a new bill, or a plan that moved to another stored bill when read together) would collide: the first wins, the report says which were left out.
  const seen = new Set<string>();
  const leftOut: BillPlan[] = [];
  const unique = plans.filter((plan) => (seen.has(plan.billId) ? (leftOut.push(plan), false) : (seen.add(plan.billId), true)));
  return { plans: unique, summary: summarisePlans(unique, leftOut, readTogether), pagesRead: { cdep: pages.filter((page) => page.parsed.source === "cdep").length, senate: pages.filter((page) => page.parsed.source === "senate").length }, unreadable };
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Writes bills in transactions: each bill's steps, sponsors and dossier row are replaced by what the pages say now. */
export async function applyDossierPlans(db: Db, plans: BillPlan[], batch = 20, log: (line: string) => void = () => {}): Promise<NonNullable<DossierImportResult["written"]>> {
  const written = { bills: 0, steps: 0, sponsors: 0, documents: 0, votesLinked: 0, placeholdersRemoved: 0 };
  for (const group of chunks(plans, batch)) {
    await db.transaction(async (tx) => {
      const ids = group.map((plan) => plan.billId);
      const replaced = new Set<string>();
      const snapshots = new Map<string, SourceSnapshot>();
      for (const plan of group) for (const snapshot of plan.snapshots) snapshots.set(snapshot.id, snapshot);
      for (const part of chunks([...snapshots.values()], 200)) {
        await tx
          .insert(schema.sourceSnapshots)
          .values(part.map((snapshot) => ({ id: snapshot.id, sourceUrl: snapshot.sourceUrl, fetchedAt: new Date(snapshot.fetchedAt), contentHash: snapshot.contentHash, parser: snapshot.parser, parserVersion: snapshot.parserVersion, status: snapshot.status, notes: snapshot.notes })))
          .onConflictDoNothing();
      }

      for (const plan of group) {
        const values = { title: plan.bill.title, identifiers: plan.bill.identifiers, chamberOfOrigin: plan.bill.chamberOfOrigin, decisionChamber: plan.bill.decisionChamber as "deputies" | "senate" | null, status: plan.bill.status, lawType: plan.bill.lawType as "ordinary" | "organic" | "constitutional" | null, sourceSnapshotIds: plan.bill.sourceSnapshotIds };
        if (plan.isNew) await tx.insert(schema.bills).values({ id: plan.billId, slug: plan.slug, ...values }).onConflictDoNothing();
        else await tx.update(schema.bills).set(values).where(sql`${schema.bills.id} = ${plan.billId}`);
      }

      // Documents: keep the ones we hold (their extracted text is tied to them), add the ones the dossier prints that we lack.
      const held = await tx.execute<{ id: string; bill_id: string; url: string; label: string; document_kind: string }>(sql`select id, bill_id, url, label, document_kind::text as document_kind from documents where bill_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
      const docIdByBillAndKey = new Map<string, string>();
      const heldById = new Map<string, { label: string; kind: string }>();
      for (const row of held) {
        docIdByBillAndKey.set(`${row.bill_id}|${documentKey(row.url)}`, row.id);
        heldById.set(row.id, { label: row.label, kind: row.document_kind });
      }
      const newDocuments: Array<typeof schema.documents.$inferInsert> = [];
      for (const plan of group) {
        for (const document of plan.documents) {
          const key = `${plan.billId}|${documentKey(document.url)}`;
          if (docIdByBillAndKey.has(key)) continue;
          const id = `doc-${plan.billId}-d${document.hash.slice(0, 10)}`;
          docIdByBillAndKey.set(key, id);
          newDocuments.push({ id, billId: plan.billId, label: document.label, url: document.url, documentKind: document.kind, sourceChamber: document.sourceChamber, officialUrlHash: document.hash });
        }
      }
      for (const part of chunks(newDocuments, 250)) await tx.insert(schema.documents).values(part).onConflictDoNothing();
      written.documents += newDocuments.length;
      // Documents this importer added earlier are its own: their label and kind follow the page. The older ones are left as they are.
      for (const plan of group) {
        for (const document of plan.documents) {
          const id = docIdByBillAndKey.get(`${plan.billId}|${documentKey(document.url)}`);
          const current = id ? heldById.get(id) : undefined;
          if (id && current && (current.label !== document.label || current.kind !== document.kind) && /-d[0-9a-f]{10}$/.test(id)) await tx.update(schema.documents).set({ label: document.label, documentKind: document.kind }).where(sql`${schema.documents.id} = ${id}`);
        }
      }

      // The other record of a dossier stored twice (merged by bills:merge-duplicates afterwards) keeps no timeline or initiators of its own:
      // the dossier written above supersedes them, and the merge would otherwise move them onto the surviving bill beside it.
      const superseded = [...new Set(group.flatMap((plan) => plan.alsoMatches))];
      if (superseded.length) {
        const other = sql.join(superseded.map((id) => sql`${id}`), sql`, `);
        await tx.execute(sql`delete from bill_procedure_steps where bill_id in (${other}) and source is null`);
        await tx.execute(sql`delete from bill_events where bill_id in (${other})`);
        await tx.execute(sql`delete from bill_sponsors where bill_id in (${other}) and source is null`);
      }

      // Steps and sponsors are replaced as a whole.
      await tx.delete(schema.billProcedureSteps).where(inArray(schema.billProcedureSteps.billId, ids));
      const stepRows = group.flatMap((plan) =>
        plan.steps.map((step) => ({
          id: step.id,
          billId: plan.billId,
          occurredOn: step.occurredOn,
          chamber: step.chamber,
          stepType: step.stepType as (typeof schema.billProcedureStepTypeEnum.enumValues)[number],
          title: step.title,
          description: step.note,
          committeeName: step.committeeName,
          documentId: step.documentUrl ? docIdByBillAndKey.get(`${plan.billId}|${documentKey(step.documentUrl)}`) : undefined,
          sourceUrl: step.sourceUrl,
          displayOrder: step.displayOrder,
          source: step.source,
          institution: step.institution,
          committeeRef: step.committeeRef,
          verdict: step.verdict,
          documentNumber: step.documentNumber,
          amendmentsAdmitted: step.amendmentsAdmitted,
          amendmentsRejected: step.amendmentsRejected,
          deadlineAmendmentsOn: step.deadlineAmendmentsOn,
          deadlineOn: step.deadlineOn,
          resultFor: step.resultFor,
          resultAgainst: step.resultAgainst,
          resultAbstention: step.resultAbstention,
          resultNotVoting: step.resultNotVoting,
          voteId: step.voteId,
          voteRef: step.voteRef,
          stenogramUrl: step.stenogramUrl,
          note: step.note
        }))
      );
      for (const part of chunks(stepRows, 250)) await tx.insert(schema.billProcedureSteps).values(part);
      written.steps += stepRows.length;

      // The compact timeline (read models, member activity and the lists date a bill from its events) follows the steps.
      await tx.delete(schema.billEvents).where(inArray(schema.billEvents.billId, ids));
      const eventRows = group.flatMap((plan) => {
        const seen = new Set<string>();
        return plan.steps.flatMap((step) => {
          const key = `${step.occurredOn}|${step.chamber}|${step.title}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [{ id: `devent-${plan.billId}-${seen.size}`, billId: plan.billId, occurredOn: step.occurredOn, chamber: step.chamber, label: step.title.slice(0, 500), sourceUrl: step.sourceUrl }];
        });
      });
      for (const part of chunks(eventRows, 250)) await tx.insert(schema.billEvents).values(part);

      const withSponsors = group.filter((plan) => plan.sponsors.length > 0);
      if (withSponsors.length) {
        await tx.delete(schema.billSponsors).where(inArray(schema.billSponsors.billId, withSponsors.map((plan) => plan.billId)));
        const sponsorRows = withSponsors.flatMap((plan) =>
          plan.sponsors.map((sponsor) => ({ id: sponsor.id, billId: plan.billId, sponsorType: sponsor.sponsorType, memberId: sponsor.memberId, name: sponsor.name, groupLabel: sponsor.groupLabel, memberChamber: sponsor.memberChamber, source: sponsor.source }))
        );
        for (const part of chunks(sponsorRows, 250)) await tx.insert(schema.billSponsors).values(part);
        written.sponsors += sponsorRows.length;
      }

      for (const plan of group) {
        const row = { billId: plan.billId, readAt: new Date(), ...plan.dossier };
        await tx
          .insert(schema.billDossiers)
          .values(row)
          .onConflictDoUpdate({ target: schema.billDossiers.billId, set: { ...row, billId: undefined } });
        for (const link of plan.voteLinks) {
          await tx.execute(sql`update votes set bill_id = ${link.billId} where id = ${link.voteId} and (bill_id is null${link.replaces ? sql` or bill_id = ${link.replaces}` : sql``})`);
          written.votesLinked += 1;
          if (link.replaces) replaced.add(link.replaces);
        }
      }
      // A placeholder that no longer holds a vote or anything else is removed (its read-model row is rebuilt by refresh-read-models).
      if (replaced.size) {
        const gone = [...replaced];
        const list = sql.join(gone.map((id) => sql`${id}`), sql`, `);
        await tx.execute(sql`delete from bill_vote_summaries where bill_id in (${list}) and not exists (select 1 from votes v where v.bill_id = bill_vote_summaries.bill_id)`);
        const removed = await tx.execute<{ id: string }>(sql`
          delete from bills b where b.id in (${list})
            and not exists (select 1 from votes v where v.bill_id = b.id)
            and not exists (select 1 from documents d where d.bill_id = b.id)
            and not exists (select 1 from bill_events e where e.bill_id = b.id)
            and not exists (select 1 from bill_procedure_steps s where s.bill_id = b.id)
            and not exists (select 1 from bill_sponsors s where s.bill_id = b.id)
            and not exists (select 1 from bill_ministry_relations r where r.bill_id = b.id)
            and not exists (select 1 from bill_document_text_chunks c where c.bill_id = b.id)
            and not exists (select 1 from bill_dossiers x where x.bill_id = b.id)
          returning b.id`);
        written.placeholdersRemoved += [...removed].length;
      }
      written.bills += group.length;
    });
    log(`${written.bills} of ${plans.length} bills written`);
  }
  return written;
}

function renderMarkdown(result: DossierImportResult, generatedAt: string): string {
  const s = result.summary;
  const lines = [
    "# Bill dossier import",
    "",
    `Generated ${generatedAt}. ${result.persisted ? "Written to the database." : "Dry run: nothing written."}`,
    "",
    `Pages read: ${result.pagesRead.cdep} Chamber, ${result.pagesRead.senate} Senate. Unreadable: ${result.unreadable.length}.`,
    `Bills: ${s.bills} (${s.newBills} new, ${s.existingBills} already held), ${s.withSteps} with steps, ${s.steps} steps.`,
    "",
    "## Outcomes as the pages say them",
    "",
    ...Object.entries(s.outcomes).map(([key, value]) => `- ${key}: ${value}`),
    "",
    `Promulgated without a law number: ${s.promulgatedWithoutLawNumber.length}. Promulgated without a gazette number: ${s.promulgatedWithoutGazette.length}.`,
    "",
    "## Initiators",
    "",
    ...Object.entries(s.sponsors).map(([key, value]) => `- ${key}: ${value}`),
    "",
    `Votes linked to a bill by the dossier: ${s.voteLinksToWrite}. Votes the dossier ties to another bill than the one stored: ${s.voteConflicts.length}.`,
    `Bills that answer to two stored records (to merge by hand): ${s.duplicateBills.length}.`,
    `Bills whose Chamber and Senate pages name no identifier in common and were read together because the stored bill ties them: ${s.readTogether.length}.`,
    `Dossiers left out because another dossier resolved to the same bill: ${s.collidingDossiers.length}.`,
    ...s.collidingDossiers.map((item) => `- ${item.bill}: kept ${JSON.stringify(item.keptIdentifiers)}; left out ${JSON.stringify(item.leftOutIdentifiers)} (${item.leftOutSteps} steps, ${item.leftOutOutcome})`),
    "",
    "## Step types",
    "",
    ...Object.entries(s.stepsByType).sort((a, b) => b[1] - a[1]).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Wording the typing did not recognise",
    "",
    ...(s.unrecognisedWording.length ? s.unrecognisedWording.map((item) => `- ${item.count}× ${item.text}`) : ["(none)"]),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

/** Reads the saved dossier pages, plans every bill against the database and, with `persist`, writes them. Dry run by default. */
export async function importBillDossiers(options: DossierImportOptions): Promise<DossierImportResult> {
  const session = createDbSession();
  try {
    const planned = await planDossierImport(session.db, options.repoRoot, { only: options.only, limit: options.limit });
    const result: DossierImportResult = { persisted: options.persist, pagesRead: planned.pagesRead, unreadable: planned.unreadable, summary: planned.summary };
    if (options.persist) result.written = await applyDossierPlans(session.db, planned.plans, options.batch ?? 20, options.log);
    const stamp = new Date().toISOString();
    const dir = path.join(options.repoRoot, "data", "coverage", "reports");
    await mkdir(dir, { recursive: true });
    const base = path.join(dir, `bill-dossiers-${stamp.slice(0, 19).replace(/[:T]/g, "-")}${options.persist ? "" : "-dry"}`);
    await writeFile(`${base}.json`, JSON.stringify({ ...result, plans: options.only ? planned.plans : undefined }, null, 2));
    await writeFile(`${base}.md`, renderMarkdown(result, stamp));
    result.files = { json: `${base}.json`, markdown: `${base}.md` };
    return result;
  } finally {
    await session.close();
  }
}
