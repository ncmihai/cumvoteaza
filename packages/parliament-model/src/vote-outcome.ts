/**
 * Whether a vote passed, derived from the official counts and the Constitution's majority rules (art. 76).
 * Neither chamber's vote pages state a result, so it is computed, and the rule used is always returned with it.
 *
 *  - ordinary laws, amendments, procedure: more than half of the members present;
 *  - organic laws: more than half of all members of the chamber;
 *  - constitutional revision: at least two thirds of all members.
 *
 * When the law type is unknown, "for" above half of all members passes under any rule except a constitutional
 * revision, and "for" at or below half of those present fails under every rule. Only the band in between
 * depends on the law type; it is reported as undetermined instead of guessed.
 */

export type LawType = "ordinary" | "organic" | "constitutional";

export type VoteOutcomeStatus = "passed" | "failed" | "undetermined" | "not_a_decision";

export type VoteOutcomeRule =
  | "majority_of_present"
  | "majority_of_members"
  | "two_thirds_of_members"
  | "passes_under_any_rule"
  | "fails_under_any_rule"
  | "depends_on_law_type"
  | "below_quorum"
  | "missing_counts"
  | "attendance_check";

/** What the result means for the item voted on. */
export type VoteOutcomeEffect =
  | "adopted"
  | "not_adopted"
  | "rejected"
  | "rejection_failed"
  | "approved"
  | "not_approved";

export type VoteOutcome = {
  status: VoteOutcomeStatus;
  rule: VoteOutcomeRule;
  effect?: VoteOutcomeEffect;
  /** Votes "for" needed under the rule applied, when one applies. */
  threshold?: number;
};

export type VoteOutcomeInput = {
  motionKind?: string | null;
  yesMeaning?: string | null;
  title?: string | null;
  forCount?: number | null;
  present?: number | null;
  /** Legal number of seats in the chamber for that legislature. */
  members?: number | null;
  lawType?: LawType;
  /** The bill's official title; CDEP often states the law type there ("lege organică"). */
  billTitle?: string | null;
};

const PRESENT_MAJORITY_KINDS = new Set(["amendment", "procedural_timing", "agenda_or_schedule", "committee_referral", "internal_procedure"]);

export function voteOutcome(input: VoteOutcomeInput): VoteOutcome {
  if (input.motionKind === "quorum_or_presence") return { status: "not_a_decision", rule: "attendance_check" };
  const forCount = input.forCount;
  const present = input.present;
  const members = input.members;
  if (forCount == null || present == null || !members) return { status: "undetermined", rule: "missing_counts" };
  if (present * 2 <= members) return { status: "undetermined", rule: "below_quorum" };

  const decide = (passed: boolean, rule: VoteOutcomeRule, threshold?: number): VoteOutcome =>
    ({ status: passed ? "passed" : "failed", rule, effect: effectOf(passed, input), threshold });
  const presentThreshold = Math.floor(present / 2) + 1;
  const membersThreshold = Math.floor(members / 2) + 1;
  const twoThirdsThreshold = Math.ceil((2 * members) / 3);

  if (PRESENT_MAJORITY_KINDS.has(input.motionKind ?? "")) return decide(forCount >= presentThreshold, "majority_of_present", presentThreshold);

  const lawType = input.lawType ?? lawTypeFromText(input.title) ?? lawTypeFromText(input.billTitle);
  if (lawType === "constitutional") return decide(forCount >= twoThirdsThreshold, "two_thirds_of_members", twoThirdsThreshold);
  if (lawType === "organic") return decide(forCount >= membersThreshold, "majority_of_members", membersThreshold);
  if (lawType === "ordinary") return decide(forCount >= presentThreshold, "majority_of_present", presentThreshold);

  if (forCount >= membersThreshold) return decide(true, "passes_under_any_rule", membersThreshold);
  if (forCount < presentThreshold) return decide(false, "fails_under_any_rule", presentThreshold);
  return { status: "undetermined", rule: "depends_on_law_type" };
}

function effectOf(passed: boolean, input: VoteOutcomeInput): VoteOutcomeEffect {
  switch (input.yesMeaning) {
    case "supports_rejection":
      return passed ? "rejected" : "rejection_failed";
    case "supports_procedure":
    case "supports_referral":
    case "supports_amendment":
      return passed ? "approved" : "not_approved";
    default:
      return passed ? "adopted" : "not_adopted";
  }
}

/** Law type stated in an official title: "revizuire a Constituţiei", "lege organică", "lege ordinară". */
export function lawTypeFromText(text?: string | null): LawType | undefined {
  const value = (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/revizuir\w*\s+(a\s+)?constitut/.test(value)) return "constitutional";
  if (/\blege(a)?\s+organic/.test(value)) return "organic";
  if (/\blege(a)?\s+ordinar/.test(value)) return "ordinary";
  return undefined;
}
