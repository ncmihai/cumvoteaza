import type { ReactNode } from "react";

const TONES = {
  /** Holds the post or the office now. */
  current: "border-vote-for-fill bg-vote-for-bg text-vote-for",
  /** Holds it in an acting capacity (interim), or the whole government has caretaker powers. */
  interim: "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain",
  /** Sat in Parliament (a deputy or a senator) while holding the post. */
  member: "border-brand bg-brand-soft text-brand-strong"
} as const;

/** The small rounded label of a state: "in office", "interim". One shape for every page (the cabinet, the ministries, the governments). */
export function StatusPill({ tone, children, className = "" }: { tone: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}
