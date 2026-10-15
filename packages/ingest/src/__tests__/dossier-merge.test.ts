import { describe, expect, it } from "vitest";
import { parseCdepDossier } from "../dossiers/cdep-dossier";
import { approvedOrdinance, groupPages, keysOfPage, mergeDossiers } from "../dossiers/merge";
import type { DossierStep, ParsedDossier } from "../dossiers/types";

const step = (source: "cdep" | "senate", chamber: DossierStep["chamber"], occurredOn: string, type: DossierStep["type"]): DossierStep => ({ source, chamber, occurredOn, order: 0, type, text: type, documents: [] });

const page = (source: "cdep" | "senate", selfId: string, registrations: ParsedDossier["registrations"], steps: DossierStep[]): ParsedDossier => ({
  source,
  sourceUrl: `https://example.test/${source}/${selfId}`,
  selfId,
  registrations,
  initiators: [],
  steps,
  consulted: [],
  fate: { outcome: "in_progress" },
  unrecognised: []
});

// The Chamber page prints the Senate's number with just a year; the Senate page carries both of its own numbers.
const chamber = page("cdep", "PL-x 378/2026", [{ body: "cdep", number: "378", date: "2026-05-04" }], [step("cdep", "deputies", "2026-05-04", "registered"), step("cdep", "deputies", "2026-06-10", "adopted")]);
const senate = page("senate", "L142/2026", [{ body: "senate", number: "L142", date: "2026-06-12" }, { body: "senate", number: "B65", date: "2026-03-02" }], [step("senate", "senate", "2026-03-02", "registered"), step("senate", "senate", "2026-03-20", "sent_to_committee"), step("senate", "senate", "2026-06-12", "registered")]);

describe("the Senate number a Chamber page prints with only a year", () => {
  const html = `<html><head><title>PL-x nr. 378/2026</title></head><body><table>
    <tr><td>Nr. înregistrare:</td><td><table>
      <tr><td>- B.P.I.:</td><td>53/11.02.2026</td></tr>
      <tr><td>- Camera Deputaţilor:</td><td>378/11.05.2026</td></tr>
      <tr><td>- Senat:</td><td>L142/2026</td></tr>
    </table></td></tr></table></body></html>`;

  it("is read as a registration with the year, and ties the page to the Senate page of that number", () => {
    const parsed = parseCdepDossier(html, "https://www.cdep.ro/x");
    expect(parsed.registrations).toContainEqual({ body: "senate", number: "L142", year: 2026 });
    expect(keysOfPage(parsed)).toMatchObject({ deputies: "PL-x 378/2026", senateL: "L142/2026" });
    const withSteps = { ...parsed, steps: chamber.steps };
    const groups = groupPages([withSteps, senate]);
    expect(groups).toHaveLength(1);
    const merged = mergeDossiers(groups[0]!);
    expect(merged.steps.filter((item) => item.chamber === "deputies")).toHaveLength(2);
    expect(merged.steps.filter((item) => item.chamber === "senate")).toHaveLength(3);
  });
});

describe("two Chamber pages that name the same Senate number", () => {
  const first = page("cdep", "PL-x 34/2026", [{ body: "cdep", number: "34", date: "2026-02-02" }, { body: "senate", number: "L588", year: 2025 }], [step("cdep", "deputies", "2026-02-02", "registered")]);
  const second = page("cdep", "PL-x 35/2026", [{ body: "cdep", number: "35", date: "2026-02-09" }, { body: "senate", number: "L588", year: 2025 }], [step("cdep", "deputies", "2026-02-09", "registered"), step("cdep", "deputies", "2026-05-13", "adopted")]);
  const senateOnly = page("senate", "L588/2025", [{ body: "senate", number: "L588", date: "2025-12-11" }], [step("senate", "senate", "2025-12-11", "registered")]);

  it("stay two bills, and the Senate page joins the first", () => {
    const groups = groupPages([first, second, senateOnly]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.pages.map((item) => item.selfId)).toEqual(["PL-x 34/2026", "L588/2025"]);
    expect(groups[1]!.pages.map((item) => item.selfId)).toEqual(["PL-x 35/2026"]);
  });
});

