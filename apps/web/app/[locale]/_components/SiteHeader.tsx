"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import type { AppLocale } from "@/lib/i18n";
import { BrandLogo } from "./BrandLogo";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function SiteHeader({ locale, labels }: { locale: AppLocale; labels: { today: string; votes: string; bills: string; members: string; compositions: string; health: string; tagline: string; search: string } }) {
  const pathname = usePathname();
  const links: Array<[string, string, string]> = [["today", `/${locale}`, labels.today], ["votes", `/${locale}/votes`, labels.votes], ["bills", `/${locale}/bills`, labels.bills], ["members", `/${locale}/members`, labels.members], ["compositions", `/${locale}/compozitii`, labels.compositions], ["health", `/${locale}/data-health`, labels.health]];
  return <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-[62px] max-w-[1440px] items-center gap-8 px-4 md:min-h-[76px] lg:px-9">
    <Link href={`/${locale}`} aria-label="CumVoteaza" className="flex shrink-0 items-center gap-3"><BrandLogo /><span className="hidden sm:block"><strong className="block font-serif text-lg leading-5 text-[#071a3a]">CumVoteaza</strong><span className="text-xs text-slate-500">{labels.tagline}</span></span></Link>
    <nav className="ml-auto hidden items-center gap-1 text-sm text-slate-700 md:flex" aria-label="Main navigation">{links.map(([key,href,label])=>{const active=key==="today"?pathname===href:key!=="today"&&pathname.startsWith(href);return <Link key={key} href={href} className={`relative whitespace-nowrap px-3 py-5 transition hover:text-[#071a3a] ${active?"font-semibold text-[#071a3a] after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:bg-[#071a3a]":""}`}>{label}</Link>})}</nav>
    <Link href={`/${locale}/votes`} aria-label={labels.search} className="hidden rounded-full p-2 text-[#071a3a] hover:bg-slate-100 sm:block"><Search size={20} /></Link><LocaleSwitcher locale={locale} />
  </div></header>;
}
