import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { chamberLabels, formatDate } from "@cumsevoteaza/parliament-model";
import { getMemberPageData } from "@/lib/data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { MemberCareerTimeline } from "../../_components/MemberCareerTimeline";
import { MemberHistoryTable } from "../../_components/MemberHistoryTable";
import { SourceBadge } from "../../_components/SourceBadge";

export default async function MemberPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ legislature?: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  const { legislature } = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const data = await getMemberPageData(slug, { legislature });
  if (!data) notFound();
  const {
    member,
    history,
    group,
    party,
    profilePhotoUrl,
    currentLogoUrl,
    careerSegments,
    mandate,
    source,
    legislatures,
    selectedLegislature,
    activity,
    voteCoverage,
    votes,
    voteRecords,
    sponsoredBills,
  } = data;
  const labels = memberPageLabels[locale];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <EditorialSections page="member" locale={locale} entityId={slug} />
      <EngagementTracker entityType="member" entityId={member.id} locale={locale} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="relative mt-1 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border border-slate-300 bg-white">
            {profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" />
            ) : currentLogoUrl ? (
              <PartyLogoMaybeLink partySlug={party?.slug} locale={locale}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentLogoUrl} alt="" className="max-h-16 max-w-16 object-contain" />
              </PartyLogoMaybeLink>
            ) : (
              <span className="text-3xl font-semibold text-slate-400">{member.displayName.slice(0, 1)}</span>
            )}
            {currentLogoUrl && profilePhotoUrl ? (
              <PartyLogoMaybeLink
                partySlug={party?.slug}
                locale={locale}
                className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center border border-slate-300 bg-white p-1 hover:border-[#309898]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentLogoUrl} alt="" className="max-h-full max-w-full object-contain" />
              </PartyLogoMaybeLink>
            ) : null}
          </div>
          <div className="min-w-0">
            <PartyTextMaybeLink partySlug={party?.slug} locale={locale} className="text-sm font-semibold uppercase text-blue-800 hover:text-[#309898] hover:underline">
              {group?.shortName ?? party?.shortName ?? "unknown"}
            </PartyTextMaybeLink>
            <h1 className="mt-2 font-serif text-5xl font-semibold tracking-tight text-[#071a3a]">{member.displayName}</h1>
            <p className="mt-3 text-slate-600">
              {mandate ? chamberLabels[locale][mandate.chamber] : "unknown"} · {mandate?.status ?? "unknown"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2">
          {source ? <SourceBadge source={source} label={messages.common.source} /> : null}
        </div>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-y-4 border border-slate-300 bg-white py-4 md:grid-cols-4">
        <div className="border-l border-slate-300 px-4 first:border-l-0">
          <div className="text-xs uppercase text-slate-500">{labels.currentGroup}</div>
          <PartyTextMaybeLink partySlug={party?.slug} locale={locale} className="mt-1 block text-2xl font-semibold text-slate-950 hover:text-[#309898] hover:underline">
            {group?.shortName ?? "-"}
          </PartyTextMaybeLink>
        </div>
        <div className="border-l border-slate-300 px-4">
          <div className="text-xs uppercase text-slate-500">{messages.nav.votes}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">
            {(activity?.votesFor ?? 0) + (activity?.votesAgainst ?? 0) + (activity?.abstentions ?? 0) + (activity?.presentNotVoting ?? 0) + (activity?.absent ?? 0) + (activity?.unknown ?? 0)}
          </div>
        </div>
        <div className="border-l border-slate-300 px-4">
          <div className="text-xs uppercase text-slate-500">{messages.common.proposals}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">{activity?.proposals ?? sponsoredBills.length}</div>
        </div>
        <div className="border-l border-slate-300 px-4">
          <div className="text-xs uppercase text-slate-500">{labels.legislature}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">{selectedLegislature?.label ?? "-"}</div>
        </div>
      </section>

      <MemberCareerTimeline segments={careerSegments} locale={locale} />

      <section className="mt-6">
        <h2 className="mb-3 text-2xl font-semibold text-slate-950">{messages.home.memberHistory}</h2>
        <MemberHistoryTable
          rows={history}
          locale={locale}
          legislatures={legislatures}
          labels={{
            period: messages.common.period,
            chamber: messages.common.chamber,
            type: messages.common.type,
            details: messages.common.details,
            votesFor: messages.common.votesFor,
            votesAgainst: messages.common.votesAgainst,
            abstentions: messages.common.abstentions,
            proposals: messages.common.proposals
          }}
        />
      </section>

      <section className="mt-6 border border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">{labels.activityByLegislature}</h2>
            <p className="mt-1 text-sm text-slate-600">{labels.activityDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {legislatures.map((item) => (
              <Link
                key={item.id}
                href={`/${locale}/members/${member.slug}?legislature=${item.id}`}
                className={[
                  "rounded-md border px-3 py-2 text-sm font-medium",
                  item.id === selectedLegislature?.id
                    ? "border-[#309898] bg-[#309898] text-white shadow-sm"
                    : "border-slate-300 bg-white text-slate-700 hover:border-[#309898] hover:text-[#0c6464]"
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {activity ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label={messages.common.votesFor} value={activity.votesFor} />
            <MiniStat label={messages.common.votesAgainst} value={activity.votesAgainst} />
            <MiniStat label={messages.common.abstentions} value={activity.abstentions} />
            <MiniStat label={labels.sourceCoverage} value={`${Object.keys(voteCoverage).length}/${votes.length}`} />
          </div>
        ) : null}
      </section>

      <section className="mt-6 border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-4 py-3 font-semibold">
          {messages.nav.votes} · {selectedLegislature?.label ?? labels.allLegislatures}
        </div>
        <div className="max-h-[520px] divide-y divide-slate-200 overflow-auto">
          {votes.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{labels.noVotes}</div> : null}
          {votes.map((individualVote) => {
            const vote = voteRecords.find((item) => item.id === individualVote.voteId);
            const coverage = voteCoverage[individualVote.voteId];
            return vote ? (
              <Link key={individualVote.id} className="block px-4 py-3 hover:bg-slate-50" href={`/${locale}/votes/${vote.id}`}>
                <div className="font-medium">{vote.title}</div>
                <div className="text-sm text-slate-600">
                  {formatDate(vote.heldOn, locale)} · {individualVote.choice}
                  {coverage ? ` · ${labels.coverage}: ${coverage.coverageLevel}` : ""}
                </div>
              </Link>
            ) : null;
          })}
        </div>
      </section>

      <section className="mt-6 border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-4 py-3 font-semibold">
          {messages.common.proposals} · {selectedLegislature?.label ?? labels.allLegislatures}
        </div>
        <div className="max-h-[420px] divide-y divide-slate-200 overflow-auto">
          {sponsoredBills.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{labels.noProposals}</div> : null}
          {sponsoredBills.map((bill) => (
            <Link key={bill.id} className="block px-4 py-3 hover:bg-slate-50" href={`/${locale}/bills/${bill.slug}`}>
              <div className="font-medium">{bill.identifiers.deputies ?? bill.identifiers.senate ?? bill.id}</div>
              <div className="mt-1 line-clamp-2 text-sm text-slate-600">{bill.title}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function PartyLogoMaybeLink({
  partySlug,
  locale,
  className = "flex h-full w-full items-center justify-center hover:bg-slate-50",
  children
}: {
  partySlug?: string;
  locale: AppLocale;
  className?: string;
  children: ReactNode;
}) {
  if (!partySlug) return <span className={className}>{children}</span>;
  return (
    <Link href={`/${locale}/parties/${partySlug}`} className={className}>
      {children}
    </Link>
  );
}

function PartyTextMaybeLink({
  partySlug,
  locale,
  className,
  children
}: {
  partySlug?: string;
  locale: AppLocale;
  className: string;
  children: ReactNode;
}) {
  if (!partySlug) return <span className={className}>{children}</span>;
  return (
    <Link href={`/${locale}/parties/${partySlug}`} className={className}>
      {children}
    </Link>
  );
}

const memberPageLabels = {
  ro: {
    currentGroup: "Grup în legislatură",
    legislature: "Legislatură",
    activityByLegislature: "Activitate pe legislatură",
    activityDescription: "Alege perioada ca să vezi voturile și propunerile conectate la mandatul respectiv.",
    sourceCoverage: "Acoperire surse",
    coverage: "acoperire",
    allLegislatures: "toate legislaturile",
    noVotes: "Nu există încă voturi nominale importate pentru această legislatură.",
    noProposals: "Nu există încă propuneri conectate acestui parlamentar pentru această legislatură."
  },
  en: {
    currentGroup: "Group in legislature",
    legislature: "Legislature",
    activityByLegislature: "Activity by legislature",
    activityDescription: "Pick a period to see votes and proposals connected to that mandate.",
    sourceCoverage: "Source coverage",
    coverage: "coverage",
    allLegislatures: "all legislatures",
    noVotes: "No nominal votes are imported for this legislature yet.",
    noProposals: "No proposals are connected to this member for this legislature yet."
  }
} satisfies Record<AppLocale, Record<string, string>>;
