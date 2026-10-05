import { describe, expect, it } from "vitest";
import { combineGroups, groupPages, mergeDossiers } from "../dossiers/merge";
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

// The Chamber page names no Senate number and the Senate page names no Chamber number: nothing on the pages ties them.
const chamber = page("cdep", "PL-x 378/2026", [{ body: "cdep", number: "378", date: "2026-05-04" }], [step("cdep", "deputies", "2026-05-04", "registered"), step("cdep", "deputies", "2026-06-10", "adopted")]);
const senate = page("senate", "L142/2026", [{ body: "senate", number: "L142", date: "2026-06-12" }, { body: "senate", number: "B65", date: "2026-03-02" }], [step("senate", "senate", "2026-03-02", "registered"), step("senate", "senate", "2026-03-20", "sent_to_committee"), step("senate", "senate", "2026-06-12", "registered")]);

describe("bills whose two pages share no identifier", () => {
  it("are two groups on their own, which is why the importer combines them when the stored bill ties them", () => {
    expect(groupPages([chamber, senate])).toHaveLength(2);
  });

  it("read together, give one bill with both chambers' steps and every identifier", () => {
    const [a, b] = groupPages([chamber, senate]);
    const combined = combineGroups([a!, b!]);
    expect(combined.pages).toHaveLength(2);
    expect(combined.keys).toMatchObject({ deputies: "PL-x 378/2026", senateL: "L142/2026", senateB: ["B65/2026"] });
    const merged = mergeDossiers(combined);
    expect(merged.steps.filter((item) => item.chamber === "deputies")).toHaveLength(2);
    expect(merged.steps.filter((item) => item.chamber === "senate")).toHaveLength(3);
  });
});
