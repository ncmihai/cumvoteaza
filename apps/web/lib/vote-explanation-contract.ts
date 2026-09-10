import { createHash } from "node:crypto";

export const EXPLANATION_VERSION = "vote-explanation-v1";
export type ExplanationOutput = { ro: string; en: string; evidence: { source: number; quote: string }[] };
export type ExplanationContext = { vote: Record<string, unknown>; sources: { url: string; text: string; label: string }[]; limited: boolean };
export function explanationId(voteId: string, context: ExplanationContext) {
  return createHash("sha256").update(JSON.stringify([voteId, EXPLANATION_VERSION, context])).digest("hex");
}
export function validateExplanation(value: unknown, context: ExplanationContext): ExplanationOutput {
  const result = value as ExplanationOutput;
  if (!result || ![result.ro, result.en].every(s => typeof s === "string" && s.trim().length >= 30 && s.length <= 1400)
      || !Array.isArray(result.evidence) || !result.evidence.length || result.evidence.length > 6) throw new Error("Invalid explanation format");
  for (const e of result.evidence) {
    if (!Number.isInteger(e.source) || typeof e.quote !== "string" || e.quote.length < 12 || e.quote.length > 800
        || !context.sources[e.source]?.text.includes(e.quote)) throw new Error("Invalid source quotation");
  }
  return { ro: result.ro.trim(), en: result.en.trim(), evidence: result.evidence.map(e => ({ source: e.source, quote: e.quote })) };
}
