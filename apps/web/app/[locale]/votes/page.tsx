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
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-6">
        <div>
          <div className="text-sm font-semibold uppercase text-blue-800">{messages.nav.votes}</div>
          <h1 className="mt-2 font-serif text-5xl font-semibold tracking-tight text-[#071a3a]">{labels.title}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{labels.subtitle}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <VoteDirectoryExplorer locale={locale} initialData={data} filterOptions={filterOptions} initialFilters={filters} labels={labels} />
        <aside className="hidden self-start border border-slate-200 bg-[#f3f7fa] p-5 lg:block"><h2 className="font-serif text-2xl font-semibold text-[#071a3a]">{locale === "ro" ? "Cum citești un vot?" : "How to read a vote"}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{locale === "ro" ? "Filtrează după cameră și legislatură, apoi deschide un vot pentru distribuția pe grupuri și votul fiecărui parlamentar." : "Filter by chamber and legislature, then open a vote for group totals and each member's choice."}</p><div className="mt-5 space-y-3 text-sm text-slate-700"><p><strong>1.</strong> {locale === "ro" ? "Verifică data și moțiunea." : "Check the date and motion."}</p><p><strong>2.</strong> {locale === "ro" ? "Compară rezultatul cu prezența." : "Compare the result with attendance."}</p><p><strong>3.</strong> {locale === "ro" ? "Citește sursa oficială." : "Read the official source."}</p></div></aside>
      </div>
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
