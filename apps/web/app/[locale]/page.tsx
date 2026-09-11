import { getHomeDashboardData, getVoteExplorerData } from "@/lib/explorer-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { HomepageExperience } from "./_components/HomepageExperience";
import { EditorialSections } from "./_components/EditorialSections";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const [dashboard, voteFeed] = await Promise.all([getHomeDashboardData(locale), getVoteExplorerData({ limit: 8 })]);
  const votes = [...dashboard.latestVotes, ...voteFeed.items]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.vote.id === item.vote.id) === index)
    .sort((left, right) => right.hotCount - left.hotCount || right.vote.heldOn.localeCompare(left.vote.heldOn));
  return <><div className="mx-auto max-w-[1440px] px-4 pt-6 md:px-8 lg:px-10"><EditorialSections page="home" locale={locale} /></div><HomepageExperience locale={locale} votes={votes} /></>;
}
