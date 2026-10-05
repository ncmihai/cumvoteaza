import type { MemberRole } from "@cumsevoteaza/parliament-model";
import { slugify } from "../parsers/utils";
import type { BureauPeriod, BureauPosition } from "./chamber-bureau";

interface Interval {
  idm: string;
  name: string;
  position: BureauPosition;
  fromMonth: string;
  /** null: still in office at the last period. */
  toMonth: string | null;
  /** The newest period page that lists this stretch of office: the page the role is sourced from. */
  lastPeriod: BureauPeriod;
}

const nextMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number) as [number, number];
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
};

/**
 * One interval per person and position, built from the bureau of each period: a person listed in consecutive
 * periods holds the position without a break, so their intervals are merged. A member who joined or left inside a
 * period ("din dec. 2024", "până în dec. 2024") is dated by that note, not by the period.
 */
export function bureauIntervals(periods: BureauPeriod[]): Interval[] {
  const ordered = [...periods].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  const found: Interval[] = [];
  for (const period of ordered) {
    for (const seat of period.seats) {
      const fromMonth = seat.sinceMonth && seat.sinceMonth > period.fromMonth ? seat.sinceMonth : period.fromMonth;
      const toMonth = seat.untilMonth ?? period.toMonth;
      found.push({ idm: seat.idm, name: seat.name, position: seat.position, fromMonth, toMonth, lastPeriod: period });
    }
  }
  const byKey = new Map<string, Interval[]>();
  for (const interval of found) byKey.set(`${interval.idm}|${interval.position}`, [...(byKey.get(`${interval.idm}|${interval.position}`) ?? []), interval]);
  const merged: Interval[] = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
    let current = { ...group[0]! };
    for (const next of group.slice(1)) {
      // Touching or overlapping (the end month of one period is the start month of the next): the same stretch of office.
      if (current.toMonth === null || next.fromMonth <= nextMonth(current.toMonth)) {
        current.toMonth = current.toMonth === null || next.toMonth === null ? null : next.toMonth > current.toMonth ? next.toMonth : current.toMonth;
        current.lastPeriod = next.lastPeriod;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }
  return merged.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth) || a.position.localeCompare(b.position) || a.name.localeCompare(b.name));
}

const TITLES: Record<BureauPosition, string> = {
  "Președinte": "Președinte al Camerei Deputaților",
  "Vicepreședinte": "Vicepreședinte al Camerei Deputaților",
  "Secretar": "Secretar al Biroului permanent",
  "Chestor": "Chestor al Biroului permanent"
};

const monthStart = (month: string) => `${month}-01`;

/**
 * The roles to store. Month-precision dates are clamped into the legislature: the first period starts "dec 2024"
 * but the legislature began on 21 December, and a role cannot start before its mandate.
 */
export function bureauRoles(input: {
  periods: BureauPeriod[];
  legislature: { startsOn: string; endsOn?: string };
  memberIdForIdm: (idm: string) => string | undefined;
  sourceSnapshotId: (period: BureauPeriod) => string | undefined;
}): { roles: MemberRole[]; unresolved: Array<{ idm: string; name: string; position: string }> } {
  const roles: MemberRole[] = [];
  const unresolved: Array<{ idm: string; name: string; position: string }> = [];
  for (const interval of bureauIntervals(input.periods)) {
    const memberId = input.memberIdForIdm(interval.idm);
    if (!memberId) {
      unresolved.push({ idm: interval.idm, name: interval.name, position: interval.position });
      continue;
    }
    const rawStart = monthStart(interval.fromMonth);
    const startsOn = rawStart <= input.legislature.startsOn ? input.legislature.startsOn : rawStart;
    const startsOnPrecision = rawStart <= input.legislature.startsOn ? "day" : "month";
    const rawEnd = interval.toMonth ? monthStart(interval.toMonth) : undefined;
    const endsOn = rawEnd && rawEnd < startsOn ? startsOn : rawEnd;
    roles.push({
      id: `role-bureau-${memberId}-${slugify(interval.position)}-${startsOn}`,
      memberId,
      title: TITLES[interval.position],
      chamber: "deputies",
      kind: "bureau",
      startsOn,
      startsOnPrecision,
      endsOn,
      endsOnPrecision: endsOn ? "month" : "day",
      sourceSnapshotId: input.sourceSnapshotId(interval.lastPeriod)
    });
  }
  return { roles, unresolved };
}
