import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";
import { countyLabel, foldKey } from "./text";

export interface CountyOption {
  /** The value used in the address: "arges", "bistrita-nasaud", "diaspora". */
  key: string;
  label: string;
  deputies: number;
  senators: number;
}

/** Every constituency that has a sitting member in the newest legislature, with its seats. Complete for all 464 sitting members (checked 6 Oct 2026). */
async function countyOptionsUncached(locale: "ro" | "en"): Promise<CountyOption[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ constituency: string; deputies: number; senators: number }>(sql`
      select constituency,
        (count(*) filter (where chamber = 'deputies'))::int as deputies,
        (count(*) filter (where chamber = 'senate'))::int as senators
      from member_mandates
      where ends_on is null and constituency is not null and btrim(constituency) <> ''
        and legislature_id = (select id from legislatures order by starts_on desc limit 1)
      group by constituency`))];
    const plain = rows.filter((row) => foldKey(row.constituency) !== "la nivel national" && foldKey(row.constituency) !== "diaspora");
    const special = rows.filter((row) => !plain.includes(row));
    const toOption = (row: (typeof rows)[number]): CountyOption => ({ key: foldKey(row.constituency), label: countyLabel(row.constituency, locale), deputies: row.deputies, senators: row.senators });
    return [...plain.map(toOption).sort((a, b) => a.label.localeCompare(b.label, "ro")), ...special.map(toOption).sort((a, b) => a.label.localeCompare(b.label, "ro"))];
  } finally {
    await session.close();
  }
}

export const getCountyOptions = unstable_cache(
  async (locale: "ro" | "en") => timed("data.county-options", () => countyOptionsUncached(locale)),
  ["county-options-v1"],
  { revalidate: 3600, tags: [CACHE_TAGS.members] }
);

export type ChangeKind = "outcome" | "stage" | "law";

export interface RecentChange {
  id: string;
  kind: ChangeKind;
  billSlug: string;
  billTitle: string;
  oldValue?: string;
  newValue: string;
  recordedAt: string;
  sourceUrl?: string;
}

const OUTCOME_WORDS: Record<"ro" | "en", Record<string, string>> = {
  ro: { promulgated: "Promulgată", rejected: "Respinsă", withdrawn: "Retrasă de inițiator", archived: "Clasată", ended: "Procedură încetată" },
  en: { promulgated: "Promulgated", rejected: "Rejected", withdrawn: "Withdrawn by the initiator", archived: "Filed away", ended: "Procedure ended" }
};

/**
 * What changed on the bills we follow, from the revisions the updater records on every run (D-027): a bill's fate, its stage and its law number.
 * Only changes to a real value count: a field that became empty is a gap in a source page, not news. Empty until the first changes are recorded (6 Oct 2026).
 */
async function recentChangesUncached(locale: "ro" | "en", limit: number): Promise<RecentChange[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<{ id: string; field: string; old_value: string | null; new_value: string | null; source_url: string | null; recorded_at: string; slug: string; title: string }>(sql`
      select r.id, r.field, r.old_value, r.new_value, r.source_url, r.recorded_at::text, b.slug, b.title
      from data_revisions r join bills b on b.id = r.entity_id
      where r.entity_type = 'bill' and r.field in ('outcome', 'stage', 'lawNumber')
        and btrim(coalesce(r.new_value, '')) <> '' and r.new_value <> 'in_progress'
        and r.recorded_at >= now() - interval '45 days'
      order by r.recorded_at desc
      limit ${limit * 3}`))];
    const changes: RecentChange[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const kind: ChangeKind = row.field === "outcome" ? "outcome" : row.field === "lawNumber" ? "law" : "stage";
      const key = `${row.slug}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const newValue = kind === "outcome" ? OUTCOME_WORDS[locale][row.new_value!] ?? row.new_value! : row.new_value!;
      const oldValue = row.old_value && kind === "outcome" ? OUTCOME_WORDS[locale][row.old_value] : row.old_value ?? undefined;
      changes.push({ id: row.id, kind, billSlug: row.slug, billTitle: row.title, oldValue: oldValue || undefined, newValue, recordedAt: row.recorded_at, sourceUrl: row.source_url ?? undefined });
      if (changes.length >= limit) break;
    }
    return changes;
  } finally {
    await session.close();
  }
}

export const getRecentChanges = unstable_cache(
  async (locale: "ro" | "en", limit: number) => timed("data.recent-changes", () => recentChangesUncached(locale, limit)),
  ["recent-changes-v1"],
  { revalidate: 900, tags: [CACHE_TAGS.bills, CACHE_TAGS.coverage] }
);
