import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import * as cheerio from "cheerio";
import { decodeOfficialBytes } from "../coverage/raw-cache";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";

/**
 * Sprint 13a (D-036): two facts the Chamber's profile pages already print and the importer used to leave on the floor.
 *
 *  - The header of every profile ("Cauta Mirela Elena Adomnicăi n. 15 aug. 1970") gives the person's date of birth, for deputies and for senators alike.
 *    The Senate's own card keeps the date and the place in a commented-out block, which its page does not show, so we do not read it.
 *  - The 2024 profiles of deputies end with "Activitatea parlamentara în cifre": speeches, initiatives, questions and interpellations, motions.
 *    A line the page does not print is not zero; it is left out.
 *
 * Everything here reads the profile pages already saved under data/cdep-history/raw; nothing is requested.
 */

const MONTHS: Record<string, number> = { ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6, iul: 7, aug: 8, sep: 9, oct: 10, noi: 11, nov: 11, dec: 12 };

export interface HeaderBirth {
  /** ISO date. */
  date: string;
  /** As the page prints it: "15 aug. 1970". */
  raw: string;
}

export interface OfficialCount {
  metric: "speeches" | "political_declarations" | "initiatives" | "questions_and_interpellations" | "motions_signed";
  value: number;
  /** Speeches: the number of sittings. */
  outOf?: number;
  /** Initiatives: how many became law. */
  detail?: number;
}

/**
 * The visible text of a saved page, entities decoded and white space collapsed. Every tag becomes a space (the header prints the name and the date in separate
 * elements; joining them would glue "Adomnicăi" to "n. 15 aug.").
 */
export function pageText(html: string): string {
  const stripped = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ");
  return cheerio.load(`<p>${stripped.replace(/</g, "&lt;")}</p>`).text().replace(/\s+/g, " ").trim();
}

/**
 * The date after the name in the page header. Only the first 220 characters after the search box ("Cauta") are read, so a date inside a CV or an article can never be taken for it.
 * An impossible date (31 February) or an implausible year is not returned.
 */
export function parseHeaderBirth(text: string): HeaderBirth | undefined {
  const start = text.indexOf("Cauta ");
  const head = start >= 0 ? text.slice(start, start + 220) : text.slice(0, 400);
  const match = /\sn\.\s*(\d{1,2})\s+([A-Za-zăâîșşțţ]{3,5})\.?\s+(\d{4})(?!\d)/.exec(head);
  if (!match) return undefined;
  const month = MONTHS[match[2]!.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")];
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (!month || year < 1900 || year > 2010) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, raw: `${match[1]} ${match[2]}${match[2]!.endsWith(".") || match[2]!.toLowerCase() === "mai" ? "" : "."} ${match[3]}` };
}

/** The "Activitatea parlamentara în cifre" block of a deputy's page; undefined when the page has none. */
export function parseDeputyCounts(text: string): OfficialCount[] | undefined {
  const start = text.indexOf("Activitatea parlamentara în cifre");
  if (start < 0) return undefined;
  const segment = text.slice(start, start + 700).split(/Biroul parlamentar|Adresa postala/)[0]!.normalize("NFD").replace(/\p{M}/gu, "");
  const counts: OfficialCount[] = [];
  const speeches = /Luari de cuvant:\s*(\d+)(?:\s*\(\s*in\s*(\d+)\s*sedint\w*\s*\))?/i.exec(segment);
  if (speeches) counts.push({ metric: "speeches", value: Number(speeches[1]), ...(speeches[2] ? { outOf: Number(speeches[2]) } : {}) });
  const declarations = /din care declaratii politice:\s*(\d+)/i.exec(segment);
  if (declarations) counts.push({ metric: "political_declarations", value: Number(declarations[1]) });
  const initiatives = /Propuneri legislative initiate:\s*(\d+)(?:\s*,?\s*din care\s*(\d+)\s*promulgat\w*)?/i.exec(segment);
  if (initiatives) counts.push({ metric: "initiatives", value: Number(initiatives[1]), ...(initiatives[2] ? { detail: Number(initiatives[2]) } : {}) });
  const questions = /Intrebari si interpelari:\s*(\d+)/i.exec(segment);
  if (questions) counts.push({ metric: "questions_and_interpellations", value: Number(questions[1]) });
  const motions = /Motiuni:\s*(\d+)/i.exec(segment);
  if (motions) counts.push({ metric: "motions_signed", value: Number(motions[1]) });
  return counts;
}

