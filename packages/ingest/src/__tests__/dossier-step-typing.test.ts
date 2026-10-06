import { describe, expect, it } from "vitest";
import { fold, isoFromRomanianDate, typeStepWording } from "../dossiers/step-typing";

describe("fold", () => {
  it("keeps the length, folds Romanian letters in both codepages and the Senate's wrong ã", () => {
    expect(fold("Înscriş ȘI ţară publicatã")).toBe("inscris si tara publicata");
    expect(fold("Comisia pentru muncă şi protecţie socială")).toHaveLength("Comisia pentru muncă şi protecţie socială".length);
  });
});

describe("isoFromRomanianDate", () => {
  it("reads the three separators", () => {
    expect(isoFromRomanianDate("16/09/2025")).toBe("2025-09-16");
    expect(isoFromRomanianDate("termen: 5.1.2026")).toBe("2026-01-05");
    expect(isoFromRomanianDate("04-09-2025")).toBe("2025-09-04");
    expect(isoFromRomanianDate("nimic")).toBeUndefined();
  });
});

type Case = [string, Record<string, unknown>];

const cases: Case[] = [
  // arrival and registration
  ["prezentare în Biroul Permanent al Camerei Deputatilor", { type: "registered" }],
  ["înregistrat la Camera Deputatilor pentru dezbatere", { type: "registered", chamber: "deputies" }],
  ["Înregistrat la Senat pentru dezbatere cu nr.b382 (adresa nr.E91/04/09/2025)", { type: "registered", chamber: "senate" }],
  ["- înregistrat la Senat pentru dezbatere cu nr.LN/N (adresa nr.plx12/2025)", { type: "registered", chamber: "senate" }],
  ["cu nr.L316 prezentare în Biroul permanent; Senatul e prima Cameră sesizată", { type: "registered" }],
  ["primit de la Senat", { type: "registered" }],
  ["înaintat la Senat", { type: "sent_to_senate" }],
  ["prezentare în Biroul Permanent al Camerei Deputatilora fost aprobata procedura de urgență solicitată de inioțiatori", { type: "registered" }],
  // urgency and deadlines
  ["procedură de urgență solicitată de inițiator", { type: "urgency_requested" }],
  ["procedura de urgență solicitată de inițiator a fost aprobată", { type: "urgency_decided" }],
  ["solicitare prelungire termen de adoptare tacită de la 45 la 60 de zile", { type: "deadline_extended" }],
  ["plenul Senatului aprobă prelungirea termenului de adoptare tacită de la 45 la 60 de zile", { type: "deadline_extended" }],
  ["plenul aproba modificarea termenului de adoptare la 60 de zile pentru Camera Deputatilor ca prima Camera sesizata", { type: "deadline_extended" }],
  // committees named in the sentence
  ["trimis pentru raport la Comisia pentru afaceri europene (TERMEN: 16/09/2025)", { type: "sent_to_committee", committee: "Comisia pentru afaceri europene", deadlineOn: "2025-09-16" }],
  ["trimis pentru aviz la Comisia economică, industrii, servicii, turism și antreprenoriat (TERMEN: 15/09/2025)", { type: "committee_opinion_requested", committee: "Comisia economică, industrii, servicii, turism și antreprenoriat", deadlineOn: "2025-09-15" }],
  ["trimis pentru aviz la Consiliul Economic şi Social", { type: "opinion_requested", institution: "Consiliul Economic şi Social" }],
  ["trimis pentru aviz la Consiliul Legislativ (termen: 11/09/2025)", { type: "opinion_requested", institution: "Consiliul Legislativ", deadlineOn: "2025-09-11" }],
  ["trimis pentru punct de vedere la Guvern", { type: "government_view_requested" }],
  ["Comisia juridică, de numiri, disciplină, imunităţi şi validări transmite avizul cu nr. 213-FAVORABIL", { type: "committee_opinion_received", committee: "Comisia juridică, de numiri, disciplină, imunităţi şi validări", documentNumber: "213", verdict: "favorable" }],
  ["Comisia pentru drepturile omului transmite avizul cu nr. 401-NEGATIV", { type: "committee_opinion_received", verdict: "unfavorable", documentNumber: "401" }],
  ["Comisia pentru afaceri europene depune raportul cu nr. 261-FAVORABIL cu amendamente", { type: "committee_report_received", committee: "Comisia pentru afaceri europene", documentNumber: "261", verdict: "favorable_with_amendments" }],
  ["Comisia pentru agricultură depune raportul cu nr. 55-NEGATIV", { type: "committee_report_received", verdict: "unfavorable", documentNumber: "55" }],
  ["Comisia pentru buget depune raportul cu nr. 481-FAVORABIL", { type: "committee_report_received", verdict: "favorable" }],
  // committees listed below the sentence (the Chamber)
  ["trimis pentru raport la:", { type: "sent_to_committee" }],
  ["trimis pentru aviz la:", { type: "committee_opinion_requested" }],
  ["trimis pentru raport suplimentar la:", { type: "sent_to_committee" }],
  ["primire aviz de la:", { type: "committee_opinion_received" }],
  ["primire raport favorabil de la:", { type: "committee_report_received", verdict: "favorable" }],
  ["primire raport favorabil (61 amend. admise) de la:", { type: "committee_report_received", verdict: "favorable_with_amendments", amendmentsAdmitted: 61 }],
  ["primire raport de respingere de la:", { type: "committee_report_received", verdict: "rejection" }],
  ["primire raport de respingere (3 amend. respinse) de la:", { type: "committee_report_received", verdict: "rejection", amendmentsRejected: 3 }],
  ["primire raport suplimentar favorabil (2 amend. admise) de la:", { type: "committee_report_received", amendmentsAdmitted: 2 }],
  // outside bodies and the Government
  ["solicitare aviz de la Consiliul Legislativ", { type: "opinion_requested", institution: "Consiliul Legislativ" }],
  ["primire aviz de la Consiliul Legislativ - cu nr.596/27.08.2025 (negativ)", { type: "opinion_received", institution: "Consiliul Legislativ", documentNumber: "596/27.08.2025", verdict: "unfavorable" }],
  ["primire aviz de la Consiliul Economic şi Social - cu nr. 8/12.09.2025 (favorabil)", { type: "opinion_received", institution: "Consiliul Economic şi Social", verdict: "favorable" }],
  ["primire aviz de la Consiliul Fiscal - cu nr. 8/12.09.2025", { type: "opinion_received", institution: "Consiliul Fiscal", documentNumber: "8/12.09.2025" }],
  ["primire hotarâre de la Consiliul Suprem de Aparare a Tarii - cu nr.DSN4/2/05.11.2025", { type: "opinion_received", institution: "Consiliul Suprem de Aparare a Tarii" }],
  ["solicitare punct de vedere de la Guvern", { type: "government_view_requested" }],
  ["solicitare informare de la Guvern", { type: "government_view_requested" }],
  ["solicitare fisa financiara de la Guvern", { type: "government_view_requested" }],
  ["primire punct de vedere de la Guvern - cu nr.1234/15.01.2026 (negativ)", { type: "government_view_received", verdict: "unfavorable", documentNumber: "1234/15.01.2026" }],
  ["primire punct de vedere de la Guvern - cu nr. 77/02.02.2026", { type: "government_view_received", documentNumber: "77/02.02.2026" }],
  // plenary
  ["înscris pe ordinea de zi a plenului Camerei Deputatilor", { type: "agenda_scheduled", chamber: "deputies" }],
  ["înscris pe ordinea de zi a plenului Camerei Deputatilor (sub rezerva depunerii raportului)pentru şedinţele Camerei Deputaţilor din zilele de 11 si 13 mai 2026", { type: "agenda_scheduled" }],
  ["înscris pe ordinea de zi a plenului Senatului", { type: "agenda_scheduled", chamber: "senate" }],
  ["dezbatere în plenul Camerei Deputatilorconsultati stenograma sedintei", { type: "plenary_debate", chamber: "deputies" }],
  ["adoptat de Camera Deputatilor rezultat vot pentru=299, contra=0, abtineri=2, nu au votat=1", { type: "adopted", chamber: "deputies", vote: { for: 299, against: 0, abstention: 2, notVoting: 1 } }],
  ["adoptata de Camera Deputatilor", { type: "adopted", chamber: "deputies" }],
  ["adoptat de Senat pentru= 116 contra=0 abțineri=5", { type: "adopted", chamber: "senate", vote: { for: 116, against: 0, abstention: 5 } }],
  ["adoptat de Senat (adoptat în condiţiile art.75 alin.(2) teza a III-a din Constituţia României, republicată)", { type: "adopted", chamber: "senate" }],
  ["adoptat de Senatadoptare cu respectarea prevederilor art.76 alin.(1) din Constitutia României", { type: "adopted", chamber: "senate" }],
  ["adoptat de Camera Deputatilortitlu: Lege pentru instituirea anului 2026 pentru=266, contra=0, abtineri=2", { type: "adopted", chamber: "deputies", vote: { for: 266, against: 0, abstention: 2 } }],
  ["proiectul de lege pentru aprobarea ordonantei de urgenta adoptat de Senat", { type: "adopted", chamber: "senate" }],
  ["respinsa de catre Senat", { type: "rejected", chamber: "senate" }],
  ["respinsa de catre Camera Deputatilor", { type: "rejected", chamber: "deputies" }],
  ["respins de Senat pentru= 80 contra=40 abțineri=3", { type: "rejected", chamber: "senate", vote: { for: 80, against: 40, abstention: 3 } }],
  // the end of the road
  ["depunere la Secretarul general pentru exercitarea dreptului de sesizare asupra constitutionalitatii legii", { type: "constitutional_window" }],
  ["depus la Secretarul general și anunțat în plenul Senatului, pentru exercitarea dreptului de sesizare asupra constitutionalității legii", { type: "constitutional_window" }],
  ["trimitere la Presedintele României pentru promulgare", { type: "sent_to_president" }],
  ["trimis la promulgare", { type: "sent_to_president" }],
  ["promulgata prin Decret nr.232/2026", { type: "promulgation" }],
  ["devine Legea nr.53/2026", { type: "promulgation" }],
  ["promulgat prin Decret nr. 1150/12/12/2025; devine Legea nr. 238/12/12/2025", { type: "promulgation" }],
  ["publicată în Monitorul Oficial nr. 1171/17.12.2025", { type: "published" }],
  ["retras de către inițiator;", { type: "withdrawn" }],
  ["iniţiatorul solicită retragerea inițiativei legislative din procesul legislativ", { type: "withdrawn" }],
  ["încetarea procedurii legislative prin desesizarea Camerei Deputatilor; înaintare la Senat.", { type: "procedure_ended" }],
  ["Sesizare la Curtea Constituţională", { type: "constitutional_review" }],
  // competence
  ["- trimis pentru aviz în vederea stabilirii competenței la Comisia pentru constituţionalitate", { type: "competence_decision", committee: "Comisia pentru constituţionalitate" }],
  ["plenul Senatului a aprobat trimiterea inițiativei legislative la Camera Deputaţilor, ca primă Cameră sesizată, urmare a primirii avizului Comisiei pentru constituţionalitate nr.4/12.11.2025", { type: "competence_decision" }]
];

