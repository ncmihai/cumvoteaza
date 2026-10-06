import { HEMICYCLE_BOX, hemicycleLayout } from "@/lib/hemicycle";

export interface HemicycleSeat {
  color: string;
  /** Shown as the hover text of the seat. */
  title?: string;
}

/**
 * A parliament chart: the seats in order from the far left to the far right (parties one after the other), drawn as dots. Seats appear in a left-to-right
 * wave once when the page loads (never under reduced motion). `highlight` rings one seat in the lit-seat colour. The seat list is also given as `summary`
 * for screen readers, since a picture of dots says nothing to them.
 */
export function Hemicycle({ seats, highlight, summary, className = "" }: { seats: HemicycleSeat[]; highlight?: number; summary: string; className?: string }) {
  const layout = hemicycleLayout(seats.length);
  const { width, height } = HEMICYCLE_BOX;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className={`block h-auto w-full ${className}`}>
      <title>{summary}</title>
      {layout.map((seat, index) => (
        <circle key={index} cx={seat.x.toFixed(2)} cy={seat.y.toFixed(2)} r={seat.r.toFixed(2)} fill={seats[index]!.color} className="seat" style={{ animationDelay: `${Math.round(seat.t * 520)}ms` }}>
          {seats[index]!.title ? <title>{seats[index]!.title}</title> : null}
        </circle>
      ))}
      {highlight !== undefined && layout[highlight] ? (
        <circle cx={layout[highlight]!.x.toFixed(2)} cy={layout[highlight]!.y.toFixed(2)} r={(layout[highlight]!.r * 1.7).toFixed(2)} fill="none" stroke="#a3e635" strokeWidth="1.1" className="seat" style={{ animationDelay: "700ms" }} />
      ) : null}
    </svg>
  );
}
