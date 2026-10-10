import { getPartyElections } from "@/lib/election-data";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { chamberLabels, formatDate } from "@cumsevoteaza/parliament-model";
import { getCurrentCompositionData } from "@/lib/composition-data";
import { getCurrentPartySlug, getPartyPageData } from "@/lib/data";
import { getPartyCurrentMembers } from "@/lib/directory-data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { selectCurrentPartyState } from "@/lib/public-presentation";
import { countyLabel } from "@/lib/text";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { ShareButton } from "../../_components/ShareButton";
import { CountUp } from "../../_components/ui/CountUp";
import { PartyMark } from "../../_components/ui/PartyMark";
import { PersonAvatar } from "../../_components/ui/PersonAvatar";
import { SectionHeader } from "../../_components/ui/SectionHeader";
import { SplitBar } from "../../_components/ui/SplitBar";
import { VOTE_STYLE } from "../../_components/ui/vote-meaning";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await getPartyPageData(slug);
  return { title: data ? data.party.name : (locale === "en" ? "Party not found" : "Partid negăsit") };
}

const KIND_LABEL = {
  ro: { party: "Partid", minority_organisation: "Organizație a unei minorități naționale", minority_group: "Grupul minorităților naționale", independent: "Parlamentari independenți", unaffiliated: "Parlamentari fără adeziune la formațiunea pentru care au candidat" },
  en: { party: "Party", minority_organisation: "National-minority organisation", minority_group: "National-minorities group", independent: "Independent members", unaffiliated: "Members with no adherence to the party they ran for" }
} as const;

