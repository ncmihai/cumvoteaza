import Link from "next/link";
import { Check, CheckCircle2, CircleSlash, Clock, X } from "lucide-react";
import { formatDate, type BillDossier, type BillProcedureStep, type DocumentSource } from "@cumsevoteaza/parliament-model";
import { deadlineLine, fateView, groupStepsByChamber, registrationLine, resultLine, stepChamberLabel, stepTypeLabel, verdictLine } from "@/lib/bill-dossier-presentation";
import type { AppLocale } from "@/lib/i18n";

const TONE_CLASSES = {
  done: "border-vote-for-fill/40 bg-vote-for-bg text-ink",
  stopped: "border-line-strong bg-wash text-ink",
  open: "border-brand/30 bg-brand-soft/60 text-ink"
} as const;

const VERDICT_CLASSES: Record<string, string> = {
  favorable: "bg-vote-for-bg text-vote-for",
  favorable_with_amendments: "bg-vote-for-bg text-vote-for",
  unfavorable: "bg-vote-against-bg text-vote-against",
  rejection: "bg-vote-against-bg text-vote-against"
};

type StageState = "done" | "current" | "stopped" | "pending";

/**
 * Where the bill is, in four stages read from what its dossier says: registered, the first chamber, the second chamber, the end (promulgation or the way it
 * stopped). A stage is "done" only when a later one has begun or the bill ended in a law; it is never inferred beyond that.
 */
function stagesOf(dossier: BillDossier, steps: BillProcedureStep[], tone: "done" | "stopped" | "open", locale: AppLocale): Array<{ label: string; state: StageState }> {
  const ro = locale === "ro";
  const lanes = groupStepsByChamber(steps.filter((step) => step.chamber && step.chamber !== "unknown"));
  const first = lanes[0] ? stepChamberLabel(lanes[0].chamber, locale) : (ro ? "Prima cameră" : "First chamber");
  const second = lanes[1] ? stepChamberLabel(lanes[1].chamber, locale) : (ro ? "A doua cameră" : "Second chamber");
  const reachedSecond = lanes.length >= 2;
  const ended = tone !== "open";
  const last = tone === "done" ? (ro ? "Promulgată" : "Promulgated") : tone === "stopped" ? fateHeadlineFor(dossier, locale) : (ro ? "Promulgare" : "Promulgation");
  const inFirst: StageState = reachedSecond || tone === "done" ? "done" : ended ? "stopped" : "current";
  const inSecond: StageState = tone === "done" ? "done" : !reachedSecond ? "pending" : ended ? "stopped" : "current";
  return [
    { label: ro ? "Depus" : "Registered", state: "done" },
    { label: first, state: inFirst },
    { label: second, state: inSecond },
    { label: last, state: tone === "done" ? "done" : "pending" }
  ];
}

function fateHeadlineFor(dossier: BillDossier, locale: AppLocale): string {
  return fateView(dossier, locale).headline;
}

