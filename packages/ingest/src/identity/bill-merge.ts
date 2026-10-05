import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

/**
 * One bill record per legislative dossier (D22). A bill is the same dossier in both chambers when it shares
 * the Senate L-number or the CDEP PL-x number. Duplicates came from two places:
 *  - CDEP vote imports created a bare placeholder from the PL-x number on the vote, next to the full record;
 *  - the Senate and CDEP bill pages of one dossier were stored under different IDs.
 * Senate B-numbers are registration numbers, not dossier numbers: a shared B-number is reported, never merged.
 */
export type BillRecord = {
  id: string;
  slug: string;
  identifiers: Record<string, string>;
  /** Parsers of the bill's source snapshots ("senate-bill", "deputies-bill", "chamber-nominal-vote", ...). */
  parsers: string[];
};

export type BillMergePlan = {
  merges: Array<{ into: string; from: string[]; key: string }>;
  /** Different dossiers that share a Senate B-number. Left untouched. */
  sharedRegistrationNumbers: Array<{ number: string; bills: string[] }>;
};

/** Dossier keys of a bill: its Senate L-number and its CDEP PL-x number, normalized. */
export function billDossierKeys(identifiers: Record<string, string>): string[] {
  const keys: string[] = [];
  const senateL = [identifiers.senate_l, identifiers.senate].find((value) => /^L\s*\d+\/\d{4}$/i.test(value ?? ""));
  if (senateL) keys.push(`senate:${senateL.replace(/\s+/g, "").toUpperCase()}`);
  const deputies = identifiers.deputies?.match(/^PL-?x\s*(\d+)\/(\d{4})$/i);
  if (deputies) keys.push(`deputies:PL-x ${Number(deputies[1])}/${deputies[2]}`);
  return keys;
}

