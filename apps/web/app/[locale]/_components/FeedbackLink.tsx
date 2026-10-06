"use client";

import { OPEN_FEEDBACK_EVENT } from "@/lib/feedback";

/** A text button for the footer that opens the feedback dialog. */
export function FeedbackLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT, { detail: { kind: "mistake" } }))}>{children}</button>;
}
