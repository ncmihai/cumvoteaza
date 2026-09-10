import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import { getDirectoryFilterOptions, getVoteExplorerData, parseExplorerFilters } from "@/lib/explorer-data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";
import { VoteDirectoryExplorer, type DirectoryLabels } from "../_components/ExplorerDirectories";

export default async function VotesPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: rawLocale } = await params;
  const rawFilters = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const filters = parseExplorerFilters(rawFilters);
  const [data, filterOptions] = await Promise.all([
    getVoteExplorerData({ limit: 10, filters }),
    getDirectoryFilterOptions(filters)
  ]);
  const labels = pageLabels[locale];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="votes" locale={locale} />
      <SearchEngagementTracker entityType="vote" query={filters.q} locale={locale} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase text-blue-800">{messages.nav.votes}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">{labels.title}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{labels.subtitle}</p>
        </div>
      </div>

      <VoteDirectoryExplorer locale={locale} initialData={data} filterOptions={filterOptions} initialFilters={filters} labels={labels} />
    </main>
  );
}

const pageLabels = {
  ro: {
    title: "Voturi",
    subtitle: "Voturi finale și nominale importate din surse oficiale, ordonate de la cel mai recent.",
    present: "Prezenți",
    submitted: "Depus",
    latestEvent: "Ultim eveniment",
    origin: "Origine",
    votes: "Voturi",
    hot: "Marchează interes",
    loadMore: "Încarcă mai multe",
    loading: "Se încarcă",
    apply: "Aplică",
    search: "Caută titlu sau identificator",
    legislature: "Legislatură",
    year: "An",
    month: "Lună",
    chamber: "Cameră",
    sourceStatus: "Sursă",
    group: "Grup"
  },
  en: {
    title: "Votes",
    subtitle: "Final and nominal votes imported from official sources, ordered by most recent date.",
    present: "Present",
    submitted: "Submitted",
    latestEvent: "Latest event",
    origin: "Origin",
    votes: "Votes",
    hot: "Mark interest",
    loadMore: "Load more",
    loading: "Loading",
    apply: "Apply",
    search: "Search title or identifier",
    legislature: "Legislature",
    year: "Year",
    month: "Month",
    chamber: "Chamber",
    sourceStatus: "Source",
    group: "Group"
  }
} satisfies Record<AppLocale, DirectoryLabels>;
