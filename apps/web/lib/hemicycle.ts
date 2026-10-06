/**
 * Seat positions of a parliament chart: `total` seats on concentric arcs, numbered from the far left to the far right (and, along one angle, from the
 * outside in), so that giving the parties' seats one after the other produces the usual wedges. Pure geometry in a 100 × 56 box; the same layout is
 * used by every seat map so a party always sits in the same place (D-029).
 */
export interface HemicycleSeat {
  x: number;
  y: number;
  /** Radius of the dot that fits without touching its neighbours. */
  r: number;
  /** 0 at the far left, 1 at the far right: drives the wave in which the seats appear. */
  t: number;
  row: number;
}

export const HEMICYCLE_BOX = { width: 100, height: 56, cx: 50, cy: 52, outer: 47 } as const;

export function defaultRows(total: number): number {
  return Math.max(3, Math.min(12, Math.round(Math.sqrt(total / 3.2))));
}

export function hemicycleLayout(total: number, rows = defaultRows(total)): HemicycleSeat[] {
  if (total <= 0) return [];
  const { cx, cy, outer } = HEMICYCLE_BOX;
  const inner = outer * 0.38;
  const radii = Array.from({ length: rows }, (_, i) => (rows === 1 ? outer : inner + ((outer - inner) * i) / (rows - 1)));
  const radiusSum = radii.reduce((sum, radius) => sum + radius, 0);
  const perRow = radii.map((radius) => Math.max(2, Math.round((total * radius) / radiusSum)));
  // Rounding: settle the difference on the outermost rows, one seat at a time.
  let difference = total - perRow.reduce((sum, count) => sum + count, 0);
  for (let i = rows - 1; difference !== 0; i = i === 0 ? rows - 1 : i - 1) {
    perRow[i] = perRow[i]! + Math.sign(difference);
    difference -= Math.sign(difference);
  }
  const rowGap = rows === 1 ? outer : (outer - inner) / (rows - 1);
  const innerSpacing = (Math.PI * radii[0]!) / Math.max(1, perRow[0]! - 1);
  const r = Math.min(rowGap, innerSpacing) * 0.43;
  const seats: Array<HemicycleSeat & { angle: number }> = [];
  radii.forEach((radius, row) => {
    const count = perRow[row]!;
    for (let k = 0; k < count; k++) {
      const angle = count === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (count - 1);
      seats.push({ x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle), r, t: 1 - angle / Math.PI, row, angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || b.row - a.row);
  return seats.map(({ angle: _angle, ...seat }) => seat);
}
