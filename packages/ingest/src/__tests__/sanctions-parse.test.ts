import { describe, expect, it } from "vitest";
import { headlineDate, nameOf, parseSanctionsPage } from "../members/sanctions-parse";

const page = `<html><body><div class="grup-parlamentar-list grupuri-parlamentare-list">
<p><b>23 martie 2026 - DECIZIE privind aplicarea unei sancţiuni doamnei deputat Elena-Laura TOADER de diminuare a indemniza?iei cu 50% pe o perioadă de 3 luni.</b>
<p><a href="/pdfs/bp/Sanctiune_TOADER_decizie_6_2026.pdf" target="PDF"><i> vezi decizia Nr.6/23-03-2026</i> </a>
<p><b></b>
<p><a href="/pdfs/bp/Contestatie dna TOADER - DBP nr. 6-2026.pdf" target="PDF"><i> vezi contestaţia</i></a>
<p><b>HCD 34-2026 privind admiterea contestaţiei doamnei deputat Elena-Laura TOADER</b>
<p> <a href="/pdfs/bp/HCD 34-2026 Admitere dna. TOADER.pdf" target="PDF"><i> vezi admiterea contestaţiei</i></a>
<p align="right"><i><a href="https://www.cdep.ro/ords/pls/steno/steno2015.stenograma?ids=8992&idm=2&idl=1" target="STENO">vezi extrasul din stenograma sedintei</a></i>
<p><hr size=1><br>
<p><b>2 aprilie 2025 - Chemarea la ordine a doamnei deputat Anamaria Gavrilă, membră a Grupului parlamentar POT.</b>
<p align="right"><i><a href="/ords/pls/steno/steno2015.stenograma?ids=8881&idm=4&idl=1" target="STENO">vezi extrasul din stenograma sedintei</a></i>
<p><hr size=1><br>
<p><b>21 mai 2024 - Informare privind Decizia Biroului permanent privind aplicarea sancţiunii reducerii duratei luării de cuvânt la 10 secunde/intervenţie pe o perioadă de 2 luni în cadrul şedinţelor şi sancţiunea diminuării indemnizaţiei cu 30% pe o perioadă de o lună, domnului deputat Andi-Gabriel Grosaru pentru nerespectarea prevederilor art. 157 şi art. 158 din Regulamentul Camerei Deputaţilor.</b>
<p><a href="/ords/bp/docs?F1/DBP2.pdf" target="PDF"><i> vezi decizia Nr.2/17-05-2024</i></a>
<p><hr size=1><br>
<p><b>12 iunie 2023 - Informare privind adoptarea, în şedinţa secretă, a Hotărârilor nr. 28, 29, 30 referitoare la contestaţiile unor deputaţi.</b>
<p><hr size=1><br>
<p><b>17 mai 2023 - Deciziile Biroului permanent al Camerei Deputaţilor cu privire la sancţionarea domnului deputat Sorin-Titus MUNCACIU.</b>
<p><b>HCD 33/2023 pentru respingerea contestaţiei domnului deputat Sorin-Titus MUNCACIU</b>
<p><hr size=1><br>
</div></body></html>`;

