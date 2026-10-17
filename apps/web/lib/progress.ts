import { formatDate } from "@cumsevoteaza/parliament-model";
import type { OfficialBillRow, OfficialVoteTotals, SeatCoverageRow, VoteCoverageRow } from "./coverage-data";

/**
 * D-060: how much of the record the site holds and how much is still to get, for the methodology page.
 *
 * A bar is drawn only where a real total exists: an official list, a register (the ministry's list of missions), a number sequence (the decrees of a year are numbered 1 to N) or a fixed set of periods
 * (the ten legislatures since 1990). Where no total exists, the row says so and carries no bar: an invented total would be a made-up percentage. Everything here is a pure function of counts the database gives,
 * so the numbers move by themselves as imports run and the tests need no database.
 */
export type Lang = "ro" | "en";
export interface Text { ro: string; en: string }

/** complete: held and agreeing with a total we could check (or the source is itself the total); held: held, but nothing to say whether it is all; none: not held. */
export type CellState = "complete" | "held" | "none";

export interface ProgressBar { kind: "bar"; id: string; label: Text; have: number; total: number; basis: Text; missing?: Text }
export interface ProgressCell { label: string; state: CellState; detail: Text }
export interface ProgressStrip { kind: "strip"; id: string; label: Text; cells: ProgressCell[]; basis: Text }
/** A row with no total to compare with: what we hold (if anything) and why there is no bar. */
export interface ProgressNote { kind: "note"; id: string; label: Text; value?: string; tone: "held" | "none"; note: Text }
export type ProgressItem = ProgressBar | ProgressStrip | ProgressNote;
export interface ProgressArea { id: string; title: Text; href: string; items: ProgressItem[] }

export interface ProgressInput {
  /** The legislatures since 1990, in any order. */
  legislatures: Array<{ label: string; startsOn: string }>;
  votes: VoteCoverageRow[];
  officialVotes?: OfficialVoteTotals;
  officialBills?: { generatedOn: string; rows: OfficialBillRow[] };
  bills: { bills: number; withDossier: number; promulgated: number; promulgatedWithGazette: number };
  seats: SeatCoverageRow[];
  members: { current: number; withBirthDate: number; withCv: number };
  elections: Array<{ kind: "parliamentary" | "presidential"; heldOn: string; legislatureYear: string }>;
  governments: Array<{ slug: string; name: string; roles: number }>;
  ministries: Array<{ slug: string; name: string; hasLeadership: boolean }>;
  decreesByYear: Array<{ year: number; held: number; highest: number }>;
  missions: { headed: number; withHead: number; honorary: number; cultural: number };
  documents: { linked: number; proposals: number; proposalsStored: number; reports: number; opinions: number };
  finance: { firstYear?: number; lastYear?: number; annualReports: number; campaignReports: number };
  questions: { deputies: Record<string, number>; senate: Record<string, number> };
  motions: Record<string, number>;
}

/** The presidential elections since 1990 (the Constitutional Court's and the AEP's records): the 2024 first round was annulled and re-run in May 2025. A fixed fact, not read from our data. */
export const PRESIDENTIAL_ELECTION_YEARS = [1990, 1992, 1996, 2000, 2004, 2009, 2014, 2019, 2024, 2025] as const;

/** At or above this share a count agreeing with its official total is called complete (the same line the votes table uses). */
export const COMPLETE_FROM = 99;

const number = (value: number, lang: Lang) => new Intl.NumberFormat(lang === "ro" ? "ro-RO" : "en-GB").format(value);
const both = (build: (lang: Lang) => string): Text => ({ ro: build("ro"), en: build("en") });

/** Share of a total, rounded down to one decimal: 2,604 of 2,609 is 99.8%, never 100%. */
export function sharePercent(have: number, total: number): number | null {
  if (total <= 0) return null;
  if (have >= total) return 100;
  return Math.floor((have / total) * 1000) / 10;
}

/** "2020-2024" → "2020–24". */
export const shortLegislature = (label: string) => label.replace(/^(\d{4})-(\d{2})(\d{2})$/, "$1–$3");

const ascending = (legislatures: ProgressInput["legislatures"]) => [...legislatures].sort((a, b) => a.startsOn.localeCompare(b.startsOn));

function bar(id: string, label: Text, have: number, total: number, basis: Text, missing?: Text): ProgressBar {
  return { kind: "bar", id, label, have: Math.min(have, total), total, basis, ...(missing ? { missing } : {}) };
}

