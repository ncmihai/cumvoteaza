import { FileText, Scale } from "lucide-react";
import { formatDate, type BillProcedureStep, type DocumentSource } from "@cumsevoteaza/parliament-model";
import { buildReportsAndOpinions, type ReportFile, type ReportOrOpinion } from "@/lib/bill-reports-opinions";
import { stepChamberLabel, verdictLine } from "@/lib/bill-dossier-presentation";
import Link from "next/link";
import type { ReportReadingView } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";

const VERDICT_CLASSES: Record<string, string> = {
  favorable: "bg-vote-for-bg text-vote-for",
  favorable_with_amendments: "bg-vote-for-bg text-vote-for",
  unfavorable: "bg-vote-against-bg text-vote-against",
  rejection: "bg-vote-against-bg text-vote-against"
};

const FORMAT_LABEL: Record<ReportFile["format"], string> = { pdf: "PDF", docx: "DOCX", doc: "DOC", other: "Fișier" };

/**
 * Every committee report, committee opinion, opinion of an outside body (the Legislative Council, the Economic and Social Council, the Fiscal Council, ...) and the
 * Government's view the dossier names, each with the link to the official file (D-032). A bill whose dossier names none shows no panel.
 */
export function BillReportsOpinions({ steps, documents, readings = {}, locale }: { steps: BillProcedureStep[]; documents: DocumentSource[]; readings?: Record<string, ReportReadingView>; locale: AppLocale }) {
  const data = buildReportsAndOpinions(steps, documents, readings);
  if (data.total === 0 && data.requestedWithoutAnswer.length === 0) return null;
  const ro = locale === "ro";
  const copy = ro
    ? { title: "Rapoarte și avize", reports: "Rapoarte ale comisiilor", committeeOpinions: "Avize ale comisiilor", bodies: "Avize ale altor instituții", government: "Punctul de vedere al Guvernului", requested: "Cerute, fără răspuns pe pagina oficială", requestedNote: "Pagina oficială a proiectului arată cererea, dar nu arată un aviz primit de la acest organ. Nu înseamnă că nu a existat unul.", attached: "depus odată cu proiectul", undated: "data nu este tipărită", note: "Fiecare legătură duce la fișierul oficial, din pagina Camerei sau a Senatului. Nu citim conținutul: concluzia (favorabil, nefavorabil) este cea tipărită în dosar.", none: "Niciun raport sau aviz nu apare încă în dosarul oficial.", number: "nr.", annexAdmitted: "Amendamente admise", annexRejected: "Amendamente respinse", authors: "Autori numiți în anexă", authorsNote: "nelegați de un amendament anume", scanned: "Copie scanată: autorii și anexa de amendamente nu se pot citi sigur.", scannedAuthors: "Copie scanată: autorii nu au fost citiți.", page: "p." }
    : { title: "Reports and opinions", reports: "Committee reports", committeeOpinions: "Committee opinions", bodies: "Opinions of other bodies", government: "The Government's view", requested: "Requested, no answer on the official page", requestedNote: "The bill's official page shows the request but no opinion received from this body. It does not mean none exists.", attached: "filed with the bill", undated: "date not printed", note: "Each link leads to the official file on the Chamber's or the Senate's site. We do not read the content: the conclusion (favourable, unfavourable) is the one printed in the dossier.", none: "No report or opinion appears in the official dossier yet.", number: "no.", annexAdmitted: "Admitted amendments", annexRejected: "Rejected amendments", authors: "Authors named in the annex", authorsNote: "not tied to a particular amendment", scanned: "Scanned copy: the authors and the annex of amendments cannot be read reliably.", scannedAuthors: "Scanned copy: the authors were not read.", page: "p." };
  const count = (entries: ReportOrOpinion[]) => entries.length;
  const opinions = count(data.committeeOpinions) + count(data.bodyOpinions) + count(data.governmentViews);
  return (
    <section aria-labelledby="reports-opinions" className="min-w-0 rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h2 id="reports-opinions" className="flex items-center gap-2 font-display text-xl font-bold text-ink"><Scale size={20} className="text-brand" aria-hidden="true" />{copy.title}</h2>
        <p className="text-sm text-muted">
          {[
            count(data.reports) ? `${count(data.reports)} ${ro ? (count(data.reports) === 1 ? "raport" : "rapoarte") : count(data.reports) === 1 ? "report" : "reports"}` : undefined,
            opinions ? `${opinions} ${ro ? (opinions === 1 ? "aviz sau punct de vedere" : "avize și puncte de vedere") : opinions === 1 ? "opinion or view" : "opinions and views"}` : undefined
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="divide-y divide-line">
        {data.total === 0 ? <p className="px-5 py-4 text-sm text-muted">{copy.none}</p> : null}
        <Group title={copy.reports} entries={data.reports} locale={locale} copy={copy} open />
        <Group title={copy.government} entries={data.governmentViews} locale={locale} copy={copy} open />
        <Group title={copy.bodies} entries={data.bodyOpinions} locale={locale} copy={copy} open />
        <Group title={copy.committeeOpinions} entries={data.committeeOpinions} locale={locale} copy={copy} open={data.committeeOpinions.length <= 6} />
        {data.requestedWithoutAnswer.length ? (
          <details className="group px-5 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink-soft hover:text-ink">{copy.requested} <span className="font-normal text-muted">({data.requestedWithoutAnswer.length})</span></summary>
            <p className="mt-2 text-xs leading-5 text-muted">{copy.requestedNote}</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-soft">
              {data.requestedWithoutAnswer.map((item) => <li key={`${item.kind}-${item.issuer}`} className="[overflow-wrap:anywhere]"><span className="font-medium text-ink">{item.issuer}</span> <span className="text-muted">· {formatDate(item.requestedOn, locale)}</span></li>)}
            </ul>
          </details>
        ) : null}
      </div>
      <p className="border-t border-line px-5 py-3 text-xs leading-5 text-muted">{copy.note}</p>
    </section>
  );
}

function Group({ title, entries, locale, copy, open }: { title: string; entries: ReportOrOpinion[]; locale: AppLocale; copy: Record<string, string>; open: boolean }) {
  if (entries.length === 0) return null;
  return (
    <details open={open} className="group px-5 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-ink">{title} <span className="font-normal text-muted">({entries.length})</span></summary>
      <ul className="mt-2 divide-y divide-line">
        {entries.map((entry) => <Entry key={entry.key} entry={entry} locale={locale} copy={copy} />)}
      </ul>
    </details>
  );
}

function Entry({ entry, locale, copy }: { entry: ReportOrOpinion; locale: AppLocale; copy: Record<string, string> }) {
  const verdict = entry.verdict ? verdictLine({ verdict: entry.verdict, amendmentsAdmitted: entry.amendments?.admitted, amendmentsRejected: entry.amendments?.rejected }, locale) : undefined;
  const heading = entry.title ?? entry.issuer;
  return (
    <li className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
      <div className="min-w-0">
        <p className="font-medium text-ink [overflow-wrap:anywhere]">{heading}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {entry.date ? <time dateTime={entry.date}>{formatDate(entry.date, locale)}</time> : <span>{copy.undated}</span>}
          {entry.chamber && entry.chamber !== "unknown" && !entry.attached ? <span>· {stepChamberLabel(entry.chamber, locale)}</span> : null}
          {entry.attached && entry.date ? <span>· {copy.attached}</span> : null}
          {entry.number ? <span>· {copy.number} {entry.number}</span> : null}
        </p>
        {verdict ? <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_CLASSES[entry.verdict ?? ""] ?? "bg-wash text-ink-soft"}`}>{verdict}</span> : null}
        {entry.kind === "report" ? <ReportReadingLine entry={entry} locale={locale} copy={copy} /> : null}
      </div>
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        {entry.files.map((file) => (
          <a key={file.url} href={file.url} target="_blank" rel="noreferrer" aria-label={`${heading}: ${FORMAT_LABEL[file.format]}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand-soft">
            <FileText size={13} aria-hidden="true" />{FORMAT_LABEL[file.format]}
          </a>
        ))}
      </div>
    </li>
  );
}

