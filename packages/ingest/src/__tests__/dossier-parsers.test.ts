import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCdepDossier } from "../dossiers/cdep-dossier";
import { deriveFate, gazetteIn } from "../dossiers/fate";
import { parseSenateDossier, parseSenateInitiators } from "../dossiers/senate-dossier";
import type { DossierStep } from "../dossiers/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "..", "fixtures", name), "utf8");
const cdep = (name: string) => parseCdepDossier(fixture(name), "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=1");
const senate = (name: string) => parseSenateDossier(fixture(name), "https://www.senat.ro/Legis/Lista.aspx?an_cls=2025&nr_cls=L316");

describe("Chamber dossier, a promulgated law (PL-x 42/2026)", () => {
  const dossier = cdep("cdep-dossier-promulgated.html");

  it("reads the header facts as printed", () => {
    expect(dossier.selfId).toBe("PL-x 42/2026");
    expect(dossier.registrations).toEqual([
      { body: "bpi", number: "21", date: "2026-02-03" },
      { body: "cdep", number: "42", date: "2026-02-09" },
      { body: "senate", number: "L509", date: "2025-11-17" }
    ]);
    expect(dossier).toMatchObject({ character: "organic", urgent: false, decisionChamber: "deputies", initiativeType: "Proiect de Lege" });
    expect(dossier.stage).toMatch(/^Lege 53\/2026/);
    expect(dossier.consulted.map((item) => item.label)).toContain("Avizul Consiliului Legislativ");
  });

  it("links every initiator to a member profile (legislature, chamber and number), with the group printed beside the name", () => {
    expect(dossier.initiators).toHaveLength(268);
    expect(dossier.initiators.every((item) => item.profile)).toBe(true);
    expect(dossier.initiators[0]).toEqual({ kind: "member", name: "Făget Mădălin-Laurenţiu", chamber: "deputies", group: "neafiliati", profile: { legislature: 2024, chamber: "deputies", idm: 103 } });
    expect(dossier.initiators.at(-1)).toMatchObject({ chamber: "senate", group: "PACE", profile: { legislature: 2024, chamber: "senate", idm: 100 } });
  });

  it("types the steps, one per committee, with deadlines, verdicts and the vote page", () => {
    const sent = dossier.steps.filter((step) => step.type === "sent_to_committee");
    expect(sent.map((step) => step.committee)).toEqual(["Comisia juridică, de disciplină şi imunităţi", expect.stringContaining("Comisia specială comună")]);
    expect(sent.every((step) => step.deadlineAmendmentsOn === "2026-02-19" && step.deadlineOn === "2026-03-03")).toBe(true);

    const reports = dossier.steps.filter((step) => step.type === "committee_report_received");
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ verdict: "favorable_with_amendments", amendmentsAdmitted: 61, occurredOn: "2026-03-24", chamber: "deputies" });
    expect(reports[0]!.documents.length).toBeGreaterThan(0);

    const opinion = dossier.steps.find((step) => step.type === "committee_opinion_received" && step.committee === "Comisia pentru învăţământ");
    expect(opinion).toMatchObject({ occurredOn: "2026-02-17" });
    expect(opinion!.documents).toHaveLength(1);

    const adoptions = dossier.steps.filter((step) => step.type === "adopted");
    expect(adoptions.map((step) => [step.chamber, step.occurredOn])).toEqual([["senate", "2026-02-02"], ["deputies", "2026-03-25"]]);
    expect(adoptions[1]!.vote).toEqual({ for: 284, against: 1, abstention: 2, notVoting: 2, reference: { source: "cdep", id: "36828" } });
  });

  it("gives a row without a date the date of the row above, and keeps the page order", () => {
    const registered = dossier.steps.filter((step) => step.chamber === "deputies" && step.occurredOn === "2026-02-09" && step.type === "registered");
    expect(registered).toHaveLength(2);
    expect(dossier.steps.map((step) => step.order)).toEqual(dossier.steps.map((_, index) => index));
  });

  it("reads the fate: decree, law number, promulgation date", () => {
    expect(dossier.fate).toEqual({ outcome: "promulgated", decreeNumber: "232", decreeYear: 2026, decreeOn: "2026-04-23", lawNumber: "53", lawYear: 2026, outcomeOn: "2026-04-23" });
    expect(dossier.steps.filter((step) => step.chamber === "president").map((step) => step.type)).toEqual(["constitutional_window", "sent_to_president", "promulgation", "promulgation"]);
    expect(dossier.unrecognised).toEqual([]);
  });
});

