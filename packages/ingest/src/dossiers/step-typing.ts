import type { StepChamber, StepType, Verdict } from "./types";

/**
 * Lower case without Romanian diacritics, one character for one character (so an index in the folded text
 * is an index in the original). Also folds the wrong-codepage letters the Senate prints ("publicatã").
 */
export function fold(text: string): string {
  const map: Record<string, string> = { ă: "a", â: "a", ã: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t", ê: "e", é: "e", ö: "o", ő: "o", ü: "u", ű: "u", á: "a", í: "i", ó: "o", ú: "u" };
  return [...text.toLowerCase()].map((char) => map[char] ?? char).join("");
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

export interface TypedWording {
  type: StepType;
  /** Set when the sentence names the chamber it belongs to ("adoptat de Senat"). */
  chamber?: StepChamber;
  committee?: string;
  institution?: string;
  verdict?: Verdict;
  documentNumber?: string;
  amendmentsAdmitted?: number;
  amendmentsRejected?: number;
  deadlineOn?: string;
  vote?: { for?: number; against?: number; abstention?: number; notVoting?: number };
  /** The sentence says this is a legislative-council-style outside opinion rather than a parliamentary committee. */
  recognised: boolean;
}

/** "16/09/2025" or "16.09.2025" or "16-09-2025" to ISO. */
export function isoFromRomanianDate(value: string | undefined): string | undefined {
  const match = value?.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  return match ? `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}` : undefined;
}

function verdictFrom(folded: string): Verdict | undefined {
  if (/raport(ul)? (suplimentar )?de respingere|respingere/.test(folded)) return "rejection";
  if (/favorabil(?:\)|\s|$|-)?.*cu amendamente|favorabil\s*\(.*amend\. admise/.test(folded) || /raport(ul)? (suplimentar )?favorabil \(\d+ amend/.test(folded)) return "favorable_with_amendments";
  if (/negativ|nefavorabil|-negativ/.test(folded)) return "unfavorable";
  if (/favorabil/.test(folded)) return "favorable";
  return undefined;
}

/** "pentru=284, contra=1, abtineri=2, nu au votat=2" in any spelling of the two pages. */
export function voteCountsIn(text: string): TypedWording["vote"] | undefined {
  return voteCounts(fold(text));
}

function voteCounts(folded: string): TypedWording["vote"] | undefined {
  const pick = (re: RegExp) => {
    const m = folded.match(re);
    return m ? Number(m[1]) : undefined;
  };
  const counts = { for: pick(/pentru\s*=\s*(\d+)/), against: pick(/contra\s*=\s*(\d+)/), abstention: pick(/abtineri\s*=\s*(\d+)/), notVoting: pick(/nu au votat\s*=\s*(\d+)/) };
  return counts.for === undefined && counts.against === undefined ? undefined : counts;
}

function chamberOfAdoption(folded: string): StepChamber | undefined {
  if (/camer(a|ei) deputat/.test(folded)) return "deputies";
  if (/senat/.test(folded)) return "senate";
  return undefined;
}

const isCommittee = (name: string) => /^comisia\b/i.test(fold(name));

/**
 * Reads what a procedure row says. `original` keeps the source's capitals and diacritics so names come out as printed.
 * First matching rule wins; a sentence no rule knows is typed `other` and flagged `recognised: false` for the report.
 */
export function typeStepWording(original: string): TypedWording {
  const text = squash(original);
  const f = fold(text);
  const amendmentsAdmitted = Number(f.match(/\((\d+) amend\. admise\)/)?.[1] ?? NaN);
  const amendmentsRejected = Number(f.match(/\((\d+) amend\. respinse\)/)?.[1] ?? NaN);
  const counts = {
    ...(Number.isNaN(amendmentsAdmitted) ? {} : { amendmentsAdmitted }),
    ...(Number.isNaN(amendmentsRejected) ? {} : { amendmentsRejected })
  };
  const deadlineOn = isoFromRomanianDate(f.match(/\(?termen:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/)?.[1]);
  const base = (type: StepType, extra: Partial<TypedWording> = {}): TypedWording => ({ type, recognised: true, ...counts, ...(deadlineOn ? { deadlineOn } : {}), ...extra });
  const after = (re: RegExp) => {
    const m = f.match(re);
    if (!m || m.index === undefined) return undefined;
    const start = m.index + m[0].length;
    return squash(text.slice(start, start + (f.length - start)));
  };

  // The tacit-adoption deadline (45 or 60 days) being extended.
  if (/prelungire(a)? termen(ului)? de adoptare tacita|modificarea termenului de adoptare|prelungirea termenului (constitutional )?de (dezbatere|depunere)|complexitate deosebita/.test(f)) return base("deadline_extended");

  // The Senate's own filing of an initiative (art. 63 alin. (5)).
  if (/^clasat\b/.test(f)) return base("archived");
  // Who initiated: the list changes.
  if (/list(a|ei) de initiatori|^retragerea semnaturii/.test(f)) return base("initiators_changed");
  // The President sends a law back; the Government takes responsibility (art. 114).
  if (/presedintele romaniei (cere|solicita) reexaminarea|cererea de reexaminare este inaintata/.test(f)) return base("reexamination_requested");
  if (/^guvernul isi angajeaza raspunderea/.test(f)) return base("government_responsibility");

  // Fate, the end of the road.
  if (/devine legea nr|promulgat(a)? prin decret/.test(f)) return base("promulgation");
  if (/publicat(a)? in monitorul oficial/.test(f)) return base("published");
  if (/trimis(a)? la promulgare|trimitere la presedintele romaniei pentru promulgare/.test(f)) return base("sent_to_president");
  // A letter from the Presidency (the row carries the document itself); nothing more is said, so it stays a plain step.
  if (/^adresa administratiei prezidentiale$/.test(f)) return base("other");
  if (/(depunere|depus|depusa) la secretarul general.*(constitutionalitat)/.test(f)) return base("constitutional_window");
  if (/retras de catre initiator|retragerea initiativei|solicita retragerea|retras(a)? de|solicitarea initiatorilor de retragere|de retragere a (propunerii|proiectului)/.test(f)) return base("withdrawn");
  if (/incetarea procedurii legislative/.test(f)) return base("procedure_ended");

  // A chamber decides.
  if (/^respins in sedinta comuna/.test(f)) return base("rejected", { chamber: "joint", vote: voteCounts(f) });
  if (/^adoptat in sedinta comuna/.test(f)) return base("adopted", { chamber: "joint", vote: voteCounts(f) });
  if (/^vot final (adoptare|respingere)/.test(f)) return base("final_vote", { vote: voteCounts(f) });
  if (/^respins(a)? (de|de catre) /.test(f) || /^(legea|proiectul|propunerea)\b.*\brespins(a)? de catre /.test(f)) return base("rejected", { chamber: chamberOfAdoption(f.replace(/^.*?respins(a)? (de catre|de) /, "")), vote: voteCounts(f) });
  if (/^(legea|proiectul|propunerea)\b.*(adoptat|adoptata) (de|ca urmare)/.test(f) || /^adoptat(a)? de (catre )?(camera deputatilor|senat)/.test(f)) return base("adopted", { chamber: chamberOfAdoption(f.replace(/^.*?adoptat(a)? de (catre )?/, "")), vote: voteCounts(f) });
  if (/^dezbatere(a)? /.test(f)) return base("plenary_debate", { chamber: chamberOfAdoption(f) });
  if (/inscris pe ordinea de zi/.test(f)) return base("agenda_scheduled", { chamber: chamberOfAdoption(f) });

  // The Government.
  if (/^(solicitare|trimis pentru) (punct de vedere|informare|fisa financiara)( de la| la) guvern|trimis pentru punct de vedere la guvern/.test(f)) return base("government_view_requested", { institution: "Guvernul României" });
  if (/^primire punct de vedere de la guvern/.test(f)) return base("government_view_received", { institution: "Guvernul României", verdict: verdictFrom(f), documentNumber: f.match(/cu nr\.?\s*([^\s(]+)/)?.[1] });
  const viewFrom = f.match(/^(solicitare punct de vedere de la|trimis pentru punct de vedere la) (.+)$/);
  if (viewFrom) return base("opinion_requested", { institution: squash(text.slice(f.length - viewFrom[2]!.length)) });
  const viewReceived = f.match(/^primire punct de vedere de la (.+?)(?:\s+-\s+cu nr\.?\s*(.+?))?\s*$/);
  if (viewReceived) return base("opinion_received", { institution: squash(text.slice(f.indexOf(viewReceived[1]!), f.indexOf(viewReceived[1]!) + viewReceived[1]!.length)), documentNumber: viewReceived[2] ? squash(text.slice(f.length - viewReceived[2].length)) : undefined });

  // Competence (which chamber is first): an opinion of a committee and the plenary's decision.
  if (/stabilirii competentei|avizarea competentei|trimiterea (initiativei|propunerii) legislative la camera deputatilor, ca prima|competentei privind|solicitarea comisiei .* de transmitere/.test(f) || /^primit de la senat.*prima camera/.test(f)) {
    return base("competence_decision", { committee: committeeIn(text) });
  }

  // Committees, named inside the sentence (the Senate) or in a list below it (the Chamber).
  const topic = f.match(/^trimis pentru (raport suplimentar|raport|aviz) privind .*?,? la (comisia .*)$/);
  if (topic) {
    const name = squash(text.slice(f.length - topic[2]!.length).replace(/\s*\((termen|TERMEN):[^)]*\)\s*$/, ""));
    return base(topic[1]!.startsWith("raport") ? "sent_to_committee" : "committee_opinion_requested", { committee: name });
  }
  const sentFor = f.match(/^-?\s*trimis pentru (raport suplimentar|raport|aviz) la:?\s*(.*)$/);
  if (sentFor) {
    const rest = sentFor[2]!;
    const name = squash(text.slice(f.length - rest.length).replace(/\s*\((termen|TERMEN):[^)]*\)\s*$/, ""));
    const reportKind = sentFor[1]!.startsWith("raport");
    if (!name) return base(reportKind ? "sent_to_committee" : "committee_opinion_requested");
    if (isCommittee(name)) return base(reportKind ? "sent_to_committee" : "committee_opinion_requested", { committee: name });
    return reportKind ? base("sent_to_committee", { institution: name }) : base("opinion_requested", { institution: name });
  }
  if (/^solicitare aviz de la /.test(f)) return base("opinion_requested", { institution: after(/^solicitare aviz de la /) });
  const received = f.match(/^primire (aviz|opinie|hotarare) de la (.+?)(?:\s+-\s+cu nr\.?\s*(\S+))?(?:\s*\((favorabil|negativ|nefavorabil)\))?\s*$/);
  if (received && !/:$/.test(f)) {
    const name = squash(text.slice(f.indexOf(received[2]!), f.indexOf(received[2]!) + received[2]!.length));
    return base(isCommittee(name) ? "committee_opinion_received" : "opinion_received", { [isCommittee(name) ? "committee" : "institution"]: name, documentNumber: received[3], verdict: received[4] ? verdictFrom(received[4]) : undefined });
  }
  if (/^primire aviz de la:?$|^primire aviz de la\s*:/.test(f)) return base("committee_opinion_received");
  if (/^primire raport( suplimentar)?( favorabil| de respingere)?( \(\d+ amend\.[^)]*\))? de la:?$/.test(f) || /^primire raport/.test(f)) return base("committee_report_received", { verdict: verdictFrom(f) ?? "favorable" });
  const named = f.match(/^(.+?)\s+(transmite avizul|depune raportul)( cu nr\.?\s*([^\s-]+)(?:-(\w+))?)?(\s+cu amendamente)?/);
  if (named) {
    const name = squash(text.slice(0, named[1]!.length));
    const isReport = named[2] === "depune raportul";
    const verdictWord = named[5];
    const verdict = verdictWord ? (verdictWord === "negativ" ? "unfavorable" : verdictWord === "favorabil" ? (named[6] ? "favorable_with_amendments" : "favorable") : undefined) : undefined;
    return base(isReport ? "committee_report_received" : isCommittee(name) ? "committee_opinion_received" : "opinion_received", { [isCommittee(name) || isReport ? "committee" : "institution"]: name, documentNumber: named[4], verdict });
  }

  // The Constitutional Court: a referral (with its author) or a decision.
  if (/sesizare de neconstitutionalitate|curt(ea|ii) constitutional/.test(f)) return base("constitutional_review");

  // The urgency procedure.
  if (/procedur(a|ii) de urgenta/.test(f) && !/^prezentare/.test(f)) return base(/a fost aprobata|aprobarea|aprobat/.test(f) ? "urgency_decided" : "urgency_requested");

  // Arrival and registration.
  if (/^(- )?(inregistrat la senat|inregistrat la camera deputatilor)/.test(f)) return base("registered", { chamber: chamberOfAdoption(f.replace(/^- /, "").replace(/^inregistrat la /, "")) });
  if (/^prezentare in birou|^cu nr\.l\d+ prezentare in biroul permanent|^biroul permanent aproba|^primit de la senat/.test(f)) return base("registered");
  if (/^inaintat la senat|^trimis la senat/.test(f)) return base("sent_to_senate");
  if (/^inaintat la camera|^trimis la camera/.test(f)) return base("sent_to_deputies");

  return { type: "other", recognised: false, ...counts, ...(deadlineOn ? { deadlineOn } : {}) };
}

/** A committee name in a sentence ("... la Comisia pentru constituţionalitate nr.5/..."). */
function committeeIn(text: string): string | undefined {
  const match = text.match(/(Comisia\s+[^()]{6,200}?)(?:\s+nr\.|\s+a solicitat|\s*\(|\s*,|\s*$)/);
  return match ? squash(match[1]!) : undefined;
}
