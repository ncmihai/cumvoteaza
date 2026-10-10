import { describe, expect, it } from "vitest";
import { GAIN_COLOUR, LOSS_COLOUR, leaderOf, listColours, metricValue, paintFor, rampOpacity, rampRange, shareOf, sumByCircumscription, turnoutOf, type MapArea, type MapList } from "./election-map";

const area = (k: string, c: number, v: number, lists: Array<[number, number]>, extra: Partial<MapArea> = {}): MapArea => ({ k, c, n: k, s: 1, r: 1000, p: 600, v, i: 10, l: lists.map((entry) => entry[0]), x: lists.map((entry) => entry[1]), ...extra });

describe("election map metrics", () => {
  const a = area("1", 1, 500, [[1, 250], [2, 150], [3, 100]]);

  it("names the leader with its share and its lead over the second", () => {
    expect(leaderOf(a)).toEqual({ code: 1, share: 0.5, lead: 0.2 });
    expect(leaderOf(area("2", 1, 0, []))).toBeUndefined();
  });

  it("gives a list's share, zero when it has no votes there, and nothing when no vote was valid", () => {
    expect(shareOf(a, 2)).toBe(0.3);
    expect(shareOf(a, 9)).toBe(0);
    expect(shareOf(area("3", 1, 0, []), 1)).toBeUndefined();
  });

  it("gives turnout over the permanent lists and nothing without voters on them", () => {
    expect(turnoutOf(a)).toBe(0.6);
    expect(turnoutOf({ ...a, r: 0 })).toBeUndefined();
    expect(metricValue(a, "invalid", 0)).toBeCloseTo(10 / 600);
  });

  it("adds communes up to their circumscription and orders the lists again", () => {
    const sums = sumByCircumscription([a, area("4", 1, 300, [[2, 200], [1, 100]]), area("5", 2, 100, [[3, 100]])]);
    expect(sums).toHaveLength(2);
    expect(sums[0]).toMatchObject({ c: 1, v: 800, r: 2000, p: 1200, l: [1, 2, 3], x: [350, 350, 100] });
    expect(sums[1]).toMatchObject({ c: 2, v: 100 });
  });
});

describe("election map colours", () => {
  const lists: MapList[] = [
    { code: 1, name: "A", independents: false, color: "#ff0000", votes: 900 },
    { code: 2, name: "B", independents: false, color: "#ff0000", votes: 800 },
    { code: 3, name: "C", independents: false, votes: 700 },
    { code: 0, name: "", independents: true, votes: 50 }
  ];

  it("keeps a party's colour, moves a list whose colour is taken and gives the others a palette colour", () => {
    const colours = listColours(lists);
    expect(colours.get(1)).toBe("#ff0000");
    expect(colours.get(2)).not.toBe("#ff0000");
    expect(new Set([colours.get(1), colours.get(2), colours.get(3)]).size).toBe(3);
    expect(colours.get(0)).toBe("#64748b");
  });

  it("paints a winner stronger the larger its lead, and a share by the list's own colour", () => {
    const colours = listColours(lists);
    const range = { min: 0, max: 1 };
    const close = paintFor(area("1", 1, 100, [[1, 40], [2, 39]]), { metric: "winner", listCode: 1, colours, range })!;
    const clear = paintFor(area("2", 1, 100, [[1, 80], [2, 10]]), { metric: "winner", listCode: 1, colours, range })!;
    expect(clear.opacity).toBeGreaterThan(close.opacity);
    expect(clear.fill).toBe(colours.get(1));
    expect(paintFor(area("3", 1, 100, [[1, 40], [3, 30]]), { metric: "share", listCode: 3, colours, range })!.fill).toBe(colours.get(3));
    expect(paintFor(area("4", 1, 0, []), { metric: "winner", listCode: 1, colours, range })).toBeUndefined();
  });

  it("ranges a ramp by percentiles and keeps its opacity between 0.12 and 1", () => {
    const range = rampRange([0.1, 0.2, 0.3, 0.4, 0.5, 5]);
    expect(range.max).toBeLessThanOrEqual(5);
    expect(rampOpacity(range.min - 1, range)).toBeCloseTo(0.12);
    expect(rampOpacity(range.max + 1, range)).toBeCloseTo(1);
    expect(rampRange([])).toEqual({ min: 0, max: 1 });
  });
});

describe("the change since the election before", () => {
  const now = area("1", 1, 100, [[1, 40], [2, 30]]);
  const before = area("1", 1, 200, [[7, 50], [8, 20]]);
  const previous = { areas: new Map([["1", before]]), listCode: 7 };

  it("is the list's share now minus its share then, found by the list's code in the election before", () => {
    expect(metricValue(now, "change", 1, previous)).toBeCloseTo(0.4 - 0.25);
    // A list with no votes in that place then counts as zero there.
    expect(metricValue(now, "change", 1, { ...previous, listCode: 9 })).toBeCloseTo(0.4);
  });

  it("has no value where the place or the list is missing in the election before", () => {
    expect(metricValue(now, "change", 1, { areas: new Map(), listCode: 7 })).toBeUndefined();
    expect(metricValue(now, "change", 1, { areas: previous.areas, listCode: undefined })).toBeUndefined();
    expect(metricValue(now, "change", 1)).toBeUndefined();
  });

  it("paints a gain blue and a loss orange, stronger the larger the change", () => {
    const colours = new Map([[1, "#ff0000"]]);
    const gain = paintFor(now, { metric: "change", listCode: 1, colours, range: { min: 0, max: 0.3 }, previous })!;
    expect(gain.fill).toBe(GAIN_COLOUR);
    const lost = paintFor(area("1", 1, 100, [[1, 5]]), { metric: "change", listCode: 1, colours, range: { min: 0, max: 0.3 }, previous })!;
    expect(lost.fill).toBe(LOSS_COLOUR);
    expect(lost.opacity).toBeGreaterThan(gain.opacity);
  });
});
