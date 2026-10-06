import { HEMICYCLE_BOX, hemicycleLayout } from "@/lib/hemicycle";

export interface HemicycleSeat {
  color: string;
}

const SLICES = 24;

/** Colours come from the database; anything that is not a plain hex colour is drawn grey. */
function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#94a3b8";
}

/**
 * A parliament chart: the seats in order from the far left to the far right (parties one after the other), drawn as dots. Seats appear slice by slice in
 * a left-to-right wave once when the page loads (never under reduced motion). `highlight` rings one seat in the lit-seat colour. The seat list is also given
 * as `summary` for screen readers, since a picture of dots says nothing to them. The markup is kept small on purpose (a seat is one short `circle`; the wave
 * animates 24 slices, not 330 dots) because this chart is on the first screen of the site.
 */
export function Hemicycle({ seats, highlight, summary, className = "" }: { seats: HemicycleSeat[]; highlight?: number; summary: string; className?: string }) {
  const layout = hemicycleLayout(seats.length);
  const { width, height } = HEMICYCLE_BOX;
  const slices: Array<Array<{ x: string; y: string; fill: string }>> = Array.from({ length: SLICES }, () => []);
  layout.forEach((seat, index) => slices[Math.min(SLICES - 1, Math.floor(seat.t * SLICES))]!.push({ x: seat.x.toFixed(1), y: seat.y.toFixed(1), fill: safeColor(seats[index]!.color) }));
  const r = (layout[0]?.r ?? 1).toFixed(2);
  // One string, not 330 elements: as elements the seats would be sent twice (markup and component data), as a string once. Only numbers and validated colours go in.
  const markup = slices.map((slice, index) => `<g class="seat" style="animation-delay:${Math.round((index / SLICES) * 520)}ms">${slice.map((seat) => `<circle cx="${seat.x}" cy="${seat.y}" r="${r}" fill="${seat.fill}"/>`).join("")}</g>`).join("");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className={`block h-auto w-full ${className}`}>
      <title>{summary}</title>
      <g dangerouslySetInnerHTML={{ __html: markup }} />
      {highlight !== undefined && layout[highlight] ? (
        <circle cx={layout[highlight]!.x.toFixed(1)} cy={layout[highlight]!.y.toFixed(1)} r={(layout[highlight]!.r * 1.7).toFixed(2)} fill="none" stroke="#a3e635" strokeWidth="1.1" className="seat" style={{ animationDelay: "700ms" }} />
      ) : null}
    </svg>
  );
}
