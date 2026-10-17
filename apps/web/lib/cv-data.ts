import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

/**
 * The CV a member filed with the Chamber, as the member page shows it (D-050): the entries as filed, each with its check against our own records where there is one.
 * A check that says "matches" is shown at once; one that says "differs" only after the owner has reviewed it (`reviewed_on`), so an unreviewed difference looks like
 * any unchecked entry. The text is the member's, not ours.
 */
export type CvSectionName = "experience" | "education" | "political";
export interface CvCheckView { status: "matches" | "differs"; reason: string; records: Array<{ kind: string; label: string; from?: string; to?: string }>; note?: string }
export interface CvEntryView {
  id: string;
  section: CvSectionName;
  /** The entry's lines as filed, without a first line that is only the date. */
  lines: string[];
  datesText?: string;
  startsOn?: string;
  endsOn?: string;
  isCurrent: boolean;
  /** The role or the first words of the entry, for a timeline. */
  title: string;
  check: CvCheckView | null;
}
export interface MemberCvView {
  sourceUrl: string;
  updatedOn?: string;
  sections: Record<CvSectionName, CvEntryView[]>;
  count: number;
}

type Row = {
  id: string; section: CvSectionName; raw_text: string; dates_text: string | null; starts_on: string | null; ends_on: string | null; is_current: boolean; source_url: string; cv_updated_on: string | null;
  check_status: string; check_reason: string | null; check_records: CvCheckView["records"]; reviewed_on: string | null; review_note: string | null;
};

const stripDates = (line: string, datesText?: string) => (datesText ? line.replace(datesText, "") : line).replace(/^[\s,;:()\-–—]+|[\s,;:()\-–—]+$/g, "").trim();

/** The lines of an entry with the date line taken out when the line is only the date, and a title from the first line that has words. */
export function presentCvEntry(row: Pick<Row, "raw_text" | "dates_text">): { lines: string[]; title: string } {
  const all = row.raw_text.split("\n").map((line) => line.trim()).filter(Boolean);
  // The first line is only the date, or starts with it ("Din 2013 Președinte al ..."): the date is shown beside the entry, so it is not repeated in the text.
  const lines = all.flatMap((line, index) => {
    if (index !== 0 || !row.dates_text) return [line];
    const rest = stripDates(line, row.dates_text);
    return rest === "" ? [] : line.startsWith(row.dates_text) ? [rest] : [line];
  });
  const first = lines.find((line) => /\p{L}{3}/u.test(stripDates(line, row.dates_text ?? undefined))) ?? lines[0] ?? "";
  const title = stripDates(first, row.dates_text ?? undefined);
  return { lines: lines.length ? lines : all, title: title.length > 110 ? `${title.slice(0, 109).trimEnd()}…` : title };
}

async function getMemberCvUncached(personId: string): Promise<MemberCvView | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<Row>(sql`
      select id, section, raw_text, dates_text, starts_on::text as starts_on, ends_on::text as ends_on, is_current, source_url, cv_updated_on::text as cv_updated_on,
             check_status, check_reason, check_records, reviewed_on::text as reviewed_on, review_note
      from member_cv_entries where person_id = ${personId} order by section, position`))];
    if (rows.length === 0) return undefined;
    const sections: MemberCvView["sections"] = { experience: [], education: [], political: [] };
    for (const row of rows) {
      const { lines, title } = presentCvEntry(row);
      const shown = row.check_status === "matches" || (row.check_status === "differs" && row.reviewed_on);
      sections[row.section].push({
        id: row.id, section: row.section, lines, title, isCurrent: row.is_current,
        ...(row.dates_text ? { datesText: row.dates_text } : {}), ...(row.starts_on ? { startsOn: row.starts_on } : {}), ...(row.ends_on ? { endsOn: row.ends_on } : {}),
        check: shown ? { status: row.check_status as "matches" | "differs", reason: row.check_reason ?? "", records: row.check_records, ...(row.review_note ? { note: row.review_note } : {}) } : null
      });
    }
    return { sourceUrl: rows[0]!.source_url, ...(rows[0]!.cv_updated_on ? { updatedOn: rows[0]!.cv_updated_on } : {}), sections, count: rows.length };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

const getCachedMemberCv = unstable_cache((personId: string) => timed(`data.member-cv.${personId}`, () => getMemberCvUncached(personId)), ["member-cv-v1"], { revalidate: 900, tags: [CACHE_TAGS.members] });

export async function getMemberCv(personId: string | undefined): Promise<MemberCvView | undefined> {
  return personId ? getCachedMemberCv(personId) : undefined;
}
