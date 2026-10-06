/**
 * The CumVoteaza mark (D-029, option B): "Cum votează?" as a question mark drawn in parliament seats, the last seat lit. It is ink on light backgrounds;
 * `tone="inverse"` is the version on a brand-colour tile (the tab icon).
 */
const SEATS: Array<[number, number]> = [[37, 11], [50, 11], [63, 11], [24, 24], [76, 24], [76, 37], [63, 50], [50, 63]];

export function BrandLogo({ size = 32, tone = "ink" }: { size?: number; tone?: "ink" | "inverse" }) {
  const dot = tone === "ink" ? "#14122b" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
      {tone === "inverse" ? <rect width="100" height="100" rx="22" fill="#4338ca" /> : null}
      {SEATS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7.2" fill={dot} />)}
      <circle cx="50" cy="87" r="8.4" fill="#a3e635" stroke={tone === "ink" ? "#14122b" : "#ffffff"} strokeWidth="2.6" />
    </svg>
  );
}
