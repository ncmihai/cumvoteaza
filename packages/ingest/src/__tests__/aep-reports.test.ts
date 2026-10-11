import { describe, expect, it } from "vitest";
import { incomeKindOf, leiOf, parseAnnualReport, parseControlReport, parseReportList } from "../finance/aep-reports";

// Extracts of two real reports (Official Gazette 57 of 19 Jan 2022 and 968 of 21 Oct 2020), the sentences the AEP writes.
const PSD_2020 = "RAPORT nr. 22.427 din 10 decembrie 2021în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului Social Democrat în anul 2020 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ Publicat în MONITORUL OFICIAL nr. 57 din 19 ianuarie 2022 - extras - În conformitate cu prevederile art. 42 alin. (1) din Legea nr. 334/2006 privind finanțarea activității partidelor politice, în perioada 25.08.2021-10.12.2021 s-a desfășurat misiunea de control referitoare la respectarea prevederilor legale privind sursele de finanțare și cheltuielile înregistrate de Partidul Social Democrat în anul 2020, perioada verificată fiind 1.01.2020-31.12.2020. Constatări: Ca urmare a verificărilor efectuate asupra documentelor puse la dispoziția echipei de control s-a constatat că Partidul Social Democrat a obținut în anul 2020 venituri aferente activității curente în sumă totală de 147.419.259,28 lei, astfel: 10.488.373,77 lei reprezentând venituri din cotizații, 2.623.730,47 lei reprezentând venituri din donații, 3.347,61 lei reprezentând venituri din reduceri comerciale mai mari de 20% din valoarea bunurilor/serviciilor, 12.711.025,00 lei reprezentând venituri din împrumuturi, 121.116.029,83 lei reprezentând subvenții acordate de la bugetul de stat și 476.752,60 lei reprezentând venituri din alte surse. Cheltuielile aferente activității curente au fost în sumă totală de 136.220.834,19 lei. În urma controlului efectuat s-a constatat că au fost încălcate prevederile art. 3 alin. (2), (4) și (8), art. 5 alin. (4), art. 13 alin. (1), art. 25 alin. (2), art. 38 alin. (4), art. 43 alin. (4) și ale art. 60 alin. (3) din Legea nr. 334/2006, republicată. București, 10 decembrie 2021.";
const PSD_2019 = "RAPORT nr. 23.827 din 15 octombrie 2020în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului Social Democrat în anul 2019 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - Constatări: s-a constatat că Partidul Social Democrat a obținut în anul 2019 venituri în sumă totală de 154.820.946,52 lei, astfel: 10.065.197,50 lei - venituri din cotizații, 270.856,35 lei - venituri din donații, 270,15 lei - venituri din dobânzi, 906,01 lei - venituri din diferențe de curs valutar, 5.554,32 lei - venituri din diferențe de curs activ FSP, 143.751.949,87 lei - subvenții acordate de la bugetul de stat și 726.212,32 lei - venituri din activități fără scop patrimonial. Cheltuielile au fost în sumă totală de 215.490.660,61 lei. În urma controlului efectuat s-a constatat că au fost încălcate prevederile art. 3 alin. (8), art. 5 alin. (4), art. 16 alin. (3), art. 25 alin. (2) și art. 60 alin. (3) din Legea nr. 334/2006, republicată, cu modificările și completările ulterioare. București, 15 octombrie 2020.";

describe("parseAnnualReport", () => {
  it("reads the income by source, the total, the expenses and the broken articles of a 2020 report", () => {
    const report = parseAnnualReport(PSD_2020)!;
    expect(report).toMatchObject({ party: "Partidul Social Democrat", year: 2020, incomeTotal: 147419259.28, expensesTotal: 136220834.19, linesAddUp: true, noViolations: false });
    expect(report.income.map((line) => [line.kind, line.lei])).toEqual([["dues", 10488373.77], ["donations", 2623730.47], ["other", 3347.61], ["loans", 12711025], ["subsidy", 121116029.83], ["other", 476752.6]]);
    expect(report.violations).toEqual(["art. 3 alin. (2), (4) și (8)", "art. 5 alin. (4)", "art. 13 alin. (1)", "art. 25 alin. (2)", "art. 38 alin. (4)", "art. 43 alin. (4)", "art. 60 alin. (3)"]);
  });

  it("reads the other phrasing (an amount, a dash, the source) and still adds up", () => {
    const report = parseAnnualReport(PSD_2019)!;
    expect(report).toMatchObject({ year: 2019, incomeTotal: 154820946.52, expensesTotal: 215490660.61, linesAddUp: true });
    expect(report.income.filter((line) => line.kind === "subsidy").reduce((sum, line) => sum + line.lei, 0)).toBeCloseTo(143751949.87, 2);
    expect(report.income.map((line) => line.kind)).toEqual(["dues", "donations", "interest", "other", "other", "subsidy", "other"]);
  });

  it("says when the lines do not add up instead of hiding it, and leaves out a text of another shape", () => {
    const short = PSD_2019.replace("270.856,35 lei - venituri din donații, ", "");
    expect(parseAnnualReport(short)!.linesAddUp).toBe(false);
    expect(parseAnnualReport("RAPORT privind verificarea legalității veniturilor și cheltuielilor electorale ale Partidului Noua Românie: nu au fost înregistrate venituri și cheltuieli electorale.")).toBeUndefined();
  });
});

