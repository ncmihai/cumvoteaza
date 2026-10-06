import Link from "next/link";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, ExternalLink, GitMerge, Landmark, Vote } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getMinistry } from "@/lib/ministry-data";
import type { AppLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const ministry = await getMinistry(slug);
  return { title: ministry ? ministry.name : (locale === "en" ? "Ministry not found" : "Minister negăsit") };
}

export default async function MinistryPage({ params }: { params: Promise<{ locale: AppLocale; slug: string }> }) {
  const { locale, slug } = await params;
  const ministry = await getMinistry(slug);
  if (!ministry) notFound();
  const current = ministry.current;
  const verifiedLegislation = ministry.legislation.filter((item) => item.confidence === "official" || item.confidence === "high");
  const suggestedLegislation = ministry.legislation.filter((item) => item.confidence === "suggested");
  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
    <Link href={`/${locale}/ministries`} className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]"><ArrowLeft size={14}/>{locale === "ro" ? "Toate ministerele" : "All ministries"}</Link>
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{locale === "ro" ? "Minister" : "Ministry"}</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold leading-[.98] tracking-[-.035em] text-[#050e2c] [overflow-wrap:anywhere] lg:text-6xl">{ministry.name}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#4b608a]">{locale === "ro" ? ministry.descriptionRo : ministry.descriptionEn}</p>
        {ministry.institutionalHistory.incarnations.length ? <InstitutionalHistory history={ministry.institutionalHistory} locale={locale}/> : null}
        <section className="mt-6 border border-slate-300 bg-white p-4 md:p-5"><div className="flex items-center gap-2"><Landmark className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Istoricul miniștrilor" : "Ministerial history"}</h2></div>
          <div className="mt-4 divide-y divide-slate-200">{ministry.terms.map((term, index) => <article key={term.id} className="grid min-w-0 gap-2 py-4 md:grid-cols-[150px_minmax(0,1fr)_auto] md:items-start">
            <div className="text-xs font-semibold text-[#4b608a]">{formatDate(term.startsOn, locale)}<span className="block">{term.endsOn ? `— ${formatDate(term.endsOn, locale)}` : `— ${locale === "ro" ? "prezent" : "present"}`}</span></div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{term.member ? <Link href={`/${locale}/members/${term.member.slug}`} className="font-serif text-lg font-semibold text-[#061a47] hover:text-[#075fc6]">{term.person.displayName}</Link> : <strong className="font-serif text-lg text-[#061a47]">{term.person.displayName}</strong>}{term.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}{index === 0 && !term.endsOn ? <span className="border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-900">{locale === "ro" ? "Actual" : "Current"}</span> : null}</div><p className="mt-1 text-xs text-[#4b608a]">{term.title} · <Link href={`/${locale}/governments/${term.government.slug}`} className="font-semibold text-[#075fc6]">{locale === "ro" ? "Guvernul" : "Government"} {term.government.name}</Link></p></div>
            {term.sourceUrl ? <a href={term.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Sursă" : "Source"}<ExternalLink size={12}/></a> : null}
          </article>)}</div>
        </section>
        <section className="mt-5 border border-slate-300 bg-white p-4 md:p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div className="flex items-center gap-2"><Vote className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Voturi și proiecte asociate" : "Related votes and bills"}</h2></div><span className="text-xs text-[#4b608a]">{verifiedLegislation.length} {locale === "ro" ? "legături confirmate" : "confirmed links"}</span></div>
          {verifiedLegislation.length ? <div className="mt-4 divide-y divide-slate-200">{verifiedLegislation.map((item) => <LegislationRow key={`${item.bill.id}-${item.relation}`} locale={locale} item={item}/>)}</div> : <p className="mt-3 text-sm leading-6 text-[#4b608a]">{locale === "ro" ? "Nu există încă proiecte atribuite oficial acestui minister. Nu transformăm simplele mențiuni în legături confirmate." : "No bills are officially attributed to this ministry yet. Simple mentions are not presented as confirmed relationships."}</p>}
          {suggestedLegislation.length ? <details className="group mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer list-none text-xs font-bold text-[#075fc6]">{locale === "ro" ? `Mențiuni în documente oficiale, de verificat (${suggestedLegislation.length})` : `Official-document mentions to review (${suggestedLegislation.length})`}</summary><div className="mt-2 divide-y divide-slate-200">{suggestedLegislation.slice(0, 20).map((item) => <LegislationRow key={`${item.bill.id}-${item.relation}`} locale={locale} item={item}/>)}</div></details> : null}
        </section>
      </div>
      <aside className="self-start border border-[#dae8f7] bg-[#f0f6fc] p-5 lg:sticky lg:top-24"><Building2 className="text-[#075fc6]"/><h2 className="mt-3 font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Conducerea actuală" : "Current leadership"}</h2>{current ? <><div className="mt-4 flex flex-wrap items-center gap-2"><strong className="font-serif text-xl text-[#061a47]">{current.person.displayName}</strong>{current.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-2 text-xs leading-5 text-[#4b608a]">{locale === "ro" ? "În funcție din" : "In office since"} {formatDate(current.startsOn, locale)}<br/>{locale === "ro" ? "Guvernul" : "Government"} {current.government.name}</p>{current.member ? <Link href={`/${locale}/members/${current.member.slug}`} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Vezi profilul parlamentar" : "View parliamentary profile"}<ArrowRight size={13}/></Link> : null}</> : <p className="mt-3 text-sm text-[#4b608a]">{locale === "ro" ? "Titularul curent este în curs de verificare." : "The current holder is under verification."}</p>}</aside>
    </div>
  </main>;
}

function InstitutionalHistory({ history, locale }: { history: NonNullable<Awaited<ReturnType<typeof getMinistry>>>["institutionalHistory"]; locale: AppLocale }) {
  return <section className="mt-6 border border-[#b8d2ef] bg-[#f0f6fc] p-4 md:p-5">
    <div className="flex items-center gap-2"><GitMerge className="text-[#075fc6]"/><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Cum s-a schimbat instituția" : "How the institution changed"}</h2></div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-[#4b608a]">{locale === "ro" ? "Portofoliul a fost purtat de instituții diferite. Separăm continuitatea domeniului de existența juridică a fiecărui minister." : "This portfolio has been held by different institutions. Policy continuity is shown separately from each ministry’s legal existence."}</p>
    <div className="mt-4 grid gap-2 md:grid-cols-2">{history.incarnations.map((item) => <article key={item.id} className="min-w-0 border border-[#cadbef] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><strong className="max-w-xl font-serif text-base leading-5 text-[#061a47]">{item.name}</strong>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#075fc6]">{locale === "ro" ? "Act oficial" : "Official act"}<ExternalLink size={10}/></a> : null}</div>
      <p className="mt-1 text-[10px] font-semibold text-[#4b608a]">{formatDate(item.startsOn, locale)} — {item.endsOn ? formatDate(item.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p>
      <div className="mt-2 flex flex-wrap gap-1">{item.portfolios.map((portfolio) => <span key={portfolio.id} className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-[#4b608a]">{locale === "ro" ? portfolio.nameRo : portfolio.nameEn}</span>)}</div>
    </article>)}</div>
    {history.lineage.length ? <div className="mt-4 border-t border-[#cadbef] pt-3"><h3 className="text-[10px] font-bold uppercase tracking-wide text-[#4b608a]">{locale === "ro" ? "Reorganizări documentate" : "Documented reorganisations"}</h3><div className="mt-2 space-y-2">{history.lineage.map((edge) => <div key={edge.id} className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-[#253b66]"><span className="font-semibold">{edge.from.name}</span><ArrowRight size={12} className="shrink-0 text-[#075fc6]"/><span className="font-semibold">{edge.to.name}</span><span className="border border-[#cadbef] bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase">{lineageLabel(edge.relationship, locale)}</span><span className="text-[10px] text-[#4b608a]">{formatDate(edge.effectiveOn, locale)}</span></div>)}</div></div> : null}
  </section>;
}

function lineageLabel(relationship: string, locale: AppLocale) {
  const labels: Record<string, [string, string]> = {
    renamed_to: ["redenumire", "renamed"],
    replaced_by: ["înlocuit", "replaced"],
    merged_into: ["comasare", "merged"],
    split_into: ["divizare", "split"],
    responsibility_transferred_to: ["transfer atribuții", "responsibilities transferred"]
  };
  const label = labels[relationship] ?? [relationship, relationship];
  return locale === "ro" ? label[0] : label[1];
}

function LegislationRow({ locale, item }: { locale: AppLocale; item: NonNullable<Awaited<ReturnType<typeof getMinistry>>>["legislation"][number] }) {
  return <article className="min-w-0 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link href={`/${locale}/bills/${item.bill.slug}`} className="font-serif text-lg font-semibold text-[#061a47] hover:text-[#075fc6]">{item.bill.identifier}</Link><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#4b608a]">{item.bill.title}</p></div><span className={`shrink-0 border px-2 py-1 text-[9px] font-bold uppercase ${item.confidence === "official" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}>{item.confidence === "official" ? (locale === "ro" ? "Oficial" : "Official") : (locale === "ro" ? "De verificat" : "To review")}</span></div><p className="mt-2 text-xs leading-5 text-[#4b608a]">{item.reason}</p>{item.votes.length ? <div className="mt-2 flex flex-wrap gap-2">{item.votes.slice(0, 3).map((vote) => <Link key={vote.id} href={`/${locale}/votes/${vote.id}`} className="border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-[#075fc6]">{formatDate(vote.heldOn, locale)} · {locale === "ro" ? "Vezi votul" : "View vote"}</Link>)}</div> : null}{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#075fc6]">{locale === "ro" ? "Documentul în care apare" : "Document containing the mention"}<ExternalLink size={10}/></a> : null}</article>;
}
