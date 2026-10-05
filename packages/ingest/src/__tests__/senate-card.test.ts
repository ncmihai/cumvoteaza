import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSenateCard } from "../leadership/senate-card";

const card = readFileSync(path.join(__dirname, "../fixtures/senate-card-2024.html"), "utf8");

describe("parseSenateCard", () => {
  const parsed = parseSenateCard(card);

  it("reads the official counts as published, each with its second number where the label has one", () => {
    expect(Object.fromEntries(parsed.metrics.map((item) => [item.metric, item]))).toMatchObject({
      initiatives: { value: 43, detail: 6 },
      political_declarations: { value: 7 },
      questions: { value: 0 },
      interpellations: { value: 2 },
      interpellations_prime_minister: { value: 0 },
      speeches: { value: 105, outOf: 162 },
      motions_signed: { value: 17 },
      evote_attendance: { value: 87, outOf: 95 }
    });
    expect(parsed.metrics).toHaveLength(8);
  });

  it("reads the seat in the Permanent Bureau with its dates, finished and current, once each", () => {
    expect(parsed.bureau).toEqual([
      { position: "Chestor", since: "2024-12-21", until: "2025-08-31" },
      { position: "Chestor", since: "2025-09-03" }
    ]);
  });

  it("returns nothing for a card without these sections instead of inventing it", () => {
    expect(parseSenateCard("<html><body><h1>X</h1></body></html>")).toEqual({ bureau: [], metrics: [] });
  });
});
