import Link from "next/link";
import type { Metadata } from "next";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getPresidents } from "@/lib/president-data";
import { personName } from "@/lib/president-format";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { titled } from "@/lib/page-metadata";
import { PageIntro } from "../../_components/ui/PageIntro";
import { Panel } from "../../_components/ui/Panel";
import { PresidencyTabs } from "../../_components/PresidencyTabs";
import { PersonAvatar } from "../../_components/ui/PersonAvatar";
import { figureFor } from "@/lib/figures";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Președinții și decretele lor", en: "The Presidents and their decrees" });
}

export default async function PresidentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const presidents = await getPresidents();
  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const percent = (value: number) => `${(value * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <PageIntro eyebrow={ro ? "Președinția României" : "The Presidency of Romania"} title={ro ? "Președinții și decretele lor" : "The Presidents and their decrees"}>
        {ro
          ? "Cine a semnat decretele din catalogul nostru, de la primul la ultimul decret al fiecăruia, ce a semnat și pe cine a numit în ce funcție. Datele sunt cele ale decretelor, nu ale mandatului; un președinte interimar apare separat."
          : "Who signed the decrees in our catalog, from each one's first to last decree, what they signed and whom they appointed to which office. The dates are those of the decrees, not of the term; an acting President appears separately."}
      </PageIntro>
      <div className="mt-5"><PresidencyTabs locale={locale} current="presidents" /></div>
      {presidents.length === 0 ? (
        <Panel><p className="text-sm text-muted">{ro ? "Catalogul decretelor nu este încă importat." : "The decree catalog is not imported yet."}</p></Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {[...presidents].reverse().map((president) => (
            <li key={president.slug}>
              <Link href={`/${locale}/presidency/presidents/${president.slug}`} className="block h-full rounded-card border border-line bg-surface p-5 hover:border-line-strong hover:shadow-lift">
                <div className="flex gap-4">
                  <PersonAvatar name={personName(president.name)} photoUrl={figureFor(personName(president.name))?.file} size={72} shape="portrait" />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-xl font-bold text-ink">{personName(president.name)}</span>
                      {president.interim ? <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{ro ? "interimar" : "acting"}</span> : null}
                    </p>
                    <p className="mt-1 text-sm text-muted">{formatDate(president.first, locale)} – {formatDate(president.last, locale)}</p>
                    <p className="mt-3 text-sm text-ink-soft"><span className="font-semibold tabular-nums text-ink">{number(president.decrees)}</span> {ro ? "decrete semnate" : "decrees signed"}</p>
                    {president.elections.map((election) => <p key={election.id} className="mt-1 text-sm text-ink-soft">{ro ? "Ales la" : "Elected in"} {election.heldOn.slice(0, 4)}: {number(election.votes)} {ro ? "voturi" : "votes"} ({percent(election.share)})</p>)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 max-w-3xl text-xs leading-5 text-muted">{ro ? "Fotografiile sunt de pe Wikimedia Commons, cu autorul și licența pe pagina fiecărui președinte. Numele sunt citite din semnătura decretului. „Ales la” apare doar pentru alegerile prezidențiale din datele noastre (2009, 2014, 2025, turul 2); celelalte alegeri nu sunt încă încărcate." : "The photographs are from Wikimedia Commons, with the author and the licence on each President's page. The names are read from the decree's signature. \"Elected in\" appears only for the presidential elections in our data (2009, 2014, 2025, second round); the other elections are not loaded yet."}</p>
    </main>
  );
}
