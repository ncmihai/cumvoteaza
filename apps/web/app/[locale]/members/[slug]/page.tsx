import Link from "next/link";

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Building2, CalendarDays, ExternalLink, Landmark, MapPin } from "lucide-react";
import { chamberLabels, formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getCurrentMemberSlug, getMemberPageData } from "@/lib/data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { presentMemberActivity, presentMemberCareer, presentMemberIdentity, presentMemberProfileContext, presentVote } from "@/lib/public-presentation";
import { placeForDisplay } from "@/lib/presentation";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { MemberCareerTimeline } from "../../_components/MemberCareerTimeline";
import { ShareButton } from "../../_components/ShareButton";
import { CountUp } from "../../_components/ui/CountUp";
import { PartyMark } from "../../_components/ui/PartyMark";
import { PersonAvatar } from "../../_components/ui/PersonAvatar";
import { SectionHeader } from "../../_components/ui/SectionHeader";
import { SplitBar } from "../../_components/ui/SplitBar";
import { VoteDot } from "../../_components/ui/VoteIcon";
import { VOTE_LABEL, VOTE_STYLE, voteKindOfChoice } from "../../_components/ui/vote-meaning";
import { getMemberVoteStats } from "@/lib/member-stats";
import { countyLabel } from "@/lib/text";
import { getGovernmentRolesForPerson } from "@/lib/ministry-data";
import { PublicCareerTimeline, type PublicCareerEvent } from "../../_components/PublicCareerTimeline";
import { OfficialActivityPanel } from "../../_components/OfficialActivityPanel";
import { MemberBodiesPanel } from "../../_components/MemberBodiesPanel";
import { QuestionsSummary } from "../../_components/QuestionsSummary";
import { getQuestionsView } from "@/lib/question-data";
import { getMandateElection } from "@/lib/election-data";
import { officialCase } from "@/lib/text";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ legislature?: string }> }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const { legislature } = await searchParams;
  const data = await getMemberPageData(slug, { legislature });
  return { title: data ? data.member.displayName : (rawLocale === "en" ? "Member not found" : "Parlamentar negăsit") };
}

