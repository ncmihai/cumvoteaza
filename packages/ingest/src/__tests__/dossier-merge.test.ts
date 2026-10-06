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
  });

  it("stay two bills even when the Chamber page prints the Senate's number by mistake", () => {
    expect(groupPages([chamberPage, senatePage])).toHaveLength(2);
  });

  it("join when the titles agree or name no ordinance", () => {
    expect(groupPages([chamberPage, withTitle(senatePage, "Proiect de lege privind aprobarea Ordonanţei de urgenţã a Guvernului nr.76/2025 pentru modificarea")])).toHaveLength(1);
    expect(groupPages([withTitle(chamberPage, "Propunere legislativă pentru modificarea Legii nr.95/2006"), senatePage])).toHaveLength(1);
  });
});
