import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { BarChart3, FileText, Search, TrendingUp, UserRound } from "lucide-react";
import { formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import { getCompositionTimelineData } from "@/lib/composition-data";
import { getHomeDashboardData, type DashboardItem } from "@/lib/explorer-data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { CompositionSeatMapPreview } from "./_components/CompositionSeatMap";
import { HotVoteCarousel } from "./_components/HotVoteCarousel";

export const dynamic = "force-dynamic";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const labels = pageLabels[locale];
  const [dashboard, composition] = await Promise.all([getHomeDashboardData(locale), getCompositionTimelineData("official")]);
  const currentStop = composition.stops[0];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="home" locale={locale} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="text-sm font-semibold uppercase text-blue-800">{messages.home.eyebrow}</div>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-normal text-slate-950 md:text-5xl">
            {messages.home.title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-7 text-slate-600">{messages.home.subtitle}</p>
          <form action={`/${locale}/members`} className="mt-6 flex max-w-2xl items-center gap-3 border border-slate-300 bg-white px-4 py-3">
            <Search size={20} className="text-slate-500" aria-hidden="true" />
            <input
              className="w-full border-0 bg-transparent text-slate-900 outline-none"
              name="q"
              type="search"
              placeholder={messages.home.searchPlaceholder}
              aria-label={messages.home.searchPlaceholder}
            />
          </form>
          {currentStop ? <CurrentComposition locale={locale} labels={labels} stop={currentStop} /> : null}
        </div>

        <aside className="border border-slate-300 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-950">{labels.thisMonth}</div>
          </div>
          <MetricList items={dashboard.mostViewed} empty={labels.noActivity} />
        </aside>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <HotVoteCarousel locale={locale} items={dashboard.trendingVotes.flatMap((item) => dashboard.latestVotes.filter((vote) => vote.vote.id === item.entityId))} fallback={dashboard.latestVotes} />
        <aside className="border border-slate-300 bg-[#f3f7fa] p-5"><h2 className="font-serif text-2xl font-semibold text-[#071a3a]">{locale === "ro" ? "Ce s-a decis și de ce contează" : "What was decided and why it matters"}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{locale === "ro" ? "Urmărește voturile recente, verifică rezultatul și citește documentele oficiale." : "Follow recent votes, check the result and read the official documents."}</p></aside>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Panel title={labels.trendingVotes} icon={<TrendingUp size={18} aria-hidden="true" />}>
          <MetricList items={dashboard.trendingVotes} empty={labels.noActivity} />
        </Panel>
        <Panel title={labels.trendingProjects} icon={<TrendingUp size={18} aria-hidden="true" />}>
          <MetricList items={dashboard.trendingBills} empty={labels.noActivity} />
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={labels.latestVotes} icon={<BarChart3 size={18} aria-hidden="true" />}>
          <div className="divide-y divide-slate-200">
            {dashboard.latestVotes.map(({ vote, hotCount }) => (
              <Link key={vote.id} href={`/${locale}/votes/${vote.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="font-medium text-slate-950">{vote.title}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {formatDate(vote.heldOn, locale)} · {voteChoiceLabels[locale].for}: {vote.totals.for} · {labels.publicInterest} {hotCount}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title={labels.latestProjects} icon={<FileText size={18} aria-hidden="true" />}>
          <div className="divide-y divide-slate-200">
            {dashboard.latestBills.map(({ bill, submittedOn, hotCount }) => (
              <Link key={bill.id} href={`/${locale}/bills/${bill.slug}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="font-medium text-slate-950">{bill.identifiers.senate ?? bill.identifiers.deputies ?? bill.id}</div>
                <div className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {submittedOn ? `${formatDate(submittedOn, locale)} · ` : ""}{bill.title} · {labels.publicInterest} {hotCount}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title={labels.searches} icon={<UserRound size={18} aria-hidden="true" />}>
          <MetricList items={dashboard.mostSearchedMembers} empty={labels.noActivity} />
        </Panel>
        <Explainer title={labels.committees} body={labels.committeeCopy} />
        <Explainer title={labels.groups} body={labels.groupCopy} href={`/${locale}/members`} cta={labels.groupCta} />
      </section>
    </main>
  );
}

function CurrentComposition({
  locale,
  labels,
  stop
}: {
  locale: AppLocale;
  labels: Record<string, string>;
  stop: Awaited<ReturnType<typeof getCompositionTimelineData>>["stops"][number];
}) {
  const pm = stop.primeMinister?.displayName ?? labels.unknown;
  const government = stop.activeGovernment?.name ?? labels.unknown;
  return (
    <section className="mt-6 border border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase text-[#0c6464]">{labels.currentComposition}</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{stop.legislature.label}</h2>
        </div>
        <Link href={`/${locale}/compozitii`} className="rounded-md border border-[#309898] px-3 py-2 text-sm font-medium text-[#0c6464] hover:bg-[#309898]/10">
          {labels.openCompositions}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold uppercase text-slate-500">{labels.currentPm}</div>
          <div className="mt-1 font-medium text-slate-950">{pm}</div>
        </div>
        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold uppercase text-slate-500">{labels.currentGovernment}</div>
          <div className="mt-1 font-medium text-slate-950">{government}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {stop.chambers.map((chamber) => (
          <CompositionSeatMapPreview key={chamber.chamber} locale={locale} chamber={chamber.chamber} seats={chamber.seats} />
        ))}
      </div>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-slate-300 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-300 px-4 py-3 font-semibold text-slate-950">
        <span className="text-[#309898]">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function MetricList({ items, empty }: { items: DashboardItem[]; empty: string }) {
  if (items.length === 0) {
    return <div className="px-4 py-4 text-sm text-slate-600">{empty}</div>;
  }

  return (
    <div className="divide-y divide-slate-200">
      {items.map((item) => {
        const content = (
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 text-sm font-medium text-slate-950">{item.title}</div>
            <div className="shrink-0 text-sm font-semibold text-blue-800">{item.count}</div>
          </div>
        );
        return item.href ? (
          <Link key={`${item.entityType}-${item.entityId ?? item.title}`} href={item.href} className="block hover:bg-slate-50">
            {content}
          </Link>
        ) : (
          <div key={`${item.entityType}-${item.entityId ?? item.title}`}>{content}</div>
        );
      })}
    </div>
  );
}

function Explainer({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <section className="border border-slate-300 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold uppercase text-[#0c6464]">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
      {href && cta ? (
        <Link className="mt-4 inline-flex rounded-md border border-[#309898] px-3 py-2 text-sm font-medium text-[#0c6464] hover:bg-[#309898]/10" href={href}>
          {cta}
        </Link>
      ) : null}
    </section>
  );
}

const pageLabels = {
  ro: {
    thisMonth: "Cele mai văzute luna aceasta",
    trendingVotes: "Voturi cu interes public",
    trendingProjects: "Proiecte cu interes public",
    publicInterest: "Interes public",
    latestVotes: "Ultimele voturi",
    latestProjects: "Ultimele proiecte",
    searches: "Căutări membri",
    noActivity: "Încă nu există activitate publică suficientă.",
    committees: "Comisii",
    committeeCopy: "Comisiile analizează proiectele înainte de plen, pregătesc rapoarte și pot influența forma finală a textului.",
    groups: "Grupuri parlamentare",
    groupCopy: "Grupurile organizează activitatea politică din fiecare cameră și agregă voturile membrilor afiliați.",
    groupCta: "Vezi grupurile pe legislaturi",
    currentComposition: "Compoziția actuală",
    currentPm: "Prim-ministru",
    currentGovernment: "Guvern activ",
    openCompositions: "Vezi compozițiile",
    unknown: "Necunoscut"
  },
  en: {
    thisMonth: "Most viewed this month",
    trendingVotes: "Votes with public interest",
    trendingProjects: "Projects with public interest",
    publicInterest: "Public interest",
    latestVotes: "Latest votes",
    latestProjects: "Latest projects",
    searches: "Member searches",
    noActivity: "Not enough public activity yet.",
    committees: "Committees",
    committeeCopy: "Committees analyze bills before plenary debate, prepare reports, and can influence the final text.",
    groups: "Parliamentary groups",
    groupCopy: "Groups organize political activity in each chamber and aggregate voting behavior for affiliated members.",
    groupCta: "View groups by legislature",
    currentComposition: "Current composition",
    currentPm: "Prime Minister",
    currentGovernment: "Active government",
    openCompositions: "View compositions",
    unknown: "Unknown"
  }
} satisfies Record<AppLocale, Record<string, string>>;
