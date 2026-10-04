export interface OcrHealthScore {
  reasons: string[];
  metrics: {
    chunkCount: number;
    charCount: number;
    lineCount: number;
    legalVocabularyHits: number;
    weirdCharacterRatio: number;
    repeatedLineRatio: number;
  };
}

export function scoreOcrHealth(input: { text?: string | null; chunkCount?: number | string | null }): OcrHealthScore {
  const text = input.text ?? "";
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const charCount = text.length;
  const legalVocabularyHits = (text.match(/\b(lege|proiect|guvern|parlament|articol|art\.|alin\.|rom[aâ]niei)\b/gi) ?? []).length;
  const weirdCharacterRatio = charCount === 0 ? 1 : [...text].filter((char) => !/[\p{L}\p{N}\s.,;:!?'"()\/\-[\]{}%+*=<>ăâîșțĂÂÎȘȚ]/u.test(char)).length / charCount;
  const repeatedLineRatio = repeatedLineRatioFor(lines);
  const metrics = {
    chunkCount: Number(input.chunkCount ?? 0),
    charCount,
    lineCount: lines.length,
    legalVocabularyHits,
    weirdCharacterRatio: round(weirdCharacterRatio),
    repeatedLineRatio: round(repeatedLineRatio)
  };
  return {
    reasons: [
      metrics.chunkCount === 0 ? "missing_text_chunks" : undefined,
      metrics.charCount > 0 && metrics.charCount < 500 ? "very_short_text" : undefined,
      metrics.charCount >= 500 && metrics.legalVocabularyHits < 3 ? "low_legal_vocabulary" : undefined,
      metrics.weirdCharacterRatio > 0.08 ? "high_noise_ratio" : undefined,
      metrics.repeatedLineRatio > 0.35 && metrics.lineCount >= 12 ? "high_repeated_line_ratio" : undefined
    ].filter((reason): reason is string => Boolean(reason)),
    metrics
  };
}

function repeatedLineRatioFor(lines: string[]): number {
  if (lines.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.toLowerCase(), (counts.get(line.toLowerCase()) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0) / lines.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
