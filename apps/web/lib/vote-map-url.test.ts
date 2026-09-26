import { describe, expect, it } from "vitest";
import { readVoteMapState, updateVoteMapUrl } from "./vote-map-url";

describe("vote map URL state", () => {
  it("restores shared search, filters and selection", () => {
    expect(readVoteMapState(new URLSearchParams("mapSearch=Ștefan&mapGroup=psd&mapChoice=for&mapSeat=seat-1"))).toEqual({ query: "Ștefan", group: "psd", choice: "for", selected: "seat-1" });
  });
  it("rejects invalid choices and defaults missing state", () => {
    expect(readVoteMapState(new URLSearchParams("mapChoice=invalid"))).toEqual({ query: "", group: null, choice: null, selected: null });
  });
  it("preserves unrelated parameters and hashes while updating or clearing", () => {
    const updated = updateVoteMapUrl("https://example.org/ro/votes/1?from=party#map", "mapSearch", "Argeș Popa");
    expect(readVoteMapState(new URL(updated, "https://example.org").searchParams).query).toBe("Argeș Popa");
    expect(updateVoteMapUrl(`https://example.org${updated}`, "mapSearch", null)).toBe("/ro/votes/1?from=party#map");
  });
});
