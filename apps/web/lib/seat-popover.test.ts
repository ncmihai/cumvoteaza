import { describe, expect, it } from "vitest";
import { driftedBeyondSlop, nearestSeatIndex, placePopover } from "./seat-popover";

describe("placePopover", () => {
  const base = { cardWidth: 248, cardHeight: 100, viewportWidth: 1000, topLimit: 76 };
  it("centres the card above the seat with the arrow under its middle", () => {
    expect(placePopover({ ...base, seatX: 500, seatY: 400 })).toEqual({ left: 376, top: 286, above: true, arrowX: 124 });
  });
  it("keeps the card on the screen at both edges and moves the arrow to stay on the seat", () => {
    const left = placePopover({ ...base, seatX: 20, seatY: 400 });
    expect(left.left).toBe(8);
    expect(left.arrowX).toBe(16);
    const right = placePopover({ ...base, seatX: 990, seatY: 400 });
    expect(right.left).toBe(1000 - 248 - 8);
    expect(right.arrowX).toBe(232);
  });
  it("goes below the seat when there is no room above it under the header", () => {
    const placed = placePopover({ ...base, seatX: 500, seatY: 150 });
    expect(placed.above).toBe(false);
    expect(placed.top).toBe(164);
  });
  it("shrinks to a narrow screen instead of overflowing", () => {
    const phone = placePopover({ ...base, viewportWidth: 240, seatX: 120, seatY: 400 });
    expect(phone.left).toBe(8);
    expect(phone.arrowX).toBe(112);
    // On a 320 px phone the full-width card is centred and fits.
    expect(placePopover({ ...base, viewportWidth: 320, seatX: 160, seatY: 400 }).left).toBe(36);
  });
});

describe("nearestSeatIndex", () => {
  const box = { left: 100, top: 50, width: 400, height: 200 };
  const seats = [{ left: 10, top: 10 }, { left: 50, top: 50 }, { left: 90, top: 90 }];
  it("finds the seat closest to the point, in the box's own pixels", () => {
    expect(nearestSeatIndex(seats, box, 300, 150, 10)).toBe(1);
    expect(nearestSeatIndex(seats, box, 140 + 3, 70 - 2, 10)).toBe(0);
  });
  it("finds nothing farther than the radius", () => {
    expect(nearestSeatIndex(seats, box, 300, 230, 20)).toBeUndefined();
    expect(nearestSeatIndex([], box, 300, 150, 100)).toBeUndefined();
  });
});

describe("driftedBeyondSlop", () => {
  it("tells a scroll from a hold by how far the finger has moved", () => {
    expect(driftedBeyondSlop(3, 4)).toBe(false);
    expect(driftedBeyondSlop(9, 9)).toBe(true);
  });
});
