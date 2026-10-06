import Link from "next/link";

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Building2, CalendarDays, ExternalLink, FileText, Landmark, MapPin, UserRound, UsersRound } from "lucide-react";
import { chamberLabels, formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { getCurrentMemberSlug, getMemberPageData } from "@/lib/data";
import { isLocale, type AppLocale } from "@/lib/i18n";
import { presentMemberActivity, presentMemberCareer, presentMemberIdentity, presentMemberProfileContext, presentVote } from "@/lib/public-presentation";
import { placeForDisplay } from "@/lib/presentation";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { MemberCareerTimeline } from "../../_components/MemberCareerTimeline";
import { ImageWithFallback } from "../../_components/ImageWithFallback";
import { DetailPageHeader } from "../../_components/DetailPageHeader";
import { getGovernmentRolesForPerson } from "@/lib/ministry-data";
import { PublicCareerTimeline, type PublicCareerEvent } from "../../_components/PublicCareerTimeline";
import { OfficialActivityPanel } from "../../_components/OfficialActivityPanel";

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
  const { member, mandate, group, party, profilePhotoUrl, currentLogoUrl, careerSegments, source, legislatures, selectedLegislature, activity, votes, voteRecords, sponsoredBills, history, officialActivity } = data;
  const governmentRoles = await getGovernmentRolesForPerson(member.personId);
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
  const context = presentMemberProfileContext({ identity, chamberLabel: mandate ? chamberLabels[locale][mandate.chamber] : undefined, constituency: placeForDisplay(mandate?.constituency), partyLabel: shortParty, legislatureId: selectedLegislature?.id, legislatureLabel: selectedLegislature?.label, history, sponsoredBillCount: sponsoredBills.length, locale, asOf, currentMandate: isActive });
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

  return <main className="mx-auto min-h-[calc(100vh-76px)] max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
    <EngagementTracker entityType="member" entityId={member.id} locale={locale}/>
    <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4b608a]"><span><Link href={`/${locale}`}>{locale === "ro" ? "Acasă" : "Home"}</Link>　›　<Link href={`/${locale}/members`}>{locale === "ro" ? "Parlamentari" : "Members"}</Link>　›　{identity.name}</span>{contextualVote ? <Link href={`/${locale}/votes/${contextualVote}`} className="font-semibold text-[#075fc6]">← {locale === "ro" ? "Înapoi la vot" : "Back to vote"}</Link> : null}</nav>

    <DetailPageHeader className="pb-1" media={<div className="relative h-[200px] w-[160px] overflow-hidden rounded-md border border-slate-300 bg-[#e9eef5] lg:h-[250px] lg:w-[210px]"><ImageWithFallback src={profilePhotoUrl} alt={identity.name} className="h-full w-full object-cover"><span className="grid h-full place-items-center font-serif text-4xl font-bold text-[#4b608a]">{initials(identity.name)}</span></ImageWithFallback>{currentLogoUrl ? <img src={currentLogoUrl} alt="" className="absolute bottom-2 right-2 h-11 w-11 border border-slate-300 bg-white object-contain p-1"/> : null}</div>} title={identity.name} subtitle={identity.office || currentGovernmentRole ? <strong className="block text-xl leading-tight text-[#061a47] lg:text-2xl">{identity.office ?? currentGovernmentRole?.title}</strong> : undefined}>
        <div className="mt-5 flex flex-wrap items-stretch gap-y-3 text-sm text-[#4b608a]">
          <IdentityFact label={locale === "ro" ? "Partid" : "Party"}>{party ? <Link href={`/${locale}/parties/${party.slug}`} className="flex items-center gap-2 font-semibold text-[#061a47]"><i className="h-4 w-4 rounded-full" style={{ background: party.color ?? group?.color ?? "#8996a9" }}/>{shortParty}</Link> : <span className="flex items-center gap-2 font-semibold text-[#061a47]"><i className="h-4 w-4 rounded-full bg-slate-400"/>{shortParty}</span>}</IdentityFact>
          {group && group.partyId !== party?.id ? <IdentityFact label={locale === "ro" ? "Grup parlamentar" : "Parliamentary group"}><span className="flex items-center gap-2 font-semibold text-[#061a47]"><i className="h-4 w-4 rounded-full" style={{ background: group.color ?? "#8996a9" }}/>{group.shortName}</span></IdentityFact> : null}
          {mandate ? <IdentityFact label={locale === "ro" ? "Cameră" : "Chamber"}><span className="flex items-center gap-2 font-semibold text-[#061a47]"><Building2 size={20}/>{chamberLabels[locale][mandate.chamber]}</span></IdentityFact> : null}
          {mandate?.constituency ? <IdentityFact label={locale === "ro" ? "Circumscripție" : "Constituency"}><span className="flex items-center gap-2 font-semibold text-[#061a47]"><MapPin size={20}/>{placeForDisplay(mandate.constituency)}</span></IdentityFact> : null}
          <IdentityFact label={locale === "ro" ? "Statut" : "Status"}><span className={`flex items-center gap-2 font-semibold ${isActive ? "text-emerald-700" : "text-[#4b608a]"}`}><i className={`h-4 w-4 rounded-full ${isActive ? "bg-emerald-600" : "bg-slate-400"}`}/>{statusLabel}</span></IdentityFact>
          {currentGovernmentRole ? <IdentityFact label={locale === "ro" ? "Rol guvernamental" : "Government role"}><span className="flex max-w-[260px] items-center gap-2 font-semibold text-[#061a47]"><Landmark size={20}/>{currentGovernmentRole.title}</span></IdentityFact> : null}
        </div>
        <p className="mt-5 max-w-4xl font-serif text-lg leading-7 text-[#4b608a]">{locale === "ro" ? `Activitate verificată în legislatura ${selectedLegislature?.label ?? "curentă"}, pe baza voturilor și inițiativelor conectate la sursele oficiale.` : `Verified activity in the ${selectedLegislature?.label ?? "current"} legislature, based on votes and bills linked to official sources.`}</p>
    </DetailPageHeader>

    <MemberCareerTimeline career={career} locale={locale}/>
    <PublicCareerTimeline events={publicCareerEvents} locale={locale}/>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-slate-300 py-3">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-[#4b608a]">{locale === "ro" ? "Legislatură" : "Legislature"}</span>{legislatures.map((item) => <Link key={item.id} href={`/${locale}/members/${member.slug}?legislature=${item.id}`} className={`border px-3 py-1.5 text-xs font-semibold ${item.id === selectedLegislature?.id ? "border-[#061a47] bg-[#061a47] text-white" : "border-slate-300 bg-white text-[#4b608a] hover:border-[#075fc6]"}`}>{item.label}</Link>)}</div>
      {source?.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-semibold text-[#075fc6]"><ExternalLink size={17}/>{locale === "ro" ? "Profil oficial" : "Official profile"}</a> : null}
    </div>

    <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-5">
        <section className="border border-slate-300 bg-white p-5 md:p-6">
          <ContextBlock icon={<FileText size={28}/>} title={locale === "ro" ? "Pe scurt" : "At a glance"}><p>{context.summary}</p></ContextBlock>
          <ContextBlock icon={<UsersRound size={28}/>} title={locale === "ro" ? "De ce contează?" : "Why does it matter?"}><p>{context.significance}</p></ContextBlock>
        </section>

        <section className="border border-slate-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#eef6fd] px-5 py-3"><h2 className="flex items-center gap-3 font-serif text-2xl font-semibold text-[#061a47]"><Landmark size={24}/>{locale === "ro" ? "Activitatea în această legislatură" : "Activity in this legislature"}</h2><span className="text-xs text-[#4b608a]">{locale === "ro" ? "Date la" : "Data as of"} {formatDate(asOf, locale)}</span></div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2"><ProfileStat icon={<FileText/>} value={expressed} label={locale === "ro" ? "voturi exprimate" : "votes cast"}/><ProfileStat icon={<UserRound/>} value={activity?.votesFor ?? 0} label={locale === "ro" ? "voturi pentru" : "votes for"}/><ProfileStat icon={<FileText/>} value={activity?.proposals ?? sponsoredBills.length} label={locale === "ro" ? "inițiative" : "initiatives"}/><ProfileStat icon={<Building2/>} value={context.committees.length} label={locale === "ro" ? "comisii documentate" : "documented committees"}/></div>
          <div className="grid grid-cols-3 border-t border-slate-200 bg-white text-center text-xs text-[#4b608a]"><ActivityBucket value={activity?.majorVoteRecords ?? 0} label={locale === "ro" ? "decizii importante" : "major decisions"}/><ActivityBucket value={activity?.standardVoteRecords ?? 0} label={locale === "ro" ? "voturi intermediare" : "intermediate votes"}/><ActivityBucket value={activity?.routineVoteRecords ?? 0} label={locale === "ro" ? "voturi procedurale" : "procedural votes"}/></div>
          <p className="border-t border-slate-200 bg-[#f8fbff] px-5 py-3 text-xs leading-5 text-[#4b608a]">{activityPresentation.coveredRecords} {activityPresentation.label}. {locale === "ro" ? "Prezența nu este estimată fără un numitor verificat al voturilor eligibile." : "Attendance is not estimated without a verified eligible-vote denominator."}</p>
        </section>

        <section className="border border-slate-300 bg-white p-5"><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Comisii și roluri" : "Committees and roles"}</h2><div className="mt-3 divide-y divide-slate-200">{institutionalRoles.length ? institutionalRoles.map((row) => <div key={row.id} className="py-3"><div className="flex items-start justify-between gap-3"><strong className="text-[#061a47]">{row.label}</strong>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer" aria-label={locale === "ro" ? "Sursă oficială" : "Official source"} className="text-[#075fc6]"><ExternalLink size={16}/></a> : null}</div><p className="mt-1 text-xs text-[#4b608a]">{formatDate(row.startsOn, locale, row.startsOnPrecision)} — {row.endsOn ? formatDate(row.endsOn, locale, row.endsOnPrecision) : (locale === "ro" ? "prezent" : "present")}</p>{row.details ? <p className="mt-1 text-sm text-[#4b608a]">{row.details}</p> : null}</div>) : <p className="py-3 text-sm leading-6 text-[#4b608a]">{locale === "ro" ? "Nu sunt încă importate apartenențe la comisii sau roluri pentru legislatura selectată." : "No committee memberships or roles are imported for the selected legislature yet."}</p>}</div></section>
      </div>

      <div className="min-w-0 space-y-5">
        <OfficialActivityPanel items={officialActivity} locale={locale} />
        {governmentRoles.length ? <section className="border border-slate-300 bg-white p-5"><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Roluri în Guvern" : "Government roles"}</h2><div className="mt-3 divide-y divide-slate-200">{governmentRoles.map((role) => <article key={role.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2">{role.ministry ? <Link href={`/${locale}/ministries/${role.ministry.slug}`} className="font-serif text-lg font-semibold text-[#061a47] hover:text-[#075fc6]">{role.incarnation?.name ?? role.ministry.name}</Link> : <strong className="font-serif text-lg text-[#061a47]">{role.title}</strong>}{role.interim ? <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-900">{locale === "ro" ? "Interimar" : "Interim"}</span> : null}</div><p className="mt-1 text-xs leading-5 text-[#4b608a]">{role.title} · <Link href={`/${locale}/governments/${role.government.slug}`} className="font-semibold text-[#075fc6]">{locale === "ro" ? "Guvernul" : "Government"} {role.government.name}</Link><br/>{formatDate(role.startsOn, locale)} — {role.endsOn ? formatDate(role.endsOn, locale) : (locale === "ro" ? "prezent" : "present")}</p>{role.sourceUrl ? <a href={role.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#075fc6]">{locale === "ro" ? "Sursă oficială" : "Official source"}<ExternalLink size={11}/></a> : null}</article>)}</div></section> : null}
        <section className="border border-slate-300 bg-white p-5 md:p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Cum a votat recent" : "Recent votes"}</h2><Link href={`/${locale}/votes`} className="text-sm font-semibold text-[#075fc6]">{locale === "ro" ? "Vezi toate →" : "See all →"}</Link></div>
          {featured ? <Link href={`/${locale}/votes/${featured.vote.id}`} className="mt-4 block border border-[#d8e6f5] bg-[#f5f9fd] p-4 transition hover:border-[#075fc6]"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4b608a]"><span className="flex items-center gap-2"><CalendarDays size={15}/>{formatDate(featured.vote.heldOn, locale)} · {voteChamberLabels[locale][featured.vote.chamber]}</span><ChoiceBadge value={featured.item.choice} locale={locale}/></div><h3 className="mt-3 font-serif text-2xl font-semibold leading-tight text-[#061a47]">{featured.presentation.heading}</h3>{featured.presentation.officialTitle !== featured.presentation.heading ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-[#4b608a]">{featured.presentation.officialTitle}</p> : null}<span className="mt-4 inline-block text-sm font-semibold text-[#075fc6]">{locale === "ro" ? "Vezi votul complet →" : "View full vote →"}</span></Link> : <p className="mt-4 border border-slate-200 bg-[#f8fbff] p-4 text-sm text-[#4b608a]">{locale === "ro" ? "Nu există voturi nominale importate pentru perioada selectată." : "No nominal votes are imported for the selected period."}</p>}
          {recent.length > 1 ? <div className="mt-5"><h3 className="border-b border-slate-300 pb-2 font-serif text-lg font-semibold text-[#061a47]">{locale === "ro" ? "Alte voturi recente" : "Other recent votes"}</h3><div className="divide-y divide-slate-200">{recent.slice(1).map(({ item, vote }) => <Link key={item.id} href={`/${locale}/votes/${vote.id}`} className="grid gap-2 py-3 text-sm hover:bg-[#fbfdff] sm:grid-cols-[92px_minmax(0,1fr)_110px]"><span className="text-xs text-[#4b608a]">{formatDate(vote.heldOn, locale)}</span><strong className="line-clamp-2 text-[#061a47]">{presentVote(vote, { locale }).heading}</strong><ChoiceBadge value={item.choice} locale={locale}/></Link>)}</div></div> : null}
        </section>

        <section className="border border-slate-300 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Inițiative legislative" : "Legislative initiatives"}</h2><span className="font-serif text-2xl font-semibold text-[#061a47]">{sponsoredBills.length}</span></div><div className="mt-3 divide-y divide-slate-200">{sponsoredBills.length ? sponsoredBills.slice(0, 5).map((bill) => <Link key={bill.id} href={`/${locale}/bills/${bill.slug}`} className="grid gap-1 py-3 hover:bg-[#fbfdff] sm:grid-cols-[120px_minmax(0,1fr)]"><strong className="text-[#061a47]">{bill.identifiers.deputies ?? bill.identifiers.senate ?? bill.id}</strong><span className="line-clamp-2 text-sm leading-5 text-[#4b608a]">{bill.title}</span></Link>) : <p className="py-3 text-sm leading-6 text-[#4b608a]">{locale === "ro" ? "Nu sunt încă inițiative legislative conectate la acest profil pentru legislatura selectată." : "No legislative initiatives are linked to this profile for the selected legislature yet."}</p>}</div></section>
      </div>
    </div>
  </main>;
}

function IdentityFact({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-[150px] border-l border-slate-300 px-5 first:border-l-0 first:pl-0"><div>{children}</div><small className="mt-1 block text-xs text-[#4b608a]">{label}</small></div>; }
function ActivityBucket({ value, label }: { value: number; label: string }) { return <div className="border-r border-slate-200 px-2 py-3 last:border-r-0"><strong className="block font-serif text-xl text-[#061a47]">{value}</strong><span>{label}</span></div>; }
function ProfileStat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) { return <div className="border-l border-slate-200 p-3 first:border-l-0 md:p-4"><div className="flex items-center gap-2 text-[#061a47] md:gap-3"><span>{icon}</span><strong className="font-serif text-2xl md:text-3xl">{value}</strong></div><p className="mt-1 text-xs text-[#4b608a]">{label}</p></div>; }
function ContextBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-4 border-t border-slate-200 py-5 first:border-t-0 first:pt-0 last:pb-0"><span className="text-[#061a47]">{icon}</span><div><h2 className="font-serif text-2xl font-semibold text-[#061a47]">{title}</h2><div className="mt-2 text-sm leading-6 text-[#4b608a]">{children}</div></div></div>; }
function ChoiceBadge({ value, locale }: { value: string; locale: AppLocale }) { const tone = value === "for" ? "bg-emerald-100 text-emerald-800" : value === "against" ? "bg-rose-100 text-rose-700" : value === "abstention" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"; return <span className={`w-fit px-2 py-1 text-xs font-semibold ${tone}`}>{choice(value, locale)}</span>; }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function choice(value: string, locale: AppLocale) { const ro: Record<string, string> = { for: "Pentru", against: "Contra", abstention: "Abținere", present_not_voting: "Nu a votat", absent: "Absent" }; return locale === "ro" ? (ro[value] ?? value) : value.replaceAll("_", " "); }

function governmentRoleRank(role: { title: string; interim?: boolean }): number {
  const title = role.title.toLowerCase();
  if (/prim-ministru|prim ministru/.test(title) && !/viceprim/.test(title)) return 0;
  if (/viceprim/.test(title)) return role.interim ? 3 : 1;
  return role.interim || /interimar/.test(title) ? 4 : 2;
}
