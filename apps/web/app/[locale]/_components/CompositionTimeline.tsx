"use client";

import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, ChevronDown, Clock3, Landmark, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, type Locale } from "@cumsevoteaza/parliament-model";
import type { CompositionMode, CompositionTimelineStop } from "@/lib/composition-data";
import { CompositionSeatMapPreview } from "./CompositionSeatMap";

export function CompositionTimeline({ locale, mode, stops }: { locale: Locale; mode: CompositionMode; stops: CompositionTimelineStop[] }) {
  const copy = labels[locale];
  const [activeId, setActiveId] = useState(stops[0]?.id ?? "");
  const [showChronology, setShowChronology] = useState(false);
  const active = useMemo(() => stops.find((stop) => stop.id === activeId) ?? stops[0], [activeId, stops]);

  if (!active) return <section className="border border-slate-300 bg-white p-6 text-sm text-[#4b608a]">{copy.empty}</section>;

  const memberCount = active.chambers.reduce((sum, chamber) => sum + chamber.seats.length, 0);
  const representativeMembers = active.chambers.flatMap((chamber) => chamber.seats).sort((a, b) => a.member.displayName.localeCompare(b.member.displayName, locale)).slice(0, 6);
  const events = [...active.events].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  return <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
    <nav aria-label={copy.legislatures} className="self-start border border-slate-300 bg-white xl:sticky xl:top-24">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#4b608a]">{copy.choose}</div>
      {stops.map((stop) => <button key={stop.id} type="button" onClick={() => { setActiveId(stop.id); setShowChronology(false); }} aria-pressed={stop.id === active.id} className={`flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 text-left last:border-b-0 ${stop.id === active.id ? "border-l-4 border-l-[#f7b500] bg-[#fffaf0]" : "border-l-4 border-l-transparent hover:bg-slate-50"}`}>
        <span><strong className="block font-serif text-lg text-[#061a47]">{stop.legislature.label}</strong><small className="mt-1 block text-[#4b608a]">{yearRange(stop.legislature.startsOn, stop.legislature.endsOn)}</small></span>
        <ArrowRight size={16} className="shrink-0 text-[#075fc6]"/>
      </button>)}
    </nav>

    <div className="min-w-0 space-y-4">
      <article className="border border-slate-300 bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{copy.legislature}</p><h2 className="mt-1 font-serif text-4xl font-semibold text-[#061a47]">{active.legislature.label}</h2><p className="mt-2 text-sm text-[#4b608a]">{formatDate(active.legislature.startsOn, locale)} – {formatDate(active.legislature.endsOn, locale)}</p></div>
          <span className={`border px-2.5 py-1 text-xs font-semibold ${active.sourceStatus === "verified" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>{active.sourceStatus === "verified" ? copy.verified : copy.documented}</span>
        </div>

        <div className="mt-5 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2">
          <Fact icon={<Users/>} label={copy.members} value={String(memberCount || "—")}/>
          <Fact icon={<Building2/>} label={copy.primeMinister} value={primeMinisterNames(active) || copy.unknown}/>
          <Fact icon={<Landmark/>} label={copy.governments} value={String(active.governments.length || "—")}/>
          <Fact icon={<CalendarRange/>} label={copy.compositionDate} value={formatDate(active.compositionDate, locale)}/>
        </div>

        <section className="mt-6">
          <h3 className="font-serif text-2xl font-semibold text-[#061a47]">{copy.governmentPeriods}</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{active.governments.length ? active.governments.map((government) => <div key={government.id} className="border-l-4 border-l-[#075fc6] bg-[#f4f7fb] px-4 py-3"><strong className="text-sm text-[#061a47]">{government.name}</strong><p className="mt-1 text-xs text-[#4b608a]">{formatDate(government.startsOn, locale)} – {government.endsOn ? formatDate(government.endsOn, locale) : copy.present}</p></div>) : <p className="text-sm text-[#4b608a]">{copy.noGovernment}</p>}</div>
        </section>
      </article>

      <section className="grid gap-4 lg:grid-cols-2">{active.chambers.map((chamber) => <article key={chamber.chamber} className="border border-slate-300 bg-white p-4">
        <CompositionSeatMapPreview locale={locale} chamber={chamber.chamber} seats={chamber.seats}/>
        <div className="mt-3 border-t border-slate-200 pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-[#4b608a]">{copy.largestGroups}</h3><div className="mt-2 space-y-1.5">{chamber.groups.slice().sort((a, b) => b.seats - a.seats).slice(0, 4).map((group) => <div key={group.group.id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{background: group.group.color}}/>{group.party?.shortName ?? group.group.shortName}</span><strong>{group.seats}</strong></div>)}</div></div>
      </article>)}</section>

      <section className="border border-slate-300 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{copy.peopleEyebrow}</p><h3 className="mt-1 font-serif text-2xl font-semibold text-[#061a47]">{copy.people}</h3></div><Link href={`/${locale}/members?legislature=${active.legislature.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-[#075fc6]">{copy.allMembers}<ArrowRight size={15}/></Link></div>
        {representativeMembers.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{representativeMembers.map(({member, group}) => <Link key={member.id} href={`/${locale}/members/${member.slug}`} className="border border-slate-200 px-3 py-2 hover:border-[#075fc6] hover:bg-[#f8fbff]"><strong className="block truncate text-sm text-[#061a47]">{member.displayName}</strong><span className="mt-1 block text-xs text-[#4b608a]">{group?.shortName ?? copy.unaffiliated}</span></Link>)}</div> : <p className="mt-3 text-sm text-[#4b608a]">{copy.noMembers}</p>}
      </section>

      <section className="border border-slate-300 bg-white">
        <button type="button" onClick={() => setShowChronology((value) => !value)} aria-expanded={showChronology} className="flex w-full items-center justify-between gap-3 p-5 text-left"><span className="flex items-center gap-3"><Clock3 className="text-[#061a47]"/><span><strong className="block font-serif text-xl text-[#061a47]">{copy.fullHistory}</strong><small className="mt-1 block text-[#4b608a]">{events.length} {copy.moments}</small></span></span><ChevronDown className={`transition ${showChronology ? "rotate-180" : ""}`}/></button>
        {showChronology ? <ol className="border-t border-slate-200 px-5 py-4">{events.length ? events.map((event) => <li key={event.id} className="relative border-l-2 border-slate-200 pb-5 pl-5 last:pb-0"><i className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#075fc6]"/><time className="text-xs font-bold uppercase text-[#075fc6]">{formatDate(event.occurredOn, locale)}</time><h4 className="mt-1 text-sm font-semibold text-[#061a47]">{event.title}</h4>{event.description ? <p className="mt-1 text-sm leading-5 text-[#4b608a]">{event.description}</p> : null}</li>) : <li className="text-sm text-[#4b608a]">{copy.noMoments}</li>}</ol> : null}
      </section>
      {mode === "computed" ? <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{copy.computed}</p> : null}
    </div>
  </section>;
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="min-w-0 bg-white p-4"><span className="text-[#075fc6] [&>svg]:h-5 [&>svg]:w-5">{icon}</span><span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#4b608a]">{label}</span><strong className="mt-1 block break-words font-serif text-lg leading-6 text-[#061a47]" title={value}>{value}</strong></div>; }
function primeMinisterNames(stop: CompositionTimelineStop) { return stop.primeMinisters.map((item) => item.person.displayName).slice(0, 3).join(", ") || stop.primeMinister?.displayName || ""; }
function yearRange(start: string, end: string) { return `${start.slice(0, 4)}–${end.slice(0, 4)}`; }

const labels = {
  ro: { empty: "Nu există încă date istorice pentru legislaturile încheiate.", legislatures: "Legislaturi istorice", choose: "Alege legislatura", legislature: "Legislatură încheiată", verified: "Date verificate", documented: "Documentare manuală", members: "Mandate documentate", primeMinister: "Prim-miniștri", governments: "Guverne", compositionDate: "Componență la data", unknown: "Necunoscut", governmentPeriods: "Guvernele legislaturii", present: "prezent", noGovernment: "Nu există perioade guvernamentale documentate.", largestGroups: "Cele mai mari grupuri", peopleEyebrow: "Oameni", people: "Parlamentari din legislatură", allMembers: "Vezi toți parlamentarii", unaffiliated: "Neafiliat", noMembers: "Nu există mandate nominale disponibile.", fullHistory: "Vezi cronologia completă", moments: "momente documentate", noMoments: "Nu există momente documentate pentru această legislatură.", computed: "Această vedere folosește o compoziție calculată și poate conține intervale incomplete." },
  en: { empty: "Historical data is not yet available for completed legislatures.", legislatures: "Historical legislatures", choose: "Choose legislature", legislature: "Completed legislature", verified: "Verified data", documented: "Manually documented", members: "Documented seats", primeMinister: "Prime ministers", governments: "Governments", compositionDate: "Composition date", unknown: "Unknown", governmentPeriods: "Governments during the term", present: "present", noGovernment: "No government periods are documented.", largestGroups: "Largest groups", peopleEyebrow: "People", people: "Members in this legislature", allMembers: "View all members", unaffiliated: "Unaffiliated", noMembers: "No nominal mandates are available.", fullHistory: "View the full chronology", moments: "documented moments", noMoments: "No moments are documented for this legislature.", computed: "This view uses a computed composition and may contain incomplete intervals." }
};