describe("Chamber dossier, other shapes", () => {
  it("a bill the Senate rejected as first chamber stays in progress, and the page's own summary and opinions are kept", () => {
    const dossier = cdep("cdep-dossier-senate-rejected.html");
    expect(dossier.selfId).toBe("PL-x 560/2025");
    expect(dossier.steps[0]).toMatchObject({ type: "rejected", chamber: "senate", occurredOn: "2025-12-08" });
    expect(dossier.fate.outcome).toBe("in_progress");
    expect(dossier.initiators).toHaveLength(18);
    expect(dossier.summary).toMatch(/^Propunerea legislativă are ca obiect/);
    expect(dossier.consulted.map((item) => item.label)).toContain("Avizul Consiliului Superior al Magistraturii");
    expect(dossier.steps.find((step) => step.type === "government_view_received")).toMatchObject({ verdict: "unfavorable", institution: "Guvernul României" });
  });

  it("'procedure ended, forwarded to the Senate' is a handoff, not the end of the bill", () => {
    const dossier = cdep("cdep-dossier-procedure-ended.html");
    expect(dossier.stage).toBe("procedura legislativa încetata");
    expect(dossier.steps.at(-1)).toMatchObject({ type: "procedure_ended" });
    expect(dossier.fate.outcome).toBe("in_progress");
  });

  it("a Government bill has the Government as its initiator and no member profiles", () => {
    const dossier = cdep("cdep-dossier-government.html");
    expect(dossier.initiators).toEqual([{ kind: "government", name: "Guvernul României" }]);
    expect(dossier.initiativeKind).toBe("government_bill");
  });
});

describe("Senate dossier, a promulgated law (L316/2025)", () => {
  const dossier = senate("senate-dossier-promulgated.html");

  it("reads the registrations, the urgency and the fate with the Official Gazette", () => {
    expect(dossier.selfId).toBe("L316/2025");
    expect(dossier.registrations).toEqual([
      { body: "senate", number: "L316", date: "2025-09-08" },
      { body: "senate", number: "B382", date: "2025-09-04" },
      { body: "cdep", number: "PLX429/2025" },
      { body: "government", number: "E91/2025" }
    ]);
    expect(dossier).toMatchObject({ urgent: true, firstChamber: "senate", character: "ordinara", initiativeKind: "government_bill" });
    expect(dossier.fate).toEqual({
      outcome: "promulgated",
      decreeNumber: "1150",
      decreeYear: 2025,
      decreeOn: "2025-12-12",
      lawNumber: "238",
      lawYear: 2025,
      outcomeOn: "2025-12-12",
      gazetteNumber: "1171",
      gazetteOn: "2025-12-17"
    });
  });

  it("types the Senate side: urgency, deadline extensions, committee opinions with their numbers, the Senate vote page", () => {
    const types = (type: string) => dossier.steps.filter((step) => step.type === type);
    expect(types("urgency_requested")[0]).toMatchObject({ chamber: "senate", occurredOn: "2025-09-04" });
    expect(types("urgency_decided")[0]).toMatchObject({ occurredOn: "2025-09-08" });
    expect(types("deadline_extended")).toHaveLength(2);
    const opinions = dossier.steps.filter((step) => step.type === "committee_opinion_received" && step.chamber === "senate");
    expect(opinions.map((step) => [step.documentNumber, step.verdict])).toEqual([["213", "favorable"], ["30", "favorable"], ["401", "favorable"], ["341", "favorable"], ["150", "favorable"]]);
    expect(opinions[0]!.documents).toHaveLength(1);
    const senateAdoption = dossier.steps.find((step) => step.type === "adopted" && step.chamber === "senate");
    expect(senateAdoption?.vote).toEqual({ for: 116, against: 0, abstention: 5, reference: { source: "senate", id: "ef4ee11f-7327-4c71-9b76-2cb5c930e88c" } });
  });

  it("gives each committee its report deadline and the amendment deadline that the Senate prints on a row of its own", () => {
    const sent = dossier.steps.filter((step) => step.type === "sent_to_committee" && step.chamber === "senate");
    expect(sent).toHaveLength(3);
    expect(sent.every((step) => step.deadlineOn === "2025-09-16" && step.deadlineAmendmentsOn === "2025-09-15")).toBe(true);
    expect(sent[0]!.committeeRef).toEqual({ source: "senate", id: "0b43e912-a027-4003-942c-073d8c82af92" });
    expect(dossier.steps.some((step) => /^termen depunere amendamente/i.test(step.text))).toBe(false);
    expect(dossier.unrecognised).toEqual([]);
  });
});

