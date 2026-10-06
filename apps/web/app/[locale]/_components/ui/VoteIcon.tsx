import { Check, CircleSlash, Minus, X } from "lucide-react";
import { VOTE_FILL_HEX, VOTE_LABEL, VOTE_STYLE, type VoteKind } from "./vote-meaning";

/** The icon of a vote kind: a check, a cross, a minus, an empty ring or a slashed circle. Decorative unless `label` is set. */
export function VoteIcon({ kind, size = 16, label }: { kind: VoteKind; size?: number; label?: string }) {
  const common = { size, strokeWidth: 2.4, "aria-hidden": label ? undefined : true, role: label ? ("img" as const) : undefined, "aria-label": label };
  if (kind === "for") return <Check {...common} />;
  if (kind === "against") return <X {...common} />;
  if (kind === "abstain") return <Minus {...common} />;
  if (kind === "absent") return <CircleSlash {...common} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

/** A small round chip with the icon, in the vote's own colour: the legend and badge version of a seat. */
export function VoteDot({ kind, size = 22, locale = "ro" }: { kind: VoteKind; size?: number; locale?: "ro" | "en" }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full text-white ${VOTE_STYLE[kind].fill}`}
      style={{ width: size, height: size, backgroundColor: kind === "present" || kind === "absent" ? VOTE_FILL_HEX[kind] : undefined }}
      title={VOTE_LABEL[locale][kind]}
    >
      <VoteIcon kind={kind} size={Math.round(size * 0.62)} />
    </span>
  );
}