export default async function MemberPage({ params, searchParams }: { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<{ legislature?: string; fromVote?: string }> }) {
  const { locale: rawLocale, slug } = await params;
  const { legislature, fromVote } = await searchParams;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const data = await getMemberPageData(slug, { legislature });
  if (!data) {
    // Profiles merged or renamed by the identity repair keep their old URLs working.
    const currentSlug = await getCurrentMemberSlug(slug);
    if (currentSlug && currentSlug !== slug) permanentRedirect(`/${rawLocale}/members/${currentSlug}${legislature ? `?legislature=${encodeURIComponent(legislature)}` : ""}`);
    notFound();
  }
  const { member, mandate, group, party, profilePhotoUrl, currentLogoUrl, careerSegments, source, legislatures, selectedLegislature, activity, votes, voteRecords, sponsoredBills, history, officialActivity, birth, cv, bodies } = data;
  const governmentRoles = await getGovernmentRolesForPerson(member.personId);
  const questionsView = await getQuestionsView({ memberSlug: slug });
  // The list the mandate was won on, where the AEP's open data covers that election (2016, 2020).
  const mandateElection = mandate && selectedLegislature && (mandate.chamber === "deputies" || mandate.chamber === "senate")
    ? await getMandateElection({ legislatureYear: selectedLegislature.label.slice(0, 4), chamber: mandate.chamber, constituency: mandate.constituency, partyName: party?.name })
    : undefined;
  const voteStats = mandate ? await getMemberVoteStats(member.id, mandate.chamber, mandate.startsOn, mandate.endsOn ?? undefined) : undefined;
  const asOf = activity?.lastActivityOn ?? new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  // Several roles can be active at once (a Prime Minister may also hold interim ministries): show the most senior.
  const currentGovernmentRole = governmentRoles
    .filter((role) => role.startsOn <= today && (!role.endsOn || role.endsOn >= today))
    .sort((a, b) => governmentRoleRank(a) - governmentRoleRank(b))[0];
  const identity = presentMemberIdentity(member, history, asOf);
  const career = presentMemberCareer(careerSegments, legislatures);
  const activityPresentation = presentMemberActivity({ for: activity?.votesFor ?? 0, against: activity?.votesAgainst ?? 0, abstention: activity?.abstentions ?? 0, presentNotVoting: activity?.presentNotVoting ?? 0, absent: activity?.absent, unknown: activity?.unknown }, locale);
  const expressed = activityPresentation.expressedVotes;
  const isActive = mandate?.status === "active";
  const statusLabel = mandate?.status === "active" ? (locale === "ro" ? "Activ" : "Active") : mandate?.status === "ended" ? (locale === "ro" ? "Încheiat" : "Ended") : (locale === "ro" ? "Necunoscut" : "Unknown");
  const votesById = new Map(voteRecords.map((vote) => [vote.id, vote]));
  const chronologicalVotes = votes.flatMap((item) => { const vote = votesById.get(item.voteId); return vote ? [{ item, vote }] : []; }).sort((a, b) => b.vote.heldOn.localeCompare(a.vote.heldOn));
  const importantVote = chronologicalVotes.find(({ vote }) => vote.prominence === "major" && (vote.classificationConfidence === "verified" || vote.classificationConfidence === "high"));
  const recent = importantVote ? [importantVote, ...chronologicalVotes.filter(({ item }) => item.id !== importantVote.item.id)].slice(0, 6) : chronologicalVotes.slice(0, 6);
  const shortParty = party?.shortName ?? (locale === "ro" ? "Fără partid declarat" : "No declared party");
  const contextualVote = fromVote && voteRecords.some((vote) => vote.id === fromVote) ? fromVote : undefined;
  const context = presentMemberProfileContext({ identity, chamberLabel: mandate ? chamberLabels[locale][mandate.chamber] : undefined, constituency: mandate?.constituency ? countyLabel(placeForDisplay(mandate.constituency) ?? mandate.constituency, locale) : undefined, partyLabel: shortParty, legislatureId: selectedLegislature?.id, legislatureLabel: selectedLegislature?.label, history, sponsoredBillCount: sponsoredBills.length, locale, asOf, currentMandate: isActive });
  const featured = recent[0] ? { ...recent[0], presentation: presentVote(recent[0].vote, { locale }) } : undefined;
  const institutionalRoles = [...context.roles, ...context.committees];
  const publicCareerEvents: PublicCareerEvent[] = [
    ...history.filter((row) => row.type !== "group" && row.type !== "relation").map((row) => ({
      id: row.id,
      category: row.type === "committee" ? "committee" as const : row.type === "party" ? "party" as const : "parliament" as const,
      title: row.type === "mandate" ? (locale === "ro" ? "Mandat parlamentar" : "Parliamentary mandate") : row.label,
      details: row.details,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      sourceUrl: row.sourceUrl
    })),
    ...governmentRoles.map((role) => ({
      id: `career-${role.id}`,
      category: "government" as const,
      title: role.title,
      details: `${role.incarnation?.name ?? role.ministry?.name ?? (locale === "ro" ? "Guvernul României" : "Government of Romania")} · ${locale === "ro" ? "Guvernul" : "Government"} ${role.government.name}`,
      startsOn: role.startsOn,
      endsOn: role.endsOn,
      sourceUrl: role.sourceUrl
    }))
  ];

  const ro = locale === "ro";
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
  const showAttendance = Boolean(voteStats && voteStats.eligible >= 10);
  const showAgreement = Boolean(voteStats && voteStats.agreementVotes >= 10);
  const partyMark = party ? { shortName: party.shortName, color: party.color ?? group?.color ?? "#64748b", logoAssetId: party.logoAssetId } : undefined;
  const choiceCounts = { for: activity?.votesFor ?? 0, against: activity?.votesAgainst ?? 0, abstain: activity?.abstentions ?? 0, present: activity?.presentNotVoting ?? 0 };

  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <EngagementTracker entityType="member" entityId={member.id} locale={locale}/>
    <nav aria-label={ro ? "Unde ești" : "Breadcrumb"} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <ol className="flex min-w-0 items-center gap-2 text-muted">
        <li><Link href={`/${locale}`} className="hover:text-brand">{ro ? "Acasă" : "Home"}</Link></li><li aria-hidden="true">›</li>
        <li><Link href={`/${locale}/members`} className="hover:text-brand">{ro ? "Parlamentari" : "Members"}</Link></li><li aria-hidden="true">›</li>
        <li aria-current="page" className="max-w-[28ch] truncate text-ink-soft sm:max-w-[48ch]">{identity.name}</li>
      </ol>
      <div className="flex items-center gap-2">
        {contextualVote ? <Link href={`/${locale}/votes/${contextualVote}`} className="rounded-full border border-brand px-3.5 py-1.5 font-semibold text-brand hover:bg-brand-soft">← {ro ? "Înapoi la vot" : "Back to vote"}</Link> : null}
        <ShareButton href={`/${locale}/members/${member.slug}`} title={identity.name} label={ro ? "Distribuie" : "Share"} copiedLabel={ro ? "Link copiat" : "Link copied"} errorLabel={ro ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink-soft hover:border-line-strong"/>
        {source?.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand px-3.5 py-1.5 font-semibold text-brand hover:bg-brand-soft"><ExternalLink size={15} aria-hidden="true"/>{ro ? "Profil oficial" : "Official profile"}</a> : null}
      </div>
    </nav>

    <header className="mt-6 flex flex-col gap-6 rounded-card border border-line bg-surface p-5 sm:flex-row sm:items-start sm:p-7">
      <div className="shrink-0"><PersonAvatar name={identity.name} photoUrl={profilePhotoUrl} size={132} shape="portrait" /></div>
      <div className="min-w-0 flex-1">
        {identity.office || currentGovernmentRole ? <p className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">{identity.office ?? currentGovernmentRole?.title}</p> : null}
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-ink [overflow-wrap:anywhere] lg:text-5xl">{identity.name}</h1>
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-4 text-sm">
          <IdentityFact label={ro ? "Partid" : "Party"}>{party && partyMark ? <Link href={`/${locale}/parties/${party.slug}`} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-brand"><PartyMark party={partyMark} size={24}/>{shortParty}</Link> : <span className="font-semibold text-muted">{shortParty}</span>}</IdentityFact>
          {group && group.partyId !== party?.id ? <IdentityFact label={ro ? "Grup parlamentar" : "Parliamentary group"}><span className="inline-flex items-center gap-2 font-semibold text-ink"><PartyMark party={{ shortName: group.shortName, color: group.color ?? "#64748b" }} size={24}/>{group.shortName}</span></IdentityFact> : null}
          {mandate ? <IdentityFact label={ro ? "Cameră" : "Chamber"}><span className="inline-flex items-center gap-2 font-semibold text-ink"><Building2 size={18} aria-hidden="true" className="text-muted"/>{chamberLabels[locale][mandate.chamber]}</span></IdentityFact> : null}
          {mandate?.constituency ? <IdentityFact label={ro ? "Circumscripție" : "Constituency"}><span className="inline-flex items-center gap-2 font-semibold text-ink"><MapPin size={18} aria-hidden="true" className="text-muted"/>{countyLabel(placeForDisplay(mandate.constituency) ?? mandate.constituency, locale)}</span></IdentityFact> : null}
          {birth ? <IdentityFact label={ro ? "Data nașterii" : "Date of birth"}><span className="inline-flex items-center gap-2 font-semibold text-ink"><time dateTime={birth.date}>{formatDate(birth.date, locale)}</time><a href={birth.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand underline" aria-label={ro ? "Sursa datei nașterii: profilul oficial" : "Source of the date of birth: the official profile"}>{ro ? "sursă" : "source"}</a></span></IdentityFact> : null}
          {cv ? <IdentityFact label={ro ? "Curriculum vitae" : "Curriculum vitae"}><a href={cv.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:text-brand-strong"><ExternalLink size={15} aria-hidden="true"/>{ro ? "CV depus la Cameră" : "CV filed with the Chamber"}{cv.updatedOn ? <span className="font-normal text-muted">· {ro ? "actualizat" : "updated"} {formatDate(cv.updatedOn, locale)}</span> : null}</a></IdentityFact> : null}
          <IdentityFact label={ro ? "Statut" : "Status"}><span className={`inline-flex items-center gap-2 font-semibold ${isActive ? "text-vote-for" : "text-muted"}`}><span aria-hidden="true" className={`size-2.5 rounded-full ${isActive ? "bg-vote-for-fill" : "bg-vote-present-fill"}`}/>{statusLabel}</span></IdentityFact>
          {currentGovernmentRole ? <IdentityFact label={ro ? "Rol guvernamental" : "Government role"}><span className="inline-flex max-w-[260px] items-center gap-2 font-semibold text-ink"><Landmark size={18} aria-hidden="true" className="text-muted"/>{currentGovernmentRole.title}</span></IdentityFact> : null}
        </dl>
        <p className="mt-5 max-w-3xl text-base leading-7 text-ink-soft">{context.summary}</p>
      </div>
    </header>

    <MemberCareerTimeline career={career} locale={locale} memberSlug={member.slug} legislatures={legislatures} selectedLegislatureId={selectedLegislature?.id}/>
    <PublicCareerTimeline events={publicCareerEvents} locale={locale}/>

    <div className="mt-8 flex flex-wrap items-center gap-2" aria-label={ro ? "Legislatura" : "Legislature"}>
      <span className="mr-1 text-sm font-semibold text-ink-soft">{ro ? "Legislatura" : "Legislature"}</span>
      {legislatures.map((item) => <Link key={item.id} href={`/${locale}/members/${member.slug}?legislature=${item.id}`} aria-current={item.id === selectedLegislature?.id ? "true" : undefined} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${item.id === selectedLegislature?.id ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-line-strong"}`}>{item.label.replace("-", "–")}</Link>)}
    </div>

    <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-6">
        <section className="rounded-card border border-line bg-surface p-6" aria-label={ro ? "Activitatea în această legislatură" : "Activity in this legislature"}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-display text-2xl font-bold text-ink">{ro ? "Activitatea în această legislatură" : "Activity in this legislature"}</h2><span className="text-xs text-muted">{ro ? "Date la" : "Data as of"} {formatDate(asOf, locale)}</span></div>
          <div className="mt-5 flex items-end gap-3"><p className="font-display text-5xl font-bold leading-none text-ink"><CountUp value={expressed} /></p><p className="pb-1 text-sm text-muted">{ro ? "voturi exprimate" : "votes cast"}</p></div>
          <div className="mt-4"><SplitBar counts={choiceCounts} locale={locale} height="h-3" /></div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {(["for", "against", "abstain", "present"] as const).map((kind) => <div key={kind} className="flex flex-col-reverse"><dt className="text-xs text-muted">{VOTE_LABEL[locale][kind]}</dt><dd className={`flex items-center gap-1.5 font-display text-2xl font-bold ${VOTE_STYLE[kind].text}`}><VoteDot kind={kind} size={20} locale={locale}/>{choiceCounts[kind]}</dd></div>)}
          </dl>
          {(showAttendance || showAgreement) && voteStats ? (
            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
              {showAttendance ? <div><p className="text-sm font-semibold text-ink-soft">{ro ? "Prezență" : "Attendance"}</p><p className="mt-1 font-display text-3xl font-bold text-ink">{pct(voteStats.present, voteStats.eligible)}%</p><p className="mt-1 text-xs leading-5 text-muted">{ro ? `pe lista nominală la ${voteStats.present} din ${voteStats.eligible} voturi nominale din mandat` : `on the name list in ${voteStats.present} of ${voteStats.eligible} nominal votes of the mandate`}</p></div> : null}
              {showAgreement ? <div><p className="text-sm font-semibold text-ink-soft">{ro ? "Vot ca restul grupului" : "Voting with the group"}</p><p className="mt-1 font-display text-3xl font-bold text-ink">{pct(voteStats.agreementMatches, voteStats.agreementVotes)}%</p><p className="mt-1 text-xs leading-5 text-muted">{ro ? `${voteStats.agreementMatches} din ${voteStats.agreementVotes} voturi în care grupul avea o majoritate clară` : `${voteStats.agreementMatches} of ${voteStats.agreementVotes} votes in which the group had a clear majority`}</p></div> : null}
              <p className="text-xs leading-5 text-muted sm:col-span-2">{ro ? "Cifre despre o singură persoană, calculate din listele nominale oficiale; nu sunt clasamente." : "Figures about one person, computed from the official name lists; they are not rankings."} <Link href={`/${locale}/methodology#cum-calculam`} className="font-semibold text-brand hover:text-brand-strong">{ro ? "Cum le calculăm" : "How we compute them"}</Link></p>
            </div>
          ) : null}
          <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted">{activityPresentation.coveredRecords} {activityPresentation.label}. {activity?.majorVoteRecords ? `${activity.majorVoteRecords} ${ro ? "decizii importante" : "major decisions"}. ` : ""}{ro ? "Cifrele sunt calculate din voturile nominale importate." : "The figures are computed from the nominal votes imported."}</p>
        </section>

        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="font-display text-2xl font-bold text-ink">{ro ? "Comisii și roluri" : "Committees and roles"}</h2>
          <div className="mt-3 divide-y divide-line">{institutionalRoles.length ? institutionalRoles.map((row) => <div key={row.id} className="py-3"><div className="flex items-start justify-between gap-3"><strong className="text-ink">{row.label}</strong>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer" aria-label={ro ? "Sursă oficială" : "Official source"} className="text-brand"><ExternalLink size={16}/></a> : null}</div><p className="mt-1 text-xs text-muted">{formatDate(row.startsOn, locale, row.startsOnPrecision)} — {row.endsOn ? formatDate(row.endsOn, locale, row.endsOnPrecision) : (ro ? "prezent" : "present")}</p>{row.details ? <p className="mt-1 text-sm text-muted">{row.details}</p> : null}</div>) : <p className="py-3 text-sm leading-6 text-muted">{ro ? "Nu sunt încă importate apartenențe la comisii sau roluri pentru legislatura selectată." : "No committee memberships or roles are imported for the selected legislature yet."}</p>}</div>
        </section>
      </div>

      <div className="min-w-0 space-y-6">
        <OfficialActivityPanel items={officialActivity} locale={locale} />
        {mandateElection ? (
          <section className="rounded-card border border-line bg-surface p-6" aria-labelledby="mandate-election">
            <h2 id="mandate-election" className="font-display text-2xl font-bold text-ink">{ro ? "Cum a ajuns aici" : "How they got the seat"}</h2>
            <p className="mt-3 text-sm leading-6 text-ink-soft">{ro
              ? `Mandat obținut pe lista ${officialCase(mandateElection.listName)} în circumscripția ${officialCase(mandateElection.circumscription)}, la alegerile din ${mandateElection.election.heldOn.slice(0, 4)}: lista a avut ${mandateElection.votes.toLocaleString("ro-RO")} de voturi (${(mandateElection.share * 100).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}% în circumscripție)${mandateElection.election.mandatesKnown ? ` și ${mandateElection.mandates} ${mandateElection.mandates === 1 ? "mandat" : "mandate"}` : ""}.`
              : `Seat won on the ${officialCase(mandateElection.listName)} list in the ${officialCase(mandateElection.circumscription)} circumscription at the ${mandateElection.election.heldOn.slice(0, 4)} elections: the list had ${mandateElection.votes.toLocaleString("en-GB")} votes (${(mandateElection.share * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}% in the circumscription)${mandateElection.election.mandatesKnown ? ` and ${mandateElection.mandates} ${mandateElection.mandates === 1 ? "mandate" : "mandates"}` : ""}.`}</p>
            <Link href={`/${locale}/elections?election=${mandateElection.election.id}&chamber=${mandateElection.chamber}&circ=${mandateElection.circumscriptionNumber}`} className="mt-2 inline-flex text-sm font-bold text-brand hover:text-brand-strong">{ro ? "Rezultatele circumscripției →" : "The circumscription's results →"}</Link>
            <Link href={`/${locale}/elections/map?election=${mandateElection.election.id}&chamber=${mandateElection.chamber}&level=communes&circ=${mandateElection.circumscriptionNumber}`} className="ml-4 mt-2 inline-flex text-sm font-bold text-brand hover:text-brand-strong">{ro ? "Pe hartă →" : "On the map →"}</Link>
          </section>
        ) : null}
        <QuestionsSummary view={questionsView} locale={locale} filter={`member=${encodeURIComponent(slug)}`} as="asker" />
        <MemberBodiesPanel bodies={bodies} locale={locale} />
        {governmentRoles.length ? (
          <section className="rounded-card border border-line bg-surface p-6">
            <h2 className="font-display text-2xl font-bold text-ink">{ro ? "Roluri în Guvern" : "Government roles"}</h2>
            <div className="mt-3 divide-y divide-line">{governmentRoles.map((role) => <article key={role.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2">{role.ministry ? <Link href={`/${locale}/ministries/${role.ministry.slug}`} className="font-display text-lg font-bold text-ink hover:text-brand">{role.incarnation?.name ?? role.ministry.name}</Link> : <strong className="font-display text-lg text-ink">{role.title}</strong>}{role.interim ? <span className="rounded-full bg-vote-abstain-bg px-2.5 py-0.5 text-xs font-semibold text-vote-abstain">{ro ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-1 text-xs leading-5 text-muted">{role.title} · <Link href={`/${locale}/governments/${role.government.slug}`} className="font-semibold text-brand">{ro ? "Guvernul" : "Government"} {role.government.name}</Link><br/>{formatDate(role.startsOn, locale)} — {role.endsOn ? formatDate(role.endsOn, locale) : (ro ? "prezent" : "present")}</p>{role.sourceUrl ? <a href={role.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">{ro ? "Sursă oficială" : "Official source"}<ExternalLink size={11}/></a> : null}</article>)}</div>
          </section>
        ) : null}

        <section className="rounded-card border border-line bg-surface p-6">
          <SectionHeader title={ro ? "Cum a votat recent" : "Recent votes"} href={`/${locale}/votes`} linkLabel={ro ? "Toate voturile" : "All votes"} />
          {featured ? (
            <Link href={`/${locale}/votes/${featured.vote.id}`} className="mt-4 block rounded-card border border-line bg-wash/60 p-4 transition hover:border-line-strong">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span className="inline-flex items-center gap-2"><CalendarDays size={15} aria-hidden="true"/>{formatDate(featured.vote.heldOn, locale)} · {voteChamberLabels[locale][featured.vote.chamber]}</span><ChoiceBadge value={featured.item.choice} locale={locale}/></div>
              <h3 className="mt-3 font-display text-xl font-bold leading-tight text-ink">{featured.presentation.heading}</h3>
              {featured.presentation.officialTitle !== featured.presentation.heading ? <p lang="ro" className="mt-2 line-clamp-3 text-sm leading-5 text-muted">{featured.presentation.officialTitle}</p> : null}
              <span className="mt-3 inline-block text-sm font-semibold text-brand">{ro ? "Vezi votul complet →" : "View full vote →"}</span>
            </Link>
          ) : <p className="mt-4 rounded-card border border-dashed border-line-strong p-4 text-sm text-muted">{ro ? "Nu există voturi nominale importate pentru perioada selectată." : "No nominal votes are imported for the selected period."}</p>}
          {recent.length > 1 ? <ul className="mt-4 divide-y divide-line">{recent.slice(1).map(({ item, vote }) => <li key={item.id}><Link href={`/${locale}/votes/${vote.id}`} className="grid gap-2 py-3 text-sm hover:bg-wash/60 sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center"><span className="text-xs text-muted">{formatDate(vote.heldOn, locale)}</span><strong className="line-clamp-2 font-semibold text-ink">{presentVote(vote, { locale }).heading}</strong><ChoiceBadge value={item.choice} locale={locale}/></Link></li>)}</ul> : null}
        </section>

        <section className="rounded-card border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-3"><h2 className="font-display text-2xl font-bold text-ink">{ro ? "Inițiative legislative" : "Legislative initiatives"}</h2><span className="font-display text-2xl font-bold text-ink">{sponsoredBills.length}</span></div>
          <div className="mt-3 divide-y divide-line">{sponsoredBills.length ? sponsoredBills.slice(0, 5).map((bill) => <Link key={bill.id} href={`/${locale}/bills/${bill.slug}`} className="grid gap-1 py-3 hover:bg-wash/60 sm:grid-cols-[120px_minmax(0,1fr)]"><strong className="text-ink">{bill.identifiers.deputies ?? bill.identifiers.senate ?? bill.id}</strong><span className="line-clamp-2 text-sm leading-5 text-muted">{bill.title}</span></Link>) : <p className="py-3 text-sm leading-6 text-muted">{ro ? "Nu sunt încă inițiative legislative conectate la acest profil pentru legislatura selectată." : "No legislative initiatives are linked to this profile for the selected legislature yet."}</p>}</div>
        </section>
      </div>
    </div>
  </main>;
}

function IdentityFact({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex min-w-0 flex-col-reverse"><dt className="mt-0.5 text-xs text-muted">{label}</dt><dd>{children}</dd></div>; }
function ChoiceBadge({ value, locale }: { value: string; locale: AppLocale }) { const kind = voteKindOfChoice(value); return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${VOTE_STYLE[kind].badge}`}><VoteDot kind={kind} size={14} locale={locale}/>{VOTE_LABEL[locale][kind]}</span>; }

function governmentRoleRank(role: { title: string; interim?: boolean }): number {
  const title = role.title.toLowerCase();
  if (/prim-ministru|prim ministru/.test(title) && !/viceprim/.test(title)) return 0;
  if (/viceprim/.test(title)) return role.interim ? 3 : 1;
  return role.interim || /interimar/.test(title) ? 4 : 2;
}
