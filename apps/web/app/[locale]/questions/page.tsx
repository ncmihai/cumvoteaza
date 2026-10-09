import Link from "next/link";
import type { Metadata } from "next";
import { X } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { QuestionList } from "../_components/QuestionList";
import { getQuestionsView, QUESTIONS_PAGE_SIZE, type QuestionFilter } from "@/lib/question-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Întrebări și interpelări", en: "Questions and interpellations" });
}

type Query = { member?: string; ministry?: string; kind?: string; answered?: string; page?: string };

export default async function QuestionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const filter: QuestionFilter = {
    ...(query.member ? { memberSlug: query.member } : {}),
    ...(query.ministry ? { ministrySlug: query.ministry } : {}),
    ...(query.kind === "question" || query.kind === "interpellation" ? { kind: query.kind } : {}),
    ...(query.answered === "yes" ? { answered: true } : query.answered === "no" ? { answered: false } : {}),
    page: Math.max(1, Number(query.page) || 1)
  };
  const view = await getQuestionsView(filter);
  const href = (changes: Partial<Query>) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries({ member: query.member, ministry: query.ministry, kind: query.kind, answered: query.answered, ...changes })) if (value) next[key] = value;
    const search = new URLSearchParams(next).toString();
    return `/${locale}/questions${search ? `?${search}` : ""}`;
  };
  const pages = view ? Math.max(1, Math.ceil(view.total / QUESTIONS_PAGE_SIZE)) : 1;
  const tab = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <p className="text-xs font-bold uppercase tracking-wide text-brand">{ro ? "Controlul parlamentar" : "Parliamentary scrutiny"}</p>
      <h1 className="mt-1 font-display text-4xl font-bold text-ink">{ro ? "Întrebări și interpelări" : "Questions and interpellations"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{ro
        ? "Cele puse de deputați Guvernului în legislatura 2024–2028, așa cum le arată paginile oficiale ale Camerei Deputaților: cine a întrebat, pe cine, textul și răspunsul, cu legătura către fiecare. Lipsa unui răspuns pe pagina oficială nu înseamnă că nu a existat unul. Întrebările senatorilor nu sunt încă incluse."
        : "Those put by deputies to the Government in the 2024–2028 legislature, as the Chamber of Deputies' official pages show them: who asked, whom, the text and the answer, each with its link. No answer on the official page does not mean none exists. Senators' questions are not included yet."}</p>
      {!view || view.counts.all === 0 ? (
        <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Întrebările și interpelările nu sunt încă importate." : "Questions and interpellations are not imported yet."}</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label={ro ? "Filtre" : "Filters"}>
            <Link href={href({ kind: undefined, page: undefined })} className={tab(!filter.kind)}>{ro ? "Toate" : "All"} ({view.counts.all.toLocaleString(ro ? "ro-RO" : "en-GB")})</Link>
            <Link href={href({ kind: "question", page: undefined })} className={tab(filter.kind === "question")}>{ro ? "Întrebări" : "Questions"} ({view.counts.questions.toLocaleString(ro ? "ro-RO" : "en-GB")})</Link>
            <Link href={href({ kind: "interpellation", page: undefined })} className={tab(filter.kind === "interpellation")}>{ro ? "Interpelări" : "Interpellations"} ({view.counts.interpellations.toLocaleString(ro ? "ro-RO" : "en-GB")})</Link>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <Link href={href({ answered: undefined, page: undefined })} className={tab(filter.answered === undefined)}>{ro ? "Cu sau fără răspuns" : "Any"}</Link>
            <Link href={href({ answered: "yes", page: undefined })} className={tab(filter.answered === true)}>{ro ? "Cu răspuns" : "Answered"} ({view.counts.answered.toLocaleString(ro ? "ro-RO" : "en-GB")})</Link>
            <Link href={href({ answered: "no", page: undefined })} className={tab(filter.answered === false)}>{ro ? "Fără răspuns pe pagina oficială" : "No answer on the official page"}</Link>
          </div>
          {view.member || view.ministry ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {view.member ? <Link href={href({ member: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full bg-wash px-3 py-1 font-semibold text-ink-soft hover:bg-brand-soft" aria-label={ro ? `Scoate filtrul: ${view.member.name}` : `Remove filter: ${view.member.name}`}>{ro ? "De la" : "From"} {view.member.name}<X size={14} aria-hidden="true" /></Link> : null}
              {view.ministry ? <Link href={href({ ministry: undefined, page: undefined })} className="inline-flex items-center gap-1.5 rounded-full bg-wash px-3 py-1 font-semibold text-ink-soft hover:bg-brand-soft" aria-label={ro ? `Scoate filtrul: ${view.ministry.name}` : `Remove filter: ${view.ministry.name}`}>{ro ? "Către" : "To"} {view.ministry.name}<X size={14} aria-hidden="true" /></Link> : null}
            </div>
          ) : null}
          <section className="mt-4 rounded-card border border-line bg-surface px-5" aria-label={ro ? "Lista întrebărilor și interpelărilor" : "List of questions and interpellations"}>
            {view.items.length ? <QuestionList items={view.items} locale={locale} /> : <p className="py-5 text-sm text-muted">{ro ? "Nimic nu corespunde filtrelor alese." : "Nothing matches the chosen filters."}</p>}
          </section>
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={ro ? "Pagini" : "Pages"}>
            <p className="text-muted">{view.total.toLocaleString(ro ? "ro-RO" : "en-GB")} {ro ? "rezultate" : "results"} · {ro ? "pagina" : "page"} {view.page} {ro ? "din" : "of"} {pages}{view.latestOn ? ` · ${ro ? "cea mai recentă înregistrare" : "latest registration"}: ${formatDate(view.latestOn, locale)}` : ""}</p>
            <div className="flex gap-2">
              {view.page > 1 ? <Link href={href({ page: String(view.page - 1) })} rel="prev" className="rounded-full border border-line px-3.5 py-1.5 font-semibold text-brand hover:border-brand">{ro ? "← Înapoi" : "← Previous"}</Link> : null}
              {view.page < pages ? <Link href={href({ page: String(view.page + 1) })} rel="next" className="rounded-full border border-line px-3.5 py-1.5 font-semibold text-brand hover:border-brand">{ro ? "Înainte →" : "Next →"}</Link> : null}
            </div>
          </nav>
        </>
      )}
    </main>
  );
}
