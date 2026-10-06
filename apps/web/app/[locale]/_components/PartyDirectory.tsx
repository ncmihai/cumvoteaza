"use client";

import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PartyDirectoryEntry } from "@/lib/directory-data";
import { foldKey } from "@/lib/text";
import { PartyMark } from "./ui/PartyMark";

type Locale = "ro" | "en";
const ALL = "all";
const CURRENT = "current";

function Card({ entry, locale, current }: { entry: PartyDirectoryEntry; locale: Locale; current: boolean }) {
  const ro = locale === "ro";
  const seated = entry.deputies + entry.senators > 0;
  return (
    <li>
      <Link href={`/${locale}/parties/${entry.slug}`} className="group flex h-full items-start gap-3 rounded-card border border-line bg-surface p-4 transition hover:border-line-strong hover:shadow-lift">
        <PartyMark party={{ shortName: entry.shortName, color: entry.color, logoAssetId: entry.logoAssetId }} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold leading-tight text-ink group-hover:text-brand">{entry.shortName}</span>
          <span className="mt-0.5 block text-sm leading-5 text-muted">{entry.fullNameKnown ? entry.name : (ro ? "Numele complet nu este înregistrat" : "Full name not recorded")}</span>
          {current && seated ? (
            <span className="mt-2 block text-sm font-semibold text-ink-soft">{entry.deputies} {ro ? "deputați" : "deputies"} · {entry.senators} {ro ? "senatori" : "senators"}</span>
          ) : entry.legislatures.length > 0 ? (
            <span className="mt-2 block text-xs text-muted">{ro ? "Legislaturi" : "Legislatures"}: {entry.legislatures.map((label) => label.slice(0, 4)).join(", ")}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * The parties directory: parties, then the national-minority organisations in a drop-down of their own (most of the entries are there), then independents and
 * the unaffiliated. A legislature selector (default: the one in office) shows who had members then; the search narrows by name.
 */
export function PartyDirectory({ entries, legislatures, locale }: { entries: PartyDirectoryEntry[]; legislatures: string[]; locale: Locale }) {
  const ro = locale === "ro";
  const [legislature, setLegislature] = useState<string>(CURRENT);
  const [query, setQuery] = useState("");
  const newest = legislatures[0];
  const visible = useMemo(() => {
    const needle = foldKey(query);
    return entries.filter((entry) => {
      if (needle && !foldKey(`${entry.shortName} ${entry.name}`).includes(needle)) return false;
      if (legislature === ALL) return true;
      if (legislature === CURRENT) return entry.deputies + entry.senators > 0 || (newest ? entry.legislatures.includes(newest) : false);
      return entry.legislatures.includes(legislature);
    });
  }, [entries, legislature, query, newest]);
  const bySeats = (a: PartyDirectoryEntry, b: PartyDirectoryEntry) => b.deputies + b.senators - (a.deputies + a.senators) || b.legislatures.length - a.legislatures.length || a.shortName.localeCompare(b.shortName, "ro");
  const parties = visible.filter((entry) => entry.kind === "party").sort(bySeats);
  const minorities = visible.filter((entry) => entry.kind === "minority_organisation" || entry.kind === "minority_group").sort((a, b) => (a.kind === "minority_group" ? -1 : b.kind === "minority_group" ? 1 : bySeats(a, b)));
  const others = visible.filter((entry) => entry.kind === "independent" || entry.kind === "unaffiliated");
  const isCurrent = legislature === CURRENT;
  const sitting = minorities.filter((entry) => entry.deputies + entry.senators > 0).length;
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 focus-within:border-brand">
          <Search size={18} aria-hidden="true" className="text-muted" />
          <span className="sr-only">{ro ? "Caută un partid" : "Search a party"}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder={ro ? "Caută un partid sau o organizație…" : "Search a party or organisation…"} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
          {ro ? "Legislatura" : "Legislature"}
          <select value={legislature} onChange={(event) => setLegislature(event.target.value)} className="rounded-control border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink">
            <option value={CURRENT}>{ro ? `Acum${newest ? ` (${newest.replace("-", "–")})` : ""}` : `Now${newest ? ` (${newest.replace("-", "–")})` : ""}`}</option>
            {legislatures.slice(1).map((label) => <option key={label} value={label}>{label.replace("-", "–")}</option>)}
            <option value={ALL}>{ro ? "Toate legislaturile" : "All legislatures"}</option>
          </select>
        </label>
      </div>

      <section className="mt-8" aria-labelledby="parties-title">
        <h2 id="parties-title" className="font-display text-2xl font-bold text-ink">{ro ? "Partide" : "Parties"} <span className="ml-1 text-base font-medium text-muted">{parties.length}</span></h2>
        {parties.length ? <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{parties.map((entry) => <Card key={entry.slug} entry={entry} locale={locale} current={isCurrent} />)}</ul> : <p className="mt-3 text-sm text-muted">{ro ? "Niciun partid nu corespunde." : "No party matches."}</p>}
      </section>

      <section className="mt-10">
        <details className="group rounded-card border border-line bg-surface p-5" open={isCurrent && sitting > 0 && Boolean(query)}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block font-display text-2xl font-bold text-ink">{ro ? "Organizații ale minorităților naționale" : "National-minority organisations"} <span className="ml-1 text-base font-medium text-muted">{minorities.length}</span></span>
              <span className="mt-1 block text-sm text-muted">{ro ? "Locurile rezervate minorităților în Camera Deputaților. O organizație poate apărea sub mai multe nume de-a lungul anilor." : "Seats reserved for minorities in the Chamber of Deputies. An organisation can appear under several names over the years."}{isCurrent && sitting > 0 ? ` ${ro ? `${sitting} au acum un reprezentant.` : `${sitting} have a sitting member now.`}` : ""}</span>
            </span>
            <ChevronDown aria-hidden="true" className="shrink-0 text-muted transition group-open:rotate-180" />
          </summary>
          {minorities.length ? <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{minorities.map((entry) => <Card key={entry.slug} entry={entry} locale={locale} current={isCurrent} />)}</ul> : <p className="mt-4 text-sm text-muted">{ro ? "Nicio organizație nu corespunde." : "No organisation matches."}</p>}
        </details>
      </section>

      {others.length ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-bold text-ink">{ro ? "Independenți și neafiliați" : "Independents and unaffiliated"}</h2>
          <p className="mt-1 text-sm text-muted">{ro ? "Parlamentari care nu aparțin unui partid sau au renunțat la formațiunea pentru care au candidat." : "Members with no party, or who left the party they ran for."}</p>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map((entry) => <Card key={entry.slug} entry={entry} locale={locale} current={isCurrent} />)}</ul>
        </section>
      ) : null}
    </div>
  );
}
