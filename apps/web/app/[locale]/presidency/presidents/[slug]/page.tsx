import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DECREE_KIND_LABELS, OFFICES, formatDate, type DecreeKind } from "@cumsevoteaza/parliament-model";
import { getPresidentPage, type Holding } from "@/lib/president-data";
import { ACTION_LABELS, SERVICE_LABELS, personName, periodsText } from "@/lib/president-format";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { PageIntro } from "../../../_components/ui/PageIntro";
import { Panel } from "../../../_components/ui/Panel";
import { PresidencyTabs } from "../../../_components/PresidencyTabs";
import { PersonAvatar } from "../../../_components/ui/PersonAvatar";
import { figureFor } from "@/lib/figures";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPresidentPage(slug);
  return titled(params, { ro: page ? personName(page.name) : "Președinte", en: page ? personName(page.name) : "President" });
}

const APPOINTING = new Set(["appointment", "reappointment", "interim", "designation"]);
const REMOVING = new Set(["release", "resignation", "dismissal", "recall"]);

export default async function PresidentPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const page = await getPresidentPage(slug);
  if (!page) notFound();
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const percent = (value: number) => `${(value * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const maxYear = Math.max(1, ...page.byYear.map((item) => item.count));
  // Appointments by office: how many people were named and how many removed.
  const byOffice = new Map<string, { named: number; removed: number }>();
  for (const item of page.appointments) {
    const entry = byOffice.get(item.office) ?? { named: 0, removed: 0 };
    if (APPOINTING.has(item.action)) entry.named += item.count;
    else if (REMOVING.has(item.action)) entry.removed += item.count;
    byOffice.set(item.office, entry);
  }
  const officeRows = [...byOffice].filter(([, value]) => value.named + value.removed > 0).sort((a, b) => b[1].named + b[1].removed - (a[1].named + a[1].removed));
  const holdingRow = (holding: Holding) => (
    <li key={`${holding.decreeId}-${holding.name}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
      <span className="flex items-center gap-3">
        <PersonAvatar name={holding.name} photoUrl={figureFor(holding.name)?.file ?? (holding.photoAssetId ? `/api/assets/${holding.photoAssetId}` : undefined)} size={32} />
        <span>
        <span className="font-semibold text-ink">{holding.memberSlug ? <Link href={`/${locale}/members/${holding.memberSlug}`} className="hover:text-brand">{holding.name}</Link> : holding.name}</span>
        <span className="text-muted"> · {ro ? ACTION_LABELS[holding.action]?.ro : ACTION_LABELS[holding.action]?.en}{holding.title ? ` · ${holding.title}` : ""}</span>
        </span>
      </span>
      <a href={holding.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">{ro ? "Decretul" : "Decree"} {holding.decreeNumber}/{holding.decreeYear} · {formatDate(holding.issuedOn, locale)}<ExternalLink size={12} aria-hidden="true" /></a>
    </li>
  );
  const figure = figureFor(personName(page.name));
  const grouped = new Map<string, Holding[]>();
  for (const holding of page.keyHoldings) grouped.set(holding.office, [...(grouped.get(holding.office) ?? []), holding]);
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={page.interim ? (ro ? "Președinte interimar" : "Acting President") : (ro ? "Președintele României" : "President of Romania")} title={personName(page.name)}>
        {ro
          ? `${page.periods.length > 1 ? `În perioadele ${periodsText(page.periods, page, (iso) => formatDate(iso, locale))}` : `De la primul decret din catalogul nostru (${formatDate(page.first, locale)}) până la ultimul (${formatDate(page.last, locale)})`}: ${number(page.decrees)} decrete semnate${page.inferred ? `, la ${number(page.inferred)} dintre ele semnatarul este dedus din decretele vecine` : ""}.`
          : `${page.periods.length > 1 ? `In the periods ${periodsText(page.periods, page, (iso) => formatDate(iso, locale))}` : `From the first decree in our catalog (${formatDate(page.first, locale)}) to the last (${formatDate(page.last, locale)})`}: ${number(page.decrees)} decrees signed${page.inferred ? `, ${number(page.inferred)} of them with the signer inferred from the neighbouring decrees` : ""}.`}
      </PageIntro>
      <div className="mt-5"><PresidencyTabs locale={locale} current="presidents" /></div>

      {figure ? (
        <figure className="mb-5 flex items-end gap-4">
          <PersonAvatar name={personName(page.name)} photoUrl={figure.file} size={120} shape="portrait" />
          <figcaption className="max-w-md text-xs leading-5 text-muted">
            {ro ? "Fotografie: " : "Photograph: "}{figure.author}{figure.cropped ? (ro ? " (decupată)" : " (cropped)") : ""} · {figure.licenceUrl ? <a href={figure.licenceUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand">{figure.licence}</a> : figure.licence} · <a href={figure.source} target="_blank" rel="noreferrer" className="font-semibold text-brand">Wikimedia Commons</a>
          </figcaption>
        </figure>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel id="elected" title={ro ? "Cum a ajuns la Cotroceni" : "How they got the office"}>
          {page.elections.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {page.elections.map((election) => (
                <li key={election.id}>
                  <p className="font-semibold text-ink">{election.label[locale]}</p>
                  <p className="text-ink-soft">{number(election.votes)} {ro ? "voturi" : "votes"} ({percent(election.share)} {ro ? "din voturile valabile" : "of the valid votes"})</p>
                  <Link href={`/${locale}/elections/map?election=${election.id}&metric=winner`} className="font-bold text-brand hover:text-brand-strong">{ro ? "Rezultatul pe hartă →" : "The result on the map →"}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-6 text-muted">{page.interim ? (ro ? "Președinte interimar: nu a fost ales la această funcție." : "An acting President: not elected to this office.") : (ro ? "Nu avem încă alegerea care l-a adus în funcție (rezultatele prezidențiale din datele noastre sunt 2009, 2014 și 2024–2025)." : "We do not hold the election that brought them to office yet (the presidential results in our data are 2009, 2014 and 2024–2025).")}</p>
          )}
        </Panel>

        <Panel id="by-year" title={ro ? "Decrete pe ani" : "Decrees by year"}>
          <ul className="space-y-1.5 text-sm">
            {page.byYear.map((item) => (
              <li key={item.year} className="flex items-center gap-3">
                <span className="w-10 tabular-nums text-ink-soft">{item.year}</span>
                <span aria-hidden="true" className="h-3 rounded-sm bg-brand" style={{ width: `${Math.max(2, (item.count / maxYear) * 100)}%`, maxWidth: "70%" }} />
                <span className="tabular-nums text-muted">{number(item.count)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel id="kinds" title={ro ? "Ce a semnat" : "What they signed"} className="mt-5">
        <table className="w-full text-sm">
          <caption className="sr-only">{ro ? "Decretele semnate, pe tipuri" : "The decrees signed, by type"}</caption>
          <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="py-2 pr-2 font-semibold">{ro ? "Tipul" : "Type"}</th><th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Decrete" : "Decrees"}</th></tr></thead>
          <tbody>
            {page.byKind.map((item) => (
              <tr key={item.kind} className="border-t border-line">
                <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink"><Link href={`/${locale}/presidency?kind=${item.kind}&signer=${page.slug}`} className="hover:text-brand">{DECREE_KIND_LABELS[item.kind as DecreeKind]?.[locale] ?? item.kind}</Link></th>
                <td className="px-2 py-2 text-right tabular-nums">{number(item.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel id="appointments" title={ro ? "Pe cine a numit" : "Whom they appointed"} className="mt-5" aside={<Link href={`/${locale}/presidency/appointments`} className="font-bold text-brand">{ro ? "Toate funcțiile →" : "All offices →"}</Link>}>
        {officeRows.length === 0 ? (
          <p className="text-sm text-muted">{ro ? "Nu avem numiri citite din decretele acestui președinte (textul unui decret este necesar pentru nume)." : "No appointments are read from this President's decrees (a decree's text is needed for the names)."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">{ro ? "Numirile și eliberările din funcții, pe funcție" : "Appointments and releases, by office"}</caption>
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th scope="col" className="py-2 pr-2 font-semibold">{ro ? "Funcția" : "Office"}</th><th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Numiri" : "Named"}</th><th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Eliberări" : "Removed"}</th></tr></thead>
              <tbody>
                {officeRows.map(([office, value]) => (
                  <tr key={office} className="border-t border-line">
                    <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink"><Link href={`/${locale}/presidency/appointments/${office}?president=${page.slug}`} className="hover:text-brand">{OFFICES[office as keyof typeof OFFICES]?.label[locale] ?? office}</Link></th>
                    <td className="px-2 py-2 text-right tabular-nums">{number(value.named)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{number(value.removed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {[...grouped].map(([office, items]) => (
          <div key={office} className="mt-5">
            <h3 className="font-display text-base font-bold text-ink">{OFFICES[office as keyof typeof OFFICES]?.label[locale] ?? office}</h3>
            <ul className="mt-1 divide-y divide-line">{items.slice(0, 12).map(holdingRow)}</ul>
          </div>
        ))}
        <p className="mt-4 text-xs leading-5 text-muted">{ro ? "Numele sunt citite numai din decretele despre funcții publice (miniștri, ambasadori, Curtea Constituțională, conducerea justiției, consilieri); nu din cele despre decorații, grațieri, judecători și procurori obișnuiți sau grade militare." : "Names are read only from decrees about public offices (ministers, ambassadors, the Constitutional Court, the heads of the judiciary, advisers); not from those about decorations, pardons, ordinary judges and prosecutors, or military ranks."}</p>
      </Panel>

      {page.serviceRanks.length > 0 ? (
        <Panel id="services" title={ro ? "Grade militare, pe instituții" : "Military ranks, by body"} className="mt-5">
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {page.serviceRanks.map((item) => <li key={item.service} className="flex justify-between gap-3 border-b border-line py-1.5"><span className="text-ink-soft">{SERVICE_LABELS[item.service]?.[locale] ?? item.service}</span><span className="tabular-nums font-semibold text-ink">{number(item.count)}</span></li>)}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">{ro ? "Numărul decretelor despre grade (acordări, înaintări, treceri în rezervă) pentru cadrele fiecărei instituții, după titlul decretului. Numele nu sunt citite. Directorii SRI și SIE nu se numesc prin decret: îi numește Parlamentul, la propunerea Președintelui." : "The number of decrees about ranks (grants, promotions, transfers to the reserve) for each body's officers, by the decree's title. Names are not read. The directors of the SRI and the SIE are not appointed by decree: Parliament appoints them, on the President's proposal."}</p>
        </Panel>
      ) : null}
    </main>
  );
}
