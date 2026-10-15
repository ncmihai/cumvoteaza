/**
 * The card that opens over a seat of the vote map: where it goes, and how close a finger or a cursor has to be to a seat to mean it.
 * Pure, so it can be tested without a browser; the component measures the page and calls these.
 */
export interface PopoverPlacement {
  /** Left edge of the card, in the same pixels as the inputs. */
  left: number;
  /** Top edge of the card. */
  top: number;
  /** True when the card sits above the seat (the arrow then points down). */
  above: boolean;
  /** Where the arrow is, from the card's left edge. */
  arrowX: number;
}

/**
 * The card is centred over the seat and kept inside the screen. It goes above the seat so a finger does not cover it, and below only when there is no
 * room above (under the page header). All numbers are viewport pixels.
 */
export function placePopover(input: { seatX: number; seatY: number; cardWidth: number; cardHeight: number; viewportWidth: number; topLimit: number; gap?: number; margin?: number }): PopoverPlacement {
  const gap = input.gap ?? 14;
  const margin = input.margin ?? 8;
  const width = Math.min(input.cardWidth, input.viewportWidth - margin * 2);
  const left = Math.min(Math.max(input.seatX - width / 2, margin), Math.max(margin, input.viewportWidth - width - margin));
  const above = input.seatY - input.cardHeight - gap >= input.topLimit;
  const top = above ? input.seatY - input.cardHeight - gap : input.seatY + gap;
  const arrowX = Math.min(Math.max(input.seatX - left, 16), Math.max(16, width - 16));
  return { left, top, above, arrowX };
}

/** Press and slide on a touch screen: how long to hold before sliding takes over from scrolling, how far a finger may drift while holding, and how near a seat counts. */
export const SCRUB = { holdMs: 160, slopPx: 10, touchRadius: 26, mouseRadius: 16 } as const;

/** The seat nearest to a point, if one is within `radius` pixels. Seat positions are percentages of the box. */
export function nearestSeatIndex(seats: ReadonlyArray<{ left: number; top: number }>, box: { left: number; top: number; width: number; height: number }, x: number, y: number, radius: number): number | undefined {
  let best: number | undefined;
  let bestDistance = Infinity;
  seats.forEach((seat, index) => {
    const distance = Math.hypot(box.left + (seat.left / 100) * box.width - x, box.top + (seat.top / 100) * box.height - y);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best !== undefined && bestDistance <= radius ? best : undefined;
}

/** A finger that moves farther than the slop before the hold is over is scrolling the page, not sliding over seats. */
export const driftedBeyondSlop = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > SCRUB.slopPx;
