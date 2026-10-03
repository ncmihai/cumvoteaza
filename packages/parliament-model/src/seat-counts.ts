import type { ChamberId, VoteChamber } from "./types";

type CountedChamber = Extract<ChamberId, "deputies" | "senate">;

/** Legal number of seats per chamber, by legislature label. */
export const chamberSeatCountsByLegislature: Record<string, Record<CountedChamber, number>> = {
  "2024-2028": { senate: 134, deputies: 331 },
  "2020-2024": { senate: 136, deputies: 330 },
  "2016-2020": { senate: 136, deputies: 329 },
  "2012-2016": { senate: 176, deputies: 412 },
  "2008-2012": { senate: 137, deputies: 334 },
  "2004-2008": { senate: 137, deputies: 314 },
  "2000-2004": { senate: 140, deputies: 345 },
  "1996-2000": { senate: 143, deputies: 343 },
  "1992-1996": { senate: 143, deputies: 341 },
  "1990-1992": { senate: 119, deputies: 396 }
};

/** Legislature start dates, so a seat count can be found from a vote date alone. */
const legislatureStarts: Array<[string, string]> = [
  ["2024-12-21", "2024-2028"], ["2020-12-21", "2020-2024"], ["2016-12-21", "2016-2020"], ["2012-12-19", "2012-2016"],
  ["2008-12-15", "2008-2012"], ["2004-12-13", "2004-2008"], ["2000-12-11", "2000-2004"], ["1996-11-22", "1996-2000"],
  ["1992-10-16", "1992-1996"], ["1990-06-18", "1990-1992"]
];

/** Seats in a chamber on a date; for a joint sitting, the deputies and senators together. */
export function chamberSeatCountOnDate(chamber: VoteChamber, date: string): number | undefined {
  if (chamber === "joint") {
    const deputies = chamberSeatCountOnDate("deputies", date);
    const senate = chamberSeatCountOnDate("senate", date);
    return deputies !== undefined && senate !== undefined ? deputies + senate : undefined;
  }
  if (chamber !== "deputies" && chamber !== "senate") return undefined;
  const label = legislatureStarts.find(([start]) => date >= start)?.[1];
  return label ? chamberSeatCountsByLegislature[label]?.[chamber] : undefined;
}