describe("the Chamber's list of sanctions on deputies", () => {
  const parsed = parseSanctionsPage(page, "2020");

  it("reads one entry per block and leaves an announcement of several decisions out", () => {
    expect(parsed.entries).toHaveLength(4);
    expect(parsed.informational).toHaveLength(1);
    expect(parsed.entries.every((entry) => entry.legislature === "2020")).toBe(true);
  });

  it("reads the date, the deputy, the percentage and the months, and the links of the first entry", () => {
    const [first] = parsed.entries;
    expect(first).toMatchObject({ heldOn: "2026-03-23", nameText: "Elena-Laura TOADER", kind: "allowance_reduced", parts: [{ kind: "allowance_reduced", percent: 50, months: 3 }] });
    expect(first!.decision).toMatchObject({ number: "6", dated: "2026-03-23", url: "https://www.cdep.ro/pdfs/bp/Sanctiune_TOADER_decizie_6_2026.pdf" });
    expect(first!.contestation).toMatchObject({ outcome: "upheld" });
    expect(first!.contestationFiledUrl).toContain("Contestatie%20dna%20TOADER");
    expect(first!.stenogramUrl).toBe("https://www.cdep.ro/ords/pls/steno/steno2015.stenograma?ids=8992&idm=2&idl=1");
  });

  it("reads the group a deputy belongs to and a relative stenogram link", () => {
    expect(parsed.entries[1]).toMatchObject({ nameText: "Anamaria Gavrilă", groupLabel: "POT", kind: "call_to_order", stenogramUrl: "https://www.cdep.ro/ords/pls/steno/steno2015.stenograma?ids=8881&idm=4&idl=1" });
  });

  it("calls two sanctions in one entry combined and keeps both", () => {
    expect(parsed.entries[2]).toMatchObject({ kind: "combined", nameText: "Andi-Gabriel Grosaru", article: "art. 157 şi art. 158" });
    expect(parsed.entries[2]!.parts).toEqual([{ kind: "speaking_time_reduced", seconds: 10, months: 2 }, { kind: "allowance_reduced", percent: 30, months: 1 }]);
  });

  it("does not invent a kind when the headline only says the Bureau decided, and reads a rejected contestation", () => {
    expect(parsed.entries[3]).toMatchObject({ kind: "bureau_decision", parts: [], contestation: { outcome: "rejected" } });
  });

  it("gives an entry the same id every time", () => {
    expect(parseSanctionsPage(page, "2020").entries.map((entry) => entry.id)).toEqual(parsed.entries.map((entry) => entry.id));
    expect(new Set(parsed.entries.map((entry) => entry.id)).size).toBe(4);
  });
});

describe("two entries with the same words on the same day", () => {
  const entry = (extract: number) => `<p><b>8 aprilie 2019 - Retragerea cuvântului doamnei deputat Cristina-Mădălina Prună, membru al Grupului parlamentar al USR. </b>
<p align="right"><i><a href="/ords/pls/steno/steno2015.stenograma?ids=8049&idm=${extract}&idl=1" target="STENO">vezi extrasul din stenograma sedintei</a></i>
<p><hr size=1><br>`;
  const pageOf = (...extracts: number[]) => `<html><body><div class="grup-parlamentar-list">${extracts.map(entry).join("\n")}</div></body></html>`;

  it("keeps both, the first under the id it has when it stands alone and the second under its own", () => {
    const [first, second] = parseSanctionsPage(pageOf(4, 12), "2016").entries;
    expect(first!.id).toBe(parseSanctionsPage(pageOf(4), "2016").entries[0]!.id);
    expect(second!.id).not.toBe(first!.id);
    expect(first!.stenogramUrl).toContain("idm=4");
    expect(second!.stenogramUrl).toContain("idm=12");
  });

  it("gives them the same ids on every read", () => {
    const ids = () => parseSanctionsPage(pageOf(4, 12), "2016").entries.map((item) => item.id);
    expect(ids()).toEqual(ids());
  });
});

describe("headline pieces", () => {
  it("reads a Romanian date at the start, with or without diacritics, and nothing otherwise", () => {
    expect(headlineDate("03 octombrie 2023 - Informare")).toEqual({ heldOn: "2023-10-03", rest: "Informare" });
    expect(headlineDate("Chemarea la ordine a domnului deputat Dan Tanasă")).toEqual({ rest: "Chemarea la ordine a domnului deputat Dan Tanasă" });
  });

  it("finds the name after 'deputat' and stops before the words that follow it", () => {
    expect(nameOf("sancţiunii domnului deputat Dan Vîlceanu, cu aplicarea diminuării").nameText).toBe("Dan Vîlceanu");
    expect(nameOf("avertismentului scris domnului deputat Dumitru Coarnă pentru încălcarea prevederilor").nameText).toBe("Dumitru Coarnă");
    expect(nameOf("Atenţionarea verbală a domnului deputat Ilie Dan Barna, membru al USRR.")).toEqual({ nameText: "Ilie Dan Barna", groupLabel: "USRR" });
    expect(nameOf("Informare privind adoptarea Hotărârilor").nameText).toBeUndefined();
  });
});
