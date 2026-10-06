import type { CSSProperties } from "react";

/**
 * A whole number that rises from 0 once when the page loads. Pure CSS (an animated integer property and a counter), so it needs no JavaScript and
 * does nothing under reduced motion. The real number is always in the page for screen readers and copying; use it for counts below 10,000.
 */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="count-up" style={{ "--n": value } as CSSProperties} />
    </span>
  );
}
