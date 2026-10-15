"use client";

import { Coffee, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";

/**
 * A slim bar at the top of every page (D-050): the site is free, has no ads and one person's time behind it; a plain donation link for those who want to support it.
 * Nothing is loaded from the other site (a link, not a widget, so no script and no tracking of readers), and closing it is remembered for 30 days in this browser only.
 */
const KEY = "cumvoteaza:support-banner-until";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const copy = {
  ro: { label: "Susține proiectul", text: "Un proiect independent, gratuit și fără reclame.", cta: "Cumpără-mi o cafea", close: "Ascunde mesajul pentru 30 de zile" },
  en: { label: "Support the project", text: "An independent project: free, and without ads.", cta: "Buy me a coffee", close: "Hide this message for 30 days" }
} as const;

export function SupportBanner({ locale }: { locale: "ro" | "en" }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      const until = Number(window.localStorage.getItem(KEY));
      if (until > Date.now()) setHidden(true);
    } catch { /* storage blocked: the bar simply shows */ }
  }, []);
  if (hidden) return null;
  const t = copy[locale];
  return <div data-testid="support-banner" role="region" aria-label={t.label} className="border-b border-line bg-brand-soft">
    <div className="mx-auto flex max-w-page items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs text-ink-soft sm:text-sm lg:px-8">
      <p className="min-w-0 text-center">{t.text}{" "}
        <a href={SITE.support.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-brand-strong underline decoration-brand/40 underline-offset-2 hover:text-brand">
          <Coffee size={14} aria-hidden="true" />{t.cta}
        </a>
      </p>
      <button type="button" aria-label={t.close} onClick={() => { setHidden(true); try { window.localStorage.setItem(KEY, String(Date.now() + THIRTY_DAYS)); } catch { /* not remembered */ } }} className="grid size-7 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface"><X size={16} aria-hidden="true" /></button>
    </div>
  </div>;
}
