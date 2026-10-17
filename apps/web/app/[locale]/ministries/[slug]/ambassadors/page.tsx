import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getAmbassadorTimelines } from "@/lib/ambassador-data";
import { LAPSE_YEARS, type PlaceTimeline } from "@/lib/ambassadors";
import { placeName } from "@/lib/places";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled, type SearchParamsInput } from "@/lib/page-metadata";
import { Flag } from "../../../_components/Flag";
import { PageIntro } from "../../../_components/ui/PageIntro";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: SearchParamsInput }): Promise<Metadata> {
  return titled(params, { ro: "Ambasadorii României, pe țări", en: "Romania's ambassadors, by country" }, { ro: "Ambasadorii României în fiecare țară, cine este numit acum și cine a fost înainte, din decretele Președintelui.", en: "Romania's ambassadors in each country, who is named now and who was before, from the President's decrees." }, { path: "/ministries/externe/ambassadors", searchParams });
}

type Query = { show?: string; q?: string };

export default async function AmbassadorsPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Query> }) {
  const { locale: rawLocale, slug } = await params;
  if (slug !== "externe") notFound();
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getAmbassadorTimelines();
  const base = `/${locale}/ministries/externe/ambassadors`;
  const needle = (query.q ?? "").trim().toLowerCase();
  const show = query.show === "current" || query.show === "none" ? query.show : "all";

  const all = (data?.timelines ?? []).map((item) => ({ item, name: placeName(item.place, locale) }));
  const matches = (entry: { item: PlaceTimeline; name: string }) => (!needle || entry.name.toLowerCase().includes(needle) || entry.item.holders.some((holder) => holder.name.toLowerCase().includes(needle)))
    && (show === "all" || (show === "current" ? Boolean(entry.item.current) : !entry.item.current));
  const shown = all.filter(matches).sort((a, b) => a.name.localeCompare(b.name, locale));
  const countries = shown.filter((entry) => entry.item.place.kind !== "organisation");
  const organisations = shown.filter((entry) => entry.item.place.kind === "organisation");
  const withCurrent = all.filter((entry) => entry.item.current).length;
  const chip = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  const href = (changes: Query) => {
    const next = new URLSearchParams();
    const merged = { show: query.show, q: query.q, ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `${base}${next.size ? `?${next}` : ""}`;
  };

  const card = ({ item, name }: { item: PlaceTimeline; name: string }) => {
    const current = item.current;
    const earlier = item.holders.filter((holder) => holder !== current).length;
    const last = item.holders[0];
    return (
      <li key={item.place.key}>
        <Link href={`${base}/${item.place.key}`} className="group flex h-full min-w-0 flex-col rounded-card border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-wash">
          <span className="flex items-center gap-3"><Flag place={item.place} width={32} /><strong className="min-w-0 flex-1 font-display text-lg leading-6 text-ink">{name}</strong><ArrowRight size={16} className="shrink-0 text-brand transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
          {current ? (
            <span className="mt-3 block text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-muted">{ro ? "Numit(ă) acum" : "Named now"}</span><strong className="text-ink">{current.name}</strong>{current.startedOn ? <span className="block text-xs text-muted">{ro ? "din" : "since"} {formatDate(current.startedOn, locale)}</span> : null}</span>
          ) : item.lapsed ? (
            <span className="mt-3 block text-xs leading-5 text-muted">{ro ? `Ultimul numit: ${item.lapsed.name}, în ${item.lapsed.startedOn?.slice(0, 4)}; nu există un decret de rechemare și numirea e mai veche de ${LAPSE_YEARS} ani.` : `Last named: ${item.lapsed.name}, in ${item.lapsed.startedOn?.slice(0, 4)}; there is no recall decree and the appointment is more than ${LAPSE_YEARS} years old.`}</span>
          ) : (
            <span className="mt-3 block text-xs leading-5 text-muted">{ro ? "Niciun ambasador numit acum în decretele noastre." : "No ambassador named now in our decrees."}{last?.endedOn ? ` ${ro ? "Ultimul" : "The last"}: ${last.name}, ${last.ended === "recalled" ? (ro ? "rechemat" : "recalled") : (ro ? "înlocuit" : "replaced")} ${formatDate(last.endedOn, locale)}.` : ""}</span>
          )}
          {earlier > 0 ? <span className="mt-2 text-xs text-muted">{ro ? `${earlier} ${earlier === 1 ? "titular anterior" : "titulari anteriori"}` : `${earlier} earlier ${earlier === 1 ? "holder" : "holders"}`}</span> : null}
        </Link>
      </li>
    );
  };

  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <Link href={`/${locale}/ministries/externe`} className="inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft size={14} aria-hidden="true" />{ro ? "Ministerul Afacerilor Externe" : "Ministry of Foreign Affairs"}</Link>
      <div className="mt-5">
        <PageIntro eyebrow={ro ? "Misiunile diplomatice" : "Diplomatic missions"} title={ro ? "Ambasadorii României, pe țări" : "Romania's ambassadors, by country"}>
          {ro ? "Pentru fiecare țară: cine este numit ambasador acum și cine a fost înainte, cu decretul fiecărei numiri și rechemări. Totul vine din decretele Președintelui din catalogul nostru; un decret numește sau recheamă, dar nu spune cine stă azi în ambasadă, așa că „acum” înseamnă ultima persoană numită, fără o rechemare sau un înlocuitor după ea." : "For each country: who is named ambassador now and who was before, with the decree of each appointment and recall. It all comes from the President's decrees in our catalog; a decree appoints or recalls but does not say who sits in the embassy today, so \"now\" means the last person named, with no recall or successor after."}
        </PageIntro>
      </div>
      {!data ? <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Decretele nu sunt disponibile acum." : "The decrees are not available right now."}</p> : (
        <>
          <p className="mt-4 text-sm text-muted">{ro ? `${all.length} posturi citite din ${data.decrees.toLocaleString("ro-RO")} decrete (din ${data.firstYear}, ultimul din ${data.lastOn ? formatDate(data.lastOn, locale) : "–"}); ${withCurrent} au un ambasador numit acum.` : `${all.length} posts read from ${data.decrees.toLocaleString("en-GB")} decrees (from ${data.firstYear}, the latest of ${data.lastOn ? formatDate(data.lastOn, locale) : "–"}); ${withCurrent} have an ambassador named now.`}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <ul className="flex flex-wrap gap-2" aria-label={ro ? "Ce posturi" : "Which posts"}>
              <li><Link href={href({ show: undefined })} aria-current={show === "all" ? "page" : undefined} className={chip(show === "all")}>{ro ? "Toate" : "All"}</Link></li>
              <li><Link href={href({ show: "current" })} aria-current={show === "current" ? "page" : undefined} className={chip(show === "current")}>{ro ? "Cu ambasador numit acum" : "With an ambassador named now"}</Link></li>
              <li><Link href={href({ show: "none" })} aria-current={show === "none" ? "page" : undefined} className={chip(show === "none")}>{ro ? "Fără" : "Without"}</Link></li>
            </ul>
            <form action={base} className="flex items-center gap-2">
              {query.show ? <input type="hidden" name="show" value={query.show} /> : null}
              <label className="sr-only" htmlFor="ambassador-search">{ro ? "Caută o țară sau un ambasador" : "Search a country or an ambassador"}</label>
              <input id="ambassador-search" type="search" name="q" defaultValue={query.q ?? ""} placeholder={ro ? "Țară sau ambasador" : "Country or ambassador"} className="min-h-10 w-56 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink" />
              <button type="submit" className="min-h-10 rounded-control bg-ink px-4 text-sm font-bold text-white">{ro ? "Caută" : "Search"}</button>
            </form>
          </div>
          {countries.length === 0 && organisations.length === 0 ? <p className="mt-6 rounded-card border border-line bg-surface p-5 text-sm text-muted">{ro ? "Niciun post nu se potrivește." : "No post matches."}</p> : null}
          {countries.length > 0 ? <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{countries.map(card)}</ul> : null}
          {organisations.length > 0 ? (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold text-ink">{ro ? "Misiuni pe lângă organizații internaționale" : "Missions to international organisations"}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{organisations.map(card)}</ul>
            </section>
          ) : null}
          {data.unplaced.length > 0 ? (
            <details className="mt-8 rounded-card border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-bold text-brand">{ro ? `Decrete pe care nu le-am putut așeza pe un post (${data.unplaced.length})` : `Decrees we could not place on a post (${data.unplaced.length})`}</summary>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-muted">{ro ? "Textul unui decret e liber și uneori listează mai multe țări, numește două persoane într-o singură frază sau e tăiat în catalogul nostru. Ce regulile noastre nu pot citi sigur nu primește un post din presupunere: e aici, cu decretul." : "A decree's text is free text and sometimes lists several countries, names two people in one sentence or is cut short in our catalog. What our rules cannot read safely is not given a post by guess: it is here, with the decree."}</p>
              <ul className="mt-3 divide-y divide-line text-sm">
                {[...data.unplaced].sort((a, b) => b.row.issuedOn.localeCompare(a.row.issuedOn)).map((entry) => (
                  <li key={`${entry.row.decreeId}-${entry.row.name}-${entry.row.action}`} className="grid gap-1 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-baseline">
                    <span className="text-xs font-semibold text-muted">{formatDate(entry.row.issuedOn, locale)}</span>
                    <span className="min-w-0"><strong className="text-ink">{entry.row.name}</strong> <span className="text-ink-soft">· {entry.row.action === "recall" ? (ro ? "rechemat(ă)" : "recalled") : entry.row.action === "appointment" || entry.row.action === "reappointment" ? (ro ? "numit(ă)" : "appointed") : entry.row.action}</span><span className="block text-xs leading-5 text-muted">{(entry.row.title ?? "").slice(0, 220) || (ro ? "Fără text în catalog." : "No text in the catalog.")}</span></span>
                    <a href={entry.row.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-brand">{entry.row.decreeNumber}/{entry.row.decreeYear}<ExternalLink size={11} aria-hidden="true" /></a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </main>
  );
}
