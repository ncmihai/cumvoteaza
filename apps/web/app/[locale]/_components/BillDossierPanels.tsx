import Link from "next/link";
import { formatDate, type BillDossier, type BillProcedureStep, type DocumentSource } from "@cumsevoteaza/parliament-model";
import { deadlineLine, fateView, groupStepsByChamber, registrationLine, resultLine, stepChamberLabel, stepTypeLabel, verdictLine } from "@/lib/bill-dossier-presentation";
import type { AppLocale } from "@/lib/i18n";

const TONE_CLASSES = {
  done: "border-emerald-700 bg-emerald-50 text-emerald-950",
  stopped: "border-slate-500 bg-slate-100 text-slate-900",
  open: "border-[#075fc6] bg-[#eef5ff] text-[#061a47]"
} as const;

const VERDICT_CLASSES: Record<string, string> = {
  favorable: "bg-emerald-100 text-emerald-900",
  favorable_with_amendments: "bg-emerald-100 text-emerald-900",
  unfavorable: "bg-rose-100 text-rose-900",
  rejection: "bg-rose-100 text-rose-900"
};

/** The bill's fate and the facts its official dossier prints (initiative type, urgency, registration numbers). */
export function BillFatePanel({ dossier, locale }: { dossier: BillDossier; locale: AppLocale }) {
  const ro = locale === "ro";
  const fate = fateView(dossier, locale);
  const facts: string[] = [];
  if (dossier.initiativeType) facts.push(dossier.initiativeType);
  if (dossier.urgent) facts.push(ro ? "Procedură de urgență" : "Urgent procedure");
  if (dossier.tacitDeadline) facts.push(`${ro ? "Termen de adoptare tacită" : "Tacit adoption deadline"}: ${formatDate(dossier.tacitDeadline, locale)}`);
  return (
    <section className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className={`min-w-0 border-l-4 px-4 py-3 ${TONE_CLASSES[fate.tone]}`}>
        <h2 className="font-serif text-xl font-semibold">{fate.headline}</h2>
        {fate.details.map((line) => (
          <p key={line} className="mt-1 text-sm [overflow-wrap:anywhere]">{line}</p>
        ))}
        {dossier.outcomeOn && dossier.outcome === "promulgated" ? <p className="mt-1 text-xs opacity-80">{ro ? "Promulgată la" : "Promulgated on"} {formatDate(dossier.outcomeOn, locale)}</p> : null}
      </div>
      <div className="min-w-0 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800">
        {facts.length ? <p className="font-medium text-[#061a47]">{facts.join(" · ")}</p> : null}
        {dossier.registrations.length ? (
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {dossier.registrations.map((registration) => (
              <li key={`${registration.body}-${registration.number}`}>{registrationLine(registration, locale)}</li>
            ))}
          </ul>
        ) : null}
        {dossier.summary ? <p className="mt-2 text-slate-700 [overflow-wrap:anywhere]"><b>{ro ? "Obiectul reglementării (după Cameră)" : "Object of regulation (as the Chamber states it)"}:</b> {dossier.summary}</p> : null}
        <p className="mt-2 text-xs text-slate-500">
          {ro ? "Citit din pagina oficială" : "Read from the official page"}: {Object.entries(dossier.sources).map(([key, value], index) => (
            <span key={key}>{index ? " · " : ""}<a className="underline" href={value.url} target="_blank" rel="noreferrer">{key === "cdep" ? (ro ? "Camera Deputaților" : "Chamber of Deputies") : "Senat"}</a></span>
          ))}
        </p>
      </div>
    </section>
  );
}

/** The procedure in lanes by chamber, each step typed: committees, verdicts, deadlines, the vote, documents. */
export function BillTimeline({ steps, documents, locale, title }: { steps: BillProcedureStep[]; documents: DocumentSource[]; locale: AppLocale; title: string }) {
  const ro = locale === "ro";
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const lanes = groupStepsByChamber(steps);
  return (
    <div className="min-w-0 border border-slate-300 bg-white">
      <div className="border-b border-slate-300 px-4 py-3 font-semibold">{title}</div>
      <div>
        {lanes.map((lane, laneIndex) => (
          <div key={`${lane.chamber}-${laneIndex}`} className="border-b border-slate-200 last:border-b-0">
            <div className="bg-[#f3f6fb] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#4b608a]">{stepChamberLabel(lane.chamber, locale)}</div>
            <div className="divide-y divide-slate-100">
              {lane.steps.map((step) => {
                const document = step.documentId ? documentById.get(step.documentId) : undefined;
                const verdict = verdictLine(step, locale);
                const result = resultLine(step.result, locale);
                const deadlines = deadlineLine(step, locale);
                const body = step.committeeName ?? step.institution;
                const labelled = step.stepType !== "other";
                return (
                  <div key={step.id} className="grid gap-1 px-4 py-3 md:grid-cols-[130px_1fr]">
                    <div className="text-sm font-medium text-slate-700">{formatDate(step.occurredOn, locale)}</div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-950">{labelled ? stepTypeLabel(step.stepType, locale) : step.title}</div>
                      {body ? <div className="mt-0.5 text-sm font-medium text-teal-800 [overflow-wrap:anywhere]">{body}</div> : null}
                      {verdict ? <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASSES[step.verdict ?? ""] ?? "bg-slate-100 text-slate-800"}`}>{verdict}{step.documentNumber ? ` · nr. ${step.documentNumber}` : ""}</span> : step.documentNumber ? <div className="mt-0.5 text-xs text-slate-600">nr. {step.documentNumber}</div> : null}
                      {deadlines ? <div className="mt-1 text-xs text-slate-600">{deadlines}</div> : null}
                      {result ? <div className="mt-1 text-sm text-slate-800">{result}{step.voteId ? <>{" · "}<Link className="font-semibold text-[#075fc6] underline" href={`/${locale}/votes/${step.voteId}`}>{ro ? "voturile nominale" : "roll call"}</Link></> : null}</div> : step.voteId ? <div className="mt-1 text-sm"><Link className="font-semibold text-[#075fc6] underline" href={`/${locale}/votes/${step.voteId}`}>{ro ? "Votul nominal" : "Roll call"}</Link></div> : null}
                      {step.note ? <div className="mt-1 text-xs text-slate-500 [overflow-wrap:anywhere]">{step.note}</div> : null}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {document ? <a href={document.url} target="_blank" rel="noreferrer" className="underline text-[#075fc6]">{document.label.replace(/\s+—\s+.*$/, "")}</a> : null}
                        {step.stenogramUrl ? <a href={step.stenogramUrl} target="_blank" rel="noreferrer" className="underline text-[#075fc6]">{ro ? "Stenograma ședinței" : "Sitting stenogram"}</a> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {steps.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{ro ? "Traseul legislativ nu este încă disponibil." : "The legislative timeline is not available yet."}</div> : null}
      </div>
    </div>
  );
}
