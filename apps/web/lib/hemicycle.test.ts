import { describe, expect, it } from "vitest";
import { HEMICYCLE_BOX, defaultRows, hemicycleLayout } from "./hemicycle";

describe("hemicycleLayout", () => {
  it("places exactly the number of seats asked for", () => {
    for (const total of [1, 7, 134, 330, 465]) expect(hemicycleLayout(total)).toHaveLength(total);
  });

  it("keeps every seat inside the box, above the baseline", () => {
    for (const seat of hemicycleLayout(330)) {
      expect(seat.x - seat.r).toBeGreaterThanOrEqual(0);
      expect(seat.x + seat.r).toBeLessThanOrEqual(HEMICYCLE_BOX.width);
      expect(seat.y - seat.r).toBeGreaterThanOrEqual(0);
      expect(seat.y).toBeLessThanOrEqual(HEMICYCLE_BOX.cy + 0.001);
    }
  });

  it("numbers seats from the far left to the far right", () => {
    const seats = hemicycleLayout(134);
    expect(seats[0]!.x).toBeLessThan(seats[seats.length - 1]!.x);
    expect(seats[0]!.t).toBeLessThan(0.01);
    expect(seats[seats.length - 1]!.t).toBeGreaterThan(0.99);
    const ts = seats.map((seat) => seat.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it("never lets two dots overlap", () => {
    const seats = hemicycleLayout(330);
    let nearest = Infinity;
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) nearest = Math.min(nearest, Math.hypot(seats[i]!.x - seats[j]!.x, seats[i]!.y - seats[j]!.y));
    expect(nearest).toBeGreaterThan(seats[0]!.r * 2);
  });

  it("uses more rows for a larger chamber", () => {
    expect(defaultRows(330)).toBeGreaterThan(defaultRows(134));
  });
});
