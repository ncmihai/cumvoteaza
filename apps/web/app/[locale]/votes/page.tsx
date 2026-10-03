import { getDirectoryFilterOptions, getVoteExplorerData, parseExplorerFilters } from "@/lib/explorer-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";
import { VoteDirectoryExplorer, type DirectoryLabels } from "../_components/ExplorerDirectories";
import { EditorialPage, EditorialPageHeader } from "../_components/EditorialPage";

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
  const filters = parseExplorerFilters(rawFilters);
  const [data, filterOptions] = await Promise.all([
    getVoteExplorerData({ limit: 20, filters }),
    getDirectoryFilterOptions(filters)
  ]);
  const labels = pageLabels[locale];

  return (
    <EditorialPage>
      
      <SearchEngagementTracker entityType="vote" query={filters.q} locale={locale} />
      <EditorialPageHeader eyebrow={new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())} title={labels.title} subtitle={labels.subtitle} />
      <div>
        <VoteDirectoryExplorer locale={locale} initialData={data} filterOptions={filterOptions} initialFilters={filters} labels={labels} />
      </div>
    </EditorialPage>
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
    hot: "Popular",
    loadMore: "Încarcă mai multe",
    loading: "Se încarcă",
    apply: "Aplică",
    search: "Caută titlu sau identificator",
    legislature: "Legislatură",
    year: "An",
    month: "Lună",
    chamber: "Cameră",
    sourceStatus: "Sursă",
    group: "Grup",
    empty: "Nu am găsit voturi pentru filtrele selectate. Resetează filtrele sau încearcă o căutare mai largă.",
    error: "Nu am putut încărca următoarele voturi. Încearcă din nou."
  },
  en: {
    title: "Votes",
    subtitle: "Final and nominal votes imported from official sources, ordered by most recent date.",
    present: "Present",
    submitted: "Submitted",
    latestEvent: "Latest event",
    origin: "Origin",
    votes: "Votes",
    hot: "Popular",
    loadMore: "Load more",
    loading: "Loading",
    apply: "Apply",
    search: "Search title or identifier",
    legislature: "Legislature",
    year: "Year",
    month: "Month",
    chamber: "Chamber",
    sourceStatus: "Source",
    group: "Group",
    empty: "No votes match the selected filters. Reset the filters or try a broader search.",
    error: "The next votes could not be loaded. Try again."
  }
} satisfies Record<AppLocale, DirectoryLabels>;
