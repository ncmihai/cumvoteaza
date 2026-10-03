import type { DatePrecision } from "@cumsevoteaza/parliament-model";

/** One group or party row from a CDEP profile, as written by the probe ("din iun. 2025", "până în sep. 2025"). */
export type DatedMembershipRow = {
  label: string;
  url: string;
  startMonth?: string | null; // "YYYY-MM"
  endMonth?: string | null;
};

export type MembershipPeriod = {
  label: string;
  url: string;
  startsOn: string;
  startsOnPrecision: DatePrecision;
  endsOn?: string;
  endsOnPrecision: DatePrecision;
};

export type MembershipPeriodsResult = {
  periods: MembershipPeriod[];
  /** Rows that cannot be placed in time without guessing. They are not imported. */
  unresolved: DatedMembershipRow[];
};

/**
 * Turns CDEP's membership rows into dated periods inside one mandate.
 *
 * Rules (no invented dates):
 * - A single row with no dates spans the whole mandate.
 * - CDEP lists rows in order; a missing boundary is the neighbouring row's boundary
 *   (a "PDL" row with no dates after "PD - până în feb. 2008" starts in feb. 2008).
 * - The first row without a start begins at the mandate start; the last row without an end
 *   ends with the mandate (or stays open).
 * - Month-only dates are stored as the 1st of the month with precision "month", clamped to the
 *   mandate; a clamped boundary becomes the mandate's exact date.
 * - If several rows exist and some have no dates at all, their order cannot be trusted:
 *   those rows are returned as unresolved instead of being given the whole mandate.
 */
export function membershipPeriods(
  rows: DatedMembershipRow[],
  mandate: { startsOn: string; endsOn?: string }
): MembershipPeriodsResult {
  if (rows.length === 0) return { periods: [], unresolved: [] };
  if (rows.length === 1 && !rows[0]!.startMonth && !rows[0]!.endMonth) {
    return { periods: [wholeMandate(rows[0]!, mandate)], unresolved: [] };
  }

  const undated = rows.filter((row) => !row.startMonth && !row.endMonth);
  // An undated row is placeable only when its neighbours pin it down (first/last position).
  const placeable = rows.filter((row, index) => {
    if (row.startMonth || row.endMonth) return true;
    const previousEnd = rows[index - 1]?.endMonth;
    const nextStart = rows[index + 1]?.startMonth;
    return (index === 0 || previousEnd) && (index === rows.length - 1 || nextStart);
  });
  const unresolved = undated.filter((row) => !placeable.includes(row));

  const ordered = sortByKnownMonth(placeable);
  const periods: MembershipPeriod[] = [];
  ordered.forEach((row, index) => {
    const startMonth = row.startMonth ?? ordered[index - 1]?.endMonth ?? null;
    const endMonth = row.endMonth ?? ordered[index + 1]?.startMonth ?? null;
    const start = startMonth ? clampStart(monthDate(startMonth), mandate) : { date: mandate.startsOn, precision: "day" as const };
    const end = endMonth ? clampEnd(monthDate(endMonth), mandate) : mandate.endsOn ? { date: mandate.endsOn, precision: "day" as const } : undefined;
    periods.push({
      label: row.label,
      url: row.url,
      startsOn: start.date,
      startsOnPrecision: start.precision,
      endsOn: end?.date,
      endsOnPrecision: end?.precision ?? "day"
    });
  });
  return { periods, unresolved };
}

function wholeMandate(row: DatedMembershipRow, mandate: { startsOn: string; endsOn?: string }): MembershipPeriod {
  return { label: row.label, url: row.url, startsOn: mandate.startsOn, startsOnPrecision: "day", endsOn: mandate.endsOn, endsOnPrecision: "day" };
}

/** CDEP usually lists rows chronologically, but a few pages list them in reverse. Sort by the first known month; keep source order on ties. */
function sortByKnownMonth(rows: DatedMembershipRow[]): DatedMembershipRow[] {
  // On the same month, a row that only ends there comes before a row that starts there.
  return rows
    .map((row, index) => ({ row, index, key: row.startMonth ?? row.endMonth ?? null, rank: row.startMonth ? 1 : 0 }))
    .sort((a, b) => {
      if (!a.key || !b.key) return a.index - b.index;
      return a.key.localeCompare(b.key) || a.rank - b.rank || a.index - b.index;
    })
    .map(({ row }) => row);
}

function monthDate(month: string): string {
  return `${month}-01`;
}

function clampStart(date: string, mandate: { startsOn: string; endsOn?: string }): { date: string; precision: DatePrecision } {
  return date <= mandate.startsOn ? { date: mandate.startsOn, precision: "day" } : { date, precision: "month" };
}

function clampEnd(date: string, mandate: { startsOn: string; endsOn?: string }): { date: string; precision: DatePrecision } {
  if (mandate.endsOn && date >= mandate.endsOn) return { date: mandate.endsOn, precision: "day" };
  if (date < mandate.startsOn) return { date: mandate.startsOn, precision: "day" };
  return { date, precision: "month" };
}

export type DatedBounds = { startsOn: string; startsOnPrecision?: DatePrecision; endsOn?: string; endsOnPrecision?: DatePrecision };

/**
 * One row placed on its own inside its bounds (a mandate, or a committee membership for a role inside it).
 * Committees can overlap, so unlike membershipPeriods there is no neighbour inference: a missing boundary is the bound's.
 */
export function periodWithin(row: { startMonth?: string | null; endMonth?: string | null }, bounds: DatedBounds) {
  const fromBound = (date: string, precision?: DatePrecision) => ({ date, precision: precision ?? ("day" as DatePrecision) });
  let start = row.startMonth ? clampStart(monthDate(row.startMonth), bounds) : fromBound(bounds.startsOn, bounds.startsOnPrecision);
  if (start.date === bounds.startsOn) start = fromBound(bounds.startsOn, bounds.startsOnPrecision);
  let end = row.endMonth ? clampEnd(monthDate(row.endMonth), bounds) : bounds.endsOn ? fromBound(bounds.endsOn, bounds.endsOnPrecision) : undefined;
  if (end && bounds.endsOn && end.date === bounds.endsOn) end = fromBound(bounds.endsOn, bounds.endsOnPrecision);
  if (end && end.date < start.date) end = { date: start.date, precision: start.precision };
  return { startsOn: start.date, startsOnPrecision: start.precision, endsOn: end?.date, endsOnPrecision: end?.precision ?? ("day" as DatePrecision) };
}
