import { describe, expect, it } from "vitest";
import { matchByName, nameTokens, type NameCandidate } from "../dossiers/member-match";

const member = (id: string, name: string, startsOn = "2024-12-21", endsOn = "2028-12-20"): NameCandidate => ({ id, name, startsOn, endsOn });

describe("matchByName", () => {
  const candidates = [
    member("m-presura", "Alexandra Presură"),
    member("m-geamanu", "Aurora-Adela Geamănu"),
    member("m-stoica-usr", "Alin-Bogdan Stoica"),
    member("m-stoica-min", "Bogdan-Alin Stoica"),
    member("m-dumitrescu", "Cristina-Gabriella Dumitrescu"),
    member("m-old", "Ion Popescu", "2020-12-21", "2024-12-20"),
    member("m-new", "Ion Popescu", "2024-12-21", "2028-12-20"),
    member("m-vlad-1", "Vlad Pop"),
    member("m-vlad-2", "Vlad Pop")
  ];

  it("reads a name whatever the order of its words", () => {
    expect(nameTokens("Cotea (Geamănu) Aurora-Adela")).toEqual(["adela", "aurora", "cotea", "geamanu"]);
    expect(matchByName("Presură Alexandra", "2025-06-01", candidates)).toEqual({ id: "m-presura", ambiguous: false });
  });

  it("accepts a maiden-name suffix", () => {
    expect(matchByName("Cotea (Geamănu) Aurora-Adela", "2025-06-01", candidates)).toEqual({ id: "m-geamanu", ambiguous: false });
  });

  it("tells two members with the same words apart by the order of the given names", () => {
    expect(matchByName("Stoica Alin-Bogdan", "2025-06-01", candidates)).toEqual({ id: "m-stoica-usr", ambiguous: false });
    expect(matchByName("Stoica Bogdan-Alin", "2025-06-01", candidates)).toEqual({ id: "m-stoica-min", ambiguous: false });
  });

  it("accepts a one-letter spelling difference in a long word, and only when one member fits", () => {
    expect(matchByName("Dumitrescu Cristina-Gabriela", "2025-06-01", candidates)).toEqual({ id: "m-dumitrescu", ambiguous: false });
  });

  it("only considers members who sat on that date", () => {
    expect(matchByName("Popescu Ion", "2022-01-01", candidates)).toEqual({ id: "m-old", ambiguous: false });
    expect(matchByName("Popescu Ion", "2025-01-01", candidates)).toEqual({ id: "m-new", ambiguous: false });
  });

  it("chooses nobody when two members fit equally, and nobody for a single word", () => {
    expect(matchByName("Pop Vlad", "2025-01-01", candidates)).toEqual({ ambiguous: true });
    expect(matchByName("Stoica", "2025-01-01", candidates)).toEqual({ ambiguous: false });
    expect(matchByName("Nimeni Altcineva", "2025-01-01", candidates)).toEqual({ ambiguous: false });
  });
});
