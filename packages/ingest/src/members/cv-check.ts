import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { foldRo, withoutDates, type DatePrecision } from "./cv-parse";

/**
 * D-050: what a member says in the CV, checked against what we hold ourselves. Only claims we can compare are checked; everything else stays `unchecked`
 * (nothing is "unverified because false"). The rules are deliberately lenient about precision and strict about reach:
 *
 *  - A CV that says "Deputat 2016 - 2024" is consistent with our mandates when every day the claim certainly covers (from the latest day it could have started
 *    to the earliest day it could have ended, given how precisely it is written) falls inside our mandates of that chamber, gaps of a month or less ignored.
 *    A claim for part of a longer stay is consistent (a member may list one term).
 *  - It is a difference when a day the claim certainly covers has no mandate of ours (the CV reaches further back, or further on, than the record), or when the CV
 *    says "prezent" and our latest mandate has ended.
 *  - A claim whose dates are too coarse to leave a certain period (both ends in the same year) is not checked.
 *
 * A difference is a flag for the owner to look at, not a finding: our record can be the wrong one. It is shown on the site only after the owner has reviewed it.
 * Claims of a ministry are only ever confirmed (our government roles do not cover every cabinet, so their absence proves nothing).
 */

export type CheckStatus = "unchecked" | "matches" | "differs";
export interface CheckRecord { kind: "mandate" | "government"; label: string; from?: string; to?: string }
export interface CheckResult { status: CheckStatus; reason: string; records: CheckRecord[] }
export interface Span { chamber?: "deputies" | "senate"; from: string; to: string; label: string; kind: "mandate" | "government" }
export interface ClaimInput {
  section: "experience" | "education" | "political"; lines: string[]; starts?: { date: string; precision: DatePrecision }; ends?: { date: string; precision: DatePrecision }; isCurrent: boolean;
  /** The day the CV was filed or last updated: "prezent" in a CV means that day, not today. */
  asOf?: string;
}

const DAY = 86_400_000;
const TOLERANCE_DAYS = 31;
const dayNumber = (iso: string) => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY);
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The first and the last day a date written with this precision can mean. */
export function dateWindow(date: string, precision: DatePrecision): [number, number] {
  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
  if (precision === "year") return [dayNumber(`${year}-01-01`), dayNumber(`${year}-12-31`)];
  if (precision === "month") return [dayNumber(`${year}-${String(month).padStart(2, "0")}-01`), dayNumber(`${year}-${String(month).padStart(2, "0")}-${lastDayOfMonth(year, month)}`)];
  return [dayNumber(date), dayNumber(date)];
}

export type ClaimKind = "deputies" | "senate" | "government";

/** What an entry claims, if it is something we can compare: the role is read from the first line that is not the date. */
export function claimKind(entry: Pick<ClaimInput, "section" | "lines">): ClaimKind | undefined {
  if (entry.section === "education") return undefined;
  const text = foldRo(entry.lines.join(" "));
  // Another parliament, a church assembly, a local council: not a seat in Romania's Parliament, so nothing of ours to compare it with.
  if (/parlamentul european|europarlamentar|parlamentar european|republicii moldova|republica moldova|eparhial|consiliului? (local|judetean)/.test(text)) return undefined;
  const role = entry.lines.map(withoutDates).find((line) => line.length > 2) ?? "";
  if (/^(viceprim-?ministru|prim-?ministru|ministru|ministrul|ministra)\b/.test(role)) return "government";
  if (/^(deputat|deputata|deputatul)\b/.test(role)) return "deputies";
  if (/^(senator|senatoare|senatorul)\b/.test(role)) return "senate";
  return undefined;
}

/** Days of [from, to] not covered by the spans (spans in day numbers). */
function uncoveredDays(from: number, to: number, spans: Array<[number, number]>): number {
  if (to < from) return 0;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let cursor = from;
  let uncovered = 0;
  for (const [start, end] of sorted) {
    if (end < cursor) continue;
    if (start > to) break;
    if (start > cursor) uncovered += start - cursor;
    cursor = Math.max(cursor, end + 1);
    if (cursor > to) break;
  }
  if (cursor <= to) uncovered += to - cursor + 1;
  return uncovered;
}

export function checkClaim(entry: ClaimInput, spans: Span[], today: string): CheckResult {
  const kind = claimKind(entry);
  if (!kind) return { status: "unchecked", reason: "no_comparable_claim", records: [] };
  if (!entry.starts) return { status: "unchecked", reason: "no_dates", records: [] };
  // "prezent" is the day the CV was written (its update date, or the day we read it), not the day of the check.
  const todayDay = dayNumber(entry.asOf && entry.asOf < today ? entry.asOf : today);
  const [, startLatest] = dateWindow(entry.starts.date, entry.starts.precision);
  let endEarliest: number;
  if (entry.isCurrent) endEarliest = todayDay;
  else if (entry.ends) endEarliest = dateWindow(entry.ends.date, entry.ends.precision)[0];
  else return { status: "unchecked", reason: "no_end", records: [] };
  if (endEarliest < startLatest) return { status: "unchecked", reason: "too_coarse", records: [] };

  const relevant = spans.filter((span) => (kind === "government" ? span.kind === "government" : span.kind === "mandate" && span.chamber === kind));
  const records = relevant.map(({ kind: recordKind, label, from, to }): CheckRecord => ({ kind: recordKind, label, from, to }));
  const numbers = relevant.map((span): [number, number] => [dayNumber(span.from), dayNumber(span.to)]);

  if (kind === "government") {
    // Only a confirmation: a period with a minister's role of ours that the claim's certain days overlap by at least half.
    const certain = endEarliest - startLatest + 1;
    const overlap = certain - uncoveredDays(startLatest, endEarliest, numbers);
    return overlap >= certain / 2 ? { status: "matches", reason: "role_overlaps", records } : { status: "unchecked", reason: "no_government_record", records: [] };
  }
  const gap = uncoveredDays(startLatest, endEarliest, numbers);
  if (gap <= TOLERANCE_DAYS) return { status: "matches", reason: "covered", records };
  if (entry.isCurrent && numbers.every(([, end]) => end < todayDay - TOLERANCE_DAYS)) return { status: "differs", reason: "not_current", records };
  return { status: "differs", reason: "not_covered", records };
}