const stateWords: Record<CellState, Text> = {
  complete: { ro: "complet", en: "complete" },
  held: { ro: "păstrat, fără un total oficial cu care să-l comparăm", en: "held, with no official total to compare it with" },
  none: { ro: "nu avem", en: "not held" }
};

function votesStrip(input: ProgressInput): ProgressStrip {
  const cells = ascending(input.legislatures).map((legislature): ProgressCell => {
    const rows = input.votes.filter((row) => row.legislature === legislature.label);
    const count = rows.reduce((sum, row) => sum + row.votes, 0);
    const state: CellState = count === 0 ? "none" : rows.every((row) => row.status === "complete") ? "complete" : "held";
    return { label: shortLegislature(legislature.label), state, detail: both((lang) => `${legislature.label}: ${count ? `${number(count, lang)} ${lang === "ro" ? (count === 1 ? "vot" : "voturi") : count === 1 ? "vote" : "votes"}, ${stateWords[state][lang]}` : stateWords.none[lang]}`) };
  });
  return {
    kind: "strip", id: "votes-legislatures", cells,
    label: { ro: "Voturile, pe legislatură", en: "Votes, by legislature" },
    basis: { ro: "„Complet” numai după ce listele oficiale ale zilelor de vot au fost comparate cu ce avem și avem cel puțin 99%.", en: "“Complete” only once the official lists of the voting days were compared with what we hold and we have at least 99%." }
  };
}

function rosterStrip(input: ProgressInput): ProgressStrip {
  const cells = ascending(input.legislatures).map((legislature): ProgressCell => {
    const rows = input.seats.filter((row) => row.legislature === legislature.label);
    const mandates = rows.reduce((sum, row) => sum + row.mandatesEver, 0);
    const seats = rows.reduce((sum, row) => sum + (row.seats ?? 0), 0);
    const bothChambers = (["deputies", "senate"] as const).every((chamber) => rows.some((row) => row.chamber === chamber && row.seats !== undefined && row.mandatesEver >= row.seats));
    const state: CellState = mandates === 0 ? "none" : bothChambers ? "complete" : "held";
    return { label: shortLegislature(legislature.label), state, detail: both((lang) => `${legislature.label}: ${mandates ? (lang === "ro" ? `${number(mandates, lang)} de mandate pentru ${number(seats, lang)} de locuri` : `${number(mandates, lang)} mandates for ${number(seats, lang)} seats`) : stateWords.none[lang]}`) };
  });
  return {
    kind: "strip", id: "rosters", cells,
    label: { ro: "Parlamentarii, pe legislatură", en: "Members, by legislature" },
    basis: { ro: "„Complet” când fiecare Cameră are cel puțin tot atâtea mandate câte locuri legale; înlocuirile din timpul legislaturii se adaugă peste.", en: "“Complete” when each chamber holds at least as many mandates as it has legal seats; replacements during a legislature come on top." }
  };
}

function parliamentaryElectionsStrip(input: ProgressInput): ProgressStrip {
  const cells = ascending(input.legislatures).map((legislature): ProgressCell => {
    const year = legislature.label.slice(0, 4);
    const held = input.elections.filter((election) => election.kind === "parliamentary" && election.legislatureYear === year);
    const state: CellState = held.length ? "complete" : "none";
    return { label: year, state, detail: both((lang) => `${year}: ${held.length ? `${lang === "ro" ? "rezultate păstrate" : "results held"} (${held.map((election) => formatDate(election.heldOn, lang)).join(", ")})` : stateWords.none[lang]}`) };
  });
  return {
    kind: "strip", id: "elections-parliamentary", cells,
    label: { ro: "Alegerile parlamentare din 1990 încoace", en: "Parliamentary elections since 1990" },
    basis: { ro: "Rezultate pe circumscripții și liste, din datele deschise ale AEP; „complet” când alegerile sunt citite.", en: "Results by circumscription and list, from the AEP's open data; “complete” when the election is read." }
  };
}

