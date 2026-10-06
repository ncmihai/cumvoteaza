"use client";

import { useState } from "react";
import { Building2, ExternalLink, Landmark, UsersRound } from "lucide-react";
import { formatDate, type Locale } from "@cumsevoteaza/parliament-model";

export interface PublicCareerEvent {
  id: string;
  category: "parliament" | "government" | "party" | "committee";
  title: string;
  details: string;
  startsOn: string;
  endsOn?: string;
  sourceUrl?: string;
}

export function PublicCareerTimeline({ events, locale }: { events: PublicCareerEvent[]; locale: Locale }) {
  if (!events.length) return null;
  const [selectedCategory, setSelectedCategory] = useState<"all" | PublicCareerEvent["category"]>("all");
  const [expanded, setExpanded] = useState(false);
  const ordered = [...events].sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.title.localeCompare(b.title, locale));
  const visible = selectedCategory === "all" ? ordered : ordered.filter((event) => event.category === selectedCategory);
  const shown = expanded ? visible : visible.slice(0, 12);
  const directlySourced = events.filter((event) => event.sourceUrl).length;
  const categories = (["parliament", "government", "party", "committee"] as const).filter((category) => events.some((event) => event.category === category));
  return <section className="mt-5 border border-slate-300 bg-white p-4 md:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-brand">{locale === "ro" ? "CV public documentat" : "Documented public CV"}</p><h2 className="mt-1 font-serif text-2xl font-semibold text-ink md:text-3xl">{locale === "ro" ? "Parcursul în funcții publice" : "Public-service career"}</h2></div><span className="text-xs text-muted">{events.length} {locale === "ro" ? "înregistrări ·" : "records ·"} {directlySourced} {locale === "ro" ? "cu legătură directă la sursă" : "with a direct source link"}</span></div>
    <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{locale === "ro" ? "Mandate, funcții parlamentare, comisii, afilieri și roluri în Guvern, reunite cronologic din înregistrările cu perioade documentate." : "Mandates, parliamentary offices, committees, affiliations and government roles, combined chronologically from dated records."}</p>
    <p className="mt-2 text-xs leading-5 text-muted">{locale === "ro" ? "O legătură directă apare când sursa este atașată acestei înregistrări. Restul provin din datele parlamentare structurate și necesită verificarea sursei la nivel de înregistrare." : "A direct link appears when a source is attached to the record. Other entries come from structured parliamentary data and still need record-level source verification."}</p>
    <div className="mt-4 flex min-w-0 gap-1 overflow-x-auto pb-1" role="group" aria-label={locale === "ro" ? "Filtrează parcursul" : "Filter career"}><FilterButton active={selectedCategory === "all"} onClick={() => { setSelectedCategory("all"); setExpanded(false); }}>{locale === "ro" ? "Toate" : "All"} ({events.length})</FilterButton>{categories.map((category) => <FilterButton key={category} active={selectedCategory === category} onClick={() => { setSelectedCategory(category); setExpanded(false); }}>{categoryLabel(category, locale)} ({events.filter((event) => event.category === category).length})</FilterButton>)}</div>
    <ol className="mt-3 border-l border-line pl-4">{shown.map((event) => <li key={event.id} className="relative border-b border-slate-200 py-3 last:border-b-0"><span className="absolute -left-[21px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-white bg-brand"/><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-brand">{categoryIcon(event.category)}</span><strong className="font-serif text-base text-ink">{event.title}</strong><span className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-bold uppercase text-muted">{categoryLabel(event.category, locale)}</span></div><p className="mt-1 text-xs leading-5 text-muted">{event.details}</p><p className="mt-1 text-xs font-semibold text-muted">{formatDate(event.startsOn, locale)} — {event.endsOn ? formatDate(event.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p></div>{event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer" aria-label={locale === "ro" ? "Sursă" : "Source"} className="shrink-0 text-brand"><ExternalLink size={14}/></a> : null}</div></li>)}</ol>
    {visible.length > 12 ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-brand hover:border-brand">{expanded ? (locale === "ro" ? "Arată mai puține" : "Show fewer") : (locale === "ro" ? `Arată toate cele ${visible.length} înregistrări` : `Show all ${visible.length} records`)}</button> : null}
  </section>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`shrink-0 border px-3 py-1.5 text-xs font-semibold ${active ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-muted hover:border-brand"}`}>{children}</button>; }

function categoryIcon(category: PublicCareerEvent["category"]) { return category === "government" ? <Landmark size={15}/> : category === "committee" ? <UsersRound size={15}/> : <Building2 size={15}/>; }
function categoryLabel(category: PublicCareerEvent["category"], locale: Locale) { const labels = { parliament: ["Parlament", "Parliament"], government: ["Guvern", "Government"], party: ["Partid", "Party"], committee: ["Comisie", "Committee"] } as const; return labels[category][locale === "ro" ? 0 : 1]; }
