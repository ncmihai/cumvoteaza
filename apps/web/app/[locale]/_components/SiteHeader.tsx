"use client";

import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AppLocale } from "@/lib/i18n";
import { BrandLogo } from "./BrandLogo";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function SiteHeader({ locale, labels }: { locale: AppLocale; labels: { today: string; votes: string; bills: string; members: string; compositions: string; health: string; tagline: string; search: string } }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links: Array<[string, string, string]> = [["today", `/${locale}`, labels.today], ["votes", `/${locale}/votes`, labels.votes], ["bills", `/${locale}/bills`, labels.bills], ["members", `/${locale}/members`, labels.members], ["compositions", `/${locale}/compozitii`, labels.compositions], ["health", `/${locale}/data-health`, labels.health]];
  return <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/95 backdrop-blur"><div className="relative mx-auto flex min-h-[62px] max-w-[1440px] items-center gap-5 px-4 md:min-h-[76px] lg:px-9">
    <Link href={`/${locale}`} aria-label="CumVoteaza" className="flex shrink-0 items-center gap-3"><BrandLogo /><strong className="hidden font-serif text-xl leading-5 text-[#071a3a] sm:block">CumVoteaza</strong></Link>
    <nav className="ml-auto hidden items-center gap-1 text-sm text-slate-700 lg:flex" aria-label={locale === "ro" ? "Navigare principală" : "Main navigation"}>{links.map(([key,href,label])=>{const active=key==="today"?pathname===href:key!=="today"&&pathname.startsWith(href);return <Link key={key} href={href} className={`relative whitespace-nowrap px-3 py-5 transition hover:text-[#071a3a] ${active?"font-semibold text-[#071a3a] after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:bg-[#071a3a]":""}`}>{label}</Link>})}</nav>
    <Link href={`/${locale}/votes`} aria-label={labels.search} className="ml-auto rounded-full p-2 text-[#071a3a] hover:bg-slate-100 lg:ml-0"><Search size={21} /></Link><LocaleSwitcher locale={locale} />
    <button type="button" className="rounded-md border border-slate-300 p-2 text-[#071a3a] hover:bg-slate-100 lg:hidden" aria-label={menuOpen ? (locale === "ro" ? "Închide meniul" : "Close menu") : (locale === "ro" ? "Deschide meniul" : "Open menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    {menuOpen ? <nav className="absolute inset-x-0 top-full grid border-y border-slate-300 bg-white p-3 shadow-lg lg:hidden" aria-label={locale === "ro" ? "Navigare mobilă" : "Mobile navigation"}>{links.map(([key,href,label])=>{const active=key==="today"?pathname===href:key!=="today"&&pathname.startsWith(href);return <Link key={key} href={href} onClick={() => setMenuOpen(false)} className={`border-l-4 px-4 py-3 text-sm ${active?"border-[#071a3a] bg-slate-50 font-semibold text-[#071a3a]":"border-transparent text-slate-700"}`}>{label}</Link>})}</nav> : null}
  </div></header>;
}
