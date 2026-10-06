/**
 * Where the party labels go around the seat map (D-029): outside the arc, never on the seats and never on each other.
 * Pure geometry so it can be tested; the explorer feeds it the middle angle of each group and the size its label takes.
 *
 * Angles run from -PI/2 (left end of the arc) to +PI/2 (right end), 0 at the top. Positions are percentages of the chart box.
 */
export interface MapLabelInput {
  id: string;
  /** Middle of the group's arc, in radians. */
  angle: number;
  /** Size the label takes on screen, in pixels (an estimate is enough). */
  width: number;
  height: number;
}

export interface MapLabelPlacement {
  id: string;
  /** Anchor point, in percent of the chart box. */
  x: number;
  y: number;
  /** CSS translate, in percent of the label itself, that puts the label's inner edge on the anchor so it grows away from the arc. */
  translateX: number;
  translateY: number;
}

/** Radii of the line the labels sit on, in percent of the box: just outside the arc, which is drawn at about 44 and 72. */
const RING = { x: 47.5, y: 77 };
/** Where the arc is centred, in percent of the box. */
const CENTRE = { x: 50, y: 88 };
const GAP = 4;

interface Working extends MapLabelInput {
  px: number;
  py: number;
  tangentX: number;
  tangentY: number;
  translateX: number;
  translateY: number;
}

function overlaps(a: Working, b: Working): boolean {
  const left = (item: Working) => item.px + (item.translateX / 100) * item.width;
  const top = (item: Working) => item.py + (item.translateY / 100) * item.height;
  return left(a) < left(b) + b.width + GAP && left(b) < left(a) + a.width + GAP && top(a) < top(b) + b.height + GAP && top(b) < top(a) + a.height + GAP;
}

/**
 * Starts every label on the ring at its group's angle, then pushes neighbours that touch apart along the ring's tangent
 * (sideways at the top, downwards at the right end, upwards at the left end), a little at a time.
 */
export function placeMapLabels(inputs: MapLabelInput[], box: { width: number; height: number }): MapLabelPlacement[] {
  const items: Working[] = [...inputs]
    .sort((a, b) => a.angle - b.angle)
    .map((input) => ({
      ...input,
      px: ((CENTRE.x + Math.sin(input.angle) * RING.x) / 100) * box.width,
      py: ((CENTRE.y - Math.cos(input.angle) * RING.y) / 100) * box.height,
      tangentX: Math.cos(input.angle),
      tangentY: Math.sin(input.angle),
      translateX: -50 + Math.sin(input.angle) * 50,
      translateY: -50 - Math.cos(input.angle) * 50
    }));
  for (let round = 0; round < 120; round += 1) {
    let moved = false;
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1]!;
      const current = items[index]!;
      if (!overlaps(previous, current)) continue;
      moved = true;
      // At the right end the tangent points down and at the left end up, so "later in the order" is always "further along the ring".
      previous.px -= previous.tangentX * 1.5;
      previous.py -= previous.tangentY * 1.5;
      current.px += current.tangentX * 1.5;
      current.py += current.tangentY * 1.5;
    }
    if (!moved) break;
  }
  return items.map((item) => ({
    id: item.id,
    x: Number(((item.px / box.width) * 100).toFixed(2)),
    y: Number(((item.py / box.height) * 100).toFixed(2)),
    translateX: Number(item.translateX.toFixed(1)),
    translateY: Number(item.translateY.toFixed(1))
  }));
}
