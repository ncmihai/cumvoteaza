import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSenateVote } from "../parsers/senate-vote";

describe("parseSenateVote", () => {
  it("reads the hyphenated present-not-voting aggregate", () => {
    const html = readFileSync(path.join(__dirname, "../fixtures/senate-vote-l316.html"), "utf8")
      .replace("Prezent - Nu au votat: <strong>0</strong>", "Prezent - Nu au votat: <strong>7</strong>");
    expect(parseSenateVote(html, "https://www.senat.ro/VoturiPlenDetaliu.aspx?Cod=27035").vote.totals.presentNotVoting).toBe(7);
  });
  it("extracts totals, groups, members, and nominal choices", () => {
    const html = readFileSync(path.join(__dirname, "../fixtures/senate-vote-l316.html"), "utf8");
    const parsed = parseSenateVote(html, "https://www.senat.ro/VoturiPlenDetaliu.aspx?Cod=27035");

    expect(parsed.vote.totals).toMatchObject({
      present: 121,
      for: 116,
      against: 0,
      abstention: 5,
      presentNotVoting: 0
    });
    expect(parsed.groups.map((group) => group.shortName)).toContain("PSD");
    expect(parsed.members.find((member) => member.displayName === "Andra Bică")).toBeTruthy();
    expect(parsed.individualVotes.find((vote) => vote.choice === "abstention")).toBeTruthy();
  });
});