export interface CheckRun {
  persisted: boolean;
  entries: number;
  claims: number;
  matches: number;
  differs: number;
  unchecked: number;
  changed: number;
  differences: Array<{ id: string; person: string; section: string; text: string; reason: string }>;
}

/** Checks the CV entries of every person we hold CV entries for and, with `persist`, writes the result. A reviewed check keeps its review only while its status stays the same. */
export async function checkCvEntries(db: DbClient, options: { persist: boolean; today?: string }): Promise<CheckRun> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const entries = [...(await db.execute<{ id: string; person_id: string; name: string; section: "experience" | "education" | "political"; raw_text: string; starts_on: string | null; starts_on_precision: DatePrecision | null; ends_on: string | null; ends_on_precision: DatePrecision | null; is_current: boolean; check_status: CheckStatus; check_reason: string | null; as_of: string }>(sql`
    select e.id, e.person_id, p.display_name as name, e.section, e.raw_text, e.starts_on::text as starts_on, e.starts_on_precision, e.ends_on::text as ends_on, e.ends_on_precision, e.is_current, e.check_status, e.check_reason, coalesce(e.cv_updated_on, e.read_at::date)::text as as_of
    from member_cv_entries e join people p on p.id = e.person_id order by e.person_id, e.section, e.position`))];
  const personIds = [...new Set(entries.map((entry) => entry.person_id))];
  const spansByPerson = new Map<string, Span[]>();
  if (personIds.length) {
    const mandates = await db.execute<{ person_id: string; chamber: "deputies" | "senate"; from: string; to: string | null; status: string; label: string; legislature_end: string | null }>(sql`
      select m.person_id, mm.chamber::text as chamber, mm.starts_on::text as "from", mm.ends_on::text as "to", mm.status, l.label, l.ends_on::text as legislature_end
      from member_mandates mm join members m on m.id = mm.member_id join legislatures l on l.id = mm.legislature_id
      where m.person_id in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})`);
    for (const mandate of mandates) {
      // A mandate with no end date of ours ends with its legislature; an active one runs to today. The past is never extended beyond today.
      const end = mandate.to ?? (mandate.status === "active" ? today : mandate.legislature_end ?? today);
      const span: Span = { chamber: mandate.chamber, from: mandate.from, to: end > today ? today : end, label: `${mandate.chamber === "deputies" ? "Deputat" : "Senator"} · ${mandate.label}`, kind: "mandate" };
      (spansByPerson.get(mandate.person_id) ?? spansByPerson.set(mandate.person_id, []).get(mandate.person_id)!).push(span);
    }
    const roles = await db.execute<{ person_id: string; title: string; from: string; to: string | null; government: string }>(sql`
      select r.person_id, r.title, r.starts_on::text as "from", r.ends_on::text as "to", g.name as government
      from government_roles r join governments g on g.id = r.government_id
      where r.person_id in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)}) and (r.title ilike '%ministr%')`);
    for (const role of roles) {
      const span: Span = { from: role.from, to: role.to ?? today, label: `${role.title} · ${role.government}`, kind: "government" };
      (spansByPerson.get(role.person_id) ?? spansByPerson.set(role.person_id, []).get(role.person_id)!).push(span);
    }
  }

  const run: CheckRun = { persisted: options.persist, entries: entries.length, claims: 0, matches: 0, differs: 0, unchecked: 0, changed: 0, differences: [] };
  for (const entry of entries) {
    const lines = entry.raw_text.split("\n");
    const result = checkClaim({
      section: entry.section, lines, isCurrent: entry.is_current, asOf: entry.as_of,
      ...(entry.starts_on && entry.starts_on_precision ? { starts: { date: entry.starts_on, precision: entry.starts_on_precision } } : {}),
      ...(entry.ends_on && entry.ends_on_precision ? { ends: { date: entry.ends_on, precision: entry.ends_on_precision } } : {})
    }, spansByPerson.get(entry.person_id) ?? [], today);
    if (result.status !== "unchecked") run.claims += 1;
    run[result.status === "matches" ? "matches" : result.status === "differs" ? "differs" : "unchecked"] += 1;
    if (result.status === "differs") run.differences.push({ id: entry.id, person: entry.name, section: entry.section, text: lines.join(" ⏎ ").slice(0, 140), reason: result.reason });
    if (result.status !== entry.check_status || result.reason !== (entry.check_reason ?? "")) run.changed += 1;
    if (options.persist) {
      await db.execute(sql`
        update member_cv_entries set check_status = ${result.status}, check_reason = ${result.reason}, check_records = ${JSON.stringify(result.records)}::jsonb, checked_on = ${today}::date,
          reviewed_on = case when check_status = ${result.status} then reviewed_on else null end
        where id = ${entry.id}`);
    }
  }
  return run;
}
