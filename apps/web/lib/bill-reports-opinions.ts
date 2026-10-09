import { classifyBillDocument, REPORT_AND_OPINION_ROLES, type BillDocumentFormat, type BillDocumentRole, type BillProcedureStep, type DocumentSource, type StepVerdict } from "@cumsevoteaza/parliament-model";

/**
 * The "Reports and opinions" panel of a bill (D-032, Sprint 12a): every committee report, committee opinion, outside body's opinion and Government view the dossier
 * names, each with the link to the official file. Built only from the stored steps and documents; nothing is read from the files themselves.
 */
export type ReportKind = "report" | "committee_opinion" | "body_opinion" | "government_view";

export interface ReportFile {
  url: string;
  format: BillDocumentFormat;
  label: string;
}

export interface ReportOrOpinion {
  key: string;
  kind: ReportKind;
  role: BillDocumentRole;
  /** The committee, or the body that issued it. */
  issuer: string;
  /** For an opinion of an outside body or the Government's view: the document's own words ("Avizul Băncii Naționale a României"), so no name is bent into a case it was not printed in. */
  title?: string;
  /** The date of the step it is printed on; absent for a document the header lists without a step. */
  date?: string;
  chamber?: BillProcedureStep["chamber"];
  verdict?: StepVerdict;
  number?: string;
  amendments?: { admitted: number; rejected: number };
  /** Printed on the registration (or another step that is not the report or opinion itself), not on a step of its own. */
  attached: boolean;
  /** The pdf first, then the editable copies of the same file. */
  files: ReportFile[];
}

export interface RequestedWithoutAnswer {
  issuer: string;
  requestedOn: string;
  kind: "committee_opinion" | "body_opinion" | "government_view";
}

export interface ReportsAndOpinions {
  reports: ReportOrOpinion[];
  committeeOpinions: ReportOrOpinion[];
  bodyOpinions: ReportOrOpinion[];
  governmentViews: ReportOrOpinion[];
  requestedWithoutAnswer: RequestedWithoutAnswer[];
  total: number;
}

