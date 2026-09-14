import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, ExternalLink, Landmark, Vote } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistry } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

export default async function MinistryPage({ params }: { params: Promise<{ locale: AppLocale; slug: string }> }) {
  const { locale, slug } = await params;
  const ministry = await getMinistry(slug);
  if (!ministry) notFound();
  const current = ministry.current;
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
    <Link href={`/${locale}/ministries`} className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]"><ArrowLeft size={14}/>{locale === "ro" ? "Toate ministerele" : "All ministries"}</Link>
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{locale === "ro" ? "Minister" : "Ministry"}</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold leading-[.98] tracking-[-.035em] text-[#050e2c] [overflow-wrap:anywhere] lg:text-6xl">{ministry.name}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#4b608a]">{locale === "ro" ? ministry.descriptionRo : ministry.descriptionEn}</p>
        <section className="mt-6 border border-slate-300 bg-white p-4 md:p-5"><div className="flex items-center gap-2"><Landmark className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Istoricul miniștrilor" : "Ministerial history"}</h2></div>
          <div className="mt-4 divide-y divide-slate-200">{ministry.terms.map((term, index) => <article key={term.id} className="grid min-w-0 gap-2 py-4 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-start">
            <div className="text-xs font-semibold text-[#4b608a]">{formatDate(term.startsOn, locale)}<span className="block">{term.endsOn ? `— ${formatDate(term.endsOn, locale)}` : `— ${locale === "ro" ? "prezent" : "present"}`}</span></div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{term.member ? <Link href={`/${locale}/members/${term.member.slug}`} className="font-serif text-lg font-semibold text-[#061a47] hover:text-[#075fc6]">{term.person.displayName}</Link> : <strong className="font-serif text-lg text-[#061a47]">{term.person.displayName}</strong>}{term.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}{index === 0 && !term.endsOn ? <span className="border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-900">{locale === "ro" ? "Actual" : "Current"}</span> : null}</div><p className="mt-1 text-xs text-[#4b608a]">{term.title} · {locale === "ro" ? "Guvernul" : "Government"} {term.government.name}</p></div>
            {term.sourceUrl ? <a href={term.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Sursă" : "Source"}<ExternalLink size={12}/></a> : null}
          </article>)}</div>
        </section>
        <section className="mt-5 border border-slate-300 bg-white p-4 md:p-5"><div className="flex items-center gap-2"><Vote className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Voturi și proiecte asociate" : "Related votes and bills"}</h2></div><p className="mt-3 text-sm leading-6 text-[#4b608a]">{locale === "ro" ? "Aici vor apărea numai proiectele legate prin inițiatorul sau ministerul responsabil din dosarul oficial. Clasificarea tematică este următoarea etapă și nu este aproximată din titlu." : "Only bills linked through the official initiator or responsible ministry will appear here. Topic classification is the next step and is not guessed from titles."}</p></section>
      </div>
      <aside className="self-start border border-[#dae8f7] bg-[#f0f6fc] p-5 lg:sticky lg:top-24"><Building2 className="text-[#075fc6]"/><h2 className="mt-3 font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Conducerea actuală" : "Current leadership"}</h2>{current ? <><div className="mt-4 flex flex-wrap items-center gap-2"><strong className="font-serif text-xl text-[#061a47]">{current.person.displayName}</strong>{current.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-2 text-xs leading-5 text-[#4b608a]">{locale === "ro" ? "În funcție din" : "In office since"} {formatDate(current.startsOn, locale)}<br/>{locale === "ro" ? "Guvernul" : "Government"} {current.government.name}</p>{current.member ? <Link href={`/${locale}/members/${current.member.slug}`} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Vezi profilul parlamentar" : "View parliamentary profile"}<ArrowRight size={13}/></Link> : null}</> : <p className="mt-3 text-sm text-[#4b608a]">{locale === "ro" ? "Titularul curent este în curs de verificare." : "The current holder is under verification."}</p>}</aside>
    </div>
  </main>;
}
