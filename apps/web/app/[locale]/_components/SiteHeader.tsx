"use client";

import Link from "next/link";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppLocale } from "@/lib/i18n";
import { BrandLogo } from "./BrandLogo";
import { LocaleSwitcher } from "./LocaleSwitcher";

interface NavItem {
  key: string;
  label: string;
  href: string;
  /** Path prefixes (after the language) that make this item the current one. */
  match: string[];
  children?: Array<{ label: string; href: string; hint: string }>;
}

function navigation(locale: AppLocale): NavItem[] {
  const ro = locale === "ro";
  const at = (path: string) => `/${locale}${path}`;
  return [
    { key: "votes", label: ro ? "Voturi" : "Votes", href: at("/votes"), match: ["/votes"] },
    { key: "bills", label: ro ? "Proiecte de lege" : "Bills", href: at("/bills"), match: ["/bills"] },
    {
      key: "members", label: ro ? "Parlamentari" : "Members", href: at("/members"), match: ["/members", "/compozitii", "/leadership", "/elections"],
      children: [
        { label: ro ? "Toți parlamentarii" : "All members", href: at("/members"), hint: ro ? "Deputați și senatori, după județ sau partid" : "Deputies and senators, by county or party" },
        { label: ro ? "Compoziția Parlamentului" : "Composition of Parliament", href: at("/compozitii"), hint: ro ? "Locurile fiecărui partid, acum și în timp" : "Each party's seats, now and over time" },
        { label: ro ? "Conducerea" : "Leadership", href: at("/leadership"), hint: ro ? "Birouri permanente, lideri de grup, comisii" : "Permanent bureaus, group leaders, committees" },
        { label: ro ? "Alegeri parlamentare" : "Parliamentary elections", href: at("/elections"), hint: ro ? "Voturi și mandate pe liste, 2016 și 2020" : "Votes and mandates by list, 2016 and 2020" }
      ]
    },
    { key: "parties", label: ro ? "Partide" : "Parties", href: at("/parties"), match: ["/parties"] },
    {
      key: "government", label: ro ? "Guvern" : "Government", href: at("/governments"), match: ["/governments", "/ministries", "/motions", "/presidency", "/questions"],
      children: [
        { label: ro ? "Guverne" : "Governments", href: at("/governments"), hint: ro ? "Prim-miniștri, formare, schimbări" : "Prime ministers, formation, changes" },
        { label: ro ? "Ministere" : "Ministries", href: at("/ministries"), hint: ro ? "Cine a condus fiecare minister" : "Who has led each ministry" },
        { label: ro ? "Moțiuni" : "Motions", href: at("/motions"), hint: ro ? "Moțiuni de cenzură și simple, cu semnatari" : "Censure and simple motions, with signatories" },
        { label: ro ? "Întrebări și interpelări" : "Questions and interpellations", href: at("/questions"), hint: ro ? "Ce au întrebat deputații Guvernul, cu răspunsuri" : "What deputies asked the Government, with answers" },
        { label: ro ? "Președinția" : "The Presidency", href: at("/presidency"), hint: ro ? "Decretele Președintelui din 2014" : "The President's decrees since 2014" }
      ]
    }
  ];
}

export function SiteHeader({ locale }: { locale: AppLocale }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const ro = locale === "ro";
  const items = navigation(locale);
  const path = pathname.replace(/^\/(?:ro|en)(?=\/|$)/, "") || "/";
  const isActive = (item: NavItem) => item.match.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-page items-center gap-4 px-4 lg:px-8">
        <Link href={`/${locale}`} aria-label={ro ? "CumVoteaza, prima pagină" : "CumVoteaza, home"} className="flex shrink-0 items-center gap-2.5">
          <BrandLogo size={34} />
          {/* On a phone narrower than 363 px the logomark alone fits beside the search, the language switch and the menu; the link keeps its name for screen readers (Backlog 3). */}
          <span className="font-display text-xl font-bold tracking-tight text-ink max-[362px]:sr-only">Cum<span className="text-brand">Voteaza</span></span>
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label={ro ? "Navigare principală" : "Main navigation"}>
          {items.map((item) => (
            <div key={item.key} className="group relative">
              <Link href={item.href} aria-current={isActive(item) ? "page" : undefined} className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${isActive(item) ? "bg-brand-soft text-brand-strong" : "text-ink-soft hover:bg-wash hover:text-ink"}`}>
                {item.label}
                {item.children ? <ChevronDown size={14} aria-hidden="true" className="opacity-60 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" /> : null}
              </Link>
              {item.children ? (
                <div className="invisible absolute left-0 top-full z-50 w-72 pt-2 opacity-0 transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="rounded-card border border-line bg-surface p-1.5 shadow-lift">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href} className="block rounded-control px-3 py-2.5 hover:bg-wash">
                        <span className="block text-sm font-semibold text-ink">{child.label}</span>
                        <span className="block text-xs text-muted">{child.hint}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/${locale}/votes`} className="hidden items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm text-muted hover:border-line-strong hover:text-ink xl:flex" aria-label={ro ? "Caută voturi, proiecte și parlamentari" : "Search votes, bills and members"}>
            <Search size={16} aria-hidden="true" />
            {ro ? "Caută voturi, proiecte…" : "Search votes, bills…"}
          </Link>
          <Link href={`/${locale}/votes`} className="rounded-full p-2.5 text-ink hover:bg-wash xl:hidden" aria-label={ro ? "Caută" : "Search"}><Search size={20} /></Link>
          <LocaleSwitcher locale={locale} />
          <button type="button" className="rounded-control border border-line p-2 text-ink hover:bg-wash lg:hidden" aria-label={menuOpen ? (ro ? "Închide meniul" : "Close menu") : (ro ? "Deschide meniul" : "Open menu")} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen ? (
          <nav className="absolute inset-x-0 top-full max-h-[80vh] overflow-y-auto border-b border-line bg-surface p-3 shadow-lift lg:hidden" aria-label={ro ? "Navigare mobilă" : "Mobile navigation"}>
            {items.map((item) => (
              <div key={item.key} className="py-1">
                <Link href={item.href} aria-current={isActive(item) ? "page" : undefined} className={`block rounded-control px-3 py-2.5 text-base font-semibold ${isActive(item) ? "bg-brand-soft text-brand-strong" : "text-ink"}`}>{item.label}</Link>
                {item.children ? <div className="ml-3 border-l border-line pl-2">{item.children.map((child) => <Link key={child.href} href={child.href} className="block rounded-control px-3 py-2 text-sm text-ink-soft hover:bg-wash">{child.label}</Link>)}</div> : null}
              </div>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