function presidentialElectionsStrip(input: ProgressInput): ProgressStrip {
  const cells = PRESIDENTIAL_ELECTION_YEARS.map((year): ProgressCell => {
    const rounds = input.elections.filter((election) => election.kind === "presidential" && election.heldOn.startsWith(String(year)));
    const state: CellState = rounds.length ? "complete" : "none";
    return { label: String(year), state, detail: both((lang) => `${year}: ${rounds.length ? (lang === "ro" ? `rezultate păstrate (${rounds.length === 1 ? "un tur" : `${rounds.length} tururi`})` : `results held (${rounds.length === 1 ? "one round" : `${rounds.length} rounds`})`) : stateWords.none[lang]}`) };
  });
  return {
    kind: "strip", id: "elections-presidential", cells,
    label: { ro: "Alegerile prezidențiale din 1990 încoace", en: "Presidential elections since 1990" },
    basis: { ro: "Zece scrutine (primul tur din 2024 a fost anulat și refăcut în 2025).", en: "Ten elections (the 2024 first round was annulled and re-run in 2025)." }
  };
}

function questionsStrip(id: string, label: Text, counts: Record<string, number>, input: ProgressInput): ProgressStrip {
  const cells = ascending(input.legislatures).map((legislature): ProgressCell => {
    const count = counts[legislature.label] ?? 0;
    const state: CellState = count ? "held" : "none";
    return { label: shortLegislature(legislature.label), state, detail: both((lang) => `${legislature.label}: ${count ? `${number(count, lang)}, ${stateWords.held[lang]}` : stateWords.none[lang]}`) };
  });
  return { kind: "strip", id, label, cells, basis: { ro: "Citite din paginile oficiale; fără un total oficial al legislaturii, nu o numim completă.", en: "Read from the official pages; with no official total for the legislature we do not call it complete." } };
}

/** The years with the most missing numbers, as "2011 (341), 1998 (197)". */
function mostMissing(years: ProgressInput["decreesByYear"], count: number): string {
  return years
    .map((row) => ({ year: row.year, missing: row.highest - row.held }))
    .filter((row) => row.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.year - b.year)
    .slice(0, count)
    .map((row) => `${row.year} (${row.missing})`)
    .join(", ");
}

