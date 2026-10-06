import { describe, expect, it } from "vitest";
import { placeMapLabels, type MapLabelInput } from "./map-labels";

/** The seat counts of the Senate vote of 5 Oct 2026, left to right, as groups sorted by size. */
function senate(): MapLabelInput[] {
  const groups = [["PSD", 36], ["AUR", 30], ["PNL", 26], ["USR", 18], ["UDMR", 10], ["NEA", 7], ["PACE", 1], ["NEA2", 1]] as const;
  const total = groups.reduce((sum, [, count]) => sum + count, 0);
  let seen = 0;
  return groups.map(([id, count]) => {
    const first = seen / total;
    seen += count;
    const last = seen / total;
    return { id, angle: -Math.PI / 2 + ((first + last) / 2) * Math.PI, width: count >= 8 ? 52 : 84, height: count >= 8 ? 54 : 22 };
  });
}

const BOX = { width: 900, height: 480 };

function rect(label: ReturnType<typeof placeMapLabels>[number], input: MapLabelInput) {
  const left = (label.x / 100) * BOX.width + (label.translateX / 100) * input.width;
  const top = (label.y / 100) * BOX.height + (label.translateY / 100) * input.height;
  return { left, top, right: left + input.width, bottom: top + input.height };
}

describe("placeMapLabels", () => {
  it("never lets two labels touch, even for the small groups at the right end of the arc", () => {
    const inputs = senate();
    const placed = placeMapLabels(inputs, BOX);
    const byId = new Map(inputs.map((input) => [input.id, input]));
    const rects = placed.map((label) => ({ id: label.id, ...rect(label, byId.get(label.id)!) }));
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const x = rects[a]!;
        const y = rects[b]!;
        const apart = x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top;
        expect(apart, `${x.id} and ${y.id}`).toBe(true);
      }
    }
  });

  it("keeps the labels outside the arc: the label grows away from the anchor, never towards the seats", () => {
    const placed = placeMapLabels([{ id: "left", angle: -Math.PI / 2, width: 50, height: 50 }, { id: "top", angle: 0, width: 50, height: 50 }, { id: "right", angle: Math.PI / 2, width: 50, height: 50 }], BOX);
    const get = (id: string) => placed.find((label) => label.id === id)!;
    expect(get("left").translateX).toBe(-100);
    expect(get("right").translateX).toBe(0);
    expect(get("top").translateY).toBe(-100);
    expect(get("top").translateX).toBe(-50);
  });

  it("stays inside a sensible area so a label cannot land on the legend or leave the page", () => {
    const inputs = senate();
    for (const label of placeMapLabels(inputs, BOX)) {
      const { left, right, bottom } = rect(label, inputs.find((input) => input.id === label.id)!);
      expect(left).toBeGreaterThan(-90);
      expect(right).toBeLessThan(BOX.width + 90);
      expect(bottom).toBeLessThan(BOX.height * 1.12);
    }
  });
});
