"use client";

import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, ChevronDown, Clock3, Landmark, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, type Locale } from "@cumsevoteaza/parliament-model";
import type { CompositionMode, CompositionTimelineStop } from "@/lib/composition-data";
import { Hemicycle } from "./ui/Hemicycle";
import { PartyMark } from "./ui/PartyMark";
import { presentMemberIdentity } from "@/lib/public-presentation";

export function CompositionTimeline({ locale, mode, stops, currentStopId }: { locale: Locale; mode: CompositionMode; stops: CompositionTimelineStop[]; currentStopId?: string }) {
  const copy = labels[locale];
  const [activeId, setActiveId] = useState(stops[0]?.id ?? "");
  const [showChronology, setShowChronology] = useState(false);
  const active = useMemo(() => stops.find((stop) => stop.id === activeId) ?? stops[0], [activeId, stops]);

  if (!active) return <section className="border border-line bg-surface p-6 text-sm text-muted rounded-card">{copy.empty}</section>;

  const memberCount = active.chambers.reduce((sum, chamber) => sum + chamber.seats.length, 0);
  const representativeMembers = active.chambers.flatMap((chamber) => chamber.seats).sort((a, b) => a.member.displayName.localeCompare(b.member.displayName, locale)).slice(0, 6);
  const events = [...active.events].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const isCurrent = active.id === currentStopId;

  return <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
    <nav aria-label={copy.legislatures} className="self-start border border-line bg-surface xl:sticky xl:top-24">
      <div className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">{copy.choose}</div>
      {stops.map((stop) => <button key={stop.id} type="button" onClick={() => { setActiveId(stop.id); setShowChronology(false); }} aria-pressed={stop.id === active.id} className={`flex w-full items-center justify-between gap-3 border-b border-line px-4 py-4 text-left last:border-b-0 ${stop.id === active.id ? "border-l-4 border-l-brand bg-canvas" : "border-l-4 border-l-transparent hover:bg-wash"}`}>
        <span><strong className="block font-serif text-lg text-ink">{stop.legislature.label}</strong><small className="mt-1 block text-muted">{yearRange(stop.legislature.startsOn, stop.legislature.endsOn)}{stop.id === currentStopId ? ` · ${copy.current}` : ""}</small></span>
        <ArrowRight size={16} className="shrink-0 text-brand"/>
      </button>)}
    </nav>

    <div className="min-w-0 space-y-4">
      <article className="border border-line bg-surface p-5 md:p-6 rounded-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div><p className="text-xs font-bold uppercase tracking-wide text-brand">{isCurrent ? copy.currentLegislature : copy.legislature}</p><h2 className="mt-1 font-serif text-4xl font-semibold text-ink">{active.legislature.label}</h2><p className="mt-2 text-sm text-muted">{formatDate(active.legislature.startsOn, locale)} – {isCurrent ? copy.present : formatDate(active.legislature.endsOn, locale)}</p></div>
          <span className={`border px-2.5 py-1 text-xs font-semibold ${active.sourceStatus === "verified" ? "border-vote-for-fill bg-vote-for-bg text-vote-for" : "border-vote-abstain-fill bg-vote-abstain-bg text-vote-abstain"}`}>{active.sourceStatus === "verified" ? copy.verified : copy.documented}</span>
        </div>

        <div className="mt-5 grid gap-px border border-line bg-line sm:grid-cols-2">
          <Fact icon={<Users/>} label={copy.members} value={String(memberCount || "—")}/>
          <Fact icon={<Building2/>} label={copy.primeMinister} value={primeMinisterNames(active) || copy.unknown}/>
          <Fact icon={<Landmark/>} label={copy.governments} value={String(active.governments.length || "—")}/>
          <Fact icon={<CalendarRange/>} label={copy.compositionDate} value={formatDate(active.compositionDate, locale)}/>
        </div>

        <section className="mt-6">
          <h3 className="font-serif text-2xl font-semibold text-ink">{copy.governmentPeriods}</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{active.governments.length ? active.governments.map((government) => <Link key={government.id} href={`/${locale}/governments/${government.slug}`} className="group border-l-4 border-l-brand bg-wash px-4 py-3 hover:bg-brand-soft"><span className="flex items-center justify-between gap-3"><strong className="text-sm text-ink">{government.name}</strong><ArrowRight size={15} className="shrink-0 text-brand transition group-hover:translate-x-0.5"/></span><p className="mt-1 text-xs text-muted">{formatDate(government.startsOn, locale)} – {government.endsOn ? formatDate(government.endsOn, locale) : copy.present}</p><span className="mt-2 block text-xs font-bold text-brand">{copy.viewCabinet}</span></Link>) : <p className="text-sm text-muted">{copy.noGovernment}</p>}</div>
        </section>
      </article>

      <section className="grid gap-4 lg:grid-cols-2">{active.chambers.map((chamber) => <article key={chamber.chamber} className="border border-line bg-surface p-4 rounded-card">
        <Hemicycle seats={seatColoursByGroup(chamber.seats)} summary={`${chamber.chamber === "senate" ? "Senat" : "Camera Deputaților"}: ${chamber.groups.slice().sort((a, b) => b.seats - a.seats).map((group) => `${group.group.shortName} ${group.seats}`).join(", ")}`}/>
        <div className="mt-3 border-t border-line pt-3"><h3 className="text-xs font-bold uppercase tracking-wide text-muted">{copy.largestGroups}</h3><div className="mt-2 space-y-1.5">{chamber.groups.slice().sort((a, b) => b.seats - a.seats).slice(0, 4).map((group) => <div key={group.group.id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"><span className="flex items-center gap-2"><PartyMark party={{ shortName: group.party?.shortName ?? group.group.shortName, color: group.group.color, logoAssetId: group.party?.logoAssetId }} size={16}/>{group.party?.shortName ?? group.group.shortName}</span><strong>{group.seats}</strong></div>)}</div></div>
      </article>)}</section>

      <section className="border border-line bg-surface p-5 rounded-card">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand">{copy.peopleEyebrow}</p><h3 className="mt-1 font-serif text-2xl font-semibold text-ink">{copy.people}</h3></div><Link href={`/${locale}/members?legislature=${active.legislature.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand">{copy.allMembers}<ArrowRight size={15}/></Link></div>
        {representativeMembers.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{representativeMembers.map(({member, group}) => <Link key={member.id} href={`/${locale}/members/${member.slug}`} className="border border-line px-3 py-2 hover:border-brand hover:bg-wash"><strong className="block truncate text-sm text-ink">{presentMemberIdentity(member).name}</strong><span className="mt-1 flex items-center gap-1.5 text-xs text-muted">{group ? <PartyMark party={{ shortName: group.shortName, color: group.color }} size={16}/> : null}{group?.shortName ?? copy.unaffiliated}</span></Link>)}</div> : <p className="mt-3 text-sm text-muted">{copy.noMembers}</p>}
      </section>

      <section className="border border-line bg-surface">
        <button type="button" onClick={() => setShowChronology((value) => !value)} aria-expanded={showChronology} className="flex w-full items-center justify-between gap-3 p-5 text-left"><span className="flex items-center gap-3"><Clock3 className="text-ink"/><span><strong className="block font-serif text-xl text-ink">{copy.fullHistory}</strong><small className="mt-1 block text-muted">{events.length} {copy.moments}</small></span></span><ChevronDown className={`transition ${showChronology ? "rotate-180" : ""}`}/></button>
        {showChronology ? <ol className="border-t border-line px-5 py-4">{events.length ? events.map((event) => <li key={event.id} className="relative border-l-2 border-line pb-5 pl-5 last:pb-0"><i className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand"/><time className="text-xs font-bold uppercase text-brand">{formatDate(event.occurredOn, locale)}</time><h4 className="mt-1 text-sm font-semibold text-ink">{event.title}</h4>{event.description ? <p className="mt-1 text-sm leading-5 text-muted">{event.description}</p> : null}</li>) : <li className="text-sm text-muted">{copy.noMoments}</li>}</ol> : null}
      </section>
      {mode === "computed" ? <p className="border border-vote-abstain-fill bg-vote-abstain-bg p-3 text-sm text-vote-abstain">{copy.computed}</p> : null}
    </div>
  </section>;
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="min-w-0 bg-surface p-4"><span className="text-brand [&>svg]:h-5 [&>svg]:w-5">{icon}</span><span className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted">{label}</span><strong className="mt-1 block break-words font-serif text-lg leading-6 text-ink" title={value}>{value}</strong></div>; }
function primeMinisterNames(stop: CompositionTimelineStop) { return stop.primeMinisters.map((item) => item.person.displayName).slice(0, 3).join(", ") || stop.primeMinister?.displayName || ""; }
function yearRange(start: string, end: string) { return `${start.slice(0, 4)}–${end.slice(0, 4)}`; }

const labels = {
  ro: { empty: "Nu există încă date istorice pentru legislaturi.", legislatures: "Legislaturi", choose: "Alege legislatura", legislature: "Legislatură încheiată", currentLegislature: "Legislatura actuală", current: "actuală", verified: "Cu sursă oficială", documented: "Documentare manuală", members: "Mandate documentate", primeMinister: "Prim-miniștri", governments: "Guverne", compositionDate: "Componență la data", unknown: "Necunoscut", governmentPeriods: "Guvernele legislaturii", viewCabinet: "Vezi miniștrii și schimbările", present: "prezent", noGovernment: "Nu există perioade guvernamentale documentate.", largestGroups: "Cele mai mari grupuri", peopleEyebrow: "Oameni", people: "Parlamentari din legislatură", allMembers: "Vezi toți parlamentarii", unaffiliated: "Neafiliat", noMembers: "Nu există mandate nominale disponibile.", fullHistory: "Vezi cronologia completă", moments: "momente documentate", noMoments: "Nu există momente documentate pentru această legislatură.", computed: "Această vedere folosește o compoziție calculată și poate conține intervale incomplete." },
  en: { empty: "Historical data is not yet available for legislatures.", legislatures: "Legislatures", choose: "Choose legislature", legislature: "Completed legislature", currentLegislature: "Current legislature", current: "current", verified: "Officially sourced", documented: "Manually documented", members: "Documented seats", primeMinister: "Prime ministers", governments: "Governments", compositionDate: "Composition date", unknown: "Unknown", governmentPeriods: "Governments during the term", viewCabinet: "View ministers and changes", present: "present", noGovernment: "No government periods are documented.", largestGroups: "Largest groups", peopleEyebrow: "People", people: "Members in this legislature", allMembers: "View all members", unaffiliated: "Unaffiliated", noMembers: "No nominal mandates are available.", fullHistory: "View the full chronology", moments: "documented moments", noMoments: "No moments are documented for this legislature.", computed: "This view uses a computed composition and may contain incomplete intervals." }
};

/** The seats of a chamber in the colour of their group, the largest group first, so that groups sit together as wedges. */
function seatColoursByGroup(seats: Array<{ group?: { id: string; color: string } }>): Array<{ color: string }> {
  const sizes = new Map<string, number>();
  for (const seat of seats) sizes.set(seat.group?.id ?? "", (sizes.get(seat.group?.id ?? "") ?? 0) + 1);
  return [...seats].sort((a, b) => (sizes.get(b.group?.id ?? "") ?? 0) - (sizes.get(a.group?.id ?? "") ?? 0) || (a.group?.id ?? "").localeCompare(b.group?.id ?? "")).map((seat) => ({ color: seat.group?.color ?? "#cbd5e1" }));
}
