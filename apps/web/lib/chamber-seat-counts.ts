import { chamberSeatCountsByLegislature, type ChamberId, type Legislature } from "@cumsevoteaza/parliament-model";

export { chamberSeatCountOnDate, chamberSeatCountsByLegislature } from "@cumsevoteaza/parliament-model";

export function chamberSeatCount(chamber: ChamberId, date: string, legislatures: Legislature[]): number | undefined {
  if (chamber !== "deputies" && chamber !== "senate") return undefined;
  const legislature = legislatures.find((item) => item.startsOn <= date && item.endsOn >= date);
  return legislature ? chamberSeatCountForLegislature(chamber, legislature) : undefined;
}

export function chamberSeatCountForLegislature(chamber: ChamberId, legislature: Legislature): number | undefined {
  if (chamber !== "deputies" && chamber !== "senate") return undefined;
  return chamberSeatCountsByLegislature[legislature.label]?.[chamber];
}