describe("Senate dossier, other shapes", () => {
  it("a bill registered for information only: first chamber is the Chamber, initiators are named with their group", () => {
    const dossier = senate("senate-dossier-for-information.html");
    expect(dossier).toMatchObject({ selfId: "B678/2025", firstChamber: "deputies", stage: "înregistrat la Senat pt. informare", character: "organica" });
    expect(dossier.initiators).toHaveLength(66);
    expect(dossier.initiators[0]).toEqual({ kind: "member", name: "Barcari Dorina", chamber: "senate", group: "AUR" });
    expect(dossier.fate.outcome).toBe("in_progress");
  });

  it("a bill that went to the Chamber keeps the Chamber's steps it prints, marked as such", () => {
    const dossier = senate("senate-dossier-two-chambers.html");
    expect(dossier.selfId).toBe("L636/2025");
    expect(new Set(dossier.steps.map((step) => step.chamber))).toEqual(new Set(["deputies", "senate", "president"]));
    expect(dossier.steps.every((step) => step.source === "senate")).toBe(true);
  });
});

describe("helpers", () => {
  it("splits the Senate's initiator text and keeps the group as printed", () => {
    expect(parseSenateInitiators("Presură Alexandra - senator PSD; Cotea (Geamănu) Aurora-Adela - deputat PSD; Bouda Ştefan - deputat FCR (minoritãti)")).toEqual([
      { kind: "member", name: "Presură Alexandra", chamber: "senate", group: "PSD" },
      { kind: "member", name: "Cotea (Geamănu) Aurora-Adela", chamber: "deputies", group: "PSD" },
      { kind: "member", name: "Bouda Ştefan", chamber: "deputies", group: "FCR (minoritãti)" }
    ]);
    expect(parseSenateInitiators("Guvernul României")).toEqual([{ kind: "government", name: "Guvernul României" }]);
    expect(parseSenateInitiators("-")).toEqual([]);
  });

  it("reads the Official Gazette in both spellings", () => {
    expect(gazetteIn("publicată în Monitorul Oficial nr. 1171/17.12.2025")).toEqual({ number: "1171", on: "2025-12-17" });
    expect(gazetteIn("A devenit Legea nr.238/12.12.2025 publicatã în M.O. nr.1171/17.12.2025")).toEqual({ number: "1171", on: "2025-12-17" });
    expect(gazetteIn("nimic")).toBeUndefined();
  });

  it("derives fate only from what the page says: a rejection counts only when the deciding chamber rejects", () => {
    const step = (type: DossierStep["type"], chamber: DossierStep["chamber"], text: string, occurredOn = "2026-01-01", order = 0): DossierStep => ({ source: "cdep", chamber, occurredOn, order, type, text, documents: [] });
    expect(deriveFate({ steps: [step("rejected", "senate", "respinsa de catre Senat")], decisionChamber: "deputies" }).outcome).toBe("in_progress");
    expect(deriveFate({ steps: [step("rejected", "deputies", "respinsa de catre Camera Deputatilor")], decisionChamber: "deputies" })).toMatchObject({ outcome: "rejected", outcomeOn: "2026-01-01" });
    expect(deriveFate({ steps: [step("withdrawn", "senate", "retras de către inițiator")] }).outcome).toBe("withdrawn");
    expect(deriveFate({ steps: [], stage: "A devenit Legea nr.5/10.02.2026 publicatã în M.O. nr.99/12.02.2026" })).toMatchObject({ outcome: "promulgated", lawNumber: "5", lawYear: 2026, gazetteNumber: "99", gazetteOn: "2026-02-12" });
    expect(deriveFate({ steps: [], stage: "Lege 53/2026 LEGE pentru ..." })).toMatchObject({ outcome: "promulgated", lawNumber: "53", lawYear: 2026 });
  });
});