/**
 * "Data actualizare: 22.02.2021" on a CV page: when the member last updated the CV they filed. Nothing else of the CV is read (D-036): its layouts vary, and it carries
 * contact details and family data that are never stored.
 */
export function parseCvUpdatedOn(text: string): string | undefined {
  const match = /Data actualiz[aă]re:?\s*(\d{2})\.(\d{2})\.(\d{4})/i.exec(text);
  if (!match) return undefined;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  if (year < 2000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export interface ProfileBody {
  kind: "delegation" | "friendship_group";
  /** The Chamber's number of the body (`idg`). */
  officialId: string;
  name: string;
  /** "Vicepreşedinte", "supleant", ...; absent for a plain member. */
  role?: string;
  /** The body's own page. */
  url: string;
}

/**
 * The delegations to international parliamentary organisations and the friendship groups with other parliaments a profile lists
 * (`structura.dp?idg=19` and `structura.pr?idg=73`), each with the role printed after it.
 */
export function parseProfileBodies(html: string, profileUrl: string): ProfileBody[] {
  const $ = cheerio.load(html);
  const bodies: ProfileBody[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = ($(element).attr("href") ?? "").replace(/&amp;/g, "&");
    const match = /structura\.(dp|pr)\?idg=(\d+)/.exec(href);
    if (!match) return;
    const kind = match[1] === "dp" ? "delegation" as const : "friendship_group" as const;
    const key = `${kind}:${match[2]}`;
    const name = $(element).text().replace(/\s+/g, " ").trim();
    if (!name || seen.has(key)) return;
    seen.add(key);
    // The row is [flag], link, spacer, [spacer image], role: the role is the last cell when it is not the link's own.
    const cells = $(element).closest("tr").children("td");
    const last = cells.last();
    const role = last.find("a").length === 0 ? last.text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : "";
    let url: string;
    try {
      url = new URL(href, profileUrl).toString();
    } catch {
      return;
    }
    bodies.push({ kind, officialId: match[2]!, name, ...(role ? { role } : {}), url });
  });
  return bodies;
}

/** `leg2024:cam2:idm1` from a profile address; undefined for the other pages of a profile (CV, initiatives, ...), which carry `pag=`. */
export function profileKeyFromUrl(url: string): string | undefined {
  if (!/structura\.mp\?/.test(url) || /[?&]pag=/.test(url)) return undefined;
  const leg = /[?&]leg=(\d{4})/.exec(url)?.[1];
  const cam = /[?&]cam=(\d)/.exec(url)?.[1];
  const idm = /[?&]idm=(\d+)/.exec(url)?.[1];
  return leg && cam && idm ? `leg${leg}:cam${cam}:idm${idm}` : undefined;
}

export interface ProfilePageFacts {
  profileKey: string;
  url: string;
  fetchedAt: string;
  birth?: HeaderBirth;
  counts?: OfficialCount[];
  bodies?: ProfileBody[];
  /** The page's own "Curriculum Vitae" address (`...&pag=0`), when the profile links one. */
  cvUrl?: string;
}

/** The address of the CV page a profile links, as the Chamber's site serves it (the bare host answers HTTP 500, so `www.`). */
export function cvUrlFromProfile(html: string, profileUrl: string): string | undefined {
  const match = /href="([^"]*structura\.mp\?[^"]*[?&;]pag=0(?:&[^"]*)?)"/i.exec(html) ?? /href="([^"]*structura\.mp\?pag=0[^"]*)"/i.exec(html);
  if (!match) return undefined;
  try {
    const url = new URL(match[1]!.replace(/&amp;/g, "&"), profileUrl);
    if (url.hostname === "cdep.ro") url.hostname = "www.cdep.ro";
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Every saved profile page, newest copy of each address. */
export async function readProfilePages(repoRoot: string, onlyLegislature?: string): Promise<ProfilePageFacts[]> {
  const dir = path.join(repoRoot, "data/cdep-history/raw");
  const newest = new Map<string, { url: string; fetchedAt: string; file: string }>();
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json")) continue;
    const meta = JSON.parse(await readFile(path.join(dir, name), "utf8")) as { url?: string; fetchedAt?: string; status?: number };
    if (!meta.url || meta.status !== 200) continue;
    const key = profileKeyFromUrl(meta.url);
    if (!key || (onlyLegislature && !key.startsWith(`leg${onlyLegislature}:`))) continue;
    const previous = newest.get(key);
    if (!previous || (meta.fetchedAt ?? "") > previous.fetchedAt) newest.set(key, { url: meta.url, fetchedAt: meta.fetchedAt ?? "", file: path.join(dir, name.replace(/\.json$/, ".html")) });
  }
  const pages: ProfilePageFacts[] = [];
  for (const [profileKey, entry] of newest) {
    let html: string;
    try {
      html = await readFile(entry.file, "utf8");
    } catch {
      continue;
    }
    const text = pageText(html);
    const birth = parseHeaderBirth(text);
    const counts = parseDeputyCounts(text);
    const cvUrl = cvUrlFromProfile(html, entry.url);
    const bodies = profileKey.startsWith("leg2024:") ? parseProfileBodies(html, entry.url) : [];
    pages.push({ profileKey, url: entry.url, fetchedAt: entry.fetchedAt, ...(birth ? { birth } : {}), ...(counts ? { counts } : {}), ...(bodies.length ? { bodies } : {}), ...(cvUrl ? { cvUrl } : {}) });
  }
  return pages;
}

