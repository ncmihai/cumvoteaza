import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import { readSnapshots, voteCoverageStatus, type OfficialVoteTotals } from "./coverage-data";

const official: OfficialVoteTotals = {
  generatedOn: "2026-10-06",
  rangeFrom: "2024-12-21",
  rangeTo: "2026-10-06",
  totals: [{ chamber: "deputies", official: 1176, held: 1176, percent: 100 }, { chamber: "senate", official: 1244, held: 677, percent: 54.42 }]
};

describe("voteCoverageStatus", () => {
  it("is complete only where the official lists were compared over the whole legislature and we hold at least 99%", () => {
    expect(voteCoverageStatus({ legislatureStartsOn: "2024-12-21", chamber: "deputies", votes: 1178, official })).toBe("complete");
    expect(voteCoverageStatus({ legislatureStartsOn: "2024-12-21", chamber: "senate", votes: 677, official })).toBe("partial");
  });

  it("labels every older legislature that holds votes partial, and one without votes none", () => {
    expect(voteCoverageStatus({ legislatureStartsOn: "2020-12-21", chamber: "deputies", votes: 129, official })).toBe("partial");
    expect(voteCoverageStatus({ legislatureStartsOn: "2016-12-21", chamber: "senate", votes: 0, official })).toBe("none");
  });

  it("is partial while no comparison is published", () => {
    expect(voteCoverageStatus({ legislatureStartsOn: "2024-12-21", chamber: "deputies", votes: 1178 })).toBe("partial");
  });
});

describe("readSnapshots", () => {
  it("reads the published rows and ignores anything shaped differently", () => {
    const result = readSnapshots([
      { id: "votes", generated_on: "2026-10-06", range_from: "2024-12-21", range_to: "2026-10-06", payload: { totals: [{ chamber: "deputies", official: 10, held: 10, percent: 100 }, { chamber: "moon", official: 1, held: 1 }] } },
      { id: "bills", generated_on: "2026-10-06", range_from: null, range_to: null, payload: { rows: [{ chamber: "senate", year: 2025, official: 682, held: 682, percent: 100 }, { chamber: "senate" }] } },
      { id: "other", generated_on: "2026-10-06", range_from: null, range_to: null, payload: "nope" }
    ]);
    expect(result.officialVotes?.totals).toEqual([{ chamber: "deputies", official: 10, held: 10, percent: 100 }]);
    expect(result.officialBills?.rows).toEqual([{ chamber: "senate", year: 2025, official: 682, held: 682, percent: 100 }]);
  });
});
