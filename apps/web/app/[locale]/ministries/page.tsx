import Link from "next/link";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { ArrowRight, Building2, Clock3, ShieldCheck } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistries } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Ministere și miniștri", en: "Ministries and ministers" });
}

export default async function MinistriesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const ministries = await getMinistries();
  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <p className="text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "Guvernul României" : "Government of Romania"}</p>
    <h1 className="mt-2 max-w-4xl font-display text-5xl font-semibold leading-[.96] tracking-[-.045em] text-ink md:text-6xl">{locale === "ro" ? "Ministere și miniștri" : "Ministries and ministers"}</h1>
    <p className="mt-3 max-w-3xl font-display text-lg leading-7 text-muted">{locale === "ro" ? "Cine conduce fiecare minister acum și cum s-au schimbat titularii în timp, pe baza mandatelor documentate." : "Who leads each ministry now and how officeholders changed over time, based on documented terms."}</p>
    <div className="mt-6 flex items-center gap-2 border border-line bg-wash p-3 text-xs text-muted rounded-card"><ShieldCheck size={18} className="shrink-0 text-brand"/><span>{locale === "ro" ? "Titularii și intervalele sunt afișate numai când există o sursă trasabilă." : "Officeholders and dates appear only when a traceable source exists."}</span></div>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ministries.map((ministry) => <Link key={ministry.id} href={`/${locale}/ministries/${ministry.slug}`} className="group min-w-0 border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-wash rounded-card">
      <div className="flex items-start justify-between gap-3"><Building2 className="shrink-0 text-brand"/><ArrowRight className="shrink-0 text-brand transition-transform group-hover:translate-x-1" size={18}/></div>
      <h2 className="mt-3 font-display text-lg font-bold leading-6 text-ink">{ministry.shortName}</h2>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{locale === "ro" ? ministry.descriptionRo : ministry.descriptionEn}</p>
      <div className="mt-4 border-t border-line pt-3">{ministry.current ? <><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-ink">{ministry.current.person.displayName}</strong>{ministry.current.interim ? <span className="border border-vote-abstain-fill bg-vote-abstain-bg px-1.5 py-0.5 text-xs font-bold uppercase text-vote-abstain">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><span className="mt-1 flex items-center gap-1 text-xs text-muted"><Clock3 size={11}/>{locale === "ro" ? "Din" : "Since"} {formatDate(ministry.current.startsOn, locale)}</span></> : <span className="text-xs text-muted">{locale === "ro" ? "Titular curent în curs de verificare" : "Current holder under verification"}</span>}</div>
    </Link>)}</section>
  </main>;
}