describe("pages that approve different ordinances", () => {
  const withTitle = (item: ParsedDossier, title: string): ParsedDossier => ({ ...item, title });
  const chamberPage = withTitle(page("cdep", "PL-x 35/2026", [{ body: "cdep", number: "35", date: "2026-02-09" }, { body: "senate", number: "L588", year: 2025 }], []), "Proiect de Lege privind aprobarea Ordonanţei de urgenţă a Guvernului nr.76/2025 pentru modificarea Ordonanţei de urgenţă a Guvernului nr.36/2023");
  const senatePage = withTitle(page("senate", "L588/2025", [{ body: "senate", number: "L588", date: "2025-12-11" }], []), "Proiect de lege privind aprobarea Ordonanţei de urgenţã a Guvernului nr.74/2025 pentru prorogarea unor termene");

  it("names the ordinance the bill approves, the first one in the title", () => {
    expect(approvedOrdinance(chamberPage.title)).toBe("76/2025");
    expect(approvedOrdinance(senatePage.title)).toBe("74/2025");
    expect(approvedOrdinance("Propunere legislativă pentru modificarea Legii nr.95/2006")).toBeUndefined();
    // The Chamber spells "Ordonanței" with a doubled n in some titles; the first ordinance named is still the one approved, not the one it amends.
    expect(approvedOrdinance("Proiect de Lege privind aprobarea Ordonnaţei de urgenţă nr.15/2021 pentru modificarea Ordonanţei de urgenţă a Guvernului nr.146/2020")).toBe("15/2021");
  });

  it("stay two bills even when the Chamber page prints the Senate's number by mistake", () => {
    expect(groupPages([chamberPage, senatePage])).toHaveLength(2);
  });

  it("join when the titles agree or name no ordinance", () => {
    expect(groupPages([chamberPage, withTitle(senatePage, "Proiect de lege privind aprobarea Ordonanţei de urgenţã a Guvernului nr.76/2025 pentru modificarea")])).toHaveLength(1);
    expect(groupPages([withTitle(chamberPage, "Propunere legislativă pentru modificarea Legii nr.95/2006"), senatePage])).toHaveLength(1);
  });
});

describe("a blank stage cell", () => {
  const html = `<html><head><title>PL-x nr. 216/2026</title></head><body><table>
    <tr valign=top><td bgcolor="#fff0d8">Stadiu:</td><td>&nbsp;</td></tr>
  </table></body></html>`;

  it("is no stage on the Chamber page", () => {
    expect(parseCdepDossier(html, "https://www.cdep.ro/x").stage).toBeUndefined();
  });

  it("does not hide the stage the Senate page prints", () => {
    const chamberPage = { ...page("cdep", "PL-x 216/2026", [{ body: "cdep", number: "216", date: "2026-05-04" }, { body: "senate", number: "L654", year: 2025 }], [step("cdep", "deputies", "2026-06-10", "registered")]), stage: "" };
    const senatePage = { ...page("senate", "L654/2025", [{ body: "senate", number: "L654", date: "2025-12-11" }], [step("senate", "senate", "2026-03-02", "registered")]), stage: "Trimis la Cameră pentru dezbatere" };
    const [group] = groupPages([chamberPage, senatePage]);
    expect(mergeDossiers(group!).stage).toBe("Trimis la Cameră pentru dezbatere");
  });
});

describe("the law's number when the two pages' stage lines differ", () => {
  it("is taken from the Chamber's line ('Lege 180/2022') although the Senate's page, with the later step, still reads 'Trimis la Cameră pentru dezbatere'", () => {
    const chamberPage = { ...page("cdep", "PL-x 134/2022", [{ body: "cdep", number: "134", date: "2022-03-21" }, { body: "senate", number: "L62", year: 2021 }], [step("cdep", "deputies", "2022-06-14", "promulgation")]), stage: "Lege 180/2022" };
    const senatePage = { ...page("senate", "L62/2021", [{ body: "senate", number: "L62", date: "2021-12-15" }], [step("senate", "senate", "2022-06-15", "registered")]), stage: "Trimis la Cameră pentru dezbatere" };
    const [group] = groupPages([chamberPage, senatePage]);
    const merged = mergeDossiers(group!);
    expect(merged.stage).toBe("Trimis la Cameră pentru dezbatere");
    expect(merged.fate).toMatchObject({ outcome: "promulgated", lawNumber: "180", lawYear: 2022 });
  });
});


describe("pages the owner has linked (Sprint 19)", () => {
  const chamber = { source: "cdep", selfId: "PL-x 594/2021", registrations: [] } as unknown as Parameters<typeof groupPages>[0][number];
  const senate = { source: "senate", selfId: "L520/2021", registrations: [] } as unknown as Parameters<typeof groupPages>[0][number];
  it("joins a Chamber page and a Senate page that share no number when a bridge names both keys", () => {
    expect(groupPages([chamber, senate])).toHaveLength(2);
    const groups = groupPages([chamber, senate], [["d:pl-x594/2021", "l:l520/2021"]]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.pages).toHaveLength(2);
  });
  it("still never joins two Chamber pages, bridge or not", () => {
    const other = { source: "cdep", selfId: "PL-x 595/2021", registrations: [] } as unknown as typeof chamber;
    expect(groupPages([chamber, other], [["d:pl-x594/2021", "d:pl-x595/2021"]])).toHaveLength(2);
  });
});
