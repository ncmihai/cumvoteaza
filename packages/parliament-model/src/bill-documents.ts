/**
 * What a document on a bill's dossier is, read from its label and address (D-032). The dossier pages name every attachment in words ("avizul Consiliului Legislativ",
 * "Comisia juridică, de disciplină şi imunităţi" under a report step, "punctul de vedere al Guvernului"); nothing here guesses beyond those words.
 */
export type BillDocumentRole =
  | "committee_report"
  | "committee_opinion"
  | "legislative_council"
  | "economic_social_council"
  | "fiscal_council"
  | "judiciary_council"
  | "competition_council"
  | "other_body_opinion"
  | "government_view"
  | "government_decision"
  | "ordinance"
  | "initiator_form"
  | "explanatory_memo"
  | "cover_letter"
  | "adopted_form"
  | "promulgation_form"
  | "other";

export type BillDocumentFormat = "pdf" | "doc" | "docx" | "other";

export interface BillDocumentClassification {
  role: BillDocumentRole;
  /** The body that issued an opinion, in the page's words, when the role is an opinion of an outside body ("ANCOM", "Consiliul Legislativ"). */
  body?: string;
  format: BillDocumentFormat;
}

/** The roles shown on the "Reports and opinions" panel: what committees and other bodies concluded about the bill. */
export const REPORT_AND_OPINION_ROLES: readonly BillDocumentRole[] = [
  "committee_report",
  "committee_opinion",
  "legislative_council",
  "economic_social_council",
  "fiscal_council",
  "judiciary_council",
  "competition_council",
  "other_body_opinion",
  "government_view"
];

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function documentFormatOf(url: string): BillDocumentFormat {
  const path = (url.split(/[?#]/)[0] ?? "").toLowerCase();
  // The Chamber serves some PDFs through `docs?2026/name.pdf`; the extension is still the last thing before the query that follows it.
  const withQuery = url.toLowerCase();
  if (/\.docx(\?|#|$)/.test(withQuery)) return "docx";
  if (/\.doc(\?|#|$)/.test(withQuery)) return "doc";
  if (/\.pdf(\?|#|$)/.test(withQuery) || path.endsWith(".pdf")) return "pdf";
  return "other";
}

/**
 * `stepType` is the dossier step the document is printed on (the same words as `BillProcedureStepType`); a committee's own document carries only the committee's
 * name as its label, so the step's type is what says whether it is the report or an opinion.
 */
export function classifyBillDocument(input: { label: string; url: string; stepType?: string }): BillDocumentClassification {
  const label = fold(input.label);
  const url = fold(input.url);
  const filename = url.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const format = documentFormatOf(input.url);
  const result = (role: BillDocumentRole, body?: string): BillDocumentClassification => ({ role, ...(body ? { body } : {}), format });

  if (/consiliului legislativ/.test(label)) return result("legislative_council", "Consiliul Legislativ");
  if (/consiliului economic si social/.test(label)) return result("economic_social_council", "Consiliul Economic și Social");
  if (/consiliului fiscal/.test(label)) return result("fiscal_council", "Consiliul Fiscal");
  if (/consiliului superior al magistraturii/.test(label)) return result("judiciary_council", "Consiliul Superior al Magistraturii");
  if (/consiliului concurentei/.test(label)) return result("competition_council", "Consiliul Concurenței");
  if (/punctul de vedere al guvernului|punct de vedere al guvernului/.test(label) || input.stepType === "government_view_received") return result("government_view", "Guvernul");
  if (/hotararea de guvern|hotararea guvernului/.test(label)) return result("government_decision");
  if (/ordonanta (de urgenta a )?guvernului/.test(label)) return result("ordinance");
  if (/forma initiatorului/.test(label)) return result("initiator_form");
  if (/expunerea de motive|expunere de motive/.test(label)) return result("explanatory_memo");
  if (/^adresa|adresa de inaintare/.test(label)) return result("cover_letter");
  if (/forma adoptata|forma trimisa la promulgare|forma pentru promulgare/.test(label)) return result(/promulgare/.test(label) ? "promulgation_form" : "adopted_form");

  // A committee's report or opinion: the step says which, then the words of the label, then the Chamber's file names (rp049.pdf, av550.docx).
  if (input.stepType === "committee_report_received") return result("committee_report");
  if (input.stepType === "committee_opinion_received") return result("committee_opinion");
  if (/^raport/.test(label) || /^rp\d+/.test(filename)) return result("committee_report");
  if (/^aviz.*comisia|^comisia/.test(label) && input.stepType !== "registered") return result("committee_opinion");
  if (/^av\d+/.test(filename)) return result("committee_opinion");

  // Any other "aviz" or "opinie" names its issuer after the word: "avizul ANCOM", "avizul Băncii Naționale a României".
  const opinion = /^(?:avizul|aviz|opinia|opinie)\s+(?:al\s+|a\s+)?(.+)$/.exec(label);
  if (opinion?.[1]) return result("other_body_opinion", titleBody(input.label, opinion[1]));
  if (/punct de vedere/.test(label)) return result("other_body_opinion", titleBody(input.label, label.replace(/^.*punct(?:ul)? de vedere\s+(?:al\s+)?/, "")));
  return result("other");
}

/** The issuer as the page wrote it (accents kept): cut the leading "avizul"/"opinia" from the original label. */
function titleBody(original: string, folded: string): string {
  const cut = /^(?:avizul|aviz|opinia|opinie|punctul de vedere|punct de vedere)\s+(?:al\s+|a\s+|de\s+)?(.+)$/i.exec(original.trim());
  const text = (cut?.[1] ?? folded).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
