import { describe, expect, it } from "vitest";
import { classifyOrganisation, isAbbreviationOnly, normalizeRomanian, organisationIdentity, organisationKey } from "../parties/organisation";
import { planLogos, planPartyMerge, type LogoEvidence, type PartyRow } from "../repair/merge-parties";

const row = (id: string, name: string, shortName = name, slug = id.replace(/^party-/, ""), color = "#64748b"): PartyRow => ({ id, slug, name, shortName, color });

describe("organisation rules (D-029)", () => {
  it("writes the comma-below letters instead of the old cedilla ones", () => {
    expect(normalizeRomanian("Asociaţia Italienilor, Şcoala Ţării")).toBe("Asociația Italienilor, Școala Țării");
  });

  it("gives every spelling of one organisation the same key", () => {
    expect(organisationKey("Uniunea Bulgară din Banat - România")).toBe(organisationKey("Uniunea Bulgara din Banat - România"));
    expect(organisationKey("Asociaţia Macedonenilor din România")).toBe("asociatia-macedonenilor-din-romania");
  });

  it("classifies minority organisations, independents and unaffiliated members, and keeps parties that sound like associations", () => {
    expect(classifyOrganisation("Uniunea Armenilor din România")).toBe("minority_organisation");
    expect(classifyOrganisation("Federaţia Comunităţilor Evreieşti din România")).toBe("minority_organisation");
    expect(classifyOrganisation("Partida Romilor")).toBe("minority_organisation");
    expect(classifyOrganisation("independent")).toBe("independent");
    expect(classifyOrganisation("Fără adeziune la formaţiunea politică pentru care a candidat la alegeri")).toBe("unaffiliated");
    expect(classifyOrganisation("Minorități naționale")).toBe("minority_group");
    expect(classifyOrganisation("Uniunea Națională pentru Progresul României")).toBe("party");
    expect(classifyOrganisation("Mișcarea Ecologistă din România")).toBe("party");
    expect(classifyOrganisation("Partidul Democrat Agrar din România")).toBe("party");
  });

  it("knows an abbreviation from a real one-word name", () => {
    expect(isAbbreviationOnly("PLS", "PLS")).toBe(true);
    expect(isAbbreviationOnly("PPU-SL", "PPU-SL")).toBe(true);
    expect(isAbbreviationOnly("PRO România", "PRO România")).toBe(false);
    expect(isAbbreviationOnly("independent", "independent")).toBe(false);
    expect(isAbbreviationOnly("Alianța Liberalilor și Democraților", "ALDE")).toBe(false);
  });

  it("builds one id and one slug per organisation", () => {
    const identity = organisationIdentity("Uniunea Armenilor din România", "AR");
    expect(identity).toMatchObject({ id: "party-org-uniunea-armenilor-din-romania", slug: "uniunea-armenilor-din-romania", kind: "minority_organisation", fullNameKnown: true });
    expect(organisationIdentity("independent", "independent").id).toBe("party-org-independent");
    expect(organisationIdentity("Fără adeziune la formaţiunea politică pentru care a candidat la alegeri", "FAFPCCA").slug).toBe("fara-adeziune");
  });
});

