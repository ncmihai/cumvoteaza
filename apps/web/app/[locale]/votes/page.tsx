import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { getSittingSummaries } from "@/lib/sitting-summaries";
import { getDirectoryFilterOptions, getVoteExplorerData, parseExplorerFilters } from "@/lib/explorer-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";
import { VoteDirectoryExplorer, type DirectoryLabels } from "../_components/ExplorerDirectories";
import { EditorialPage, EditorialPageHeader } from "../_components/EditorialPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Voturi", en: "Votes" });
}

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
  const [data, filterOptions, sittings] = await Promise.all([
    getVoteExplorerData({ limit: 20, filters }),
    getDirectoryFilterOptions(filters),
    getSittingSummaries()
  ]);
  const labels = pageLabels[locale];
  const sittingLabels = sittingText[locale];

  return (
    <EditorialPage>
      
      <SearchEngagementTracker entityType="vote" query={filters.q} locale={locale} />
      <EditorialPageHeader eyebrow={new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())} title={labels.title} subtitle={labels.subtitle} />
      <div>
        <VoteDirectoryExplorer locale={locale} initialData={data} filterOptions={filterOptions} initialFilters={filters} labels={labels} />
      </div>
      {sittings.length > 0 ? (
        <section className="mt-8 border border-line bg-white p-5 rounded-card" aria-labelledby="sitting-summaries">
          <h2 id="sitting-summaries" className="font-serif text-2xl font-semibold text-ink">{sittingLabels.title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{sittingLabels.note}</p>
          <div className="mt-3 divide-y divide-line">
            {sittings.map((sitting) => (
              <div key={sitting.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[200px_minmax(0,1fr)_auto]">
                <span className="text-xs font-bold text-muted">{formatDate(sitting.heldOn, locale)} · {voteChamberLabels[locale][sitting.chamber]}</span>
                <span className="text-ink">{sittingLabels.votes}: {sitting.voteCount}</span>
                <a className="text-xs font-bold text-brand underline" href={sitting.officialUrl} rel="noreferrer">{sittingLabels.link}</a>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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

const sittingText = {
  ro: {
    title: "Ședințe comune cu voturi pe articole și amendamente",
    note: "La aceste ședințe comune s-au votat pe rând articolele, anexele și amendamentele unui proiect (sute de voturi, fiecare cu peste 400 de votanți). Nu le păstrăm una câte una; lista completă, cu votul fiecărui parlamentar, este pe site-ul Camerei Deputaților.",
    votes: "Voturi pe articole, anexe și amendamente",
    link: "Lista oficială ↗"
  },
  en: {
    title: "Joint sittings with article and amendment votes",
    note: "At these joint sittings the articles, annexes and amendments of one bill were voted one by one (hundreds of ballots, each with over 400 voters). We do not store them individually; the full list, with every parliamentarian's vote, is on the Chamber of Deputies' site.",
    votes: "Votes on articles, annexes and amendments",
    link: "Official list ↗"
  }
} as const;
