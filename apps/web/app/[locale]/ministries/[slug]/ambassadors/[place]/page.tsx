import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getAmbassadorTimelines } from "@/lib/ambassador-data";
import { LAPSE_YEARS, type DecreeRef, type HolderPeriod } from "@/lib/ambassadors";
import { placeByKey, placeName } from "@/lib/places";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { Flag } from "../../../../_components/Flag";
import { PageIntro } from "../../../../_components/ui/PageIntro";
import { StatusPill } from "../../../../_components/ui/StatusPill";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string; place: string }> }): Promise<Metadata> {
  const { locale, place: key } = await params;
  const place = placeByKey(key);
  const name = place ? placeName(place, locale === "en" ? "en" : "ro") : key;
  return titled(params, { ro: `Ambasadorii României: ${name}`, en: `Romania's ambassadors: ${name}` }, { ro: `Cine este numit ambasador al României: ${name}, și cine a fost înainte, cu decretele fiecărei numiri și rechemări.`, en: `Who is named Romania's ambassador: ${name}, and who was before, with the decree of each appointment and recall.` }, { path: `/ministries/externe/ambassadors/${key}` });
}

export default async function AmbassadorPlacePage({ params }: { params: Promise<{ locale: string; slug: string; place: string }> }) {
  const { locale: rawLocale, slug, place: key } = await params;
  if (slug !== "externe") notFound();
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const data = await getAmbassadorTimelines();
  const timeline = data?.timelines.find((item) => item.place.key === key);
  if (!timeline) notFound();
  const { place } = timeline;
  const name = placeName(place, locale);
  const base = `/${locale}/ministries/externe/ambassadors`;
  const decree = (item: DecreeRef) => <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-brand">{ro ? "decretul" : "decree"} {item.number}/{item.year}<ExternalLink size={11} aria-hidden="true" /></a>;
  const alsoIn = (holder: HolderPeriod) => holder.alsoIn.flatMap((other) => { const target = placeByKey(other); return target ? [target] : []; });
  const title = place.kind === "organisation" || place.kind === "holy-see" ? name : (ro ? `Ambasadorii României în ${name}` : `Romania's ambassadors in ${name}`);

  const when = (holder: HolderPeriod) => `${holder.startedOn ? formatDate(holder.startedOn, locale) : (ro ? "dată necunoscută" : "date unknown")} – ${holder.ended === "open" ? (ro ? "prezent" : "present") : holder.endedOn ? formatDate(holder.endedOn, locale) : "?"}`;
  const end = (holder: HolderPeriod) => {
    if (holder.ended === "recalled" && holder.endDecree) return <>{ro ? "Rechemat(ă) prin " : "Recalled by "}{decree(holder.endDecree)}</>;
    if (holder.ended === "replaced" && holder.endDecree) return <>{ro ? "Înlocuit(ă) la numirea următorului, prin " : "Replaced when the next was named, by "}{decree(holder.endDecree)}{ro ? "; nu există un decret de rechemare în catalog." : "; there is no recall decree in the catalog."}</>;
    return <>{ro ? "Niciun decret de rechemare sau de înlocuire după numire." : "No recall or replacement decree after the appointment."}</>;
  };

  const holderBlock = (holder: HolderPeriod, current: boolean) => (
    <li key={`${holder.name}-${holder.startedOn ?? holder.endedOn}`} className="relative pb-6 pl-6 last:pb-0">
      <span aria-hidden="true" className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${current ? "border-brand bg-brand" : "border-line-strong bg-surface"}`} />
      <div className="flex flex-wrap items-center gap-2"><strong className="font-display text-lg text-ink">{holder.name}</strong>{current ? <StatusPill tone="current">{ro ? "numit(ă) acum" : "named now"}</StatusPill> : null}</div>
      <p className="text-sm font-semibold text-ink-soft">{when(holder)}</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {holder.startDecree ? <>{ro ? "Numit(ă) prin " : "Appointed by "}{decree(holder.startDecree)}. </> : <>{ro ? "Numirea nu e în decretele noastre. " : "The appointment is not in our decrees. "}</>}
        {holder.reappointedBy.length ? <>{ro ? "Reînvestit(ă) prin " : "Reappointed by "}{holder.reappointedBy.map((item, index) => <span key={item.id}>{index ? ", " : ""}{decree(item)}</span>)}. </> : null}
        {end(holder)}
      </p>
      {holder.residence ? <p className="mt-1 text-xs text-muted">{ro ? `Decretul spune: cu reședința la ${holder.residence.charAt(0).toUpperCase()}${holder.residence.slice(1)}.` : `The decree says: residing in ${holder.residence.charAt(0).toUpperCase()}${holder.residence.slice(1)}.`}</p> : null}
      {alsoIn(holder).length ? <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{ro ? "Numit(ă) în același decret și în:" : "Named in the same decree to:"}{alsoIn(holder).map((other) => <Link key={other.key} href={`${base}/${other.key}`} className="inline-flex items-center gap-1 font-semibold text-brand"><Flag place={other} width={16} />{placeName(other, locale)}</Link>)}</p> : null}
    </li>
  );

  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <Link href={base} className="inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft size={14} aria-hidden="true" />{ro ? "Toți ambasadorii, pe țări" : "All ambassadors, by country"}</Link>
      <div className="mt-5 flex items-start gap-4">
        <div className="mt-1.5 hidden sm:block"><Flag place={place} width={56} /></div>
        <div className="min-w-0 flex-1"><PageIntro eyebrow={ro ? "Misiunile diplomatice" : "Diplomatic missions"} title={title}>
          {ro ? "Din decretele Președintelui: cine a fost numit și cine a fost rechemat, la fiecare post. Un decret nu spune cine stă azi în ambasadă; „acum” înseamnă ultima persoană numită, fără o rechemare sau un înlocuitor după ea." : "From the President's decrees: who was appointed and who was recalled, at each post. A decree does not say who sits in the embassy today; \"now\" means the last person named, with no recall or successor after."}
        </PageIntro></div>
      </div>

      <section className="mt-6 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-bold text-ink">{ro ? "Acum" : "Now"}</h2>
        {timeline.current ? (
          <p className="mt-2 text-sm leading-6 text-ink-soft"><strong className="text-ink">{timeline.current.name}</strong>{timeline.current.startedOn ? ` ${ro ? "din" : "since"} ${formatDate(timeline.current.startedOn, locale)}` : ""}.{" "}
            {timeline.currentAgeYears !== undefined && timeline.currentAgeYears >= 4 ? (ro ? `Numirea are ${timeline.currentAgeYears} ani și nu există un decret de rechemare în catalog; poate fi doar o lacună a decretelor noastre.` : `The appointment is ${timeline.currentAgeYears} years old and there is no recall decree in the catalog; it may only be a gap in our decrees.`) : ""}</p>
        ) : timeline.lapsed ? (
          <p className="mt-2 text-sm leading-6 text-ink-soft">{ro ? `Nu putem spune cine este numit acum. Ultima persoană numită este ${timeline.lapsed.name}, în ${timeline.lapsed.startedOn?.slice(0, 4)}, iar decretele noastre nu mai spun nimic despre acest post de peste ${LAPSE_YEARS} ani.` : `We cannot say who is named now. The last person named is ${timeline.lapsed.name}, in ${timeline.lapsed.startedOn?.slice(0, 4)}, and our decrees say nothing more about this post for over ${LAPSE_YEARS} years.`}</p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-ink-soft">{ro ? "Decretele noastre nu numesc acum niciun ambasador la acest post: ultimul titular a fost rechemat sau înlocuit și nu e numit altul după el." : "Our decrees name no ambassador at this post now: the last holder was recalled or replaced and no one is named after."}</p>
        )}
      </section>

      <section className="mt-5 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-bold text-ink">{ro ? "Cronologia titularilor" : "Timeline of holders"}</h2>
        <ol className="mt-4 border-l-2 border-line">{timeline.holders.map((holder) => holderBlock(holder, holder === timeline.current))}</ol>
        <p className="mt-4 text-xs leading-5 text-muted">{ro ? "Data este cea a decretului, nu ziua sosirii la post. Decretele sunt cele din catalogul nostru (portalul legislativ), de la 1990." : "The date is that of the decree, not the day of arrival at the post. The decrees are those of our catalog (the legislative portal), from 1990."}</p>
      </section>
    </main>
  );
}
