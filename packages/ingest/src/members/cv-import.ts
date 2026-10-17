import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { decodeOfficialBytes } from "../coverage/raw-cache";
import { parseCv, type CvSection, type ParsedCv } from "./cv-parse";
import { parseSenateBiography } from "./senate-bio-parse";
import { pickSenateCards, senateCardUrl } from "./senate-bio-fetch";
import { cvKey } from "./cv-fetch";
import { readProfilePages } from "./profile-facts";

/**
 * D-050: the CV pages saved by `members:cv:fetch` read into `member_cv_entries`. Nothing is requested; the saved pages are read offline. A person's entries are replaced
 * as a whole when their CV is read again, but an entry whose text did not change keeps its check and its review, and one that changed starts over as unchecked.
 */
export interface ImportCvResult {
  persisted: boolean;
  people: number;
  pagesRead: number;
  pagesWithEntries: number;
  entries: Record<CvSection, number>;
  dated: Record<CvSection, number>;
  droppedContactLines: number;
  pagesWithoutEntries: string[];
  rowsWritten: number;
  rowsDeleted: number;
}

export async function importCvEntries(db: DbClient, options: { repoRoot: string; persist: boolean; log?: (line: string) => void }): Promise<ImportCvResult> {
  const pages = await readProfilePages(options.repoRoot);
  const byKey = new Map(pages.map((page) => [page.profileKey, page]));
  const members = [...(await db.execute<{ person_id: string; key: string }>(sql`
    select m.person_id, m.source_ids->>'cdepProfileKey' as key from members m where m.person_id is not null and m.source_ids ? 'cdepProfileKey'`))];

  // One CV per person: the latest legislature's, as members:cv:fetch saved it.
  const latest = new Map<string, { key: string; url: string }>();
  for (const member of members) {
    const page = byKey.get(member.key);
    if (!page?.cvUrl) continue;
    const previous = latest.get(member.person_id);
    if (!previous || member.key > previous.key) latest.set(member.person_id, { key: member.key, url: page.cvUrl });
  }
  // A sitting senator's own biography (the Senate's card, members:senate-bio:fetch) stands in for a CV the Chamber does not hold: the Chamber's CV, where there is one, wins.
  const seats = [...(await db.execute<{ person_id: string; guid: string; key: string }>(sql`
    select m.person_id, m.source_ids->>'senatRoGuid' as guid, coalesce(m.source_ids->>'cdepProfileKey', m.id) as key from members m where m.person_id is not null and m.source_ids ? 'senatRoGuid'`))];
  const savedCards = new Set((await readdir(path.join(options.repoRoot, "data/coverage/raw/senate-bio")).catch(() => [] as string[])).filter((name) => name.endsWith(".html")).map((name) => name.slice(0, -5)));
  const biography = new Map<string, { guid: string; url: string }>();
  for (const [personId, guid] of pickSenateCards(seats.map((seat) => ({ personId: seat.person_id, guid: seat.guid, key: seat.key })), savedCards)) if (!latest.has(personId)) biography.set(personId, { guid, url: senateCardUrl(guid) });

  const result: ImportCvResult = {
    persisted: options.persist, people: 0, pagesRead: 0, pagesWithEntries: 0,
    entries: { experience: 0, education: 0, political: 0 }, dated: { experience: 0, education: 0, political: 0 },
    droppedContactLines: 0, pagesWithoutEntries: [], rowsWritten: 0, rowsDeleted: 0
  };
  const cvDir = path.join(options.repoRoot, "data/coverage/raw/member-cv");
  const readAt = new Date();
  const rows: Array<typeof schema.memberCvEntries.$inferInsert> = [];
  const persons = new Set<string>();
  const sources: Array<{ personId: string; key: string; url: string; file: string; parse: (html: string) => ParsedCv }> = [
    ...[...latest].map(([personId, cv]) => ({ personId, key: cv.key, url: cv.url, file: path.join(cvDir, `${cvKey(cv.key)}.html`), parse: parseCv })),
    ...[...biography].map(([personId, bio]) => ({ personId, key: `senate:${bio.guid}`, url: bio.url, file: path.join(options.repoRoot, "data/coverage/raw/senate-bio", `${bio.guid}.html`), parse: parseSenateBiography }))
  ];
  for (const { personId, key, url, file, parse } of sources) {
    const cv = { key, url };
    let html: string;
    try {
      html = decodeOfficialBytes(await readFile(file));
    } catch {
      continue;
    }
    result.pagesRead += 1;
    const parsed = parse(html);
    result.droppedContactLines += parsed.droppedContactLines;
    if (!parsed.entries.length) { result.pagesWithoutEntries.push(cv.key); continue; }
    result.pagesWithEntries += 1;
    persons.add(personId);
    for (const entry of parsed.entries) {
      result.entries[entry.section] += 1;
      if (entry.starts) result.dated[entry.section] += 1;
      rows.push({
        id: `cv-${personId}-${entry.section}-${entry.position}`, personId, section: entry.section, position: entry.position, rawText: entry.rawText,
        datesText: entry.datesText ?? null,
        startsOn: entry.starts?.date ?? null, startsOnPrecision: entry.starts?.precision ?? null,
        endsOn: entry.ends?.date ?? null, endsOnPrecision: entry.ends?.precision ?? null,
        isCurrent: entry.isCurrent, sourceUrl: cv.url, cvUpdatedOn: parsed.updatedOn ?? null, contentHash: entry.contentHash, readAt
      });
    }
  }
  result.people = persons.size;
  if (!options.persist) return result;

  // Replace each person's entries: upsert by (person, section, position); an unchanged entry keeps its check and review, a changed one starts over.
  const keep = new Set(rows.map((row) => row.id));
  const existing = [...(await db.execute<{ id: string; person_id: string }>(sql`select id, person_id from member_cv_entries`))];
  const stale = existing.filter((row) => persons.has(row.person_id) && !keep.has(row.id)).map((row) => row.id);
  for (let start = 0; start < rows.length; start += 200) {
    const chunk = rows.slice(start, start + 200);
    await db.insert(schema.memberCvEntries).values(chunk).onConflictDoUpdate({
      target: schema.memberCvEntries.id,
      set: {
        rawText: sql`excluded.raw_text`, datesText: sql`excluded.dates_text`, startsOn: sql`excluded.starts_on`, startsOnPrecision: sql`excluded.starts_on_precision`,
        endsOn: sql`excluded.ends_on`, endsOnPrecision: sql`excluded.ends_on_precision`, isCurrent: sql`excluded.is_current`, sourceUrl: sql`excluded.source_url`,
        cvUpdatedOn: sql`excluded.cv_updated_on`, readAt: sql`excluded.read_at`,
        checkStatus: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.check_status else 'unchecked' end`,
        checkReason: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.check_reason else null end`,
        checkRecords: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.check_records else '[]'::jsonb end`,
        checkedOn: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.checked_on else null end`,
        reviewedOn: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.reviewed_on else null end`,
        reviewNote: sql`case when member_cv_entries.content_hash = excluded.content_hash then member_cv_entries.review_note else null end`,
        contentHash: sql`excluded.content_hash`
      }
    });
    result.rowsWritten += chunk.length;
  }
  for (let start = 0; start < stale.length; start += 200) {
    const chunk = stale.slice(start, start + 200);
    await db.execute(sql`delete from member_cv_entries where id in (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})`);
    result.rowsDeleted += chunk.length;
  }
  options.log?.(`CV entries: ${result.rowsWritten} written, ${result.rowsDeleted} removed`);
  return result;
}

export const CV_SECTIONS: readonly CvSection[] = ["experience", "education", "political"];