export default async function PartyPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const ro = locale === "ro";
  const [data, composition] = await Promise.all([getPartyPageData(slug), getCurrentCompositionData("official")]);
  if (!data) {
    const currentSlug = await getCurrentPartySlug(slug);
    if (currentSlug && currentSlug !== slug) permanentRedirect(`/${rawLocale}/parties/${currentSlug}`);
    notFound();
  }
  const { party, legislatureSummaries, groupTotals, votes, formationEvents, governmentParticipations, tribunalSources } = data;
  const members = await getPartyCurrentMembers(party.id);
  const electionResults = await getPartyElections(party.id);
  const kind = (party.kind ?? "party") as keyof (typeof KIND_LABEL)["ro"];
  const chamberSeats = (chamber: "deputies" | "senate") => {
    const entry = composition.chambers.find((candidate) => candidate.chamber === chamber);
    const total = entry?.groups.reduce((sum, group) => sum + group.seats, 0) ?? 0;
    const own = entry?.groups.filter((group) => group.party?.id === party.id).reduce((sum, group) => sum + group.seats, 0) ?? 0;
    return { own: kind === "party" ? own : members.filter((member) => member.chamber === chamber).length, total };
  };
  const deputies = chamberSeats("deputies");
  const senate = chamberSeats("senate");
  const asOf = new Date().toISOString().slice(0, 10);
  const government = selectCurrentPartyState(governmentParticipations, asOf).participation;
  const recent = aggregatePartyVotes(groupTotals).flatMap((total) => { const vote = votes.find((candidate) => candidate.id === total.voteId); return vote ? [{ total, vote }] : []; }).sort((a, b) => b.vote.heldOn.localeCompare(a.vote.heldOn)).slice(0, 8);
  const founded = formationEvents.find((event) => event.eventType === "party_founded");
  const restored = formationEvents.find((event) => event.eventType === "party_reestablished");
  const seated = deputies.own + senate.own > 0;
  return (
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      <EngagementTracker entityType="party" entityId={party.id} locale={locale} />
      <nav aria-label={ro ? "Unde ești" : "Breadcrumb"} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <ol className="flex min-w-0 items-center gap-2 text-muted">
          <li><Link href={`/${locale}`} className="hover:text-brand">{ro ? "Acasă" : "Home"}</Link></li><li aria-hidden="true">›</li>
          <li><Link href={`/${locale}/parties`} className="hover:text-brand">{ro ? "Partide" : "Parties"}</Link></li><li aria-hidden="true">›</li>
          <li aria-current="page" className="max-w-[28ch] truncate text-ink-soft sm:max-w-[48ch]">{party.shortName}</li>
        </ol>
        <ShareButton href={`/${locale}/parties/${party.slug}`} title={party.name} label={ro ? "Distribuie" : "Share"} copiedLabel={ro ? "Link copiat" : "Link copied"} errorLabel={ro ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink-soft hover:border-line-strong" />
      </nav>

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <PartyMark party={{ shortName: party.shortName, color: party.color, logoAssetId: party.logoAssetId }} size={72} />
        <div className="min-w-0 flex-1">
          <p className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">{KIND_LABEL[locale][kind]}</p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-ink [overflow-wrap:anywhere] lg:text-5xl">{party.fullNameKnown === false ? party.shortName : party.name}</h1>
          <p className="mt-1 text-lg text-ink-soft">{party.fullNameKnown === false ? (ro ? "Numele complet nu este înregistrat (sursele oficiale îl dau doar prescurtat)." : "The full name is not recorded (the official sources give only the abbreviation).") : party.shortName !== party.name ? party.shortName : ""}</p>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-label={ro ? "Acum în Parlament" : "In Parliament now"} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {([["deputies", deputies], ["senate", senate]] as const).map(([chamber, seats]) => (
              <div key={chamber} className="rounded-card border border-line bg-surface p-5">
                <p className="text-sm font-medium text-muted">{chamberLabels[locale][chamber]}</p>
                <p className="mt-1 font-display text-4xl font-bold leading-none text-ink"><CountUp value={seats.own} /></p>
                <p className="mt-2 text-sm text-muted">{seats.total > 0 ? (ro ? `din ${seats.total} (${Math.round((seats.own / seats.total) * 1000) / 10}%)` : `of ${seats.total} (${Math.round((seats.own / seats.total) * 1000) / 10}%)`) : ""}</p>
              </div>
            ))}
            <div className="rounded-card border border-line bg-surface p-5">
              <p className="text-sm font-medium text-muted">{ro ? "Rolul în guvernare" : "Role in government"}</p>
              {government ? <><p className="mt-1 font-display text-2xl font-bold capitalize text-ink">{alignment(government.alignment, locale)}</p><p className="mt-2 text-sm text-muted">{government.government.name}</p></> : <p className="mt-2 text-sm leading-6 text-muted">{ro ? "Fără clasificare guvernamentală verificată." : "No verified government classification."}</p>}
            </div>
          </section>

          {members.length > 0 ? (
            <section>
              <SectionHeader eyebrow={ro ? "Parlamentari" : "Members"} title={ro ? "Parlamentarii de acum" : "Members now"} href={`/${locale}/members?group=group-name:${party.shortName.toLowerCase()}`} linkLabel={ro ? "Vezi toți" : "See all"} />
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {members.slice(0, 24).map((member) => (
                  <li key={member.slug}>
                    <Link href={`/${locale}/members/${member.slug}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 hover:border-line-strong hover:shadow-lift">
                      <PersonAvatar name={member.name} photoUrl={member.photoAssetId ? `/api/assets/${encodeURIComponent(member.photoAssetId)}` : undefined} size={44} />
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{member.name}</span><span className="block truncate text-xs text-muted">{chamberLabels[locale][member.chamber]}{member.constituency ? ` · ${countyLabel(member.constituency, locale)}` : ""}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
              {members.length > 24 ? <p className="mt-3 text-sm text-muted">{ro ? `și încă ${members.length - 24}.` : `and ${members.length - 24} more.`}</p> : null}
            </section>
          ) : null}

          <section>
            <SectionHeader eyebrow={ro ? "Voturi" : "Votes"} title={ro ? `Cum a votat recent ${party.shortName}` : `How ${party.shortName} voted recently`} href={`/${locale}/votes?group=${encodeURIComponent(party.id)}`} linkLabel={ro ? "Toate voturile" : "All votes"} />
            <p className="mt-2 text-sm text-muted">{ro ? "Poziția cumulată a grupurilor partidului în voturile nominale importate." : "The combined position of the party's groups in the imported nominal votes."}</p>
            {recent.length ? (
              <ul className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {recent.map(({ total, vote }) => {
                  const match = voteOutcomeMatches(total, vote.totals.for, vote.totals.against, locale);
                  return (
                    <li key={total.voteId} className="relative p-4 hover:bg-wash/60">
                      <p className="text-xs text-muted"><time dateTime={vote.heldOn}>{formatDate(vote.heldOn, locale)}</time></p>
                      <Link href={`/${locale}/votes/${vote.id}`} lang="ro" className="mt-0.5 block text-sm font-semibold leading-5 text-ink after:absolute after:inset-0 after:content-['']">{vote.title}</Link>
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                        <div className="w-full sm:w-64"><SplitBar counts={{ for: total.for, against: total.against, abstain: total.abstention, present: total.presentNotVoting }} locale={locale} height="h-2" /></div>
                        <p className="flex gap-3 text-sm tabular-nums"><span className={`font-semibold ${VOTE_STYLE.for.text}`}>{total.for}</span><span className={`font-semibold ${VOTE_STYLE.against.text}`}>{total.against}</span><span className={`font-semibold ${VOTE_STYLE.abstain.text}`}>{total.abstention}</span></p>
                        <p className="text-xs text-muted">{agreement(total.for, total.against, total.abstention)}% {ro ? "în același sens" : "voted the same way"} · <span className={match.tone}>{match.label}</span></p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-4 rounded-card border border-dashed border-line-strong p-5 text-sm text-muted">{ro ? "Nu există încă voturi de grup conectate." : "No connected group votes yet."}</p>}
          </section>

          {legislatureSummaries.length > 0 ? (
            <section>
              <SectionHeader eyebrow={ro ? "Istoric" : "History"} title={ro ? "Pe legislaturi" : "By legislature"} />
              <div className="mt-5 overflow-x-auto rounded-card border border-line bg-surface" tabIndex={0} role="region" aria-label={ro ? "Pe legislaturi" : "By legislature"}>
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <thead className="bg-wash text-left text-xs text-ink-soft"><tr><th scope="col" className="px-4 py-2 font-semibold">{ro ? "Legislatura" : "Legislature"}</th><th scope="col" className="px-4 py-2 font-semibold">{ro ? "Camera" : "Chamber"}</th><th scope="col" className="px-4 py-2 text-right font-semibold">{ro ? "Locuri" : "Seats"}</th><th scope="col" className="px-4 py-2 text-right font-semibold">{ro ? "Persoane" : "People"}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {legislatureSummaries.map((summary) => <tr key={`${summary.legislature.id}-${summary.chamber}`}><td className="px-4 py-2 font-medium text-ink">{summary.legislature.label.replace("-", "–")}</td><td className="px-4 py-2 text-ink-soft">{chamberLabels[locale][summary.chamber]}</td><td className="px-4 py-2 text-right tabular-nums">{summary.seatCount}</td><td className="px-4 py-2 text-right tabular-nums">{summary.memberCount}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {electionResults.length > 0 ? (
            <section aria-labelledby="election-results">
              <SectionHeader eyebrow={ro ? "Alegeri" : "Elections"} title={ro ? "La alegerile parlamentare" : "At the parliamentary elections"} href={`/${locale}/elections`} linkLabel={ro ? "Toate rezultatele" : "All results"} />
              <div className="mt-5 overflow-x-auto rounded-card border border-line bg-surface" tabIndex={0} role="region" aria-label={ro ? "Rezultate electorale" : "Election results"}>
                <table className="w-full min-w-[28rem] border-collapse text-sm">
                  <caption className="sr-only">{ro ? "Voturile și mandatele partidului la fiecare alegere" : "The party's votes and mandates at each election"}</caption>
                  <thead className="bg-wash text-left text-xs text-ink-soft"><tr><th scope="col" className="px-4 py-2 font-semibold">{ro ? "Alegerea" : "Election"}</th><th scope="col" className="px-4 py-2 font-semibold">{ro ? "Camera" : "Chamber"}</th><th scope="col" className="px-4 py-2 text-right font-semibold">{ro ? "Voturi" : "Votes"}</th><th scope="col" className="px-4 py-2 text-right font-semibold">%</th><th scope="col" className="px-4 py-2 text-right font-semibold">{ro ? "Mandate" : "Mandates"}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {electionResults.map((row) => <tr key={`${row.election.id}-${row.chamber}`}><td className="px-4 py-2 font-medium text-ink"><Link href={`/${locale}/elections?election=${row.election.id}&chamber=${row.chamber}`} className="hover:text-brand">{row.election.heldOn.slice(0, 4)}</Link></td><td className="px-4 py-2 text-ink-soft">{row.chamber === "senate" ? (ro ? "Senat" : "Senate") : ro ? "Camera Deputaților" : "Chamber of Deputies"}</td><td className="px-4 py-2 text-right tabular-nums text-ink-soft">{row.votes.toLocaleString(ro ? "ro-RO" : "en-GB")}</td><td className="px-4 py-2 text-right tabular-nums text-ink-soft">{(row.share * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">{row.election.mandatesKnown ? row.mandates : "–"}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{ro ? "Din datele deschise ale AEP, doar alegerile din 2016 și 2020 (cele din 2024 nu sunt acolo). Un partid care a candidat într-o alianță apare sub numele alianței, nu aici." : "From the AEP's open data, only the 2016 and 2020 elections (2024 is not there). A party that ran in an alliance appears under the alliance's name, not here."}</p>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="font-display text-xl font-bold text-ink">{ro ? "Pe scurt" : "At a glance"}</h2>
            <dl className="mt-4 divide-y divide-line text-sm">
              <Fact label={ro ? "Tip" : "Kind"} value={KIND_LABEL[locale][kind]} />
              {founded ? <Fact label={ro ? "Înființat" : "Founded"} value={formatDate(founded.date, locale)} /> : null}
              {restored ? <Fact label={ro ? "Reînființat" : "Re-established"} value={formatDate(restored.date, locale)} /> : null}
              <Fact label={ro ? "Acum în Parlament" : "In Parliament now"} value={seated ? `${deputies.own} ${ro ? "deputați" : "deputies"} · ${senate.own} ${ro ? "senatori" : "senators"}` : (ro ? "Niciun parlamentar" : "No members")} />
              <Fact label={ro ? "Legislaturi" : "Legislatures"} value={legislatureSummaries.length ? [...new Set(legislatureSummaries.map((summary) => summary.legislature.label.slice(0, 4)))].sort().join(", ") : "—"} />
            </dl>
            {party.logoAssetId ? <p className="mt-4 text-xs leading-5 text-muted">{ro ? "Sigla este cea publicată de Camera Deputaților pe paginile parlamentarilor." : "The logo is the one the Chamber of Deputies publishes on its members' pages."}</p> : null}
          </section>
          {formationEvents.length ? (
            <details className="rounded-card border border-line bg-surface p-5">
              <summary className="cursor-pointer font-display text-xl font-bold text-ink">{ro ? "Istoricul partidului" : "Party history"}</summary>
              <div className="mt-3 space-y-3">{formationEvents.slice(0, 8).map((event) => <a key={event.id} href={event.sourceUrl} target={event.sourceUrl ? "_blank" : undefined} rel="noreferrer" className="block border-l-2 border-line-strong pl-3 text-sm"><strong className="text-ink">{formatDate(event.date, locale)}</strong><span className="mt-0.5 block text-muted">{ro ? event.titleRo : event.titleEn}</span></a>)}</div>
            </details>
          ) : null}
          {tribunalSources.map((source) => <a key={source.id} href={source.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 text-sm font-semibold text-brand hover:border-line-strong">{ro ? "Registrul oficial al partidului" : "Official party registry"}<ExternalLink size={16} aria-hidden="true" /></a>)}
        </aside>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5"><dt className="text-muted">{label}</dt><dd className="font-medium text-ink">{value}</dd></div>;
}

function alignment(value: string, locale: AppLocale) {
  const ro: Record<string, string> = { government: "guvernare", governing_support: "susținere", opposition: "opoziție", mixed: "poziție mixtă", unaffiliated: "neafiliat", unknown: "necunoscut" };
  return locale === "ro" ? (ro[value] ?? value) : value.replaceAll("_", " ");
}

function agreement(forVotes: number, against: number, abstention: number) {
  const all = forVotes + against + abstention;
  return all ? Math.round((Math.max(forVotes, against, abstention) / all) * 100) : 0;
}

function aggregatePartyVotes(rows: Array<{ voteId: string; for: number; against: number; abstention: number; presentNotVoting: number }>) {
  const totals = new Map<string, { voteId: string; for: number; against: number; abstention: number; presentNotVoting: number; covered: number }>();
  for (const row of rows) {
    const current = totals.get(row.voteId) ?? { voteId: row.voteId, for: 0, against: 0, abstention: 0, presentNotVoting: 0, covered: 0 };
    current.for += row.for; current.against += row.against; current.abstention += row.abstention; current.presentNotVoting += row.presentNotVoting; current.covered += row.for + row.against + row.abstention + row.presentNotVoting;
    totals.set(row.voteId, current);
  }
  return [...totals.values()];
}

function voteOutcomeMatches(total: { for: number; against: number; abstention: number }, overallFor: number, overallAgainst: number, locale: AppLocale) {
  const partyChoice = total.for >= total.against && total.for >= total.abstention ? "for" : total.against >= total.for && total.against >= total.abstention ? "against" : "abstention";
  if (overallFor === overallAgainst) return { tone: "text-muted", label: locale === "ro" ? "Majoritate nedeterminată" : "No recorded majority" };
  const majority = overallFor > overallAgainst ? "for" : "against";
  const matches = partyChoice === majority;
  return { tone: matches ? "font-semibold text-vote-for" : "font-semibold text-vote-against", label: locale === "ro" ? (matches ? "ca majoritatea plenului" : "diferit de majoritatea plenului") : (matches ? "matches the plenary majority" : "differs from the plenary majority") };
}
