import Link from "next/link";
import { ArrowRight, Building2, Clock3, ShieldCheck } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistries } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

export default async function MinistriesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const ministries = await getMinistries();
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
    <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{locale === "ro" ? "Guvernul României" : "Government of Romania"}</p>
    <h1 className="mt-2 max-w-4xl font-serif text-5xl font-semibold leading-[.96] tracking-[-.045em] text-[#050e2c] md:text-6xl">{locale === "ro" ? "Ministere și miniștri" : "Ministries and ministers"}</h1>
    <p className="mt-3 max-w-3xl font-serif text-lg leading-7 text-[#4b608a]">{locale === "ro" ? "Cine conduce fiecare minister acum și cum s-au schimbat titularii în timp, pe baza mandatelor documentate." : "Who leads each ministry now and how officeholders changed over time, based on documented terms."}</p>
    <div className="mt-6 flex items-center gap-2 border border-[#dae8f7] bg-[#f0f6fc] p-3 text-xs text-[#4b608a]"><ShieldCheck size={18} className="shrink-0 text-[#075fc6]"/><span>{locale === "ro" ? "Titularii și intervalele sunt afișate numai când există o sursă trasabilă." : "Officeholders and dates appear only when a traceable source exists."}</span></div>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ministries.map((ministry) => <Link key={ministry.id} href={`/${locale}/ministries/${ministry.slug}`} className="group min-w-0 border border-slate-300 bg-white p-4 transition-colors hover:border-[#075fc6] hover:bg-[#f8fbff]">
      <div className="flex items-start justify-between gap-3"><Building2 className="shrink-0 text-[#075fc6]"/><ArrowRight className="shrink-0 text-[#075fc6] transition-transform group-hover:translate-x-1" size={18}/></div>
      <h2 className="mt-3 font-serif text-xl font-semibold leading-6 text-[#061a47]">{ministry.shortName}</h2>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#4b608a]">{locale === "ro" ? ministry.descriptionRo : ministry.descriptionEn}</p>
      <div className="mt-4 border-t border-slate-200 pt-3">{ministry.current ? <><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#061a47]">{ministry.current.person.displayName}</strong>{ministry.current.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><span className="mt-1 flex items-center gap-1 text-[10px] text-[#4b608a]"><Clock3 size={11}/>{locale === "ro" ? "Din" : "Since"} {formatDate(ministry.current.startsOn, locale)}</span></> : <span className="text-xs text-[#4b608a]">{locale === "ro" ? "Titular curent în curs de verificare" : "Current holder under verification"}</span>}</div>
    </Link>)}</section>
  </main>;
}
