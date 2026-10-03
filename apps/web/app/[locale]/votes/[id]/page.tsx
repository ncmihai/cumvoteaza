import { VoteExplanation } from "@/app/[locale]/_components/VoteExplanation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import { ArrowLeft, Building2, CalendarDays, FileText } from "lucide-react";
import { getVotePageData } from "@/lib/data";
import { getDocumentConfidenceMap } from "@/lib/document-confidence";
import { getHotCount } from "@/lib/explorer-data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { presentVote } from "@/lib/public-presentation";
import { confidenceForSource } from "@/lib/source-confidence";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { GovernmentContextPanel } from "../../_components/GovernmentContextPanel";
import { HotButton } from "../../_components/HotButton";
import { SourceBadge } from "../../_components/SourceBadge";
import { ShareButton } from "../../_components/ShareButton";
import { VoteBillDossierPanel } from "../../_components/VoteBillDossierPanel";
import { VoteChamberExplorer } from "../../_components/VoteChamberExplorer";

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

  return <main className="mx-auto max-w-[1600px] bg-[#fbfaf6] px-4 py-5 md:px-8 lg:px-10">
    <EngagementTracker entityType="vote" entityId={vote.id} locale={locale}/>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d2e0f1] pb-4 text-xs text-[#4b608a]"><Link href={`/${locale}/votes`} className="inline-flex items-center gap-2 font-semibold text-[#075fc6]"><ArrowLeft size={15}/>{locale === "ro" ? "Înapoi la voturi" : "Back to votes"}</Link><ShareButton href={`/${locale}/votes/${vote.id}`} title={presentation.heading} label={locale === "ro" ? "Distribuie" : "Share"} copiedLabel={locale === "ro" ? "Link copiat" : "Link copied"} errorLabel={locale === "ro" ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 bg-transparent text-[#4b608a]"/></div>
    <div className="grid min-w-0 gap-6 pt-5 lg:grid-cols-[minmax(285px,.38fr)_minmax(0,1fr)] xl:gap-8">
      <div className="min-w-0 border-b border-[#d2e0f1] pb-6 lg:border-b-0 lg:border-r lg:pr-7">
        <p className="text-xs font-bold uppercase tracking-wide text-[#075fc6]">{presentation.voteType}</p><h1 className="mt-2 font-serif text-4xl font-semibold leading-[.98] tracking-[-.035em] text-[#061a47] [overflow-wrap:anywhere] lg:text-5xl">{presentation.heading}</h1>
        <p className="mt-3 font-serif text-base leading-6 text-[#4b608a]">{presentation.subject ?? presentation.officialTitle}</p>{locale === "en" ? <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Official parliamentary title in Romanian</p> : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#4b608a]"><span className="inline-flex items-center gap-1.5"><CalendarDays size={16}/>{formatDate(vote.heldOn,locale)}</span><span className="inline-flex items-center gap-1.5"><Building2 size={16}/>{vote.chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies")}</span></div>
        <div className="mt-5 border border-[#c9dff6] bg-[#f0f6fc] p-4"><p className="font-serif text-lg font-bold text-[#061a47]">{presentation.outcomeLabel}</p><p className="mt-1 text-xs leading-5 text-[#4b608a]">{presentation.outcomeExplanation}</p>{bill ? <Link href={`/${locale}/bills/${bill.slug}`} className="mt-2 inline-block text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Vezi starea proiectului →" : "View bill status →"}</Link> : null}</div>
        <h2 className="mt-6 font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Cum s-a votat?" : "How did members vote?"}</h2><p className="mt-1 text-sm text-[#4b608a]">{locale === "ro" ? "Voturile nominale publicate de Parlament, fără interpretarea stării juridice a proiectului." : "Parliament's published nominal votes, without interpreting the bill's legal status."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><ResultFact label={voteChoiceLabels[locale].for} value={vote.totals.for} tone="text-emerald-700"/><ResultFact label={voteChoiceLabels[locale].against} value={vote.totals.against} tone="text-red-700"/><ResultFact label={voteChoiceLabels[locale].abstention} value={vote.totals.abstention} tone="text-amber-700"/><ResultFact label={voteChoiceLabels[locale].present_not_voting} value={vote.totals.presentNotVoting} tone="text-slate-600"/><ResultFact label={locale === "ro" ? "prezenți" : "present"} value={vote.totals.present} tone="text-[#061a47]"/><ResultFact label={locale === "ro" ? "absențe consemnate" : "recorded absences"} value={seatVotes.filter((seat) => seat.choice === "absent").length} tone="text-[#4b608a]"/></div>
        <div className="mt-5 flex flex-wrap gap-2"><HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.publicInterest}/>{source ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-[#b8c8df] bg-white px-3 py-2 text-xs font-bold text-[#075fc6]"><FileText size={15}/>{locale === "ro" ? "Sursa oficială" : "Official source"}</a> : null}</div>
      </div>
      <div className="min-w-0"><VoteChamberExplorer voteId={vote.id} locale={locale} chamber={vote.chamber} groups={groups} members={members} seatVotes={seatVotes} seatConstituencies={seatConstituencies} seatPhotoUrls={seatPhotoUrls} nominalVotes={individualVotes} groupTotals={groupTotals} officialTotals={vote.totals} capacity={data.seatCapacity}/></div>
    </div>
    <details className="mt-7 border-t border-[#d2e0f1] pt-4"><summary className="cursor-pointer font-serif text-xl font-semibold text-[#061a47]">{locale === "ro" ? "Detalii oficiale și context" : "Official details and context"}</summary><div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0">{process.env.GEMINI_EXPLANATIONS_ENABLED === "1" ? <VoteExplanation id={vote.id} locale={locale}/> : null}<GovernmentContextPanel context={governmentContext} locale={locale}/>{bill ? <div className="mt-6"><VoteBillDossierPanel locale={locale} bill={bill} billHref={`/${locale}/bills/${bill.slug}`} voteDate={vote.heldOn} procedureSteps={billProcedureSteps} documents={billDocuments} documentConfidence={Object.fromEntries(billDocumentConfidence)} sponsorNames={sponsorNames} sponsorOverflowCount={Math.max(0, billSponsorContexts.length - sponsorNames.length)} sponsorContexts={billSponsorContexts} labels={labels}/></div> : null}</div><aside>{source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale}/> : null}</aside></div></details>
  </main>;
}

function ResultFact({label,value,tone}:{label:string;value:number;tone:string}){
  return <div className="border-b border-[#d2e0f1] py-2"><strong className={`block font-serif text-3xl leading-none ${tone}`}>{value}</strong><span className="mt-1 block text-xs text-[#4b608a]">{label}</span></div>;
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
