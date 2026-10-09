/**
 * The types a presidential decree can have (Sprint 14, D-037), as the reader of the decree's title assigns them, with the words the site uses for each. The rules that assign them live in
 * the ingest package; the site only shows the type and counts decrees by it.
 */
export const DECREE_KINDS = [
  "promulgation",
  "pm_designation",
  "government",
  "magistrates",
  "judiciary_leadership",
  "constitutional_court",
  "diplomacy",
  "military",
  "presidential_staff",
  "state_bodies",
  "decoration",
  "pardon",
  "state_of_exception",
  "parliament_and_referendum",
  "correction",
  "other"
] as const;

export type DecreeKind = (typeof DECREE_KINDS)[number];

export const DECREE_KIND_LABELS: Record<DecreeKind, { ro: string; en: string }> = {
  promulgation: { ro: "Promulgarea unei legi", en: "Promulgation of a law" },
  pm_designation: { ro: "Desemnarea candidatului la funcția de prim-ministru", en: "Designation of the prime-minister candidate" },
  government: { ro: "Guvern și miniștri", en: "Government and ministers" },
  magistrates: { ro: "Judecători și procurori", en: "Judges and prosecutors" },
  judiciary_leadership: { ro: "Conducerea sistemului judiciar", en: "Judiciary leadership" },
  constitutional_court: { ro: "Curtea Constituțională", en: "Constitutional Court" },
  diplomacy: { ro: "Ambasadori și diplomație", en: "Ambassadors and diplomacy" },
  military: { ro: "Armată și grade militare", en: "Armed forces and ranks" },
  presidential_staff: { ro: "Consilieri prezidențiali și de stat", en: "Presidential and state advisers" },
  state_bodies: { ro: "Consilii și autorități ale statului", en: "State councils and authorities" },
  decoration: { ro: "Decorații", en: "Decorations" },
  pardon: { ro: "Grațieri", en: "Pardons" },
  state_of_exception: { ro: "Stare de urgență, mobilizare, trupe", en: "Emergency, mobilisation, troops" },
  parliament_and_referendum: { ro: "Parlament și referendum", en: "Parliament and referendum" },
  correction: { ro: "Rectificări și modificări de decrete", en: "Corrections and amendments of decrees" },
  other: { ro: "Altele", en: "Other" }
};