describe("typeStepWording", () => {
  it.each(cases)("%s", (sentence, expected) => {
    const typed = typeStepWording(sentence);
    expect(typed).toMatchObject({ recognised: true, ...expected });
  });

  it("says plainly when it does not know a sentence", () => {
    expect(typeStepWording("o formulare cu totul nouă")).toMatchObject({ type: "other", recognised: false });
  });
});

describe("wording found in the full corpus of 2024-2026", () => {
  const more: Case[] = [
    ["Clasat, conform Hotărârii Biroului Permanent al Senatului din data de 30.12.2024 în baza art.63 alin.(5) din Constituţie", { type: "archived" }],
    ["se aprobă retragerea din lista de inițiatori", { type: "initiators_changed" }],
    ["se aprobă completarea listei de inițiatori", { type: "initiators_changed" }],
    ["retragerea semnăturii", { type: "initiators_changed" }],
    ["Președintele României cere reexaminarea legii", { type: "reexamination_requested" }],
    ["Presedintele României solicita reexaminarea;cererea de reexaminare este înaintata Camerei Deputatilor", { type: "reexamination_requested" }],
    ["s-a depus sesizare de neconstituționalitate; autor: Președintele României", { type: "constitutional_review" }],
    ["sesizare de neconstituţionalitate", { type: "constitutional_review" }],
    ["trimis pentru raport privind decizia Curții Constituționale la Comisia pentru constituţionalitate (TERMEN: 21/04/2026)", { type: "sent_to_committee", committee: "Comisia pentru constituţionalitate", deadlineOn: "2026-04-21" }],
    ["trimis pentru raport privind cererea de reexaminare formulată de Președintele României, la Comisia juridică, de numiri, disciplină, imunităţi şi validări (TERMEN: 11/11/2025)", { type: "sent_to_committee", committee: "Comisia juridică, de numiri, disciplină, imunităţi şi validări", deadlineOn: "2025-11-11" }],
    ["trimis pentru aviz privind cererea de reexaminare formulată de Președintele României, la Comisia pentru tineret și sport (TERMEN: 09/09/2025)", { type: "committee_opinion_requested", committee: "Comisia pentru tineret și sport" }],
    ["adoptat în ședința comună a celor două Camere", { type: "adopted", chamber: "joint" }],
    ["vot final respingere - fără majoritate calificată", { type: "final_vote" }],
    ["vot final adoptare - nu a fost întrunită majoritatea simplă", { type: "final_vote" }],
    ["legea pentru aprobarea ordonantei adoptata de Camera Deputatilor (ca urmare a cererii de reexaminare)", { type: "adopted", chamber: "deputies" }],
    ["propunerea legislativă privind introducerea în curriculum naţional a disciplinei \"Educaţie\" (Pl-x 446/2025) (adoptată ca urmare a depăşirii termenului constituţional).", { type: "adopted" }],
    ["solicitarea Comisiei juridice, de disciplină şi imunităţi cu privire la încadrarea în categoria legilor de complexitate deosebită şi, în consecinţă, prelungirea termenului constituţional de dezbatere", { type: "deadline_extended" }],
    ["Biroul permanent a aprobat prelungirea termenului de depunere a raportului", { type: "deadline_extended" }],
    ["aprobarea procedurii de urgenta în plenul Camerei Deputatilor", { type: "urgency_decided" }],
    ["Guvernul își angajează răspunderea în Parlament - asupra formei inițiatorului (nu au fost acceptate amendamente)", { type: "government_responsibility" }],
    ["solicitare punct de vedere de la Consiliul Concurenţei", { type: "opinion_requested", institution: "Consiliul Concurenţei" }],
    ["primire punct de vedere de la Consiliul Concurenţei - cu nr.RG 8636/17.06.2026", { type: "opinion_received", institution: "Consiliul Concurenţei", documentNumber: "RG 8636/17.06.2026" }],
    ["trimis pentru punct de vedere la Înalta Curte de Casație și Justiție", { type: "opinion_requested", institution: "Înalta Curte de Casație și Justiție" }],
    ["prezentare în Birourile Permanente reunite ale Senatului și Camerei Deputaților cu nr.L13", { type: "registered" }],
    ["trimis pentru avizarea competenţei de primă Cameră sesizată, la Comisia pentru constituţionalitate", { type: "competence_decision" }],
    ["plenul Senatului a aprobat trimiterea propunerii legislative la Camera Deputaţilor, ca primă Cameră sesizată, urmare a primirii avizului Comisiei pentru constituţionalitate nr.3381/23.10.2024", { type: "competence_decision" }],
    ["dezbaterea Proiectului de Lege pentru aprobarea Ordonanţei de urgenţă a Guvernului nr. 7/2024", { type: "plenary_debate" }],
    ["legea este respinsa de catre Senat", { type: "rejected", chamber: "senate" }],
    ["solicitarea iniţiatorilor de retragere a Propunerii legislative privind instituirea mecanismului permanent de audit extern", { type: "withdrawn" }]
  ];
  it.each(more)("%s", (sentence, expected) => {
    expect(typeStepWording(sentence)).toMatchObject({ recognised: true, ...expected });
  });
});

describe("the Presidency's letter", () => {
  it("is a recognised plain step, not wording the typing does not know", () => {
    expect(typeStepWording("Adresa Administraţiei Prezidenţiale")).toMatchObject({ type: "other", recognised: true });
  });
});
