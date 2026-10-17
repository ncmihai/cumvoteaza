import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getAmbassadorTimelines } from "@/lib/ambassador-data";
import { getMissionsByPlace } from "@/lib/mission-data";
import { LAPSE_YEARS } from "@/lib/ambassadors";
import { placeByKey, placeName } from "@/lib/places";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { Flag } from "../../../../_components/Flag";
import { PageIntro } from "../../../../_components/ui/PageIntro";
import { HolderTimeline } from "../../../../_components/HolderTimeline";
import { MissionsPanel } from "../../../../_components/MissionsPanel";

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
  const [data, missions] = await Promise.all([getAmbassadorTimelines(), getMissionsByPlace()]);
  const timeline = data?.timelines.find((item) => item.place.key === key);
  if (!timeline) notFound();
  const { place } = timeline;
  const name = placeName(place, locale);
  const base = `/${locale}/ministries/externe/ambassadors`;
  const title = place.kind === "organisation" || place.kind === "holy-see" ? name : (ro ? `Ambasadorii României în ${name}` : `Romania's ambassadors in ${name}`);

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

      {missions[key] ? <MissionsPanel locale={locale} data={missions[key]!} {...(timeline.current ? { decreeCurrentName: timeline.current.name } : {})} /> : null}

      <section className="mt-5 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-bold text-ink">{ro ? "Cronologia titularilor" : "Timeline of holders"}</h2>
        <div className="mt-4"><HolderTimeline holders={timeline.holders} current={timeline.current} locale={locale} placeHref={(other) => `${base}/${other}`} endedBy={{ ro: "Rechemat(ă) prin ", en: "Recalled by " }} /></div>
        <p className="mt-4 text-xs leading-5 text-muted">{ro ? "Data este cea a decretului, nu ziua sosirii la post. Decretele sunt cele din catalogul nostru (portalul legislativ), de la 1990." : "The date is that of the decree, not the day of arrival at the post. The decrees are those of our catalog (the legislative portal), from 1990."}</p>
      </section>
    </main>
  );
}
