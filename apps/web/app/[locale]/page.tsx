import { getCurrentCompositionData } from "@/lib/composition-data";
import { getCoveragePageData, getLastCatchUp } from "@/lib/coverage-data";
import { getVoteExplorerData } from "@/lib/explorer-data";
import { getCountyOptions, getRecentChanges } from "@/lib/home-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { ChangesFeed } from "./_components/home/ChangesFeed";
import { Hero } from "./_components/home/Hero";
import { LatestDecisions } from "./_components/home/LatestDecisions";
import { ParliamentNow } from "./_components/home/ParliamentNow";
import { TrustStrip } from "./_components/home/TrustStrip";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const [votes, composition, counties, changes, coverage, checkedAt] = await Promise.all([
    getVoteExplorerData({ limit: 7 }),
    getCurrentCompositionData("official"),
    getCountyOptions(locale),
    getRecentChanges(locale, 6),
    getCoveragePageData(),
    getLastCatchUp()
  ]);
  const deputies = composition.chambers.find((chamber) => chamber.chamber === "deputies");
  return (
    <main>
      <Hero locale={locale} counties={counties} chamber={deputies} today={new Date().toISOString().slice(0, 10)} />
      <LatestDecisions votes={votes.items} locale={locale} />
      <div className="mx-auto grid max-w-page grid-cols-1 gap-10 px-4 py-10 lg:grid-cols-[1.15fr_1fr] lg:px-8">
        <ChangesFeed changes={changes} locale={locale} />
        <ParliamentNow chambers={composition.chambers} locale={locale} sitting={{ deputies: counties.reduce((sum, county) => sum + county.deputies, 0), senate: counties.reduce((sum, county) => sum + county.senators, 0) }} />
      </div>
      <TrustStrip coverage={coverage} checkedAt={checkedAt} locale={locale} />
    </main>
  );
}
