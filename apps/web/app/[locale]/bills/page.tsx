import { getBillExplorerData, getDirectoryFilterOptions, parseExplorerFilters } from "@/lib/explorer-data";
import { titled } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { SearchEngagementTracker } from "../_components/EngagementTracker";
import { BillDirectoryExplorer, type DirectoryLabels } from "../_components/ExplorerDirectories";
import { EditorialGuide, EditorialPage, EditorialPageHeader } from "../_components/EditorialPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return titled(params, { ro: "Proiecte legislative", en: "Bills" });
}

export default async function BillsPage({
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
    getBillExplorerData({ limit: 10, filters }),
    getDirectoryFilterOptions(filters)
  ]);
  const labels = pageLabels[locale];

  return (
    <EditorialPage aside={<EditorialGuide title={locale === "ro" ? "Cum găsești un proiect?" : "How to find a bill"} body={locale === "ro" ? "Caută după număr sau subiect, apoi restrânge rezultatele după legislatură și cameră." : "Search by number or subject, then narrow results by legislature and chamber."} items={locale === "ro" ? ["Caută după identificator sau cuvinte din titlu.", "Folosește filtrele pentru rezultate precise.", "Deschide proiectul pentru traseu, documente și voturi."] : ["Search by identifier or title words.", "Use filters for precise results.", "Open a bill for its timeline, documents and votes."]} />}>
      
      <SearchEngagementTracker entityType="bill" query={filters.q} locale={locale} />
      <EditorialPageHeader eyebrow={messages.nav.bills} title={labels.title} subtitle={labels.subtitle} />

      <BillDirectoryExplorer locale={locale} initialData={data} filterOptions={filterOptions} initialFilters={filters} labels={labels} />
    </EditorialPage>
  );
}

const pageLabels = {
  ro: {
    title: "Proiecte",
    subtitle: "Proiecte legislative importate din surse oficiale, ordonate după prima dată cunoscută din traseul parlamentar.",
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
    group: "Grup sponsor",
    empty: "Nu am găsit proiecte pentru filtrele selectate. Resetează filtrele sau încearcă o căutare mai largă.",
    error: "Nu am putut încărca următoarele proiecte. Încearcă din nou."
  },
  en: {
    title: "Projects",
    subtitle: "Legislative projects imported from official sources, ordered by the first known date in the parliamentary timeline.",
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
    group: "Sponsor group",
    empty: "No projects match the selected filters. Reset the filters or try a broader search.",
    error: "The next projects could not be loaded. Try again."
  }
} satisfies Record<AppLocale, DirectoryLabels>;
