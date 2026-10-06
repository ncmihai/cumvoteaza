import { VoteExplanation } from "@/app/[locale]/_components/VoteExplanation";
import { clip } from "@/lib/page-metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import { ArrowRight, Building2, CalendarDays, FileText } from "lucide-react";
import { getVotePageData } from "@/lib/data";
import { getDocumentConfidenceMap } from "@/lib/document-confidence";
import { getHotCount } from "@/lib/explorer-data";
import { getGroupMarks } from "@/lib/party-marks";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { presentVote } from "@/lib/public-presentation";
import { confidenceForSource } from "@/lib/source-confidence";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { GovernmentContextPanel } from "../../_components/GovernmentContextPanel";
import { HotButton } from "../../_components/HotButton";
import { SourceBadge } from "../../_components/SourceBadge";
import { ShareButton } from "../../_components/ShareButton";
import { VoteBillDossierPanel } from "../../_components/VoteBillDossierPanel";
import { JointVoteBreakdown } from "../../_components/JointVoteBreakdown";
import { VoteChamberExplorer } from "../../_components/VoteChamberExplorer";
import { CountUp } from "../../_components/ui/CountUp";
import { OutcomeBadge } from "../../_components/ui/OutcomeBadge";
import { SplitBar, countsOfTotals } from "../../_components/ui/SplitBar";
import { VoteDot } from "../../_components/ui/VoteIcon";
import { VOTE_LABEL, VOTE_STYLE, type VoteKind } from "../../_components/ui/vote-meaning";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const data = await getVotePageData(id);
  if (!data) return { title: locale === "ro" ? "Vot negăsit" : "Vote not found" };
  const presentation = presentVote(data.vote, { locale, bill: data.bill, source: data.source });
  return { title: `${clip(presentation.heading)} · ${formatDate(data.vote.heldOn, locale)}` };
}

