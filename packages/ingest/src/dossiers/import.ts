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
import { groupPages, mergeDossiers, type PageGroup } from "./merge";
import type { NameCandidate } from "./member-match";
import { contradicts, documentKey, indexExistingBills, planBill, summarisePlans, type BillPlan, type ExistingBill, type PlanContext, type PlanSummary } from "./plan";
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
  written?: { bills: number; steps: number; stepDocuments: number; sponsors: number; documents: number; votesLinked: number; placeholdersRemoved: number };
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
  const aliases = await db.execute<{ alias_id: string }>(sql`select alias_id from id_aliases where alias_id like 'bill-%'`);
  return { existingBills, profileKeyToMember, candidatesByChamber, voteByRef, slugsTaken: new Set([...slugs].map((row) => row.slug)), aliasIds: new Set([...aliases].map((row) => row.alias_id)) };
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
  const planGroup = (group: PageGroup, exclude?: Set<string>) => {
    const members = group.pages.map((page) => byParsed.get(page)!);
    const fetchedAt: Partial<Record<"cdep" | "senate", string>> = {};
    for (const member of members) fetchedAt[member.parsed.source] = member.fetchedAt;
    return planBill({ merged: mergeDossiers(group), snapshots: members.map((member) => member.snapshot), fetchedAt, context, existingIndex, exclude });
  };
  // A stored bill belongs to one dossier. When two dossiers both resolve to it (the stored copy shares a Chamber or Senate number with a bill it is not, an older mislink),
  // the dossier whose own numbers name that bill keeps it and the other one moves on to its next match, or becomes a bill of its own.
  const shadowed: BillPlan[] = [];
  const planned = groups.map((group) => ({ group, plan: planGroup(group), excluded: new Set<string>() }));
  for (let round = 0; round < 5; round++) {
    const holders = new Map<string, typeof planned>();
    for (const item of planned) if (!item.plan.isNew) holders.set(item.plan.billId, [...(holders.get(item.plan.billId) ?? []), item]);
    let changed = false;
    for (const [billId, items] of holders) {
      if (items.length < 2) continue;
      const keeper = items.find((item) => item.plan.claimsStoredBill) ?? items[0]!;
      for (const item of items) {
        if (item === keeper) continue;
        item.excluded.add(billId);
        item.plan = planGroup(item.group, item.excluded);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // A new bill under the id of a record that was merged away earlier (the second Chamber registration of a bill, folded into the first) would shadow its redirect: left out, and reported.
  const plansByBill = new Map(planned.map((item) => [item.plan.billId, item.plan]));
  const plans = planned.flatMap((item) => {
    const plan = item.plan;
    if (!(plan.isNew && context.aliasIds.has(plan.billId))) return [plan];
    // The id of an old merge. Undone only when the dossier it was folded into approves a different ordinance (the merge rested on a number the Chamber printed on the wrong bill).
    const keeper = [...item.excluded].map((id) => plansByBill.get(id)).find(Boolean);
    if (keeper && contradicts(keeper.bill.title, plan.bill.title)) return [{ ...plan, unmerge: true }];
    shadowed.push(plan);
    return [];
  });
  // Two dossiers that resolve to one bill id would collide: the first wins, the report says which were left out.
  const seen = new Set<string>();
  const leftOut: BillPlan[] = [...shadowed];
  const unique = plans.filter((plan) => (seen.has(plan.billId) ? (leftOut.push(plan), false) : (seen.add(plan.billId), true)));
  return { plans: unique, summary: summarisePlans(unique, leftOut), pagesRead: { cdep: pages.filter((page) => page.parsed.source === "cdep").length, senate: pages.filter((page) => page.parsed.source === "senate").length }, unreadable };
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Writes bills in transactions: each bill's steps, sponsors and dossier row are replaced by what the pages say now. */
export async function applyDossierPlans(db: Db, plans: BillPlan[], batch = 20, log: (line: string) => void = () => {}): Promise<NonNullable<DossierImportResult["written"]>> {
  const written = { bills: 0, steps: 0, stepDocuments: 0, sponsors: 0, documents: 0, votesLinked: 0, placeholdersRemoved: 0 };
  const ownedByAPlan = new Set(plans.map((plan) => plan.billId));
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
        if (plan.unmerge) await tx.execute(sql`delete from id_aliases where alias_id in (${plan.billId}, ${`slug:${plan.slug}`})`);
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
      // Only a stored record no dossier of this run owns: the record of another dossier that merely shares a number keeps its own timeline.
      const superseded = [...new Set(group.flatMap((plan) => plan.alsoMatches))].filter((id) => !ownedByAPlan.has(id));
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
      // Every document each step prints (D-032), in the page's order. The steps above were just written, so the old rows went with them (on delete cascade).
      const stepDocumentRows = group.flatMap((plan) => plan.steps.flatMap((step) => {
        const seen = new Set<string>();
        return (step.documentUrls ?? []).flatMap((url) => {
          const documentId = docIdByBillAndKey.get(`${plan.billId}|${documentKey(url)}`);
          if (!documentId || seen.has(documentId)) return [];
          seen.add(documentId);
          return [{ stepId: step.id, documentId, position: seen.size }];
        });
      }));
      for (const part of chunks(stepDocumentRows, 500)) await tx.insert(schema.billStepDocuments).values(part).onConflictDoNothing();
      written.stepDocuments += stepDocumentRows.length;

      // The documents this importer made for these bills (ids ending -d<hash>) follow the pages as a whole: one a re-read no longer lists (it came from a page that was
      // wrongly tied to the bill) is removed, unless something has been built on it (extracted text, a ministry relation). Documents held before are never touched.
      const keepDocumentIds = new Set(group.flatMap((plan) => plan.documents.flatMap((document) => docIdByBillAndKey.get(`${plan.billId}|${documentKey(document.url)}`) ?? [])));
      const keep = keepDocumentIds.size ? sql`and d.id not in (${sql.join([...keepDocumentIds].map((id) => sql`${id}`), sql`, `)})` : sql``;
      await tx.execute(sql`
        delete from documents d where d.bill_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and d.id ~ '-d[0-9a-f]{10}$' ${keep}
          and not exists (select 1 from bill_document_text_chunks c where c.document_id = d.id)
          and not exists (select 1 from bill_ministry_relations r where r.document_id = d.id)
          and not exists (select 1 from bill_procedure_steps s where s.document_id = d.id)
          and not exists (select 1 from bill_step_documents sd where sd.document_id = d.id)`);

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
          // A gazette number the pages do not print may have been filled in from legislatie.just.ro (bills:gazette:fill): a read of the pages must not erase it.
          .onConflictDoUpdate({ target: schema.billDossiers.billId, set: { ...row, billId: undefined, gazetteNumber: sql`coalesce(excluded.gazette_number, bill_dossiers.gazette_number)`, gazetteOn: sql`coalesce(excluded.gazette_on, bill_dossiers.gazette_on)` } });
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
    `Chamber of origin corrected by the dossier: ${s.originCorrections.origin} bills; deciding chamber: ${s.originCorrections.decision}. Left as stored because the two pages disagree: ${s.originCorrections.conflicts.length} (${s.originCorrections.conflicts.join(", ")}).`,
    ...(s.unmergedBills.length ? [`Bills re-created because an old merge put two different laws into one: ${s.unmergedBills.join(", ")}.`] : []),
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

export interface StepDocumentLinkResult {
  persisted: boolean;
  bills: number;
  /** Steps of the pages that match a stored step (same id, type and date) and print at least one document. */
  stepsWithDocuments: number;
  /** Document links the pages give for those steps. */
  links: number;
  /** Links not yet stored (the rest were already there). */
  toWrite: number;
  written: number;
  /** Steps whose stored row no longer matches the page (the page changed since the last import): left to the next import, never overwritten here. */
  stepsNotMatching: number;
  /** Documents a page prints that are not in `documents` for that bill: left to the next import. */
  documentsMissing: number;
  /** Bills the pages describe that are not stored yet. */
  billsNotStored: number;
}

/**
 * D-032: adds `bill_step_documents` for the steps already stored, from the saved pages, without touching anything else (no bill, step, sponsor or document is
 * written or changed). A step is matched by its id, type and date; one that no longer matches waits for the regular import. Dry run unless `persist`.
 */
export async function linkStepDocuments(options: { repoRoot: string; persist: boolean; only?: string[]; log?: (line: string) => void }): Promise<StepDocumentLinkResult> {
  const session = createDbSession();
  const log = options.log ?? (() => {});
  try {
    const { plans } = await planDossierImport(session.db, options.repoRoot, { only: options.only });
    const result: StepDocumentLinkResult = { persisted: options.persist, bills: plans.length, stepsWithDocuments: 0, links: 0, toWrite: 0, written: 0, stepsNotMatching: 0, documentsMissing: 0, billsNotStored: 0 };
    const stored = plans.filter((plan) => !plan.isNew);
    result.billsNotStored = plans.length - stored.length;
    for (const group of chunks(stored, 200)) {
      const ids = group.map((plan) => plan.billId);
      const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
      const stepRows = await session.db.execute<{ id: string; step_type: string; occurred_on: string }>(sql`select id, step_type::text as step_type, occurred_on::text as occurred_on from bill_procedure_steps where bill_id in (${idList})`);
      const stepById = new Map([...stepRows].map((row) => [row.id, row]));
      const documentRows = await session.db.execute<{ id: string; bill_id: string; url: string }>(sql`select id, bill_id, url from documents where bill_id in (${idList})`);
      const documentIdByKey = new Map([...documentRows].map((row) => [`${row.bill_id}|${documentKey(row.url)}`, row.id]));
      const existingRows = await session.db.execute<{ step_id: string; document_id: string }>(sql`select sd.step_id, sd.document_id from bill_step_documents sd join bill_procedure_steps s on s.id = sd.step_id where s.bill_id in (${idList})`);
      const existing = new Set([...existingRows].map((row) => `${row.step_id}|${row.document_id}`));
      const rows: Array<{ stepId: string; documentId: string; position: number }> = [];
      for (const plan of group) {
        for (const step of plan.steps) {
          if (!step.documentUrls?.length) continue;
          const row = stepById.get(step.id);
          if (!row || row.step_type !== step.stepType || row.occurred_on !== step.occurredOn) { result.stepsNotMatching += 1; continue; }
          result.stepsWithDocuments += 1;
          const seen = new Set<string>();
          for (const url of step.documentUrls) {
            const documentId = documentIdByKey.get(`${plan.billId}|${documentKey(url)}`);
            if (!documentId) { result.documentsMissing += 1; continue; }
            if (seen.has(documentId)) continue;
            seen.add(documentId);
            result.links += 1;
            if (!existing.has(`${step.id}|${documentId}`)) rows.push({ stepId: step.id, documentId, position: seen.size });
          }
        }
      }
      result.toWrite += rows.length;
      if (options.persist) {
        for (const part of chunks(rows, 500)) await session.db.insert(schema.billStepDocuments).values(part).onConflictDoNothing();
        result.written += rows.length;
        log(`${result.written} links written`);
      }
    }
    return result;
  } finally {
    await session.close();
  }
}
