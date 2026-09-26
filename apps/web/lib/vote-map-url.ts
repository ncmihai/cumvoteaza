import type { VoteChoice } from "@cumsevoteaza/parliament-model";

const choices: VoteChoice[] = ["for", "against", "abstention", "present_not_voting", "absent", "unknown"];

export function readVoteMapState(params: URLSearchParams) {
  const choice = params.get("mapChoice") as VoteChoice | null;
  return {
    query: params.get("mapSearch") ?? "",
    group: params.get("mapGroup") || null,
    choice: choice && choices.includes(choice) ? choice : null,
    selected: params.get("mapSeat") || null,
  };
}

/** Change only map-owned parameters, preserving page context and the anchor. */
export function updateVoteMapUrl(href: string, key: "mapSearch" | "mapGroup" | "mapChoice" | "mapSeat", value: string | null) {
  const url = new URL(href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}