describe("helpers", () => {
  it("reads Romanian amounts and sorts the sources", () => {
    expect(leiOf("147.419.259,28")).toBe(147419259.28);
    expect(leiOf("270,15")).toBe(270.15);
    expect(incomeKindOf("subvenții acordate de la bugetul de stat")).toBe("subsidy");
    expect(incomeKindOf("venituri din cotizații")).toBe("dues");
    expect(incomeKindOf("venituri din activități fără scop patrimonial")).toBe("other");
  });

  it("reads a result list: the report's number, date, title and gazette", () => {
    const html = `<div>2 document(e) găsit(e)</div><div class="search_result_item"><p>1. RAPORT 10/12/2021</p><p>RAPORT nr. 22.427 din 10 decembrie 2021<br/>în urma verificării respectării prevederilor legale privind veniturile şi cheltuielile Partidului Social Democrat în anul 2020<br/>EMITENT Autoritatea Electorală Permanentă<br/>PUBLICAT ÎN Monitorul Oficial nr. 57 din 19 ianuarie 2022</p><a href="/Public/DetaliiDocument/250585">Vizualizeaza</a></div>`;
    expect(parseReportList(html)).toEqual({ total: 2, items: [{ portalId: "250585", number: "22427", issuedOn: "2021-12-10", title: "în urma verificării respectării prevederilor legale privind veniturile şi cheltuielile Partidului Social Democrat în anul 2020", gazetteNumber: "57", gazetteOn: "2022-01-19" }] });
  });
});

// Extracts of the 2026 report on the Union Save Romania for 2023 and 2024 (Official Gazette 849 of 9 Oct 2026) and of a 2026 report on a party with no income.
const USR_2326 = "RAPORT nr. 13.093 din 30 iulie 2026 privind verificarea respectării prevederilor legale privind veniturile și cheltuielile înregistrate de Partidul Uniunea Salvați România în perioada 1.01.2023-31.12.2024 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - I. Constatări Ca urmare a verificărilor efectuate asupra documentelor justificative puse la dispoziția echipei de control de către Partidul Uniunea Salvați România, s-a constatat că: În anul 2023, veniturile obținute de Partidul Uniunea Salvați România au fost în valoare totală de 49.264.863,89 lei, după cum urmează: – 2.919.659,09 lei - venituri din cotizații; ... – 556.780,75 lei - venituri din donații; ... – 1.945,52 lei - venituri din dobânzi bancare; ... – 45.768.288,67 lei - venituri din subvențiile de la bugetul de stat: ... – 18.133,11 lei - alte venituri din exploatare; ... – 56,75 lei - venituri din diferențe favorabile de curs valutar. ... În anul 2024, veniturile obținute de Partidul Uniunea Salvați România au fost în valoare totală de 144.576.518,37 lei, după cum urmează: – 3.451.933,80 lei - venituri din cotizații; ... – 50.815.180,08 lei - venituri din donații, din care: ... – 3.088.067,75 lei - venituri donații activitate curentă; ... – 35.020,77 lei - venituri din donații provenite din reduceri comerciale mai mari de 20%; ... – 6.306.347,51 lei - venituri din rambursare cheltuieli electorale alegeri europarlamentare; ... – 15.063.091,59 lei - venituri din rambursare cheltuieli electorale locale generale; ... – 1.218.938,73 lei - sume nerambursate candidați alegeri locale; ... – 25.103.713,73 lei - venituri din rambursare cheltuieli electorale alegeri prezidențiale; ... – 0,25 lei - venituri din dobânzi bancare; ... – 90.281.984,71 lei - venituri din subvențiile de la bugetul de stat: ... – 27.379,26 lei - alte venituri din exploatare; ... – 40,27 lei - venituri din diferențe favorabile de curs valutar. ... Cheltuielile efectuate în anul 2023 de Partidul Uniunea Salvați România sunt în cuantum de 48.402.308,03 lei. Cheltuielile efectuate în anul 2024 de Partidul Uniunea Salvați România sunt în cuantum de 169.463.114,87 lei. ... II. Sancțiuni aplicate Partidul Uniunea Salvați România a fost sancționat cu amendă în cuantum de 40.000,00 lei pentru nerespectarea prevederilor art. 25 alin. (2) și ale art. 43 alin. (4) din Legea nr. 334/2006 privind finanțarea activității partidelor politice și a campaniilor electorale, republicată , cu modificările și completările ulterioare, și s-a hotărât confiscarea sumei de 758.358,59 lei. ... București, 30 iulie 2026.";
const NOTHING = "RAPORT nr. 12.353 din 16 iulie 2026 privind verificarea respectării prevederilor legale privind veniturile și cheltuielile Partidului Victoria Națională (ARCA) în anul 2025 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - În conformitate cu prevederile art. 42 alin. (1) din Legea nr. 334/2006, s-a desfășurat misiunea de control referitoare la respectarea prevederilor legale privind veniturile și cheltuielile înregistrate de Partidul Victoria Națională (ARCA) în anul 2025, perioada verificată fiind 1.01.2025-31.12.2025. I. Constatări În urma verificărilor efectuate și a analizei documentelor depuse, echipa de control a constatat că Partidul Victoria Națională (ARCA) nu a înregistrat venituri și nu a efectuat cheltuieli în perioada supusă controlului. ... II. Sancțiuni aplicate Nu a fost cazul. ... București, 16 iulie 2026. Nr. 12.353.";

