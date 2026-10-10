import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { OFFICES, OFFICE_GROUPS, OFFICE_GROUP_LABELS, OFFICE_KEYS, ROUTE_LABELS, formatDate } from "@cumsevoteaza/parliament-model";
import { getOfficeSummaries, getParliamentAppointments } from "@/lib/president-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { PageIntro } from "../../_components/ui/PageIntro";
import { Panel } from "../../_components/ui/Panel";
import { PresidencyTabs } from "../../_components/PresidencyTabs";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Numirile Președintelui, pe funcții", en: "The President's appointments, by office" });
}

export default async function AppointmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const summaries = new Map((await getOfficeSummaries()).map((item) => [item.office, item]));
  const parliament = await getParliamentAppointments();
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={ro ? "Președinția României" : "The Presidency of Romania"} title={ro ? "Numirile, pe funcții" : "Appointments, by office"}>
        {ro
          ? "Fiecare funcție la care Președintele are un rol, cu drumul ei: cine propune, cine hotărăște, cine semnează. Numele sunt cele din decrete; o funcție pe care o ocupă Parlamentul la propunerea Președintelui nu se numește prin decret și apare cu drumul ei, fără nume."
          : "Every office in which the President has a part, with its route: who proposes, who decides, who signs. The names are those in the decrees; an office Parliament fills on the President's proposal is not appointed by decree and appears with its route, without names."}
      </PageIntro>
      <div className="mt-5"><PresidencyTabs locale={locale} current="appointments" /></div>
      {OFFICE_GROUPS.map((group) => {
        const keys = OFFICE_KEYS.filter((key) => OFFICES[key].group === group && key !== "other");
        if (keys.length === 0) return null;
        return (
          <Panel key={group} id={`group-${group}`} title={OFFICE_GROUP_LABELS[group][locale]} className="mt-5">
            <ul className="divide-y divide-line">
              {keys.map((key) => {
                const office = OFFICES[key];
                const summary = summaries.get(key);
                return (
                  <li key={key} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="font-display text-base font-bold text-ink">{office.byDecree ? <Link href={`/${locale}/presidency/appointments/${key}`} className="hover:text-brand">{office.label[locale]}</Link> : <Link href={`/${locale}/presidency/appointments/${key}`} className="hover:text-brand">{office.label[locale]}</Link>}</h3>
                      <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{ROUTE_LABELS[office.route][locale]}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted">{office.summary[locale]}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {office.byDecree
                        ? (summary ? <span>{number(summary.appointments)} {ro ? "numiri" : "appointments"} · {number(summary.releases)} {ro ? "eliberări" : "removals"} · {number(summary.people)} {ro ? "persoane" : "people"}{summary.first && summary.last ? ` · ${formatDate(summary.first, locale)} – ${formatDate(summary.last, locale)}` : ""}</span> : <span>{ro ? "Nicio persoană citită încă din decrete." : "No one read from the decrees yet."}</span>)
                        : (() => {
                          const own = parliament.filter((row) => row.office === key && row.action === "appointment");
                          return own.length ? <span>{number(own.length)} {ro ? "numiri prin hotărâre a Parlamentului" : "appointments by decision of Parliament"} · {own[own.length - 1]!.year} – {own[0]!.year}</span> : <span>{ro ? "Titularii nu sunt în decrete; hotărârile Parlamentului nu sunt încă citite." : "The office-holders are not in decrees; Parliament's decisions are not read yet."}</span>;
                        })()}
                      {office.basis.map((basis) => <a key={basis.url} href={basis.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-brand">{basis.label}<ExternalLink size={11} aria-hidden="true" /></a>)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
      <p className="mt-4 max-w-3xl text-xs leading-5 text-muted">{ro ? "Drumurile sunt scrise după textul Constituției (republicată în 2003) și al legilor indicate, citite pe portalul legislativ; o funcție apare aici doar după ce drumul ei a fost citit acolo. Numirile din decrete încep în 2014 (catalogul nostru)." : "The routes are written from the text of the Constitution (republished in 2003) and of the laws indicated, read on the legislative portal; an office appears here only once its route has been read there. The appointments in decrees begin in 2014 (our catalog)."}</p>
    </main>
  );
}
