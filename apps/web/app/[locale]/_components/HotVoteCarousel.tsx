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
  return <section className="border border-slate-300 bg-white" aria-label={labels.eyebrow}>
    <div className="border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-[#0c6464]"><Flame className="mr-1 inline-block" size={15} aria-hidden="true" />{items.length ? labels.eyebrow : labels.fallback}</div>
    <div className="p-5">
      <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase text-slate-500">{active.vote.chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies")}</div><h2 className="mt-2 font-serif text-3xl font-semibold leading-tight text-[#071a3a]">{active.vote.title}</h2><p className="mt-3 text-sm text-slate-600">{formatDate(active.vote.heldOn, locale)} · {voteChoiceLabels[locale].for}: {active.vote.totals.for} · {active.hotCount} {locale === "ro" ? "reacții Hot" : "Hot reactions"}</p></div><span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">{active.vote.totals.for >= active.vote.totals.against ? (locale === "ro" ? "Adoptat" : "Adopted") : (locale === "ro" ? "Respins" : "Rejected")}</span></div>
      <div className="mt-5 flex items-center justify-between gap-3"><Link href={`/${locale}/votes/${active.vote.id}`} className="rounded-md bg-[#071a3a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102d5b]">{labels.details} →</Link><div className="flex items-center gap-2"><button type="button" onClick={() => move(-1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" aria-label={labels.previous}><ChevronLeft size={18} /></button><span className="min-w-14 text-center text-xs text-slate-500" aria-live="polite">{index + 1} / {slides.length}</span><button type="button" onClick={() => move(1)} className="rounded-md border border-slate-300 p-2 hover:bg-slate-50" aria-label={labels.next}><ChevronRight size={18} /></button></div></div>
    </div>
  </section>;
}