describe("planPartyMerge", () => {
  const rows: PartyRow[] = [
    row("party-pnl", "Partidul Național Liberal", "PNL", "pnl", "#f2c230"),
    row("party-minoritati", "Minorități naționale", "Minorități", "minoritati"),
    row("party-formation-2016-uniunea-armenilor-din-romania", "Uniunea Armenilor din România", "AR", "formation-2016-uniunea-armenilor-din-romania"),
    row("party-formation-2020-uniunea-armenilor-din-romania", "Uniunea Armenilor din România", "AR", "formation-2020-uniunea-armenilor-din-romania"),
    row("party-formation-2020-independent", "independent", "independent", "formation-2020-independent"),
    row("party-formation-2024-independent", "independent", "independent", "formation-2024-independent"),
    row("party-formation-2020-asociatia-macedonenilor", "Asociaţia Macedonenilor din România", "AMR", "formation-2020-asociatia-macedonenilor"),
    row("party-formation-2024-sos", "SOS", "SOS", "formation-2024-sos"),
    row("party-sos-ro", "SOS România", "SOS RO", "sos-ro"),
    row("party-formation-2024-partidul-national-liberal", "Partidul Național Liberal", "PNL", "formation-2024-partidul-national-liberal")
  ];

  it("folds the per-legislature rows into one row per organisation", () => {
    const plan = planPartyMerge(rows);
    const armenians = plan.groups.find((group) => group.canonicalId === "party-org-uniunea-armenilor-din-romania")!;
    expect(armenians.oldIds).toHaveLength(2);
    expect(armenians.years).toEqual(["2016", "2020"]);
    expect(armenians.kind).toBe("minority_organisation");
    expect(armenians.slug).toBe("uniunea-armenilor-din-romania");
    const independents = plan.groups.find((group) => group.canonicalId === "party-org-independent")!;
    expect(independents.oldIds).toHaveLength(2);
    expect(independents.kind).toBe("independent");
  });

  it("folds a formation into the curated party that has the same name, and keeps the curated slug", () => {
    const plan = planPartyMerge(rows);
    const pnl = plan.groups.find((group) => group.canonicalId === "party-pnl")!;
    expect(pnl.intoCurated).toBe(true);
    expect(pnl.slug).toBe("pnl");
    expect(plan.idMap.get("party-formation-2024-partidul-national-liberal")).toBe("party-pnl");
  });

  it("reports abbreviation-only names and a possible match with a curated party, without merging them", () => {
    const plan = planPartyMerge(rows);
    expect(plan.abbreviationOnly).toContain("SOS");
    expect(plan.possibleDuplicates).toEqual([{ organisation: "SOS", curated: "party-sos-ro (SOS România)" }]);
    expect(plan.idMap.get("party-formation-2024-sos")).toBe("party-org-sos");
  });

  it("marks the umbrella minority row and leaves ordinary curated parties alone", () => {
    const plan = planPartyMerge(rows);
    expect(plan.curatedKinds).toEqual([{ id: "party-minoritati", kind: "minority_group" }]);
  });

  it("renames a slug that a curated party already uses", () => {
    const plan = planPartyMerge([row("party-per", "Partidul Ecologist Român", "PER", "per"), row("party-formation-2020-per", "PER", "PER", "formation-2020-per")]);
    expect(plan.slugCollisions).toEqual(["per"]);
    expect(plan.groups[0]!.slug).toBe("org-per");
  });
});

describe("planLogos", () => {
  const ev = (assetId: string, contentHash: string, legislatureId: string, partyId: string | null): LogoEvidence => ({ assetId, contentHash, officialUrl: `https://cdep.ro/aleg/${contentHash}.png`, legislatureId, partyId });
  const many = (hash: string, leg: string, party: string, n: number, prefix = hash) => Array.from({ length: n }, (_, i) => ev(`${prefix}-${i}`, hash, leg, party));

  it("takes the logo that one party clearly owns in the newest legislature", () => {
    const plan = planLogos([...many("psd", "leg-2024-2028", "party-psd", 126), ...many("psd", "leg-2024-2028", "party-formation-2024-sos", 1, "x")]);
    expect(plan.picks).toHaveLength(1);
    expect(plan.picks[0]).toMatchObject({ partyId: "party-psd", contentHash: "psd", confidence: "confident", profiles: 126 });
  });

  it("never uses an image that several parties carry (an alliance or list logo)", () => {
    const plan = planLogos([...many("alliance", "leg-2004-2008", "party-pnl", 40), ...many("alliance", "leg-2004-2008", "party-pd", 40, "b")]);
    expect(plan.picks).toHaveLength(0);
    expect(plan.mixed).toHaveLength(1);
  });

  it("uses a single profile's image for a one-member organisation only when no other party uses it", () => {
    const plan = planLogos([ev("a1", "armenians", "leg-2024-2028", "party-org-uniunea-armenilor-din-romania")]);
    expect(plan.picks[0]).toMatchObject({ partyId: "party-org-uniunea-armenilor-din-romania", confidence: "weak" });
    const shared = planLogos([ev("a1", "h", "leg-2024-2028", "party-a"), ev("a2", "h", "leg-2020-2024", "party-b")]);
    expect(shared.picks).toHaveLength(0);
  });

  it("prefers the newest legislature and maps old party ids to the merged one", () => {
    const plan = planLogos(
      [...many("new", "leg-2024-2028", "party-formation-2024-x", 5), ...many("old", "leg-2012-2016", "party-formation-2012-x", 9, "o")],
      (id) => (id.startsWith("party-formation-") ? "party-org-x" : id)
    );
    expect(plan.picks).toHaveLength(1);
    expect(plan.picks[0]).toMatchObject({ partyId: "party-org-x", contentHash: "new", legislatureId: "leg-2024-2028" });
  });
});
