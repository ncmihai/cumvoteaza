import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
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
import { VoteExplorer } from "../../_components/VoteExplorer";
import { DetailPageHeader } from "../../_components/DetailPageHeader";

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
    seatVotes
  } = data;
  const [hotCount, billDocumentConfidence] = await Promise.all([
    getHotCount("vote", vote.id),
    getDocumentConfidenceMap(billDocuments.map((document) => document.id))
  ]);
  const sponsorNames = uniqueDisplayNames(
    billSponsorContexts.map((item) => item.member?.displayName ?? item.sponsor.name ?? "").filter(Boolean)
  ).slice(0, 4);
  const presentation = presentVote(vote, { locale, bill, source });

  return (
    <main className="mx-auto max-w-[1440px] bg-[#fbfaf6]">
      <EditorialSections page="vote" locale={locale} entityId={id} />
      <EngagementTracker entityType="vote" entityId={vote.id} locale={locale} />
      <div className="grid min-h-[calc(100vh-76px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 px-4 py-6 md:px-8 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#4b608a]">
            <Link href={`/${locale}/votes`} className="inline-flex items-center gap-2 font-semibold text-[#075fc6]"><ArrowLeft size={17}/>{locale === "ro" ? "Înapoi la voturi" : "Back to votes"}</Link>
            <ShareButton href={`/${locale}/votes/${vote.id}`} title={presentation.heading} label={locale === "ro" ? "Distribuie" : "Share"} copiedLabel={locale === "ro" ? "Link copiat" : "Link copied"} errorLabel={locale === "ro" ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 bg-transparent text-[#4b608a]" />
          </div>

          <DetailPageHeader className="mt-6 pb-6" eyebrow={presentation.voteType} title={presentation.heading} subtitle={presentation.subject ?? presentation.officialTitle} trailing={<span className="rounded-md border border-slate-300 bg-white px-3 py-2 font-serif font-semibold text-[#4b608a]">{presentation.outcomeLabel}</span>}>
            {locale === "en" ? <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Official parliamentary title in Romanian</p> : null}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#4b608a]"><span className="inline-flex items-center gap-2"><CalendarDays size={18}/>{formatDate(vote.heldOn,locale)}</span><span className="inline-flex items-center gap-2"><Building2 size={18}/>{vote.chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies")}</span><span className="inline-flex items-center gap-2"><FileText size={18}/>{presentation.voteType}</span></div>
            {process.env.GEMINI_EXPLANATIONS_ENABLED === "1" && <VoteExplanation id={vote.id} locale={locale} />}
          </DetailPageHeader>

          <section className="mt-5 border border-[#dae8f7] bg-[#f0f6fc] p-5">
            <h2 className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Pe scurt" : "In brief"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#4b608a]">{locale === "ro" ? "Pagina separă rezultatul acestei moțiuni de starea juridică a proiectului și păstrează legătura către datele nominale publicate de Parlament." : "This page separates the result of this motion from the legal status of the bill and retains the link to Parliament's published nominal data."}</p>
          </section>

          <section className="mt-6" aria-labelledby="vote-result-heading">
            <h2 id="vote-result-heading" className="font-serif text-2xl font-semibold text-[#061a47]">{locale === "ro" ? "Rezultatul votului" : "Vote result"}</h2>
            <div className="mt-3 grid grid-cols-2 border-y border-slate-300 bg-white px-4 py-3 sm:grid-cols-4">
              <ResultFact label={voteChoiceLabels[locale].for} value={vote.totals.for} tone="bg-emerald-600" />
              <ResultFact label={voteChoiceLabels[locale].against} value={vote.totals.against} tone="bg-red-600" />
              <ResultFact label={voteChoiceLabels[locale].abstention} value={vote.totals.abstention} tone="bg-amber-600" />
              <ResultFact label={voteChoiceLabels[locale].present_not_voting} value={vote.totals.presentNotVoting} tone="bg-slate-400" />
            </div>
            <p className="mt-2 text-sm text-[#4b608a]"><strong className="font-serif text-2xl text-[#061a47]">{vote.totals.present}</strong> {locale === "ro" ? "prezenți" : "present"} · {individualVotes.length} {locale === "ro" ? "voturi nominale" : "nominal votes"}</p>
          </section>

          <div className="mt-6">
            <VoteExplorer voteId={vote.id} locale={locale} chamber={vote.chamber} groups={groups} groupLogoUrls={data.groupLogoUrls} members={members} seatVotes={seatVotes} nominalVotes={individualVotes} groupTotals={groupTotals} groupAlignments={Object.fromEntries(groupContexts.map((item) => [item.group.id, item.alignment]))} />
          </div>

          <GovernmentContextPanel context={governmentContext} locale={locale} />

          {bill ? <div className="mt-6"><VoteBillDossierPanel locale={locale} bill={bill} billHref={`/${locale}/bills/${bill.slug}`} voteDate={vote.heldOn} procedureSteps={billProcedureSteps} documents={billDocuments} documentConfidence={Object.fromEntries(billDocumentConfidence)} sponsorNames={sponsorNames} sponsorOverflowCount={Math.max(0, billSponsorContexts.length - sponsorNames.length)} sponsorContexts={billSponsorContexts} labels={labels} /></div> : null}
        </div>

        <aside className="border-t border-slate-300 bg-white/75 px-5 py-6 xl:border-l xl:border-t-0 xl:px-7">
          <div className="xl:sticky xl:top-24">
            <div className="flex flex-col gap-3">
              <HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.publicInterest} />
              {source ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 border border-[#9eabc0] bg-white px-4 py-3 text-sm font-bold text-[#075fc6]"><FileText size={18}/>{locale === "ro" ? "Sursa oficială" : "Official source"}</a> : null}
              {source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale} /> : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function ResultFact({label,value,tone}:{label:string;value:number;tone:string}){
  return <div className="grid grid-cols-[10px_38px_1fr] items-center gap-2 py-2 text-sm"><i className={`h-2.5 w-2.5 rounded-full ${tone}`}/><strong className="text-[#061a47]">{value}</strong><span className="text-[#4b608a]">{label}</span></div>;
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
