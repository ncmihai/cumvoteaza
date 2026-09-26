import { describe, expect, it } from "vitest";
import { matchesVoteSearch, normalizeVoteSearch } from "./vote-search";

describe("vote search", () => {
  it("matches ASCII, comma-below and cedilla spelling", () => {
    for (const query of ["Stefan", "Ștefan", "ŞTEFAN"]) {
      expect(matchesVoteSearch(query, ["Ştefan-Ovidiu Popa", "PSD", "Argeș"])).toBe(true);
    }
  });
  it("matches constituency and party across reordered search terms", () => {
    expect(matchesVoteSearch("arges popa", ["Ştefan-Ovidiu Popa", "PSD", "Argeș"])).toBe(true);
    expect(matchesVoteSearch("PSD", ["Ştefan-Ovidiu Popa", "PSD"])).toBe(true);
  });
  it("keeps empty and no-result behavior explicit", () => {
    expect(matchesVoteSearch("   ", ["Popa"])).toBe(true);
    expect(matchesVoteSearch("Cluj", ["Popa", undefined, "Argeș"])).toBe(false);
    expect(normalizeVoteSearch("Ţară Știință")).toBe("tara stiinta");
  });
});
