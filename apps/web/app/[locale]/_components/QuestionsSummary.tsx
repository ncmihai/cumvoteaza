import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { QuestionList } from "./QuestionList";
import type { QuestionsView } from "@/lib/question-data";
import type { AppLocale } from "@/lib/i18n";

/**
 * The few latest questions and interpellations of a member (as asker) or of a ministry (as addressee), with the counts and the link to the full list (D-036).
 * Nothing is shown for a member or ministry with none on the Chamber's pages.
 */
export function QuestionsSummary({ view, locale, filter, as }: { view: QuestionsView | undefined; locale: AppLocale; filter: string; as: "asker" | "addressee" }) {
  if (!view || view.counts.all === 0) return null;
  const ro = locale === "ro";
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const parts = [
    view.counts.questions ? `${number(view.counts.questions)} ${ro ? (view.counts.questions === 1 ? "întrebare" : "întrebări") : view.counts.questions === 1 ? "question" : "questions"}` : undefined,
    view.counts.interpellations ? `${number(view.counts.interpellations)} ${ro ? (view.counts.interpellations === 1 ? "interpelare" : "interpelări") : view.counts.interpellations === 1 ? "interpellation" : "interpellations"}` : undefined
  ].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby="questions-summary" className="min-w-0 rounded-card border border-line bg-surface p-6">
      <h2 id="questions-summary" className="flex items-center gap-2 font-display text-2xl font-bold text-ink"><MessageCircleQuestion size={22} aria-hidden="true" className="text-brand" />{ro ? "Întrebări și interpelări" : "Questions and interpellations"}</h2>
      <p className="mt-1 text-sm text-ink-soft">{parts} · {number(view.counts.answered)} {ro ? "cu răspuns pe pagina oficială" : "with an answer on the official page"}</p>
      <QuestionList items={view.items.slice(0, 5)} locale={locale} showAskers={as === "addressee"} showAddressees={as === "asker"} />
      <Link href={`/${locale}/questions?${filter}`} className="mt-1 inline-flex text-sm font-bold text-brand hover:text-brand-strong">{ro ? `Toate cele ${number(view.counts.all)} →` : `All ${number(view.counts.all)} →`}</Link>
      <p className="mt-2 text-xs leading-5 text-muted">{ro ? "Din paginile oficiale ale Camerei Deputaților. Lipsa unui răspuns acolo nu înseamnă că nu a existat unul." : "From the Chamber of Deputies' official pages. No answer there does not mean none exists."}</p>
    </section>
  );
}
