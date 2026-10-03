import type {
  VoteChamber,
  VoteClassificationBasis,
  VoteClassificationConfidence,
  VoteMotionKind,
  VoteProminence,
  VoteYesMeaning
} from "@cumsevoteaza/parliament-model";

export const VOTE_CLASSIFIER_VERSION = "ro-rules-v1";

export interface VoteClassificationInput {
  title: string;
  voteType?: string | null;
  billTitle?: string | null;
  billId?: string | null;
  chamber?: VoteChamber;
}

export interface VoteClassification {
  motionKind: VoteMotionKind;
  prominence: VoteProminence;
  yesMeaning: VoteYesMeaning;
  confidence: VoteClassificationConfidence;
  basis: VoteClassificationBasis;
  version: typeof VOTE_CLASSIFIER_VERSION;
  reason: string;
}

type Rule = {
  kind: VoteMotionKind;
  prominence: VoteProminence;
  yesMeaning: VoteYesMeaning;
  pattern: RegExp;
  reason: string;
  confidence?: VoteClassificationConfidence;
  requiresBill?: boolean;
};

// Precedence is intentional: procedural wording must win even when a title also
// contains phrases such as "vot final" or a bill identifier.
const RULES: Rule[] = [
  { kind: "quorum_or_presence", prominence: "routine", yesMeaning: "confirms_presence", pattern: /\b(verificare(?:a)? prezent(?:ei|a)|prezenta electronica|apel nominal|intrunirea cvorumului|cvorum)\b/, reason: "presence or quorum wording" },
  { kind: "agenda_or_schedule", prominence: "routine", yesMeaning: "supports_procedure", pattern: /\b(ordinea? de zi|program(?:ul)? de lucru|lucreze (?:in )?paralel|in paralel cu plenul|prelungirea programului|modificare(?:a)? (?:programului|ordinii? de zi)|suspendarea sedintei)\b/, reason: "agenda or sitting schedule wording" },
  { kind: "procedural_timing", prominence: "routine", yesMeaning: "supports_procedure", pattern: /\b(timp(?:i|ul)? (?:de )?dezbater(?:e|i)|prelungirea termenului|termen(?:ul)? constitutional|limitarea timpului|durata dezbaterilor)\b/, reason: "debate or constitutional timing wording" },
  { kind: "internal_procedure", prominence: "routine", yesMeaning: "supports_procedure", pattern: /\b(procedura de vot|modalitatea de vot|reluarea votului|vot (?:secret|prin bile|test|control)|regulament(?:ul)? (?:camerei|senatului))\b/, reason: "internal voting procedure wording" },
  { kind: "amendment", prominence: "standard", yesMeaning: "supports_amendment", pattern: /\b(amendament(?:ul|e|ele)?|articol(?:ul)? amendat|am[ar]\.?\s*\d+|titlul legii)\b/, reason: "amendment or article-level wording" },
  { kind: "committee_referral", prominence: "standard", yesMeaning: "supports_referral", pattern: /\b(retrimitere(?:a)? la comisi\w*|trimitere(?:a)? la comisi\w*|sesizarea comisi\w*)\b/, reason: "committee referral wording" },
  { kind: "reconsideration", prominence: "standard", yesMeaning: "supports_reconsideration", pattern: /\b(reexaminare(?:a)?|repunere(?:a)? pe ordinea de zi|reconsiderare(?:a)?)\b/, reason: "reconsideration wording" },
  { kind: "institutional_resolution", prominence: "standard", yesMeaning: "supports_resolution", pattern: /\b(ph\s*(?:(?:cd|s)\s*\d+|-\s*(?:com|ancheta)\b)|proiect(?:ul)? de hotarare|raport de activitate|declaratia (?:senatului|parlamentului))\b/, reason: "institutional resolution or oversight wording" },
  { kind: "no_confidence", prominence: "major", yesMeaning: "supports_no_confidence", pattern: /\b(motiune(?:a)? de cenzura|motiunii de cenzura)\b/, reason: "no-confidence motion wording", confidence: "high" },
  { kind: "confidence", prominence: "major", yesMeaning: "supports_confidence", pattern: /\b(angajarea raspunderii|vot de incredere|investirea guvernului|acordarea increderii)\b/, reason: "confidence or investiture wording", confidence: "high" },
  { kind: "rejection_report", prominence: "major", yesMeaning: "supports_rejection", pattern: /\b(raport(?:ul)? de respingere|propunere(?:a)? de respingere)\b/, reason: "explicit rejection-report wording", confidence: "high" },
  { kind: "final_adoption", prominence: "major", yesMeaning: "supports_adoption", pattern: /\bproiect de lege (?:privind|pentru|de) aprobare(?:a)?\b/, reason: "official Senate approval-bill vote wording", confidence: "high", requiresBill: true },
  { kind: "final_rejection", prominence: "major", yesMeaning: "supports_rejection", pattern: /\bvot final\b.*\b(respingere|respins)\b|\b(respingere|respins)\b.*\bvot final\b/, reason: "explicit final rejection wording", confidence: "high" },
  { kind: "final_adoption", prominence: "major", yesMeaning: "supports_adoption", pattern: /\bvot final\b.*\b(adoptare|adoptat)\b|\b(adoptare|adoptat)\b.*\bvot final\b/, reason: "explicit final adoption wording", confidence: "high" },
  { kind: "final_adoption", prominence: "major", yesMeaning: "supports_adoption", pattern: /\bvot final\b/, reason: "final-vote wording linked to a bill", confidence: "medium", requiresBill: true },
  { kind: "final_adoption", prominence: "major", yesMeaning: "supports_adoption", pattern: /\b(?:pl-?x?|l)\s*\d+\/\d{4}\b.*\bvot final\b/, reason: "final-vote wording with an official bill identifier", confidence: "medium" },
  { kind: "final_adoption", prominence: "major", yesMeaning: "supports_adoption", pattern: /\bvf\b/, reason: "official final-vote abbreviation linked to a bill", confidence: "medium", requiresBill: true },
  { kind: "institutional_resolution", prominence: "standard", yesMeaning: "supports_resolution", pattern: /\b(hotarare(?:a)? (?:camerei|senatului|parlamentului)|numire(?:a)?|revocare(?:a)?|validare(?:a)?|alegerea vicepresedintilor|biroul permanent)\b/, reason: "institutional resolution wording" }
];

export function classifyVote(input: VoteClassificationInput): VoteClassification {
  // The bill title is deliberately excluded from rule matching: it describes the
  // dossier, not the question put to the chamber in this particular vote.
  const normalized = normalizeRomanian([input.title, input.voteType].filter(Boolean).join(" | "));
  for (const rule of RULES) {
    if (rule.requiresBill && !input.billId) continue;
    if (!rule.pattern.test(normalized)) continue;
    return {
      motionKind: rule.kind,
      prominence: rule.prominence,
      yesMeaning: rule.yesMeaning,
      confidence: rule.confidence ?? "high",
      basis: "deterministic_rule",
      version: VOTE_CLASSIFIER_VERSION,
      reason: rule.reason
    };
  }
  return {
    motionKind: "unknown",
    prominence: "unclassified",
    yesMeaning: "unknown",
    confidence: "low",
    basis: "unclassified",
    version: VOTE_CLASSIFIER_VERSION,
    reason: "no deterministic rule matched"
  };
}

export function normalizeRomanian(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ro");
}