export default async function VotePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const labels = votePageLabels[locale];
  const data = await getVotePageData(id);
  if (!data) notFound();
  const {
    vote,
    bill,
    billProcedureSteps,
    billDocuments,
    billSponsorContexts,
    source,
    governmentContext,
    groupContexts,
    groups,
    members,
    groupTotals,
    individualVotes,
    seatVotes,
    seatConstituencies,
    seatPhotoUrls
  } = data;
  const [hotCount, billDocumentConfidence] = await Promise.all([
    getHotCount("vote", vote.id),
    getDocumentConfidenceMap(billDocuments.map((document) => document.id))
  ]);
  const sponsorNames = uniqueDisplayNames(
    billSponsorContexts.map((item) => item.member?.displayName ?? item.sponsor.name ?? "").filter(Boolean)
  ).slice(0, 4);
  const presentation = presentVote(vote, { locale, bill, source });
  const groupMarks = await getGroupMarks(groups);

  const ro = locale === "ro";
  const absentSeats = seatVotes.filter((seat) => seat.choice === "absent").length;
  const counts = countsOfTotals({ ...vote.totals, absent: absentSeats });
  const kinds: Array<{ kind: VoteKind; value: number }> = [
    { kind: "for", value: counts.for ?? 0 },
    { kind: "against", value: counts.against ?? 0 },
    { kind: "abstain", value: counts.abstain ?? 0 },
    { kind: "present", value: counts.present ?? 0 },
    { kind: "absent", value: counts.absent ?? 0 }
  ];

  return <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
    <EngagementTracker entityType="vote" entityId={vote.id} locale={locale}/>
    <nav aria-label={ro ? "Unde ești" : "Breadcrumb"} className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <ol className="flex min-w-0 items-center gap-2 text-muted">
        <li><Link href={`/${locale}`} className="hover:text-brand">{ro ? "Acasă" : "Home"}</Link></li><li aria-hidden="true">›</li>
        <li><Link href={`/${locale}/votes`} className="hover:text-brand">{ro ? "Voturi" : "Votes"}</Link></li><li aria-hidden="true">›</li>
        <li aria-current="page" className="max-w-[28ch] truncate text-ink-soft sm:max-w-[48ch]">{presentation.heading}</li>
      </ol>
      <div className="flex items-center gap-2">
        <ShareButton href={`/${locale}/votes/${vote.id}`} title={presentation.heading} label={ro ? "Distribuie" : "Share"} copiedLabel={ro ? "Link copiat" : "Link copied"} errorLabel={ro ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink-soft hover:border-line-strong"/>
        {source ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand px-3.5 py-1.5 font-semibold text-brand hover:bg-brand-soft"><FileText size={15} aria-hidden="true"/>{ro ? "Sursa oficială" : "Official source"}</a> : null}
      </div>
    </nav>
    <header className="mt-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand-strong">{presentation.voteType}</span>
        {vote.chamber === "joint" ? <span className="rounded-full bg-ink px-3 py-1 font-semibold text-white">{voteChamberLabels[locale].joint}</span> : <span className="inline-flex items-center gap-1.5 rounded-full bg-wash px-3 py-1 font-medium text-ink-soft"><Building2 size={15} aria-hidden="true"/>{voteChamberLabels[locale][vote.chamber]}</span>}
        <span className="inline-flex items-center gap-1.5 text-muted"><CalendarDays size={15} aria-hidden="true"/><time dateTime={vote.heldOn}>{formatDate(vote.heldOn, locale)}</time></span>
      </div>
      <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink [overflow-wrap:anywhere] lg:text-5xl">{presentation.heading}</h1>
      <p lang="ro" className="mt-3 max-w-4xl text-lg leading-7 text-ink-soft">{presentation.subject ?? presentation.officialTitle}</p>
      {locale === "en" ? <p className="mt-2 text-sm font-medium text-muted">Official parliamentary title, in Romanian</p> : null}
    </header>
    <div className="mt-7 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,.42fr)_minmax(0,1fr)]">
      <aside className="min-w-0 self-start rounded-card border border-line bg-surface p-6 lg:sticky lg:top-24">
        <OutcomeBadge outcome={presentation.outcome} label={presentation.outcomeLabel} size="lg"/>
        <p className="mt-3 text-sm leading-6 text-muted">{presentation.outcomeExplanation}</p>
        {bill ? <Link href={`/${locale}/bills/${bill.slug}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-strong">{ro ? "Vezi starea proiectului" : "View bill status"}<ArrowRight size={15} aria-hidden="true"/></Link> : null}
        <h2 className="mt-6 font-display text-xl font-bold text-ink">{ro ? "Cum s-a votat?" : "How did members vote?"}</h2>
        <p className="mt-1 text-sm text-muted">{ro ? "Voturile nominale publicate de Parlament, fără interpretarea stării juridice a proiectului." : "Parliament's published nominal votes, without interpreting the bill's legal status."}</p>
        <div className="mt-4"><SplitBar counts={counts} locale={locale} height="h-3.5" showAbsent/></div>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
          {kinds.filter((item) => item.value > 0 || item.kind !== "absent").map(({ kind, value }) => (
            <div key={kind} className="flex flex-col-reverse gap-1">
              <dt className="pl-10 text-xs leading-4 text-muted">{VOTE_LABEL[locale][kind]}</dt>
              <dd className={`flex items-center gap-2.5 font-display text-3xl font-bold leading-none ${VOTE_STYLE[kind].text}`}><VoteDot kind={kind} size={28} locale={locale}/><CountUp value={value}/></dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft"><strong className="font-display text-lg text-ink tabular-nums">{vote.totals.present}</strong> {ro ? "parlamentari prezenți la vot" : "members present for the vote"}</p>
        <div className="mt-5 flex flex-wrap gap-2"><HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.publicInterest}/></div>
      </aside>
      <div className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-6">{individualVotes.length === 0 && groupTotals.length === 0 ? <p role="note" className="rounded-card border border-vote-abstain-fill bg-vote-abstain-bg p-4 text-sm leading-6 text-vote-abstain">{ro ? "Pentru acest vot sursa oficială publică doar totalurile, nu și lista nominală (de exemplu, la un vot secret). De aceea nu afișăm harta votului și nu completăm voturile individuale." : "For this vote the official source publishes only the totals, not a name list (for example, in a secret ballot). So we show no seat map and do not fill in individual votes."}</p> : vote.chamber === "joint" ? <JointVoteBreakdown locale={locale} nominalVotes={individualVotes} groups={groups}/> : <VoteChamberExplorer voteId={vote.id} locale={locale} chamber={vote.chamber} groups={groups} members={members} seatVotes={seatVotes} seatConstituencies={seatConstituencies} seatPhotoUrls={seatPhotoUrls} nominalVotes={individualVotes} groupTotals={groupTotals} officialTotals={vote.totals} capacity={data.seatCapacity} groupMarks={groupMarks}/>}</div>
    </div>
    <details className="mt-6 rounded-card border border-line bg-surface p-5"><summary className="cursor-pointer font-display text-xl font-bold text-ink">{locale === "ro" ? "Detalii oficiale și context" : "Official details and context"}</summary><div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0">{process.env.GEMINI_EXPLANATIONS_ENABLED === "1" ? <VoteExplanation id={vote.id} locale={locale}/> : null}<GovernmentContextPanel context={governmentContext} locale={locale}/>{bill ? <div className="mt-6"><VoteBillDossierPanel locale={locale} bill={bill} billHref={`/${locale}/bills/${bill.slug}`} voteDate={vote.heldOn} procedureSteps={billProcedureSteps} documents={billDocuments} documentConfidence={Object.fromEntries(billDocumentConfidence)} sponsorNames={sponsorNames} sponsorOverflowCount={Math.max(0, billSponsorContexts.length - sponsorNames.length)} sponsorContexts={billSponsorContexts} labels={labels}/></div> : null}</div><aside>{source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale}/> : null}</aside></div></details>
  </main>;
}

const votePageLabels = {
  ro: {
    publicInterest: "Popular",
    billDossier: "Dosar proiect",
    decisionChamber: "Cameră decizională",
    documents: "Documente",
    initiators: "Inițiatori",
    recentProcedure: "Ultimii pași înainte de vot",
    fullProcedure: "Procedură legislativă completă",
    showFullDossier: "Vezi procedura completă și textul",
    hideFullDossier: "Ascunde procedura completă",
    officialDocuments: "Documente oficiale",
    extractedText: "Text extras",
    noExtractedText: "Textul extras nu este încă disponibil pentru documentele acestui proiect.",
    fullBillPage: "Deschide pagina completă a proiectului",
    showProjectText: "Vezi textul proiectului",
    showText: "Vezi text extras",
    hideText: "Ascunde textul",
    loadingText: "Se încarcă textul...",
    failedText: "Textul extras nu este disponibil.",
    textUnavailable: "Textul extras nu este disponibil pentru acest document.",
    automaticTextStatus: "Extras automat",
    automaticTextNote: "Pentru citare, verificați PDF-ul oficial.",
    chambers: {
      deputies: "Camera Deputaților",
      senate: "Senat",
      joint: "Ședință comună",
      unknown: "Cameră necunoscută"
    },
    documentKinds: {
      proposal: "propunere",
      senate_adopted_form: "formă adoptată Senat",
      committee_report: "raport comisie",
      committee_opinion: "aviz comisie",
      adopted_form: "formă adoptată",
      promulgation_form: "formă promulgare",
      other: "alte documente"
    }
  },
  en: {
    publicInterest: "Popular",
    billDossier: "Bill dossier",
    decisionChamber: "Decision chamber",
    documents: "Documents",
    initiators: "Initiators",
    recentProcedure: "Recent steps before the vote",
    fullProcedure: "Full legislative procedure",
    showFullDossier: "Show full procedure and text",
    hideFullDossier: "Hide full procedure",
    officialDocuments: "Official documents",
    extractedText: "Extracted text",
    noExtractedText: "Extracted text is not available yet for this bill's documents.",
    fullBillPage: "Open full bill page",
    showProjectText: "Show bill text",
    showText: "Show extracted text",
    hideText: "Hide text",
    loadingText: "Loading text...",
    failedText: "Extracted text is not available.",
    textUnavailable: "Extracted text is not available for this document.",
    automaticTextStatus: "Automatic extraction",
    automaticTextNote: "Use the official PDF for citation.",
    chambers: {
      deputies: "Chamber of Deputies",
      senate: "Senate",
      joint: "Joint sitting",
      unknown: "Unknown chamber"
    },
    documentKinds: {
      proposal: "proposal",
      senate_adopted_form: "Senate adopted form",
      committee_report: "committee report",
      committee_opinion: "committee opinion",
      adopted_form: "adopted form",
      promulgation_form: "promulgation form",
      other: "other documents"
    }
  }
} satisfies Record<AppLocale, {
  publicInterest: string;
  billDossier: string;
  decisionChamber: string;
  documents: string;
  initiators: string;
  recentProcedure: string;
  fullProcedure: string;
  showFullDossier: string;
  hideFullDossier: string;
  officialDocuments: string;
  extractedText: string;
  noExtractedText: string;
  fullBillPage: string;
  showProjectText: string;
  showText: string;
  hideText: string;
  loadingText: string;
  failedText: string;
  textUnavailable: string;
  automaticTextStatus: string;
  automaticTextNote: string;
  chambers: Record<string, string>;
  documentKinds: Record<string, string>;
}>;

function uniqueDisplayNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}