export function buildProgress(input: ProgressInput): ProgressArea[] {
  const areas: ProgressArea[] = [];

  // Votes
  const votes: ProgressItem[] = [votesStrip(input)];
  const official = input.officialVotes;
  if (official && official.totals.length) {
    const have = official.totals.reduce((sum, item) => sum + item.held, 0);
    const total = official.totals.reduce((sum, item) => sum + item.official, 0);
    votes.push(bar("votes-official", { ro: "Voturile din 2024–2028 față de listele oficiale", en: "Votes of 2024–2028 against the official lists" }, have, total,
      both((lang) => (lang === "ro" ? `Lista oficială a fiecărei zile de vot, de la ${formatDate(official.rangeFrom, lang)}, verificată la ${formatDate(official.generatedOn, lang)}.` : `Each voting day's official list, since ${formatDate(official.rangeFrom, lang)}, checked on ${formatDate(official.generatedOn, lang)}.`)),
      total > have ? both((lang) => (lang === "ro" ? `${number(total - have, lang)} lipsesc față de lista oficială.` : `${number(total - have, lang)} missing against the official list.`)) : undefined));
  }
  const heldVotes = input.votes.reduce((sum, row) => sum + row.votes, 0);
  const nominalVotes = input.votes.reduce((sum, row) => sum + row.nominalVotes, 0);
  if (heldVotes) {
    votes.push(bar("votes-nominal", { ro: "Voturi cu lista nominală (cine cum a votat)", en: "Votes with the named list (who voted how)" }, nominalVotes, heldVotes,
      { ro: "Din voturile păstrate; un vot secret sau o listă nepublicată de sursă nu are listă nominală.", en: "Of the votes we hold; a secret ballot or a list the source does not publish has no named list." }));
  }
  areas.push({ id: "votes", title: { ro: "Voturi", en: "Votes" }, href: "/votes", items: votes });

  // Bills and documents
  const bills: ProgressItem[] = [];
  const billRows = input.officialBills?.rows ?? [];
  if (input.officialBills && billRows.length) {
    const have = billRows.reduce((sum, row) => sum + row.held, 0);
    const total = billRows.reduce((sum, row) => sum + row.official, 0);
    const years = billRows.map((row) => row.year);
    const first = Math.min(...years);
    const last = Math.max(...years);
    const generatedOn = input.officialBills.generatedOn;
    bills.push(bar("bills-official", { ro: `Proiectele din ${first}–${last} față de listele oficiale pe an`, en: `Bills of ${first}–${last} against the official yearly lists` }, have, total,
      both((lang) => (lang === "ro" ? `Lista oficială a fiecărui an și a fiecărei Camere, verificată la ${formatDate(generatedOn, lang)}.` : `Each year's and each chamber's official list, checked on ${formatDate(generatedOn, lang)}.`)),
      total > have ? both((lang) => (lang === "ro" ? `${number(total - have, lang)} lipsesc față de listă.` : `${number(total - have, lang)} missing against the list.`)) : undefined));
  }
  if (input.bills.bills) {
    bills.push(bar("bills-dossier", { ro: "Proiecte cu dosarul citit (pașii, avizele, votul, promulgarea)", en: "Bills with their file read (steps, opinions, vote, promulgation)" }, input.bills.withDossier, input.bills.bills,
      { ro: "Din toate proiectele păstrate, inclusiv cele dinainte de 2020, care apar doar când le menționează un vot sau un proiect mai nou.", en: "Of all bills we hold, including those from before 2020, which appear only when a vote or a newer bill refers to them." }));
  }
  if (input.bills.promulgated) {
    bills.push(bar("bills-gazette", { ro: "Legi promulgate cu numărul Monitorului Oficial", en: "Promulgated laws with their Official Gazette number" }, input.bills.promulgatedWithGazette, input.bills.promulgated,
      { ro: "Numărul vine de pe pagina Parlamentului sau de pe portalul legislativ.", en: "The number comes from Parliament's page or the legislative portal." }));
  }
  if (input.documents.proposals) {
    bills.push(bar("documents-text", { ro: "Propuneri legislative cu textul păstrat", en: "Legislative proposals with their text stored" }, input.documents.proposalsStored, input.documents.proposals,
      { ro: "Textul propunerii, păstrat pentru căutare în text; restul au doar legătura către fișierul oficial.", en: "The proposal's text, stored for full-text search; the rest have only the link to the official file." }));
  }
  if (input.documents.linked) {
    bills.push({ kind: "note", id: "documents-linked", tone: "held", label: { ro: "Documente legate de proiecte", en: "Documents linked to bills" }, value: number(input.documents.linked, "ro"),
      note: both((lang) => (lang === "ro"
        ? `Cu legătură către fișierul oficial (avize ale comisiilor ${number(input.documents.opinions, lang)}, rapoarte ${number(input.documents.reports, lang)}, alte forme și documente); textul lor nu este copiat. Nu există un total oficial cu care să le comparăm.`
        : `With the link to the official file (committee opinions ${number(input.documents.opinions, lang)}, reports ${number(input.documents.reports, lang)}, other forms and documents); their text is not copied. There is no official total to compare them with.`)) });
  }
  bills.push({ kind: "note", id: "laws-text", tone: "none", label: { ro: "Textul legilor și ce schimbă fiecare proiect", en: "The text of laws and what each bill changes" }, note: { ro: "Planificat: legea publicată și versiunea consolidată, comparate articol cu articol. Încă necitit.", en: "Planned: the law as published and the consolidated version, compared article by article. Not read yet." } });
  areas.push({ id: "bills", title: { ro: "Proiecte legislative și documente", en: "Bills and documents" }, href: "/bills", items: bills });

  // Members
  const members: ProgressItem[] = [rosterStrip(input)];
  const current = input.seats.filter((row) => row.openMandates !== undefined && row.seats !== undefined);
  if (current.length) {
    members.push(bar("seats-now", { ro: "Locuri ocupate acum în Parlament", en: "Seats filled in Parliament now" }, current.reduce((sum, row) => sum + (row.openMandates ?? 0), 0), current.reduce((sum, row) => sum + (row.seats ?? 0), 0),
      { ro: "Mandatele deschise față de numărul legal de locuri; un loc rămâne gol până la înlocuire.", en: "Open mandates against the legal number of seats; a seat stays empty until it is filled." }));
  }
  if (input.members.current) {
    members.push(bar("members-birth", { ro: "Parlamentari în funcție cu data nașterii", en: "Sitting members with a date of birth" }, input.members.withBirthDate, input.members.current,
      { ro: "Data din profilul oficial; dacă profilurile aceleiași persoane se contrazic, nu afișăm nicio dată.", en: "The date on the official profile; if one person's profiles disagree, we show no date." }));
    members.push(bar("members-cv", { ro: "Parlamentari în funcție cu CV-ul citit", en: "Sitting members with their CV read" }, input.members.withCv, input.members.current,
      { ro: "Din CV-urile depuse la Cameră și la Senat; unii parlamentari nu au CV pe site-ul oficial.", en: "From the CVs filed with the Chamber and the Senate; some members have no CV on the official site." }));
  }
  areas.push({ id: "members", title: { ro: "Parlamentari", en: "Members of Parliament" }, href: "/members", items: members });

  // Elections
  areas.push({
    id: "elections", title: { ro: "Alegeri", en: "Elections" }, href: "/elections",
    items: [
      parliamentaryElectionsStrip(input),
      presidentialElectionsStrip(input),
      { kind: "note", id: "elections-other", tone: "none", label: { ro: "Alegeri locale, europarlamentare și referendumuri", en: "Local and European elections and referendums" }, note: { ro: "Nu sunt citite.", en: "Not read." } }
    ]
  });

  // Government and ministries
  const government: ProgressItem[] = [];
  // A caretaker government (the slug says "acting") keeps the ministers of the one that left, so only the others are counted.
  const cabinets = input.governments.filter((government) => !/-acting-/.test(government.slug));
  if (cabinets.length) {
    const withCabinet = cabinets.filter((government) => government.roles > 1);
    const without = cabinets.filter((government) => government.roles <= 1).map((government) => government.name);
    government.push(bar("governments-cabinets", { ro: "Guverne cu miniștrii numiți", en: "Governments with their ministers named" }, withCabinet.length, cabinets.length,
      { ro: "Guvernele de la 1989 încoace, fără cele interimare (un prim-ministru interimar păstrează miniștrii guvernului plecat). Miniștrii vin din decretele de numire.", en: "The governments since 1989, without caretaker ones (an acting prime minister keeps the ministers of the government that left). The ministers come from the appointment decrees." },
      without.length ? both((lang) => `${lang === "ro" ? "Doar prim-ministrul" : "Prime minister only"}: ${without.join(", ")}.`) : undefined));
  }
  if (input.ministries.length) {
    const without = input.ministries.filter((ministry) => !ministry.hasLeadership).map((ministry) => ministry.name);
    government.push(bar("ministries-leadership", { ro: "Ministere cu conducerea citită de pe site-ul propriu", en: "Ministries with their leadership read from their own site" }, input.ministries.length - without.length, input.ministries.length,
      { ro: "Ministrul, secretarii de stat și secretarul general, așa cum le arată pagina ministerului.", en: "The minister, state secretaries and secretary general, as the ministry's page shows them." },
      without.length ? both((lang) => `${lang === "ro" ? "Lipsește" : "Missing"}: ${without.join(", ")}.`) : undefined));
  }
  government.push({ kind: "note", id: "investiture", tone: "none", label: { ro: "Listele nominale ale votului de învestitură", en: "Named lists of the investiture vote" }, note: { ro: "Nu sunt în fișierele de voturi ale Camerei; totalurile se văd pe pagina fiecărui guvern, listele nu sunt citite.", en: "They are not in the Chamber's vote files; the totals show on each government's page, the lists are not read." } });
  areas.push({ id: "government", title: { ro: "Guvern și ministere", en: "Government and ministries" }, href: "/governments", items: government });

  // Presidency
  const presidency: ProgressItem[] = [];
  const decreesHeld = input.decreesByYear.reduce((sum, row) => sum + row.held, 0);
  const decreesNumbered = input.decreesByYear.reduce((sum, row) => sum + row.highest, 0);
  if (decreesNumbered) {
    const years = input.decreesByYear.map((row) => row.year);
    const worst = mostMissing(input.decreesByYear, 4);
    presidency.push(bar("decrees", { ro: `Decretele din ${Math.min(...years)}–${Math.max(...years)} față de șirul numerelor`, en: `Decrees of ${Math.min(...years)}–${Math.max(...years)} against the numbering` },
      decreesHeld, decreesNumbered,
      { ro: "Decretele unui an sunt numerotate de la 1; totalul este cel mai mare număr pe care îl avem în fiecare an (un minim: numerele de după el nu se văd).", en: "A year's decrees are numbered from 1; the total is the highest number we hold in each year (a minimum: numbers after it cannot be seen)." },
      worst ? both((lang) => (lang === "ro" ? `Anii cu cele mai multe numere lipsă (între paranteze, câte): ${worst}. Un număr lipsă poate fi un decret nepublicat sau pe care portalul legislativ nu îl listează.` : `Years with the most numbers missing (how many in brackets): ${worst}. A missing number can be a decree never published or one the legislative portal does not list.`)) : undefined));
  }
  presidency.push({ kind: "note", id: "offices", tone: "none", label: { ro: "Șeful Statului Major al Apărării și alte funcții numite prin decret", en: "The Chief of the Defence Staff and other offices filled by decree" }, note: { ro: "Decretele sunt păstrate, dar nu sunt încă grupate pe funcție, cu succesiunea fiecăreia.", en: "The decrees are held but not yet grouped by office, with each office's succession." } });
  areas.push({ id: "presidency", title: { ro: "Președintele și decretele", en: "The President and decrees" }, href: "/presidency", items: presidency });

  // Ambassadors and missions
  const missions: ProgressItem[] = [];
  if (input.missions.headed) {
    missions.push(bar("missions-heads", { ro: "Misiuni cu șeful numit pe pagina ministerului", en: "Missions with their head named on the ministry's page" }, input.missions.withHead, input.missions.headed,
      { ro: "Ambasade, misiuni permanente, consulate generale și consulate din lista Ministerului Afacerilor Externe; pagina fiecăreia numește șeful (un însărcinat cu afaceri, când nu e ambasador).", en: "Embassies, permanent missions, consulates general and consulates on the Foreign Affairs ministry's list; each one's page names its head (a chargé d'affaires where there is no ambassador)." },
      input.missions.headed > input.missions.withHead ? both((lang) => (lang === "ro" ? `${number(input.missions.headed - input.missions.withHead, lang)} pagini nu numesc pe nimeni (post vacant sau altă machetă).` : `${number(input.missions.headed - input.missions.withHead, lang)} pages name no one (a vacant post or another layout).`)) : undefined));
  }
  if (input.missions.honorary + input.missions.cultural) {
    missions.push({ kind: "note", id: "missions-unread", tone: "none", label: { ro: "Consulate onorifice și institute culturale", en: "Honorary consulates and cultural institutes" }, value: number(input.missions.honorary + input.missions.cultural, "ro"),
      note: { ro: "Sunt în listă, dar șeful lor nu este citit: nu sunt posturi pe care le numește Președintele.", en: "They are on the list, but their head is not read: they are not posts the President fills." } });
  }
  areas.push({ id: "ambassadors", title: { ro: "Ambasadori și misiuni", en: "Ambassadors and missions" }, href: "/ministries/externe/ambassadors", items: missions });

  // Questions and motions
  areas.push({
    id: "questions", title: { ro: "Întrebări, interpelări și moțiuni", en: "Questions, interpellations and motions" }, href: "/questions",
    items: [
      questionsStrip("questions-deputies", { ro: "Întrebările și interpelările deputaților", en: "Deputies' questions and interpellations" }, input.questions.deputies, input),
      questionsStrip("questions-senate", { ro: "Întrebările și interpelările senatorilor", en: "Senators' questions and interpellations" }, input.questions.senate, input),
      questionsStrip("motions", { ro: "Moțiunile", en: "Motions" }, input.motions, input)
    ]
  });

  // Party money
  const finance = input.finance;
  areas.push({
    id: "finance", title: { ro: "Banii partidelor", en: "Party money" }, href: "/finance",
    items: [{
      kind: "note", id: "finance-reports", tone: finance.annualReports + finance.campaignReports ? "held" : "none", label: { ro: "Rapoarte anuale și de campanie ale AEP", en: "The AEP's annual and campaign reports" },
      ...(finance.firstYear !== undefined && finance.lastYear !== undefined ? { value: `${finance.firstYear}–${finance.lastYear}` } : {}),
      note: both((lang) => (lang === "ro"
        ? `${number(finance.annualReports, lang)} rapoarte anuale, ${number(finance.campaignReports, lang)} de campanie. Nu avem un registru al partidelor pe an cu care să le comparăm, deci nu putem spune cât lipsește; știm că lipsesc donatorii, subvenția pe trimestre și rapoartele detaliate din 2025.`
        : `${number(finance.annualReports, lang)} annual reports, ${number(finance.campaignReports, lang)} campaign reports. We hold no register of parties by year to compare them with, so we cannot say how much is missing; we know the donors, the subsidy by quarter and the detailed reports from 2025 are.`))
    }]
  });

  // An area with nothing to show (no total, no figure) is left out rather than drawn empty.
  return areas.filter((area) => area.items.length > 0);
}

