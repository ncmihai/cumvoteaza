import { describe, expect, it } from "vitest";
import { actionOf, classifyAppointment, titleOf } from "../presidency/appointments";

describe("classifyAppointment", () => {
  const cases: Array<[string, string, string, string]> = [
    ["judiciary_leadership", "Domnul Alex-Florin Florența se numește în funcția de procuror general al Parchetului de pe lângă Înalta Curte de Casație și Justiție pe o perioadă de 3 ani.", "appointment", "prosecutor-general"],
    ["judiciary_leadership", "Domnul Aurel-Sebastian Vălean se numește în funcția de prim-adjunct al procurorului general al Parchetului de pe lângă Înalta Curte de Casație și Justiție pe o perioadă de 3 ani.", "appointment", "prosecutor-general-deputy"],
    ["judiciary_leadership", "Domnul Marius-Ionuț Voineag se numește în funcția de procuror-șef al Direcției Naționale Anticorupție pe o perioadă de 3 ani.", "appointment", "dna-chief"],
    ["judiciary_leadership", "Doamna Tatiana Toader se numește în funcția de procuror-șef adjunct al Direcției Naționale Anticorupție pe o perioadă de 3 ani.", "appointment", "dna-deputy"],
    ["judiciary_leadership", "Doamna Mădălina Scarlat se numește în funcția de adjunct al procurorului șef al Direcției Naționale Anticorupție, pe o perioadă de 3 ani.", "appointment", "dna-deputy"],
    ["judiciary_leadership", "Doamna Alina Albu se numește în funcția de procuror-șef al Direcției de Investigare a Infracțiunilor de Criminalitate Organizată și Terorism pe o perioadă de 3 ani.", "appointment", "diicot-chief"],
    ["judiciary_leadership", "Doamna Elena-Giorgiana Hosu se numește în funcția de procuror-șef adjunct al Direcției de Investigare a Infracțiunilor de Criminalitate Organizată și Terorism pe o perioadă de 3 ani.", "appointment", "diicot-deputy"],
    ["judiciary_leadership", "Domnul Popa Remus-Iulian se numește în funcția de procuror-șef al Secției de urmărire penală din cadrul Parchetului de pe lângă Înalta Curte de Casație și Justiție pe o perioadă de 3 ani.", "appointment", "prosecutor-section-chief"],
    ["judiciary_leadership", "Doamna Laura Codruța Kövesi se revocă din funcția de procuror-șef al Direcției Naționale Anticorupție.", "dismissal", "dna-chief"],
    ["judiciary_leadership", "Domnul Tiberiu-Mihail Niţu se eliberează din funcţia de procuror general al Parchetului de pe lângă Înalta Curte de Casaţie şi Justiţie ca urmare a demisiei.", "resignation", "prosecutor-general"],
    ["judiciary_leadership", "Laura Codruţa Kovesi se reînvesteşte în funcţia de procuror-şef al Direcţiei Naţionale Anticorupţie, pentru o perioadă de 3 ani, începând cu data de 16 mai 2016.", "reappointment", "dna-chief"],
    ["judiciary_leadership", "Doamna Iulia-Cristina Tarcea se eliberează din funcţia de vicepreşedinte al Înaltei Curţi de Casaţie şi Justiţie, ca urmare a numirii în funcţia de preşedinte al Înaltei Curţi de Casaţie şi Justiţie.", "release", "iccj-vice-president"],
    ["presidential_staff", "Începând cu data de 25 mai 2026, domnul Radu-Ioan Mogoș se numește în funcția de consilier de stat.", "appointment", "state-counsellor"],
    ["presidential_staff", "Începând cu data de 19 noiembrie 2025, domnul Ludovic Orban este eliberat din funcția de consilier prezidențial.", "release", "presidential-adviser"],
    ["pm_designation", "Se desemnează domnul Ion-Marcel Ciolacu în calitate de candidat la funcția de prim-ministru, pentru a cere votul de încredere al Parlamentului asupra programului și listei noului Guvern.", "designation", "pm-candidate"],
    ["pm_designation", "Se revocă Decretul nr. 316/2026 privind desemnarea candidatului la funcția de prim-ministru, prin care a fost desemnat domnul Eugen Tomac în calitate de candidat.", "dismissal", "pm-candidate"],
    ["government", "Se ia act de demisia domnului Florin-Ionuț Barbu din funcția de ministru al agriculturii și dezvoltării rurale și se constată vacanța acestei funcții.", "resignation", "minister"],
    ["government", "Se desemnează domnul Radu-Dinel Miruță, viceprim-ministru, ministrul apărării naționale, în funcția de ministru al transporturilor și infrastructurii, interimar.", "interim", "minister"],
    ["diplomacy", "Doamna Theodora-Magdalena Mircea, ambasador extraordinar și plenipotențiar al României în Republica Cuba, în Federația Saint Kitts și Nevis, se acreditează.", "appointment", "ambassador"],
    ["diplomacy", "Domnul Ștefan-Alexandru Tinca se recheamă din calitatea de ambasador extraordinar și plenipotențiar al României în Republica Turcia.", "recall", "ambassador"],
    ["diplomacy", "Se acordă gradul diplomatic de ambasador doamnei Mihaela-Simona Spinaru.", "rank", "diplomatic-rank"],
    ["constitutional_court", "Domnul X se numește judecător la Curtea Constituțională.", "appointment", "ccr-judge"],
    ["presidential_staff", "Se numesc în funcția de consilier prezidențial: – doamna Daniela Bârsan; ... – doamna Mihaela Ciochină;", "appointment", "presidential-adviser"],
    ["presidential_staff", "Se numesc în funcția de consilier de stat: – domnul Gheorghe Angelescu; ... – domnul Constantin Ionescu;", "appointment", "state-counsellor"],
    ["diplomacy", "Doamna Daniela Mariana Sezonov-Țane își va încheia misiunea în termen de cel mult 90 de zile de la publicarea prezentului decret.", "release", "ambassador"]
  ];
  for (const [kind, sentence, action, office] of cases) {
    it(`${office} / ${action}: "${sentence.slice(0, 70)}…"`, () => {
      const facts = classifyAppointment(kind as never, sentence);
      expect(facts.action).toBe(action);
      expect(facts.office).toBe(office);
    });
  }

  it("takes the office as the sentence words it and cuts the term and the reason", () => {
    expect(titleOf("Domnul Alex-Florin Florența se numește în funcția de procuror general al Parchetului de pe lângă Înalta Curte de Casație și Justiție pe o perioadă de 3 ani.")).toBe("procuror general al Parchetului de pe lângă Înalta Curte de Casație și Justiție");
    expect(titleOf("Începând cu data de 31 ianuarie 2026, domnul Mihai Șomordolea se eliberează din funcția de consilier de stat, la cerere.")).toBe("consilier de stat");
    expect(titleOf("Se ia act de demisia domnului X din funcția de ministru al sănătății și se constată vacanța acestei funcții.")).toBe("ministru al sănătății");
    expect(titleOf("Domnul Ovidiu Alexandru Raețchi se acreditează în calitate de ambasador extraordinar și plenipotențiar al României în Japonia, cu reședința la Tokyo.")).toBe("ambasador extraordinar și plenipotențiar al României în Japonia, cu reședința la Tokyo");
    expect(titleOf("Nimic de citit aici.")).toBeUndefined();
  });

  it("calls a sentence no rule knows \"other\"", () => {
    expect(actionOf("Domnul X are o altă soartă.")).toBe("other");
    expect(classifyAppointment("diplomacy", "Altceva despre cineva.").office).toBe("other");
  });
});
