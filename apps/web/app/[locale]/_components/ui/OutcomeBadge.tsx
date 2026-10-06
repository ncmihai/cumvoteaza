import { Check, Info, X } from "lucide-react";
import { voteOutcomeTone, type VoteOutcome } from "@/lib/public-presentation";

/** The result of a vote: adopted (green check), not adopted (red cross), or something we do not decide for the reader (neutral info). */
export function OutcomeBadge({ outcome, label, size = "md" }: { outcome: VoteOutcome; label: string; size?: "sm" | "md" | "lg" }) {
  const tone = voteOutcomeTone(outcome);
  const tones = {
    positive: "bg-vote-for-bg text-vote-for",
    negative: "bg-vote-against-bg text-vote-against",
    neutral: "bg-line text-ink-soft"
  } as const;
  const sizes = { sm: "gap-1 px-2 py-0.5 text-xs", md: "gap-1.5 px-2.5 py-1 text-sm", lg: "gap-2 px-3.5 py-1.5 text-base" } as const;
  const iconSize = size === "lg" ? 18 : size === "md" ? 16 : 13;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full font-semibold ${tones[tone]} ${sizes[size]}`}>
      {tone === "positive" ? <Check size={iconSize} strokeWidth={2.6} aria-hidden="true" /> : tone === "negative" ? <X size={iconSize} strokeWidth={2.6} aria-hidden="true" /> : <Info size={iconSize} strokeWidth={2.4} aria-hidden="true" />}
      {label}
    </span>
  );
}
