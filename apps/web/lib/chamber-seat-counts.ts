import { chamberSeatCountsByLegislature, type ChamberId, type Legislature, type VoteChamber } from "@cumsevoteaza/parliament-model";

export { chamberSeatCountOnDate, chamberSeatCountsByLegislature } from "@cumsevoteaza/parliament-model";

export function chamberSeatCount(chamber: VoteChamber, date: string, legislatures: Legislature[]): number | undefined {
  if (chamber === "joint") {
    const deputies = chamberSeatCount("deputies", date, legislatures);
    const senate = chamberSeatCount("senate", date, legislatures);
    return deputies !== undefined && senate !== undefined ? deputies + senate : undefined;
  }
  if (chamber !== "deputies" && chamber !== "senate") return undefined;
  const legislature = legislatures.find((item) => item.startsOn <= date && item.endsOn >= date);
  return legislature ? chamberSeatCountForLegislature(chamber, legislature) : undefined;
}

export function chamberSeatCountForLegislature(chamber: ChamberId, legislature: Legislature): number | undefined {
  if (chamber !== "deputies" && chamber !== "senate") return undefined;
  return chamberSeatCountsByLegislature[legislature.label]?.[chamber];
}
