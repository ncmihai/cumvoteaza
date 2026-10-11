import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSenateVote, reidSenateVote, senateAppId } from "../parsers/senate-vote";

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

describe("untitled Senate items", () => {
  it("builds a readable title from the official identifier, never a placeholder", async () => {
    const { describeSenateItem } = await import("../parsers/senate-vote");
    expect(describeSenateItem("PH - COM (2026) 314 final")).toBe("Proiect de hotărâre privind documentul european COM(2026) 314 final");
    expect(describeSenateItem("PH - JOIN (2026) 25 final")).toBe("Proiect de hotărâre privind documentul european JOIN(2026) 25 final");
    expect(describeSenateItem("PH - ancheta parlamentara")).toBe("Proiect de hotărâre privind o anchetă parlamentară");
    expect(describeSenateItem("raport de activitate")).toBe("Raport de activitate");
    expect(describeSenateItem("Declarația Senatului")).toBe("Declarația Senatului");
  });
});

describe("two votes of one day on the same words", () => {
  const html = readFileSync(path.join(__dirname, "../fixtures/senate-vote-l316.html"), "utf8");
  const url = "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=6D6DB996-4EB7-4AEC-A703-5366597BBBF1";

  it("reads the official id of a page's address, lower case", () => {
    expect(senateAppId(url)).toBe("6d6db996-4eb7-4aec-a703-5366597bbbf1");
    expect(senateAppId("https://www.senat.ro/VoturiPlenDetaliu.aspx?Cod=27035")).toBeUndefined();
  });

  it("gives the second vote its own id in the vote, its group totals and every row, and changes nothing else", () => {
    const parsed = parseSenateVote(html, url);
    const again = reidSenateVote(parsed, "6d6db996");
    expect(again.vote.id).toBe(`${parsed.vote.id}-6d6db996`);
    expect(again.groupVoteTotals.every((total) => total.voteId === again.vote.id && total.id.includes(again.vote.id))).toBe(true);
    expect(again.individualVotes.every((row) => row.voteId === again.vote.id && row.id.startsWith(`iv-${again.vote.id}-`))).toBe(true);
    expect(again.individualVotes).toHaveLength(parsed.individualVotes.length);
    expect(again.individualVotes.map((row) => [row.memberId, row.choice])).toEqual(parsed.individualVotes.map((row) => [row.memberId, row.choice]));
    expect(again.vote.totals).toEqual(parsed.vote.totals);
  });
});
