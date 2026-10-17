import { describe, expect, it } from "vitest";
import { endReasonLabel, mergeContinuations, seatDuring } from "./cabinet-members";

const gov = (slug: string) => ({ id: `government-${slug}`, slug, name: slug });
const term = (person: string, government: string, startsOn: string, endsOn: string | undefined, extra: { interim?: boolean; sourceUrl?: string } = {}) => ({ person: { id: person }, government: gov(government), startsOn, ...(endsOn ? { endsOn } : {}), interim: false, sourceUrl: undefined as string | undefined, ...extra });

describe("a minister who stayed across governments", () => {
  it("is one stretch of office when the periods touch, from the first start to the last end, naming each government", () => {
    const merged = mergeContinuations([
      term("p1", "bolojan", "2025-06-23", undefined),
      term("p1", "ciolacu-ii", "2024-12-23", "2025-05-06"),
      term("p1", "ciolacu-i", "2023-06-15", "2024-12-23", { sourceUrl: "https://example.test/first" })
    ]);
    // Ciolacu II ended on 6 May and Bolojan began on 23 June: an acting government stood between, so these two do not touch; Ciolacu I and II do.
    expect(merged.map((item) => `${item.startsOn}–${item.endsOn ?? "open"}:${item.governments.map((g) => g.slug).join("+")}`)).toEqual(["2025-06-23–open:bolojan", "2023-06-15–2025-05-06:ciolacu-ii+ciolacu-i"]);
    expect(merged[1]!.sourceUrl).toBe("https://example.test/first");
  });

  it("stays two periods for two people, for an acting post beside a titular one, and for a gap", () => {
    expect(mergeContinuations([term("p2", "b", "2020-06-20", undefined), term("p1", "a", "2020-01-10", "2020-06-20")])).toHaveLength(2);
    expect(mergeContinuations([term("p1", "b", "2020-06-20", undefined, { interim: true }), term("p1", "a", "2020-01-10", "2020-06-20")])).toHaveLength(2);
    expect(mergeContinuations([term("p1", "b", "2020-07-01", undefined), term("p1", "a", "2020-01-10", "2020-06-20")])).toHaveLength(2);
  });
});

describe("a seat in Parliament while holding a post", () => {
  const spans = [{ chamber: "senate" as const, startsOn: "2016-12-21", endsOn: "2020-12-20" }, { chamber: "deputies" as const, startsOn: "2020-12-21" }];
  it("is the chamber whose mandate overlaps the period, an open mandate running to today", () => {
    expect(seatDuring(spans, "2018-01-01", "2018-06-01", "2026-10-17")).toBe("senate");
    expect(seatDuring(spans, "2024-01-01", undefined, "2026-10-17")).toBe("deputies");
    expect(seatDuring(spans, "2010-01-01", "2012-01-01", "2026-10-17")).toBeUndefined();
    expect(seatDuring(undefined, "2018-01-01", undefined, "2026-10-17")).toBeUndefined();
  });
});

describe("how a period ended", () => {
  it("is worded in the reader's language, and nothing for an unknown reason", () => {
    expect(endReasonLabel("resigned", "ro")).toBe("Demisie");
    expect(endReasonLabel("government_ended", "en")).toBe("The government ended");
    expect(endReasonLabel("something-else", "ro")).toBeUndefined();
    expect(endReasonLabel(undefined, "ro")).toBeUndefined();
  });
});