export interface BirthDisagreement {
  person: string;
  dates: Array<{ date: string; profiles: string[] }>;
}

export interface ImportProfileFactsResult {
  persisted: boolean;
  pagesRead: number;
  pagesWithBirth: number;
  people: number;
  peopleWithBirth: number;
  peopleWithCv: number;
  sittingWithCv: number;
  sittingMembers: number;
  sittingWithBirth: number;
  sittingWithoutBirth: string[];
  disagreements: BirthDisagreement[];
  countRows: number;
  deputiesWithCounts: number;
  bodyRows: number;
  membersWithBodies: number;
  birthWritten: number;
  countsWritten: number;
  bodiesWritten: number;
}

/**
 * Writes `person_biographies` (date of birth, with the page it comes from) and the deputies' published counts to `member_official_activity` (as published, never recomputed).
 * A person with profiles in several legislatures gets the date only when every profile that prints one agrees; a disagreement is listed and nothing is written for that person.
 */
export async function importProfileFacts(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportProfileFactsResult> {
  const pages = await readProfilePages(options.repoRoot);
  const byKey = new Map(pages.map((page) => [page.profileKey, page]));
  const members = [...(await db.execute<{ id: string; person_id: string; key: string; name: string }>(sql`
    select m.id, m.person_id, m.source_ids->>'cdepProfileKey' as key, m.display_name as name from members m where m.person_id is not null and m.source_ids ? 'cdepProfileKey'`))];
  const sitting = new Set([...(await db.execute<{ person_id: string }>(sql`
    select distinct m.person_id from members m join member_mandates mm on mm.member_id = m.id where m.person_id is not null and mm.ends_on is null and mm.status = 'active'`))].map((row) => row.person_id));

  const perPerson = new Map<string, Map<string, { profiles: string[]; urls: string[] }>>();
  const names = new Map<string, string>();
  for (const member of members) {
    names.set(member.person_id, member.name);
    const page = byKey.get(member.key);
    if (!page?.birth) continue;
    const dates = perPerson.get(member.person_id) ?? new Map();
    const entry = dates.get(page.birth.date) ?? { profiles: [], urls: [] };
    entry.profiles.push(member.key);
    entry.urls.push(page.url);
    dates.set(page.birth.date, entry);
    perPerson.set(member.person_id, dates);
  }

  const people = new Set(members.map((member) => member.person_id));
  const disagreements: BirthDisagreement[] = [];
  const births: Array<typeof schema.personBiographies.$inferInsert> = [];
  const readAt = new Date();
  for (const [person, dates] of perPerson) {
    if (dates.size > 1) {
      disagreements.push({ person: `${person} (${names.get(person)})`, dates: [...dates].map(([date, entry]) => ({ date, profiles: entry.profiles })) });
      continue;
    }
    const [date, entry] = [...dates][0]!;
    // The most recent legislature's page is the one linked: the latest key sorts last (`leg2024` after `leg2020`).
    const latest = entry.profiles.map((key, index) => ({ key, url: entry.urls[index]! })).sort((a, b) => a.key.localeCompare(b.key)).at(-1)!;
    births.push({ personId: person, birthDate: date, birthDateSourceUrl: latest.url, readAt });
  }
  const withBirth = new Set(births.map((row) => row.personId));

  // The CV page each person filed (saved by members:cv:fetch): its address and the date the member last updated it.
  const cvDir = path.join(options.repoRoot, "data/coverage/raw/member-cv");
  const cvByPerson = new Map<string, { key: string; url: string; updatedOn?: string }>();
  for (const member of members) {
    const page = byKey.get(member.key);
    if (!page?.cvUrl) continue;
    let html: string;
    try {
      html = decodeOfficialBytes(await readFile(path.join(cvDir, `${member.key.replace(/:/g, "-")}.html`)));
    } catch {
      continue;
    }
    const updatedOn = parseCvUpdatedOn(pageText(html));
    const previous = cvByPerson.get(member.person_id);
    if (!previous || member.key > previous.key) cvByPerson.set(member.person_id, { key: member.key, url: page.cvUrl, ...(updatedOn ? { updatedOn } : {}) });
  }
  const biographies = new Map<string, typeof schema.personBiographies.$inferInsert>(births.map((row) => [row.personId, { ...row, cvUrl: null, cvUpdatedOn: null }]));
  for (const [person, cv] of cvByPerson) {
    const row = biographies.get(person) ?? { personId: person, birthDate: null, birthDateSourceUrl: null, readAt };
    biographies.set(person, { ...row, cvUrl: cv.url, cvUpdatedOn: cv.updatedOn ?? null });
  }
  const sittingList = [...sitting];
  const sittingWithoutBirth = sittingList.filter((person) => !withBirth.has(person)).map((person) => names.get(person) ?? person).sort();

  // Official counts: deputies of the current legislature only (that is where the block exists).
  const legislature = [...(await db.execute<{ id: string }>(sql`select id from legislatures order by starts_on desc limit 1`))][0]!.id;
  const activity: Array<typeof schema.memberOfficialActivity.$inferInsert> = [];
  const countedMembers = new Set<string>();
  for (const member of members) {
    if (!member.key.startsWith("leg2024:cam2:")) continue;
    const page = byKey.get(member.key);
    if (!page?.counts?.length) continue;
    const asOf = page.fetchedAt.slice(0, 10);
    for (const count of page.counts) {
      activity.push({ id: `activity-${member.id}-${legislature}-${count.metric}`, memberId: member.id, legislatureId: legislature, chamber: "deputies", metric: count.metric, value: count.value, outOf: count.outOf ?? null, detail: count.detail ?? null, asOf, sourceUrl: page.url, sourceSnapshotId: null });
    }
    countedMembers.add(member.id);
  }

  // Delegations and friendship groups of the current legislature's members (deputies and senators): replaced as a whole for every member whose page was read.
  const bodyRows: Array<typeof schema.memberInternationalBodies.$inferInsert> = [];
  const bodyMembers = new Set<string>();
  for (const member of members) {
    if (!member.key.startsWith("leg2024:")) continue;
    const page = byKey.get(member.key);
    if (!page) continue;
    bodyMembers.add(member.id);
    const asOf = page.fetchedAt.slice(0, 10);
    for (const body of page.bodies ?? []) {
      bodyRows.push({ id: `body-${member.id}-${body.kind}-${body.officialId}`, memberId: member.id, legislatureId: legislature, kind: body.kind, officialId: body.officialId, name: body.name, role: body.role ?? null, bodyUrl: body.url, sourceUrl: page.url, asOf });
    }
  }

  const result: ImportProfileFactsResult = {
    persisted: options.persist,
    pagesRead: pages.length,
    pagesWithBirth: pages.filter((page) => page.birth).length,
    people: people.size,
    peopleWithBirth: births.length,
    peopleWithCv: cvByPerson.size,
    sittingWithCv: sittingList.filter((person) => cvByPerson.has(person)).length,
    sittingMembers: sittingList.length,
    sittingWithBirth: sittingList.filter((person) => withBirth.has(person)).length,
    sittingWithoutBirth,
    disagreements,
    countRows: activity.length,
    deputiesWithCounts: countedMembers.size,
    bodyRows: bodyRows.length,
    membersWithBodies: new Set(bodyRows.map((row) => row.memberId)).size,
    birthWritten: 0,
    countsWritten: 0,
    bodiesWritten: 0
  };
  if (!options.persist) return result;
  await db.transaction(async (tx) => {
    const rows = [...biographies.values()];
    for (let i = 0; i < rows.length; i += 300) {
      await tx.insert(schema.personBiographies).values(rows.slice(i, i + 300)).onConflictDoUpdate({
        target: schema.personBiographies.personId,
        set: { birthDate: sql`excluded.birth_date`, birthDateSourceUrl: sql`excluded.birth_date_source_url`, cvUrl: sql`excluded.cv_url`, cvUpdatedOn: sql`excluded.cv_updated_on`, readAt: sql`excluded.read_at` }
      });
    }
    // A person who no longer has a date to show (a disagreement found later) must not keep an old one.
    const keep = rows.map((row) => row.personId);
    if (keep.length) await tx.execute(sql`update person_biographies set birth_date = null, birth_date_source_url = null where birth_date is not null and person_id not in (${sql.join(keep.map((id) => sql`${id}`), sql`, `)})`);
    for (let i = 0; i < activity.length; i += 300) {
      await tx.insert(schema.memberOfficialActivity).values(activity.slice(i, i + 300)).onConflictDoUpdate({
        target: [schema.memberOfficialActivity.memberId, schema.memberOfficialActivity.legislatureId, schema.memberOfficialActivity.metric],
        set: { value: sql`excluded.value`, outOf: sql`excluded.out_of`, detail: sql`excluded.detail`, asOf: sql`excluded.as_of`, sourceUrl: sql`excluded.source_url` }
      });
    }
    const read = [...bodyMembers];
    for (let i = 0; i < read.length; i += 300) {
      await tx.execute(sql`delete from member_international_bodies where legislature_id = ${legislature} and member_id in (${sql.join(read.slice(i, i + 300).map((id) => sql`${id}`), sql`, `)})`);
    }
    for (let i = 0; i < bodyRows.length; i += 300) await tx.insert(schema.memberInternationalBodies).values(bodyRows.slice(i, i + 300)).onConflictDoNothing();
  });
  result.birthWritten = births.length;
  result.countsWritten = activity.length;
  result.bodiesWritten = bodyRows.length;
  return result;
}