/** Where a report's amendment annexes are (a link to that page of the PDF) and who they name, when the text could be read; a scan says so instead of guessing. */
function ReportReadingLine({ entry, locale, copy }: { entry: ReportOrOpinion; locale: AppLocale; copy: Record<string, string> }) {
  const reading = entry.reading;
  const pdf = entry.files.find((file) => file.format === "pdf") ?? entry.files[0];
  const withAmendments = entry.verdict === "favorable_with_amendments";
  if (!reading) return null;
  if (reading.annexes.length === 0 && !(reading.quality !== "clean" && withAmendments)) return null;
  return (
    <div className="mt-1.5 space-y-1 text-xs text-ink-soft">
      {pdf && reading.annexes.length ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {reading.annexes.map((annex) => <a key={`${annex.kind}-${annex.page}`} href={`${pdf.url}#page=${annex.page}`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">{annex.kind === "admitted" ? copy.annexAdmitted : copy.annexRejected} ({copy.page} {annex.page})</a>)}
        </p>
      ) : null}
      {reading.authors.length ? (
        <p className="[overflow-wrap:anywhere]"><span className="font-semibold">{copy.authors}:</span> {reading.authors.map((author, index) => (
          <span key={`${author.name}-${index}`}>{index ? ", " : ""}{author.memberSlug ? <Link href={`/${locale}/members/${author.memberSlug}`} className="text-brand underline">{author.name}</Link> : author.name}{author.group ? ` (${author.group})` : ""}</span>
        ))} <span className="text-muted">({copy.authorsNote})</span></p>
      ) : reading.quality !== "clean" && reading.annexes.length ? <p className="text-muted">{copy.scannedAuthors}</p> : null}
      {reading.quality !== "clean" && !reading.annexes.length && withAmendments ? <p className="text-muted">{copy.scanned}</p> : null}
    </div>
  );
}
