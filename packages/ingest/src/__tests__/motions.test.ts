import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMotionDetail, parseMotionsList } from "../parsers/motions";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures", name), "utf8");

describe("CDEP motions", () => {
  it("reads the list of censure motions with their official results", () => {
    const rows = parseMotionsList(fixture("cdep-motions-censure-list.html"), "https://www.cdep.ro/ords/pls/parlam/motiuni2015.lista?cam=0");
    expect(rows[0]).toEqual(expect.objectContaining({ number: 1, filedOn: "2026-04-28", outcome: "adopted" }));
    expect(rows[0]!.detailUrl).toBe("https://www.cdep.ro/ords/pls/parlam/parlament.motiuni2015.detalii?leg=2024&cam=0&idm=1584");
    expect(rows[0]!.documentUrl).toBe("https://www.cdep.ro/motiuni/2026/1583.pdf");
    expect(rows.map((row) => row.outcome)).toEqual(["adopted", "rejected", "rejected"]);
    expect(rows[2]).toEqual(expect.objectContaining({ number: 1, filedOn: "2025-02-25" }));
  });

  it("reads the result, totals and signatories of the motion that dismissed the Bolojan government", () => {
    const motion = parseMotionDetail(fixture("cdep-motion-detail.html"), "https://www.cdep.ro/ords/pls/parlam/parlament.motiuni2015.detalii?leg=2024&cam=0&idm=1584")!;
    expect(motion).toEqual(expect.objectContaining({ kind: "censure", number: 1, filedOn: "2026-04-28", outcome: "adopted", votesFor: 281, votesAgainst: 4, signatoriesDeputies: 175, signatoriesSenators: 79 }));
    expect(motion.title).toContain("Planului Bolojan");
    expect(motion.documentUrl).toBe("https://www.cdep.ro/motiuni/2026/1583.pdf");
    expect(motion.signatories.slice(0, 2)).toEqual([
      { officialId: "3", chamber: "deputies", legislatureYear: "2024", displayName: "Albu Dumitriţa", groupLabel: "Neafiliaţi" },
      { officialId: "5", chamber: "deputies", legislatureYear: "2024", displayName: "Alecu Robert", groupLabel: "Neafiliaţi" }
    ]);
    expect(motion.signatories.map((item) => item.groupLabel)).toContain("PSD");
    expect(motion.signatories.at(-1)).toEqual(expect.objectContaining({ chamber: "senate", groupLabel: "Neafiliaţi" }));
  });

  it("ignores pages that are not a motion", () => {
    expect(parseMotionDetail("<html><body><p>nothing</p></body></html>", "https://www.cdep.ro/x")).toBeUndefined();
  });

  it("reads presentation and vote dates, and a vote total without an 'against' figure (censure motion 6/2025)", () => {
    const html = `<html><body><div class="boxTitle"><h1>Opriţi sărăcirea românilor</h1></div><div class="boxDep clearfix"><h3>
      <p><b>Moţiune de cenzură</b>, iniţiată de <b>Deputaţi şi senatori aparţinând grupurilor parlamentare ale AUR</b><p><b>Nr./Data înregistrării:</b> 6 / 03.09.2025
      <p><b>Textul moţiunii</b>: Prezentare în şedinţa comună a Camerei Deputaţilor şi Senatului din 04.09.2025 Vot în şedinţa comună a Camerei Deputaţilor şi Senatului din 07.09.2025
      <p> Rezultat: <b>Respinsă</b><br>Voturi pentru moţiune: 119<p>Moţiunea a fost semnată de către <b>126 parlamentari</b> (92 deputaţi şi 34 senatori)</h3></div></body></html>`;
    const motion = parseMotionDetail(html, "https://www.cdep.ro/x")!;
    expect(motion).toEqual(expect.objectContaining({ outcome: "rejected", votesFor: 119, presentedOn: "2025-09-04", votedOn: "2025-09-07", signatoriesDeputies: 92, signatoriesSenators: 34 }));
    expect(motion.votesAgainst).toBeUndefined();
  });

  it("reads an 'informare' with no vote and deputies-only signatures (simple motion 3/2025)", () => {
    const html = `<html><body><div class="boxTitle"><h1>Diplomaţia românească</h1></div><div class="boxDep clearfix"><h3>
      <p><b>Moţiune simplă</b>, iniţiată de <b>Deputaţi din grupul parlamentar AUR</b><p><b>Nr./Data înregistrării:</b> 3 / 23.04.2025
      <p><b>Textul moţiunii</b>: Informare în şedinţa Camerei Deputaţilor din 23.04.2025 <p>Moţiunea a fost semnată de către <b>75 deputaţi</b></h3></div></body></html>`;
    const motion = parseMotionDetail(html, "https://www.cdep.ro/x")!;
    expect(motion).toEqual(expect.objectContaining({ kind: "simple", outcome: "unknown", presentedOn: "2025-04-23", signatoriesDeputies: 75, signatoriesSenators: 0 }));
    expect(motion.votedOn).toBeUndefined();
  });
});
