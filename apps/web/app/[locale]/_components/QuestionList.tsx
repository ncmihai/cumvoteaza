import Link from "next/link";
import { ExternalLink, FileText, MessageCircleQuestion } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { QuestionItem } from "@/lib/question-data";
import type { AppLocale } from "@/lib/i18n";
import { normalizeRomanian } from "@/lib/text";

/**
 * Questions and interpellations as the Chamber's pages give them (D-036): who asked, whom, the title, and the two PDFs. An item with no answer on the official page says
 * exactly that; it does not say the question went unanswered.
 */
export function QuestionList({ items, locale, showAskers = true, showAddressees = true }: { items: QuestionItem[]; locale: AppLocale; showAskers?: boolean; showAddressees?: boolean }) {
  const ro = locale === "ro";
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-soft"><MessageCircleQuestion size={14} aria-hidden="true" className="text-brand" />{item.kind === "question" ? (ro ? "Întrebarea" : "Question") : ro ? "Interpelarea" : "Interpellation"} {item.number}</span>
            <time dateTime={item.registeredOn}>{formatDate(item.registeredOn, locale)}</time>
            {item.answerUrl || item.answeredOn
              ? <span className="rounded-full bg-vote-for-bg px-2.5 py-0.5 font-semibold text-vote-for">{ro ? "Răspuns" : "Answer"}{item.answeredOn ? ` · ${formatDate(item.answeredOn, locale)}` : ""}</span>
              : <span className="rounded-full bg-wash px-2.5 py-0.5 font-semibold text-ink-soft">{ro ? "Fără răspuns pe pagina oficială" : "No answer on the official page"}</span>}
          </div>
          <p lang="ro" className="mt-1.5 font-medium leading-6 text-ink [overflow-wrap:anywhere]">{normalizeRomanian(item.title)}</p>
          <div className="mt-1.5 space-y-0.5 text-sm text-ink-soft">
            {showAskers && item.askers.length ? (
              <p><span className="text-muted">{ro ? "De la" : "From"}: </span>{item.askers.map((asker, index) => <span key={`${asker.name}-${index}`}>{index ? ", " : ""}{asker.slug ? <Link href={`/${locale}/members/${asker.slug}`} className="font-semibold text-brand hover:text-brand-strong">{asker.name}</Link> : normalizeRomanian(asker.name)}</span>)}</p>
            ) : null}
            {showAddressees && item.addressees.length ? (
              <p><span className="text-muted">{ro ? "Către" : "To"}: </span>{item.addressees.map((addressee, index) => (
                <span key={`${addressee.name}-${index}`}>{index ? "; " : ""}{addressee.ministrySlug ? <Link href={`/${locale}/ministries/${addressee.ministrySlug}`} className="font-semibold text-brand hover:text-brand-strong">{normalizeRomanian(addressee.name)}</Link> : normalizeRomanian(addressee.name)}{addressee.attention ? <span className="text-muted"> ({normalizeRomanian(addressee.attention)})</span> : null}</span>
              ))}</p>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.textUrl ? <PdfLink href={item.textUrl} label={ro ? "Textul (PDF)" : "The text (PDF)"} /> : null}
            {item.answerUrl ? <PdfLink href={item.answerUrl} label={ro ? "Răspunsul (PDF)" : "The answer (PDF)"} /> : null}
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand-soft">{ro ? "Pagina oficială" : "Official page"}<ExternalLink size={12} aria-hidden="true" /></a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PdfLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand-soft"><FileText size={12} aria-hidden="true" />{label}</a>;
}
