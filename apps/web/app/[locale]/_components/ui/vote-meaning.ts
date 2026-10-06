/**
 * What a vote means, drawn the same way everywhere (D-029): seat maps, legends, badges, tables and bars all take their colour and icon from here.
 * Colour never carries the meaning alone: every kind also has its own icon shape. Class names are written out in full so Tailwind can find them.
 */
export type VoteKind = "for" | "against" | "abstain" | "present" | "absent";

export const VOTE_KINDS: VoteKind[] = ["for", "against", "abstain", "present", "absent"];

export const VOTE_STYLE: Record<VoteKind, { text: string; badge: string; fill: string; ring: string }> = {
  for: { text: "text-vote-for", badge: "bg-vote-for-bg text-vote-for", fill: "bg-vote-for-fill", ring: "ring-vote-for-fill" },
  against: { text: "text-vote-against", badge: "bg-vote-against-bg text-vote-against", fill: "bg-vote-against-fill", ring: "ring-vote-against-fill" },
  abstain: { text: "text-vote-abstain", badge: "bg-vote-abstain-bg text-vote-abstain", fill: "bg-vote-abstain-fill", ring: "ring-vote-abstain-fill" },
  present: { text: "text-vote-present", badge: "bg-vote-present-bg text-vote-present", fill: "bg-vote-present-fill", ring: "ring-vote-present-fill" },
  absent: { text: "text-vote-absent", badge: "bg-line text-vote-absent", fill: "bg-vote-absent-fill", ring: "ring-vote-absent-fill" }
};

/** Hex values for SVG seats (the same colours as the tokens in globals.css). */
export const VOTE_FILL_HEX: Record<VoteKind, string> = {
  for: "#16a34a",
  against: "#dc2626",
  abstain: "#d97706",
  present: "#94a3b8",
  absent: "#cbd5e1"
};

export const VOTE_LABEL: Record<"ro" | "en", Record<VoteKind, string>> = {
  ro: { for: "Pentru", against: "Contra", abstain: "Abținere", present: "Prezent, nu a votat", absent: "Absent" },
  en: { for: "For", against: "Against", abstain: "Abstained", present: "Present, did not vote", absent: "Absent" }
};

/** The same meaning for the stored choice names used by the data layer. */
export function voteKindOfChoice(choice: string): VoteKind {
  if (choice === "for") return "for";
  if (choice === "against") return "against";
  if (choice === "abstention" || choice === "abstain") return "abstain";
  if (choice === "present_not_voting" || choice === "present") return "present";
  return "absent";
}