describe("parseControlReport", () => {
  it("reads a paragraph per year: the sources, the 'din care' lines counted once, the expenses of each year, the fine and the confiscation", () => {
    const report = parseControlReport(USR_2326)!;
    expect(report.party).toBe("Partidul Uniunea Salvați România");
    expect(report.years.map((year) => [year.year, year.incomeTotal, year.expensesTotal, year.linesAddUp])).toEqual([[2023, 49264863.89, 48402308.03, true], [2024, 144576518.37, 169463114.87, true]]);
    expect(report.years[1]!.income.filter((line) => line.kind === "refund").reduce((sum, line) => sum + line.lei, 0)).toBeCloseTo(6306347.51 + 15063091.59 + 25103713.73, 2);
    expect(report.years[1]!.income.filter((line) => line.kind === "subsidy").map((line) => line.lei)).toEqual([90281984.71]);
    expect(report).toMatchObject({ fineLei: 40000, confiscatedLei: 758358.59, nothingRegistered: false });
    expect(report.violations).toEqual(["art. 25 alin. (2)", "art. 43 alin. (4)"]);
  });

  it("reads a party that registered nothing, and the single-year shape of 2019 to 2021 with its broken articles", () => {
    const none = parseControlReport(NOTHING)!;
    expect(none).toMatchObject({ party: "Partidul Victoria Națională (ARCA)", nothingRegistered: true, noViolations: true });
    expect(none.years.map((year) => [year.year, year.incomeTotal])).toEqual([[2025, 0]]);
    const single = parseControlReport(PSD_2020)!;
    expect(single.years).toHaveLength(1);
    expect(single.violations).toHaveLength(7);
  });
});

