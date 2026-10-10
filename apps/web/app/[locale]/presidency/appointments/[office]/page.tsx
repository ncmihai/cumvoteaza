import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { OFFICES, OFFICE_GROUP_LABELS, ROUTE_LABELS, formatDate } from "@cumsevoteaza/parliament-model";
import { getOfficeHoldings, getParliamentAppointments, getPresidents } from "@/lib/president-data";
import { ACTION_LABELS, personName } from "@/lib/president-format";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { PageIntro } from "../../../_components/ui/PageIntro";
import { Panel } from "../../../_components/ui/Panel";
import { PresidencyTabs } from "../../../_components/PresidencyTabs";
import { PersonAvatar } from "../../../_components/ui/PersonAvatar";
import { figureFor } from "@/lib/figures";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; office: string }> }): Promise<Metadata> {
  const { office } = await params;
  const info = (OFFICES as Record<string, (typeof OFFICES)[keyof typeof OFFICES]>)[office];
  return titled(params, { ro: info?.label.ro ?? "Funcție", en: info?.label.en ?? "Office" });
}

export default async function OfficePage({ params, searchParams }: { params: Promise<{ locale: string; office: string }>; searchParams: Promise<{ president?: string }> }) {
  const { locale: rawLocale, office } = await params;
  const query = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const info = (OFFICES as Record<string, (typeof OFFICES)[keyof typeof OFFICES]>)[office];
  if (!info || office === "other") notFound();
  const [holdings, presidents, parliament] = await Promise.all([getOfficeHoldings(office), getPresidents(), getParliamentAppointments(office)]);
  const chosen = presidents.find((item) => item.slug === query.president);
  const shown = chosen ? holdings.filter((holding) => holding.signer === chosen.name) : holdings;
  const signers = presidents.filter((item) => holdings.some((holding) => holding.signer === item.name));
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={OFFICE_GROUP_LABELS[info.group][locale]} title={info.label[locale]}>{info.summary[locale]}</PageIntro>
      <div className="mt-5"><PresidencyTabs locale={locale} current="appointments" /></div>
      <Panel id="route" title={ro ? "Drumul funcției" : "The route of the office"}>
        <p className="text-sm font-semibold text-ink">{ROUTE_LABELS[info.route][locale]}</p>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {info.basis.map((basis) => <li key={basis.url}><a href={basis.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-brand">{basis.label}<ExternalLink size={11} aria-hidden="true" /></a></li>)}
        </ul>
      </Panel>
      {!info.byDecree ? (
        <Panel id="holders" title={ro ? "Titularii" : "Office-holders"} className="mt-5">
          <p className="text-sm leading-6 text-muted">{ro ? "Directorul nu se numește prin decret, deci nu apare în catalogul de decrete. Titularii se numesc prin hotărâre a Parlamentului, în ședință comună, la propunerea Președintelui; hotărârile sunt mai jos." : "The director is not appointed by decree, so does not appear in the decree catalog. The office-holders are appointed by a decision of Parliament in joint sitting, on the President's proposal; the decisions are below."}</p>
        </Panel>
      ) : (
        <Panel id="holders" title={ro ? "Decretele care numesc sau eliberează" : "Decrees that appoint or release"} className="mt-5" aside={chosen ? <Link href={`/${locale}/presidency/appointments/${office}`} className="font-bold text-brand">{ro ? "Toți președinții" : "All Presidents"}</Link> : undefined}>
          {signers.length > 1 ? (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label={ro ? "Președintele care a semnat" : "The President who signed"}>
              <li><Link href={`/${locale}/presidency/appointments/${office}`} className={chip(!chosen)}>{ro ? "Toți" : "All"}</Link></li>
              {signers.map((signer) => <li key={signer.slug}><Link href={`/${locale}/presidency/appointments/${office}?president=${signer.slug}`} className={chip(chosen?.slug === signer.slug)}>{personName(signer.name)}</Link></li>)}
            </ul>
          ) : null}
          {shown.length === 0 ? (
            <p className="text-sm text-muted">{ro ? "Nicio persoană citită din decrete pentru această funcție." : "No one read from the decrees for this office."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">{ro ? "Persoane numite sau eliberate, cu decretul și președintele" : "People appointed or released, with the decree and the President"}</caption>
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr><th scope="col" className="py-2 pr-2 font-semibold">{ro ? "Persoana" : "Person"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Ce s-a întâmplat" : "What happened"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Funcția, cum o scrie decretul" : "The office, as the decree words it"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Decretul" : "Decree"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Președintele" : "President"}</th></tr>
                </thead>
                <tbody>
                  {shown.map((holding) => (
                    <tr key={`${holding.decreeId}-${holding.name}`} className="border-t border-line align-top">
                      <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink"><span className="flex items-center gap-2.5"><PersonAvatar name={holding.name} photoUrl={figureFor(holding.name)?.file ?? (holding.photoAssetId ? `/api/assets/${holding.photoAssetId}` : undefined)} size={32} />{holding.memberSlug ? <Link href={`/${locale}/members/${holding.memberSlug}`} className="hover:text-brand">{holding.name}</Link> : holding.name}</span></th>
                      <td className="px-2 py-2 text-ink-soft">{ACTION_LABELS[holding.action]?.[locale] ?? holding.action}</td>
                      <td className="px-2 py-2 text-muted">{holding.title ?? "–"}</td>
                      <td className="px-2 py-2"><a href={holding.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-brand">{holding.decreeNumber}/{holding.decreeYear}<ExternalLink size={11} aria-hidden="true" /></a><span className="block text-xs text-muted">{formatDate(holding.issuedOn, locale)}</span></td>
                      <td className="px-2 py-2 text-ink-soft">{holding.signer ? <Link href={`/${locale}/presidency/presidents/${presidents.find((item) => item.name === holding.signer)?.slug ?? ""}`} className="hover:text-brand">{personName(holding.signer)}</Link> : "–"}{holding.signedAsInterim ? <span className="ml-1 text-xs text-muted">({ro ? "interimar" : "acting"})</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-muted">{ro ? "Un rând este o persoană numită într-un decret; un decret care o eliberează, o revocă sau o recheamă are rândul lui. Persoana apare după numele din decret, legată de pagina ei doar când numele este exact cel al unui parlamentar al nostru." : "A row is a person named in a decree; a decree that releases, dismisses or recalls them has its own row. The person appears by the name in the decree, linked to a page only when the name is exactly one of our members of Parliament."}</p>
        </Panel>
      )}
      {parliament.length > 0 ? (
        <Panel id="parliament" title={office === "ccr-judge" ? (ro ? "Judecătorii numiți de Camera Deputaților și de Senat" : "The judges appointed by the Chamber of Deputies and the Senate") : (ro ? "Hotărârile Parlamentului" : "Parliament's decisions")} className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">{ro ? "Hotărârile Parlamentului, ale Camerei sau ale Senatului" : "The decisions of Parliament, the Chamber or the Senate"}</caption>
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="py-2 pr-2 font-semibold">{ro ? "Persoana" : "Person"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Ce s-a hotărât" : "What was decided"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Cine a hotărât" : "Who decided"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Hotărârea" : "Decision"}</th></tr></thead>
              <tbody>
                {parliament.map((row) => (
                  <tr key={`${row.number}-${row.year}-${row.body}-${row.name}`} className="border-t border-line align-top">
                    <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink">{row.name ? (row.memberSlug ? <Link href={`/${locale}/members/${row.memberSlug}`} className="hover:text-brand">{row.name}</Link> : row.name) : "–"}</th>
                    <td className="px-2 py-2 text-ink-soft">{row.action === "appointment" ? (ro ? "Numit(ă)" : "Appointed") : row.action === "resignation" ? (ro ? "Demisie; funcția declarată vacantă" : "Resignation; the office declared vacant") : row.action === "vacancy" ? (ro ? "Funcția declarată vacantă" : "The office declared vacant") : (ACTION_LABELS[row.action]?.[locale] ?? row.action)}</td>
                    <td className="px-2 py-2 text-ink-soft">{row.body === "parliament" ? (ro ? "Camera și Senatul, în ședință comună" : "The Chamber and the Senate, in joint sitting") : row.body === "chamber" ? (ro ? "Camera Deputaților" : "The Chamber of Deputies") : (ro ? "Senatul" : "The Senate")}</td>
                    <td className="px-2 py-2"><a href={row.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-brand">{row.number}/{row.year}<ExternalLink size={11} aria-hidden="true" /></a><span className="block text-xs text-muted">{formatDate(row.adoptedOn, locale)}{row.gazetteNumber ? ` · MO ${row.gazetteNumber}` : ""}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">{ro ? "Numele sunt cele din hotărâre, adesea cu numele de familie primul. Hotărârile sunt găsite pe portalul legislativ după titlul lor; una de la începutul anilor 1990 nu are text pe portal și lipsește." : "The names are those in the decision, often with the surname first. The decisions are found on the legislative portal by their title; one from the early 1990s has no text on the portal and is missing."}</p>
        </Panel>
      ) : null}
    </main>
  );
}