export function planBillMerges(bills: BillRecord[]): BillMergePlan {
  const parent = new Map(bills.map((bill) => [bill.id, bill.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const owner = new Map<string, string>();
  for (const bill of bills) {
    for (const key of billDossierKeys(bill.identifiers)) {
      const other = owner.get(key);
      if (!other) {
        owner.set(key, bill.id);
        continue;
      }
      const [a, b] = [find(other), find(bill.id)];
      if (a !== b) parent.set(b, a);
    }
  }

  const groups = new Map<string, BillRecord[]>();
  for (const bill of bills) groups.set(find(bill.id), [...(groups.get(find(bill.id)) ?? []), bill]);
  const merges: BillMergePlan["merges"] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const [into, ...rest] = [...members].sort(survivorOrder);
    const keys = members.flatMap((bill) => billDossierKeys(bill.identifiers));
    const shared = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
    merges.push({ into: into!.id, from: rest.map((bill) => bill.id).sort(), key: shared.sort().join(", ") });
  }

  const byRegistration = new Map<string, Set<string>>();
  for (const bill of bills) {
    const number = bill.identifiers.senate_b;
    if (number) byRegistration.set(number, (byRegistration.get(number) ?? new Set()).add(find(bill.id)));
  }
  const sharedRegistrationNumbers = [...byRegistration]
    .filter(([, roots]) => roots.size > 1)
    .map(([number, roots]) => ({ number, bills: [...roots].sort() }))
    .sort((a, b) => a.number.localeCompare(b.number));

  return { merges: merges.sort((a, b) => a.into.localeCompare(b.into)), sharedRegistrationNumbers };
}

/** The record built from the richest source survives: Senate bill page, then CDEP bill page, then a vote placeholder. */
function survivorOrder(a: BillRecord, b: BillRecord): number {
  const rank = (bill: BillRecord) => (bill.parsers.includes("senate-bill") ? 0 : bill.parsers.includes("deputies-bill") ? 1 : 2);
  return rank(a) - rank(b) || Number(!a.id.startsWith("bill-l")) - Number(!b.id.startsWith("bill-l")) || a.id.localeCompare(b.id);
}

export async function loadBillRecords(db: DbClient): Promise<BillRecord[]> {
  const rows = await db.execute<{ id: string; slug: string; identifiers: Record<string, string>; parsers: string[] | null }>(sql`
    select b.id, b.slug, b.identifiers,
      (select array_agg(distinct ss.parser) from jsonb_array_elements_text(b.source_snapshot_ids) sid
         join source_snapshots ss on ss.id = sid) as parsers
    from bills b
  `);
  return rows.map((row) => ({ id: row.id, slug: row.slug, identifiers: row.identifiers ?? {}, parsers: row.parsers ?? [] }));
}

const BILL_CHILD_TABLES = ["votes", "bill_events", "bill_sponsors", "documents", "bill_procedure_steps", "bill_document_text_chunks"] as const;

/**
 * Folds each retired record into the survivor: children re-pointed, identifiers and sources united,
 * missing facts filled from the retired record, retired ID and slug kept as aliases for redirects.
 */
/** Documents of one bill that point at the same file (the Senate appends `?nocache=true`, hosts differ): one row stays. */
const DUPLICATE_DOCUMENTS = sql`
  select id, keep_id from (
    select id,
      row_number() over (partition by bill_id, k order by (text_status = 'stored') desc, (text_asset_id is not null) desc, id) as rn,
      first_value(id) over (partition by bill_id, k order by (text_status = 'stored') desc, (text_asset_id is not null) desc, id) as keep_id
    from (select documents.*, lower(regexp_replace(regexp_replace(url, '[?]nocache=true$', ''), '^https?://(www[.])?', '')) as k from documents) d
  ) ranked where rn > 1`;

/** Keeps the copy that has extracted text, repoints what referred to the others (steps, ministry relations, text chunks), deletes them. Returns how many were deleted. */
export async function dedupeBillDocuments(db: DbClient): Promise<number> {
  await db.execute(sql`with dups as (${DUPLICATE_DOCUMENTS}) update bill_procedure_steps s set document_id = d.keep_id from dups d where s.document_id = d.id`);
  await db.execute(sql`with dups as (${DUPLICATE_DOCUMENTS}) update bill_ministry_relations r set document_id = d.keep_id from dups d where r.document_id = d.id`);
  await db.execute(sql`with dups as (${DUPLICATE_DOCUMENTS}) delete from bill_document_text_chunks c using dups d where c.document_id = d.id and exists (select 1 from bill_document_text_chunks k where k.document_id = d.keep_id)`);
  await db.execute(sql`with dups as (${DUPLICATE_DOCUMENTS}) update bill_document_text_chunks c set document_id = d.keep_id from dups d where c.document_id = d.id`);
  const removed = await db.execute<{ id: string }>(sql`with dups as (${DUPLICATE_DOCUMENTS}) delete from documents x using dups d where x.id = d.id returning x.id`);
  return [...removed].length;
}

export async function applyBillMergePlan(db: DbClient, plan: BillMergePlan): Promise<void> {
  for (const merge of plan.merges) {
    for (const from of merge.from) {
      const into = merge.into;
      for (const table of BILL_CHILD_TABLES) {
        await db.execute(sql`update ${sql.identifier(table)} set bill_id = ${into} where bill_id = ${from}`);
      }
      // One dossier row per bill: the survivor's stays if it has one, otherwise the retired bill's moves over.
      await db.execute(sql`delete from bill_dossiers where bill_id = ${from} and exists (select 1 from bill_dossiers where bill_id = ${into})`);
      await db.execute(sql`update bill_dossiers set bill_id = ${into} where bill_id = ${from}`);
      await db.execute(sql`
        delete from bill_ministry_relations r where r.bill_id = ${from}
          and exists (select 1 from bill_ministry_relations s where s.bill_id = ${into} and s.ministry_id = r.ministry_id and s.relation = r.relation)
      `);
      await db.execute(sql`update bill_ministry_relations set bill_id = ${into} where bill_id = ${from}`);
      await db.execute(sql`delete from bill_vote_summaries where bill_id = ${from}`);
      await db.execute(sql`delete from entity_search_index where entity_id = ${from}`);
      await db.execute(sql`update engagement_events set entity_id = ${into} where entity_id = ${from}`);
      await db.execute(sql`
        delete from content_reactions r where r.entity_id = ${from}
          and exists (select 1 from content_reactions s where s.entity_type = r.entity_type and s.entity_id = ${into} and s.reaction = r.reaction and s.visitor_hash = r.visitor_hash)
      `);
      await db.execute(sql`update content_reactions set entity_id = ${into} where entity_id = ${from}`);
      await db.execute(sql`
        update bills b set
          identifiers = f.identifiers || b.identifiers,
          source_snapshot_ids = (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(b.source_snapshot_ids || f.source_snapshot_ids) x),
          chamber_of_origin = case when b.chamber_of_origin = 'unknown' then f.chamber_of_origin else b.chamber_of_origin end,
          decision_chamber = coalesce(b.decision_chamber, f.decision_chamber),
          status = case when b.status = 'unknown' then f.status else b.status end,
          law_type = coalesce(b.law_type, f.law_type)
        from bills f where b.id = ${into} and f.id = ${from}
      `);
      await db.execute(sql`
        insert into id_aliases (alias_id, canonical_id, kind, reason)
        select ${from}, ${into}, 'bill', ${`same dossier (${merge.key})`}
        union all
        select 'slug:' || slug, ${into}, 'bill-slug', ${`same dossier (${merge.key})`} from bills where id = ${from}
        on conflict (alias_id) do update set canonical_id = excluded.canonical_id
      `);
      await db.execute(sql`update id_aliases set canonical_id = ${into} where canonical_id = ${from}`);
      await db.execute(sql`delete from bills where id = ${from}`);
    }
  }
  if (plan.merges.length) await dedupeBillDocuments(db);
}