// The sentence forms of 2018 to 2022 (Official Gazette of 2019 to 2023): the sources in a sentence, a total with no breakdown, nothing declared, nothing sent.
const UDMR_2018 = "RAPORT nr. 29.577 din 11 decembrie 2019 în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Uniunii Democrate Maghiare din România în anul 2018 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ Publicat în MONITORUL OFICIAL nr. 1 din 6 ianuarie 2020 - extras - + Constatări: Ca urmare a verificărilor efectuate asupra documentelor justificative puse la dispoziția echipei de control, s-a constatat că în anul 2018 veniturile Uniunii Democrate Maghiare din România au fost în cuantum total de 28.374.179,98 lei, din care: cotizații ale membrilor de partid în sumă de 1.421.043,46 lei, donații în sumă de 694.996,77 lei, dobânzi în sumă de 404,62 lei, alte venituri din activități fără scop patrimonial în sumă de 84.892,12 lei, venituri din cedarea activelor corporale în sumă de 15.261,44 lei, venituri din creanțe reactivate în sumă de 101,57 lei și resurse obținute de la bugetul de stat în sumă de 26.157.480,00 lei. Cheltuielile totale au fost în sumă de 24.381.556,41 lei. În urma controlului efectuat nu s-au constatat încălcări. București, 11 decembrie 2019.";
const PNL_1718 = "RAPORT nr. 29.578 din 11 decembrie 2019 în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului Național Liberal în anii 2017-2018 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - + Constatări: Ca urmare a verificărilor efectuate asupra documentelor puse la dispoziția echipei de control s-a constatat că pentru anul 2017 veniturile Partidului Național Liberal au totalizat 18.394.050,92 lei și au fost obținute din cotizații, donații, venituri din alte surse și subvenții de la bugetul de stat. Cheltuielile au fost în sumă de 11.201.817,85 lei. Ca urmare a verificărilor efectuate asupra documentelor puse la dispoziția echipei de control s-a constatat că pentru anul 2018 veniturile Partidului Național Liberal au totalizat 53.304.092,41 lei, fiind obținute din cotizații în sumă de 6.794.189,66 lei, donații în sumă de 720.370,84 lei, subvenții de la bugetul de stat în sumă de 44.441.815,46 lei și venituri din activități fără scop patrimonial, inclusiv venituri din dobânzi, în sumă de 1.347.716,45 lei. Cheltuielile au fost în sumă de 16.362.796,77 lei. În urma controlului efectuat s-a constatat că au fost încălcate prevederile art. 3 alin. (8) , art. 5 alin. (4) , art. 16 alin. (1) , art. 45 alin (2) și ale art. 60 alin. (3) din Legea nr. 334/2006, republicată. București, 11 decembrie 2019.";
const NOT_DECLARED = "RAPORT nr. 17.725 din 15 septembrie 2021 în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului Dreapta Conservatoare în anii 2019 și 2020 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - + Constatări: Ca urmare a verificărilor efectuate asupra documentelor puse la dispoziția echipei de control, sa constatat că formațiunea politică nu a declarat venituri și cheltuieli pentru anii 2019 și 2020. În urma controlului efectuat s-a constatat că au fost încălcate prevederile art. 49 alin. (1) și (3) din Legea nr. 334/2006, republicată. București, 15 septembrie 2021.";
const NOT_SENT = "RAPORT nr. 29.211 din 6 decembrie 2019 în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului Social Democrat Independent în anul 2018 EMITENT AUTORITATEA ELECTORALĂ PERMANENTĂ - extras - + Constatări: Întrucât Partidul Social Democrat Independent nu a transmis în termen de 15 zile documentele solicitate de Autoritatea Electorală Permanentă, echipa de control nu a putut verifica veniturile și cheltuielile formațiunii politice aferente anului 2018. În urma controlului efectuat s-a constatat că au fost încălcate prevederile art. 43 alin. (4) și ale art. 49 alin. (1) și (3) din Legea nr. 334/2006. București, 6 decembrie 2019.";

describe("parseControlReport on the sentence forms", () => {
  it("reads the sources a sentence lists after 'din care', including the one whose name holds commas", () => {
    const report = parseControlReport(UDMR_2018)!;
    expect(report.party).toBe("Uniunea Democrată Maghiară din România");
    expect(report.years.map((year) => [year.year, year.incomeTotal, year.expensesTotal, year.linesAddUp])).toEqual([[2018, 28374179.98, 24381556.41, true]]);
    expect(report.years[0]!.income.find((line) => line.kind === "subsidy")?.lei).toBe(26157480);
    const pnl = parseControlReport(PNL_1718)!;
    expect(pnl.party).toBe("Partidul Național Liberal");
    expect(pnl.years.map((year) => [year.year, year.incomeTotal, year.expensesTotal, year.linesAddUp])).toEqual([[2017, 18394050.92, 11201817.85, false], [2018, 53304092.41, 16362796.77, true]]);
    expect(pnl.years[1]!.income.map((line) => line.kind)).toEqual(["dues", "donations", "subsidy", "other"]);
    expect(pnl.violations).toHaveLength(5);
  });

  it("gives a year with no figures its note, never a zero it was not told", () => {
    const declared = parseControlReport(NOT_DECLARED)!;
    expect(declared.years.map((year) => [year.year, year.incomeTotal])).toEqual([[2019, undefined], [2020, undefined]]);
    expect(declared.years[0]!.note).toMatch(/declared no income/);
    const sent = parseControlReport(NOT_SENT)!;
    expect(sent.years).toHaveLength(1);
    expect(sent.years[0]!.year).toBe(2018);
    expect(sent.years[0]!.incomeTotal).toBeUndefined();
    expect(sent.years[0]!.note).toMatch(/did not send/);
    expect(sent.violations).toEqual(["art. 43 alin. (4)", "art. 49 alin. (1) și (3)"]);
  });
});
