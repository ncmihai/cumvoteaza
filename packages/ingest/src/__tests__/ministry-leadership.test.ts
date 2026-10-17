import { describe, expect, it } from "vitest";
import { nameOf, parseLeadership } from "../ministries/leadership-parse";
import { leadershipId, nameKey } from "../ministries/leadership-import";

const page = (lines: string[]) => `<html><body><nav><a>Conducere</a></nav><div>${lines.map((line) => `<p>${line}</p>`).join("")}</div><footer>Contact Tel. 021 123</footer><script>var Secretar = 1;</script></body></html>`;

describe("a person's name on a ministry's page", () => {
  it("reads a name with its title taken off, in any order of the words, and nothing that is not one", () => {
    expect(nameOf("dr. Stela Firu")).toBe("Stela Firu");
    expect(nameOf("General Gheorghiță VLAD")).toBe("Gheorghiță VLAD");
    expect(nameOf("Munteanu Codrin-Dumitru")).toBe("Munteanu Codrin-Dumitru");
    expect(nameOf("Curriculum Vitae")).toBeUndefined();
    expect(nameOf("Declarație de Avere 2025")).toBeUndefined();
    expect(nameOf("Secretar de stat")).toBeUndefined();
    expect(nameOf("Conducere")).toBeUndefined();
    expect(nameOf("Ministerul Culturii")).toBeUndefined();
  });
});

describe("the leadership of a ministry", () => {
  it("reads each post with the name on the line before it, and the date the page prints after it", () => {
    const parsed = parseLeadership(page(["Oana-Silvia Țoiu", "Ministrul afacerilor externe", "(23 iunie 2025)", "Clara Staicu", "Secretar de stat", "(iunie 2024)", "Felix Zaharia", "Secretar general"]));
    expect(parsed.entries.map((entry) => `${entry.kind}:${entry.name}${entry.since ? `[${entry.since}]` : ""}`)).toEqual(["minister:Oana-Silvia Țoiu[23 iunie 2025]", "state_secretary:Clara Staicu[iunie 2024]", "secretary_general:Felix Zaharia"]);
    expect(parsed.postsWithoutName).toBe(0);
  });

  it("tells the deputy secretary general and the undersecretary from the posts they resemble", () => {
    const parsed = parseLeadership(page(["Ana Alb", "Secretar General Adjunct", "Bob Bun", "Subsecretar de stat", "Cora Cea", "Șeful Statului Major al Apărării"]));
    expect(parsed.entries.map((entry) => entry.kind)).toEqual(["secretary_general_deputy", "undersecretary", "chief_of_defence_staff"]);
  });

  it("gives nothing for a post with no name before it, counts it, and never takes the name of the next post", () => {
    const parsed = parseLeadership(page(["Declarație de Interese 2025", "Secretar de stat", "Curriculum Vitae", "Dan Dinu", "Secretar de stat"]));
    expect(parsed.entries.map((entry) => entry.name)).toEqual(["Dan Dinu"]);
    expect(parsed.postsWithoutName).toBe(1);
  });

  it("reads a post that begins with a dash, and a name and its post on one line", () => {
    const parsed = parseLeadership(page(["CSEKE Attila", "- MINISTRUL DEZVOLTĂRII, LUCRĂRILOR PUBLICE ȘI ADMINISTRAȚIEI", "Ákos DERZSI SECRETAR DE STAT", "Francisc-Oscar GAL SUBSECRETAR DE STAT", "Eduard CORJESCU SECRETAR GENERAL"]));
    expect(parsed.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(["minister:CSEKE Attila", "state_secretary:Ákos DERZSI", "undersecretary:Francisc-Oscar GAL", "secretary_general:Eduard CORJESCU"]);
    expect(parsed.entries[0]!.role.startsWith("MINISTRUL")).toBe(true);
  });

  it("reads a name with a comma and its post on one line, and a police rank before a name", () => {
    const parsed = parseLeadership(page(["Marian-Cătălin PREDOIU, Viceprim-ministru, Ministrul Afacerilor Interne", "Chestor general de poliție Bogdan DESPESCU – Secretar de stat", "Chestor șef de poliție Ioana DOROBANȚU – Secretar general adjunct"]));
    expect(parsed.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(["minister:Marian-Cătălin PREDOIU", "state_secretary:Bogdan DESPESCU", "secretary_general_deputy:Ioana DOROBANȚU"]);
  });

  it("reads a deputy prime minister's line as the minister's post, and a page that is one big form", () => {
    const html = "<html><body><form action='/x'><div><p>Tánczos Barna</p><p>Viceprim-ministru, ministru interimar al Agriculturii și Dezvoltării Rurale</p><p>Florian-Emil Dumitru</p><p>Secretar de Stat</p></div><input name='q'></form></body></html>";
    expect(parseLeadership(html).entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(["minister:Tánczos Barna", "state_secretary:Florian-Emil Dumitru"]);
  });

  it("does not take a name for two posts, and leaves the menu, the footer and scripts out", () => {
    const parsed = parseLeadership(page(["Ana Alb", "Secretar de stat", "Secretar de stat"]));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.postsWithoutName).toBe(1);
  });
});

describe("a person's name as a key", () => {
  it("is the same for the words in another order, another accent or a hyphen", () => {
    expect(nameKey("Munteanu Codrin-Dumitru")).toBe(nameKey("Codrin Dumitru MUNTEANU"));
    expect(nameKey("Țoiu Oana-Silvia")).toBe(nameKey("oana silvia toiu"));
    expect(leadershipId("aparare", "Munteanu Codrin-Dumitru", "secretary_general")).toBe(leadershipId("aparare", "Codrin Dumitru Munteanu", "secretary_general"));
    expect(leadershipId("aparare", "Ana Alb", "state_secretary")).not.toBe(leadershipId("aparare", "Ana Alb", "secretary_general"));
  });
});
