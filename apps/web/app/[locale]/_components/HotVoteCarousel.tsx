"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useState } from "react";
import type { VoteExplorerItem } from "@/lib/explorer-data";
import { formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";

export function HotVoteCarousel({ locale, items, fallback }: { locale: "ro" | "en"; items: VoteExplorerItem[]; fallback: VoteExplorerItem[] }) {
  const slides = items.length ? items : fallback;
  const [index, setIndex] = useState(0);
  if (!slides.length) return null;
  const active = slides[Math.min(index, slides.length - 1)]!;
  const labels = locale === "ro" ? { eyebrow: "Voturi cu interes public · ultimele 30 de zile", fallback: "Cele mai recente voturi verificate", details: "Vezi detalii", previous: "Vot anterior", next: "Vot următor" } : { eyebrow: "Public interest votes · last 30 days", fallback: "Latest verified votes", details: "View details", previous: "Previous vote", next: "Next vote" };
  const move = (delta: number) => setIndex((value) => (value + delta + slides.length) % slides.length);
  return <section className="border-l-4 border-l-[#ffb400] border-y border-r border-slate-300 bg-white shadow-sm" aria-label={labels.eyebrow}>
    <div className="border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-[#0c6464]"><Flame className="mr-1 inline-block" size={15} aria-hidden="true" />{items.length ? labels.eyebrow : labels.fallback}</div>
    <div className="p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{active.vote.chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies")}</div><h2 className="mt-2 max-w-3xl font-serif text-4xl font-semibold leading-[1.05] text-[#071a3a]">{active.vote.title}</h2><p className="mt-3 text-sm text-slate-600">{formatDate(active.vote.heldOn, locale)} · {active.vote.voteType}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{locale === "ro" ? "Vot verificat" : "Verified vote"}</span></div>
      <div className="mt-6 grid grid-cols-2 divide-x border-y border-slate-200 py-3 sm:grid-cols-4"><Stat label={voteChoiceLabels[locale].for} value={active.vote.totals.for} tone="text-emerald-700" /><Stat label={voteChoiceLabels[locale].against} value={active.vote.totals.against} tone="text-red-700" /><Stat label={voteChoiceLabels[locale].abstention} value={active.vote.totals.abstention} tone="text-amber-700" /><Stat label={locale === "ro" ? "Prezenți" : "Present"} value={active.vote.totals.present} tone="text-[#071a3a]" /></div>
      <div className="mt-5 flex items-center justify-between gap-3"><Link href={`/${locale}/votes/${active.vote.id}`} className="rounded-md bg-[#071a3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102d5b]">{labels.details} →</Link><div className="flex items-center gap-2"><button type="button" onClick={() => move(-1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" aria-label={labels.previous}><ChevronLeft size={18} /></button><span className="min-w-14 text-center text-xs text-slate-500" aria-live="polite">{index + 1} / {slides.length}</span><button type="button" onClick={() => move(1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" aria-label={labels.next}><ChevronRight size={18} /></button></div></div>
    </div>
  </section>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="px-3 first:pl-0 last:pr-0"><div className={`font-serif text-2xl font-semibold ${tone}`}>{value}</div><div className="text-xs text-slate-500">{label}</div></div>;
}