const FORMAT_ORDER: Record<BillDocumentFormat, number> = { pdf: 0, docx: 1, doc: 2, other: 3 };
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** One file with its editable copies: the Chamber lists `av550.pdf` and `av550.docx` side by side; the Senate lists one file in both formats. */
function fileBase(url: string): string {
  return fold(url.split(/[?#]/)[0] ?? url).replace(/\.(pdf|docx?|rtf)$/, "").replace(/^https?:\/\/(www\.)?/, "");
}

/** The label as the page printed it, with the first letter capital and the dossier's stray spaces folded. */
const titleOf = (label: string) => { const text = label.replace(/\s+/g, " ").trim(); return text.charAt(0).toUpperCase() + text.slice(1); };

const kindOf = (role: BillDocumentRole): ReportKind | undefined =>
  role === "committee_report" ? "report" : role === "committee_opinion" ? "committee_opinion" : role === "government_view" ? "government_view" : REPORT_AND_OPINION_ROLES.includes(role) ? "body_opinion" : undefined;

const REQUESTED: Record<string, RequestedWithoutAnswer["kind"]> = { committee_opinion_requested: "committee_opinion", opinion_requested: "body_opinion", government_view_requested: "government_view" };
const RECEIVED: Record<string, RequestedWithoutAnswer["kind"]> = { committee_opinion_received: "committee_opinion", committee_report_received: "committee_opinion", opinion_received: "body_opinion", government_view_received: "government_view" };

export function buildReportsAndOpinions(steps: BillProcedureStep[], documents: DocumentSource[]): ReportsAndOpinions {
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const usedDocumentIds = new Set<string>();
  const entries: ReportOrOpinion[] = [];

  const ordered = [...steps].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.displayOrder - b.displayOrder);
  for (const step of ordered) {
    const ids = step.documentIds?.length ? step.documentIds : step.documentId ? [step.documentId] : [];
    // The documents of one step, grouped by file so a .pdf and its .docx copy are one entry.
    const groups = new Map<string, { documents: DocumentSource[]; role: BillDocumentRole; body?: string }>();
    for (const id of ids) {
      const document = documentById.get(id);
      if (!document) continue;
      const classified = classifyBillDocument({ label: document.label, url: document.url, stepType: step.stepType });
      if (!kindOf(classified.role)) continue;
      const key = `${classified.role}|${fileBase(document.url)}`;
      const group = groups.get(key) ?? { documents: [], role: classified.role, body: classified.body };
      group.documents.push(document);
      groups.set(key, group);
      usedDocumentIds.add(id);
    }
    for (const [groupKey, group] of groups) {
      const kind = kindOf(group.role)!;
      const itself = step.stepType === "committee_report_received" || step.stepType === "committee_opinion_received" || step.stepType === "opinion_received" || step.stepType === "government_view_received";
      const issuer = kind === "report" || kind === "committee_opinion" ? step.committeeName ?? group.documents[0]!.label.replace(/^(Raport|Aviz)\s+—\s+/, "") : group.body ?? step.institution ?? group.documents[0]!.label;
      entries.push({
        key: `${step.id}|${groupKey}`,
        kind,
        role: group.role,
        issuer,
        ...(kind === "body_opinion" || kind === "government_view" ? { title: titleOf(group.documents[0]!.label) } : {}),
        date: step.occurredOn,
        chamber: step.chamber,
        ...(itself && step.verdict ? { verdict: step.verdict } : {}),
        ...(itself && step.documentNumber ? { number: step.documentNumber } : {}),
        ...(itself && (step.amendmentsAdmitted !== undefined || step.amendmentsRejected !== undefined) ? { amendments: { admitted: step.amendmentsAdmitted ?? 0, rejected: step.amendmentsRejected ?? 0 } } : {}),
        attached: !itself,
        files: group.documents
          .map((document) => ({ url: document.url, format: classifyBillDocument({ label: document.label, url: document.url }).format, label: document.label }))
          .sort((a, b) => FORMAT_ORDER[a.format] - FORMAT_ORDER[b.format])
      });
    }
  }

  // Documents the header lists that no step prints (the Legislative Council's opinion, the Economic and Social Council's): no date, never invented.
  for (const document of documents) {
    if (usedDocumentIds.has(document.id)) continue;
    const classified = classifyBillDocument({ label: document.label, url: document.url });
    const kind = kindOf(classified.role);
    // Committee papers without a step are the editable copy of one that has a step (the Chamber's .docx beside its .pdf), or the step is gone: not shown on their own.
    if (!kind || kind === "report" || kind === "committee_opinion") continue;
    const base = fileBase(document.url);
    if (entries.some((entry) => entry.files.some((file) => fileBase(file.url) === base))) continue;
    entries.push({ key: `header|${document.id}`, kind, role: classified.role, issuer: classified.body ?? document.label, title: titleOf(document.label), attached: true, files: [{ url: document.url, format: classified.format, label: document.label }] });
  }

  // The same opinion printed by both chambers' pages (two addresses, one body, one date) is one line with both files.
  const merged: ReportOrOpinion[] = [];
  for (const entry of entries) {
    const twin = merged.find((item) => item.kind === entry.kind && item.role === entry.role && fold(item.issuer) === fold(entry.issuer) && item.date === entry.date && entry.kind !== "report");
    if (twin) {
      for (const file of entry.files) if (!twin.files.some((existing) => fileBase(existing.url) === fileBase(file.url) && existing.format === file.format)) twin.files.push(file);
      twin.verdict ??= entry.verdict;
      twin.number ??= entry.number;
      continue;
    }
    merged.push({ ...entry, files: [...entry.files] });
  }

  // What was asked for and has no answer on the official page: matched by the committee or body the request names.
  const answered = new Set<string>();
  for (const step of steps) {
    const kind = RECEIVED[step.stepType];
    if (kind) answered.add(`${kind}|${fold(step.committeeName ?? step.institution ?? "")}`);
  }
  const requestedWithoutAnswer: RequestedWithoutAnswer[] = [];
  const seenRequests = new Set<string>();
  for (const step of ordered) {
    const kind = REQUESTED[step.stepType];
    const issuer = step.committeeName ?? step.institution;
    if (!kind || !issuer) continue;
    const key = `${kind}|${fold(issuer)}`;
    if (answered.has(key) || seenRequests.has(key)) continue;
    seenRequests.add(key);
    requestedWithoutAnswer.push({ issuer, requestedOn: step.occurredOn, kind });
  }

  const byDate = (a: ReportOrOpinion, b: ReportOrOpinion) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.issuer.localeCompare(b.issuer, "ro");
  const pick = (kind: ReportKind) => merged.filter((entry) => entry.kind === kind).sort(byDate);
  return {
    reports: pick("report"),
    committeeOpinions: pick("committee_opinion"),
    bodyOpinions: pick("body_opinion"),
    governmentViews: pick("government_view"),
    requestedWithoutAnswer,
    total: merged.length
  };
}