function Stepper({ stages, locale }: { stages: Array<{ label: string; state: StageState }>; locale: AppLocale }) {
  const ro = locale === "ro";
  const word: Record<StageState, string> = { done: ro ? "încheiată" : "done", current: ro ? "în curs" : "in progress", stopped: ro ? "oprită aici" : "stopped here", pending: ro ? "încă nu" : "not yet" };
  return (
    <ol className="mt-5 grid grid-cols-4 gap-2" aria-label={ro ? "Etapele proiectului" : "Stages of the bill"}>
      {stages.map((stage, index) => (
        <li key={`${stage.label}-${index}`} aria-current={stage.state === "current" ? "step" : undefined} className="min-w-0">
          <div className="flex items-center">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-white ${stage.state === "done" ? "bg-vote-for-fill" : stage.state === "stopped" ? "bg-vote-against-fill" : stage.state === "current" ? "bg-brand ring-4 ring-brand-soft" : "border-2 border-line-strong bg-surface"}`}>
              {stage.state === "done" ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : stage.state === "stopped" ? <X size={15} strokeWidth={3} aria-hidden="true" /> : null}
            </span>
            {index < stages.length - 1 ? <span aria-hidden="true" className={`h-0.5 flex-1 ${stage.state === "done" ? "bg-vote-for-fill" : "bg-line"}`} /> : null}
          </div>
          <p className="mt-2 pr-2 text-xs font-semibold leading-4 text-ink [overflow-wrap:anywhere]">{stage.label}</p>
          <p className="text-xs text-muted">{word[stage.state]}</p>
        </li>
      ))}
    </ol>
  );
}

/** The bill's fate, a four-stage progress line, and the facts its official dossier prints (initiative type, urgency, registration numbers). */
export function BillFatePanel({ dossier, steps = [], locale }: { dossier: BillDossier; steps?: BillProcedureStep[]; locale: AppLocale }) {
  const ro = locale === "ro";
  const fate = fateView(dossier, locale);
  const facts: string[] = [];
  if (dossier.initiativeType) facts.push(dossier.initiativeType);
  if (dossier.urgent) facts.push(ro ? "Procedură de urgență" : "Urgent procedure");
  if (dossier.tacitDeadline) facts.push(`${ro ? "Termen de adoptare tacită" : "Tacit adoption deadline"}: ${formatDate(dossier.tacitDeadline, locale)}`);
  const Icon = fate.tone === "done" ? CheckCircle2 : fate.tone === "stopped" ? CircleSlash : Clock;
  return (
    <section className="mt-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className={`min-w-0 rounded-card border p-5 ${TONE_CLASSES[fate.tone]}`}>
        <div className="flex items-start gap-3">
          <Icon size={28} aria-hidden="true" className={fate.tone === "done" ? "text-vote-for" : fate.tone === "stopped" ? "text-ink-soft" : "text-brand"} />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight">{fate.headline}</h2>
            {fate.details.map((line) => <p key={line} className="mt-1 text-sm text-ink-soft [overflow-wrap:anywhere]">{line}</p>)}
            {dossier.outcomeOn && dossier.outcome === "promulgated" ? <p className="mt-1 text-xs text-muted">{ro ? "Promulgată la" : "Promulgated on"} {formatDate(dossier.outcomeOn, locale)}</p> : null}
          </div>
        </div>
        <Stepper stages={stagesOf(dossier, steps, fate.tone, locale)} locale={locale} />
      </div>
      <div className="min-w-0 rounded-card border border-line bg-surface p-5 text-sm text-ink-soft">
        {facts.length ? <p className="font-semibold text-ink">{facts.join(" · ")}</p> : null}
        {dossier.registrations.length ? (
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {dossier.registrations.map((registration) => <li key={`${registration.body}-${registration.number}`}>{registrationLine(registration, locale)}</li>)}
          </ul>
        ) : null}
        {dossier.summary ? <p className="mt-3 text-ink-soft [overflow-wrap:anywhere]"><b className="text-ink">{ro ? "Obiectul reglementării (după Cameră)" : "Object of regulation (as the Chamber states it)"}:</b> {dossier.summary}</p> : null}
        <p className="mt-3 text-xs text-muted">
          {ro ? "Citit din pagina oficială" : "Read from the official page"}: {Object.entries(dossier.sources).map(([key, value], index) => (
            <span key={key}>{index ? " · " : ""}<a className="font-semibold text-brand underline" href={value.url} target="_blank" rel="noreferrer">{key === "cdep" ? (ro ? "Camera Deputaților" : "Chamber of Deputies") : "Senat"}</a></span>
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
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
      <h2 className="border-b border-line px-5 py-4 font-display text-xl font-bold text-ink">{title}</h2>
      <div>
        {lanes.map((lane, laneIndex) => (
          <div key={`${lane.chamber}-${laneIndex}`} className="border-b border-line last:border-b-0">
            <div className="bg-wash px-5 py-2"><span className="rounded-full bg-surface px-3 py-0.5 text-xs font-semibold text-ink-soft ring-1 ring-line">{stepChamberLabel(lane.chamber, locale)}</span></div>
            <ol className="divide-y divide-line">
              {lane.steps.map((step) => {
                const document = step.documentId ? documentById.get(step.documentId) : undefined;
                const verdict = verdictLine(step, locale);
                const result = resultLine(step.result, locale);
                const deadlines = deadlineLine(step, locale);
                const body = step.committeeName ?? step.institution;
                const labelled = step.stepType !== "other";
                return (
                  <li key={step.id} className="grid gap-1 px-5 py-3 md:grid-cols-[130px_1fr]">
                    <div className="text-sm font-medium tabular-nums text-ink-soft">{formatDate(step.occurredOn, locale)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{labelled ? stepTypeLabel(step.stepType, locale) : step.title}</div>
                      {body ? <div className="mt-0.5 text-sm font-medium text-brand-strong [overflow-wrap:anywhere]">{body}</div> : null}
                      {verdict ? <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_CLASSES[step.verdict ?? ""] ?? "bg-wash text-ink-soft"}`}>{verdict}{step.documentNumber ? ` · nr. ${step.documentNumber}` : ""}</span> : step.documentNumber ? <div className="mt-0.5 text-xs text-muted">nr. {step.documentNumber}</div> : null}
                      {deadlines ? <div className="mt-1 text-xs text-muted">{deadlines}</div> : null}
                      {result ? <div className="mt-1 text-sm text-ink-soft">{result}{step.voteId ? <>{" · "}<Link className="font-semibold text-brand underline" href={`/${locale}/votes/${step.voteId}`}>{ro ? "voturile nominale" : "roll call"}</Link></> : null}</div> : step.voteId ? <div className="mt-1 text-sm"><Link className="font-semibold text-brand underline" href={`/${locale}/votes/${step.voteId}`}>{ro ? "Votul nominal" : "Roll-call vote"}</Link></div> : null}
                      {step.note ? <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{step.note}</div> : null}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {document ? <a href={document.url} target="_blank" rel="noreferrer" className="text-brand underline">{document.label.replace(/\s+—\s+.*$/, "")}</a> : null}
                        {step.stenogramUrl ? <a href={step.stenogramUrl} target="_blank" rel="noreferrer" className="text-brand underline">{ro ? "Stenograma ședinței" : "Sitting stenogram"}</a> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        {steps.length === 0 ? <div className="px-5 py-4 text-sm text-muted">{ro ? "Traseul legislativ nu este încă disponibil." : "The legislative timeline is not available yet."}</div> : null}
      </div>
    </div>
  );
}
