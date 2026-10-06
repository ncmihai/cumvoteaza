import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { ChamberComposition } from "@/lib/composition-data";
import type { CountyOption } from "@/lib/home-data";
import { CountUp } from "../ui/CountUp";
import { Hemicycle } from "../ui/Hemicycle";
import { PartyMark } from "../ui/PartyMark";

type Locale = "ro" | "en";

/** The first screen: the question the site answers, one search over everything, the way to "the MPs elected in my county", and the Chamber as it sits today. */
export function Hero({ locale, counties, chamber, today }: { locale: Locale; counties: CountyOption[]; chamber?: ChamberComposition; today: string }) {
  const ro = locale === "ro";
  const groups = chamber?.groups ?? [];
  const registered = groups.flatMap((entry) => Array.from({ length: entry.seats }, () => ({ color: entry.group.color, title: entry.group.shortName })));
  // Sitting deputies by their mandates (one per seat); a member with no registered group is drawn as a grey seat and said so, never left out.
  const sitting = counties.reduce((sum, county) => sum + county.deputies, 0);
  const unplaced = sitting > registered.length ? sitting - registered.length : 0;
  const seats = [...registered, ...Array.from({ length: unplaced }, () => ({ color: "#cbd5e1", title: ro ? "Fără grup înregistrat" : "No registered group" }))];
  const total = seats.length;
  const legend = groups.slice(0, 6);
  const rest = groups.slice(6);
  return (
    <section className="bg-gradient-to-b from-brand-soft/70 via-wash/50 to-canvas">
      <div className="mx-auto grid max-w-page grid-cols-1 items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:px-8 lg:py-16">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-medium text-brand-strong ring-1 ring-line">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-highlight ring-1 ring-ink" />
            {formatDate(today, locale)}
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {ro ? <>Cum <span className="text-brand">votează</span> Parlamentul?</> : <>How does Parliament <span className="text-brand">vote</span>?</>}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-7 text-ink-soft">
            {ro ? "Voturile, proiectele de lege și parlamentarii României, din surse oficiale. Fiecare cifră are legătura către sursă." : "Romania's votes, bills and members of parliament, from official sources. Every figure links to its source."}
          </p>
          <form action={`/${locale}/votes`} method="get" role="search" className="mt-7 flex max-w-xl gap-2 rounded-full border-2 border-line bg-surface p-1.5 shadow-lift focus-within:border-brand">
            <label htmlFor="home-search" className="sr-only">{ro ? "Caută voturi, proiecte de lege" : "Search votes and bills"}</label>
            <span className="grid place-items-center pl-3 text-muted"><Search size={20} aria-hidden="true" /></span>
            <input id="home-search" name="q" type="search" placeholder={ro ? "Caută un vot, o lege, un subiect…" : "Search a vote, a law, a topic…"} className="min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-muted" />
            <button type="submit" className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong">{ro ? "Caută" : "Search"}</button>
          </form>
          {counties.length > 0 ? (
            <form action={`/${locale}/members`} method="get" className="mt-4 flex max-w-xl flex-wrap items-center gap-x-2 gap-y-2">
              <label htmlFor="home-county" className="flex w-full items-center gap-2 text-sm font-medium text-ink-soft"><MapPin size={16} aria-hidden="true" className="text-brand" />{ro ? "Parlamentarii din județul tău" : "The members elected in your county"}</label>
              <select id="home-county" name="county" required defaultValue="" className="min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink">
                <option value="" disabled>{ro ? "Alege județul…" : "Choose a county…"}</option>
                {counties.map((county) => <option key={county.key} value={county.key}>{county.label} ({county.deputies} {ro ? "dep." : "dep."}, {county.senators} {ro ? "sen." : "sen."})</option>)}
              </select>
              <button type="submit" className="rounded-control border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">{ro ? "Arată" : "Show"}</button>
            </form>
          ) : null}
        </div>
        {total > 0 ? (
          <div className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-lift">
            <p className="flex items-center justify-between text-sm font-semibold text-ink-soft">
              <span>{ro ? "Camera Deputaților, acum" : "Chamber of Deputies, now"}</span>
              <Link href={`/${locale}/compozitii`} className="inline-flex items-center gap-1 text-brand hover:text-brand-strong">{ro ? "Compoziția" : "Composition"}<ArrowRight size={14} aria-hidden="true" /></Link>
            </p>
            <div className="relative mt-2">
              <Hemicycle seats={seats} summary={`${ro ? "Camera Deputaților" : "Chamber of Deputies"}: ${groups.map((entry) => `${entry.group.shortName} ${entry.seats}`).join(", ")}`} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
                <CountUp value={total} className="font-display text-3xl font-bold text-ink sm:text-5xl" />
                <span className="hidden text-sm text-muted sm:block">{ro ? "mandate ocupate" : "seats filled"}</span>
              </div>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {legend.map((entry) => (
                <li key={entry.group.id} className="flex items-center gap-2 text-sm">
                  <PartyMark party={{ shortName: entry.party?.shortName ?? entry.group.shortName, color: entry.group.color, logoAssetId: entry.party?.logoAssetId }} size={24} />
                  <span className="font-semibold text-ink">{entry.group.shortName}</span>
                  <span className="ml-auto tabular-nums text-muted">{entry.seats}</span>
                </li>
              ))}
            </ul>
            {unplaced > 0 ? <p className="mt-2 text-xs text-muted"><span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full bg-line-strong align-middle" />{ro ? `${unplaced} deputat fără grup înregistrat în datele noastre (listele oficiale îl trec la neafiliați; în verificare).` : `${unplaced} deputy with no registered group in our data (the official lists show an unaffiliated member; being checked).`}</p> : null}
            {rest.length > 0 ? <p className="mt-2 text-xs text-muted">{ro ? `și încă ${rest.length} grupuri, cu ${rest.reduce((sum, entry) => sum + entry.seats, 0)} mandate. Ordinea este după mărime, nu politică.` : `and ${rest.length} more groups with ${rest.reduce((sum, entry) => sum + entry.seats, 0)} seats. The order is by size, not political.`}</p> : <p className="mt-2 text-xs text-muted">{ro ? "Ordinea este după mărimea grupului, nu politică." : "The order is by group size, not political."}</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
