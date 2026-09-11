import { EditorialSections } from "@/app/[locale]/_components/EditorialSections";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@cumsevoteaza/parliament-model";
import { getBillTextComparisons } from "@/lib/bill-text-features";
import { getBillPageData } from "@/lib/data";
import { getDocumentConfidenceMap } from "@/lib/document-confidence";
import { getHotCount } from "@/lib/explorer-data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { presentBill } from "@/lib/public-presentation";
import { confidenceForDocument, confidenceForSource } from "@/lib/source-confidence";
import { ArrowLeft } from "lucide-react";
import { BillDocumentDiffPanel } from "../../_components/BillDocumentDiffPanel";
import { BillTextSearch } from "../../_components/BillTextSearch";
import { ConfidenceBadge } from "../../_components/ConfidenceBadge";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { BillDocumentTextToggle } from "../../_components/BillDocumentTextToggle";
import { GovernmentContextPanel } from "../../_components/GovernmentContextPanel";
import { HotButton } from "../../_components/HotButton";
import { SourceBadge } from "../../_components/SourceBadge";
import { ShareButton } from "../../_components/ShareButton";

export default async function BillPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const labels = billPageLabels[locale];
  const data = await getBillPageData(id);
  if (!data) notFound();
  const { bill, events, procedureSteps, documents, votes, source, governmentContext, sponsorContexts } = data;
  const [hotCount, comparisons, documentConfidence] = await Promise.all([
    getHotCount("bill", bill.id),
    getBillTextComparisons(bill.id),
    getDocumentConfidenceMap(documents.map((document) => document.id))
  ]);
  const timeline = procedureSteps.length > 0 ? procedureSteps : events;
  const committees = [...new Set(procedureSteps.map((step) => step.committeeName).filter(Boolean))] as string[];
  const presentation = presentBill(bill);

  return (
    <main className="mx-auto max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
      <EditorialSections page="bill" locale={locale} entityId={bill.id} billId={bill.id} />
      <EngagementTracker entityType="bill" entityId={bill.id} locale={locale} />
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/${locale}/bills`} className="inline-flex items-center gap-2 font-semibold text-[#075fc6]"><ArrowLeft size={17}/>{locale === "ro" ? "Înapoi la proiecte" : "Back to bills"}</Link>
        <ShareButton href={`/${locale}/bills/${bill.slug}`} title={presentation.heading} label={locale === "ro" ? "Distribuie" : "Share"} copiedLabel={locale === "ro" ? "Link copiat" : "Link copied"} errorLabel={locale === "ro" ? "Copiază manual" : "Copy manually"} className="bg-transparent text-[#4b608a]" />
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase text-blue-800">{presentation.identifier}</div>
          <h1 className="mt-2 max-w-5xl break-words font-serif text-3xl font-semibold leading-tight tracking-[-.035em] text-[#050e2c] sm:text-4xl md:text-5xl">{presentation.heading}</h1>
          {presentation.status !== "—" ? <p className="mt-3 text-slate-600">{presentation.status}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-700">
            {bill.identifiers.deputies ? <span className="border border-slate-300 px-2 py-1">{bill.identifiers.deputies}</span> : null}
            {bill.identifiers.senate && bill.identifiers.senate !== bill.identifiers.deputies ? <span className="border border-slate-300 px-2 py-1">{bill.identifiers.senate}</span> : null}
            {bill.decisionChamber ? <span className="border border-slate-300 px-2 py-1">{labels.decisionChamber}: {labels.chambers[bill.decisionChamber]}</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2">
          <HotButton entityType="bill" entityId={bill.id} initialCount={hotCount} label={labels.publicInterest} />
          {source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale} /> : null}
        </div>
      </div>

      <GovernmentContextPanel context={governmentContext} billSponsors={sponsorContexts} locale={locale} />

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="border border-slate-300 bg-white">
            <div className="border-b border-slate-300 px-4 py-3 font-semibold">{labels.timeline}</div>
            <div className="divide-y divide-slate-200">
              {timeline.map((item) => (
                <div key={item.id} className="grid gap-2 px-4 py-4 md:grid-cols-[140px_1fr]">
                  <div className="text-sm font-medium text-slate-700">{formatDate(item.occurredOn, locale)}</div>
                  <div>
                    <div className="font-medium text-slate-950">{"title" in item ? item.title : item.label}</div>
                    {"description" in item && item.description ? <div className="mt-1 text-sm text-slate-700">{item.description}</div> : null}
                    {"committeeName" in item && item.committeeName ? <div className="mt-2 text-sm font-medium text-teal-700">{item.committeeName}</div> : null}
                    <div className="mt-1 text-sm text-slate-600">{item.chamber}</div>
                  </div>
                </div>
              ))}
              {timeline.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{locale === "ro" ? "Traseul legislativ nu este încă disponibil." : "The legislative timeline is not available yet."}</div> : null}
            </div>
          </div>

          <BillDocumentDiffPanel comparisons={comparisons} locale={locale} />
        </div>

        <aside className="space-y-5">
          <BillTextSearch
            billId={bill.id}
            labels={{
              title: labels.textSearchTitle,
              placeholder: labels.textSearchPlaceholder,
              search: labels.textSearchButton,
              empty: labels.textSearchEmpty,
              noQuery: labels.textSearchNoQuery,
              loading: labels.textSearchLoading,
              failed: labels.textSearchFailed
            }}
          />

          <div className="border border-slate-300 bg-white">
            <div className="border-b border-slate-300 px-4 py-3 font-semibold">{messages.nav.votes}</div>
            <div className="divide-y divide-slate-200">
              {votes.map((vote) => (
                <Link key={vote.id} className="block px-4 py-3 hover:bg-slate-50" href={`/${locale}/votes/${vote.id}`}>
                  <div className="font-medium">{vote.title}</div>
                  <div className="text-sm text-slate-600">{formatDate(vote.heldOn, locale)}</div>
                </Link>
              ))}
              {votes.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{locale === "ro" ? "Nu există încă voturi conectate acestui proiect." : "No votes are connected to this bill yet."}</div> : null}
            </div>
          </div>

          {committees.length > 0 ? (
            <div className="border border-slate-300 bg-white">
              <div className="border-b border-slate-300 px-4 py-3 font-semibold">{labels.committees}</div>
              <div className="divide-y divide-slate-200">
                {committees.map((committee) => (
                  <div key={committee} className="px-4 py-3 text-sm text-slate-800">
                    {committee}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border border-slate-300 bg-white">
            <div className="border-b border-slate-300 px-4 py-3 font-semibold">{labels.documents}</div>
            <div className="divide-y divide-slate-200">
              {documents.map((document) => (
                <div key={document.id} className="px-4 py-3 text-sm">
                  <a href={document.url} target="_blank" rel="noreferrer" className="font-medium underline">
                    {document.label}
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase text-slate-500">{document.documentKind ?? "other"}</span>
                    <ConfidenceBadge
                      confidence={documentConfidence.get(document.id) ?? confidenceForDocument({ textStatus: document.textStatus })}
                      locale={locale}
                    />
                  </div>
                  {document.textStatus === "stored" ? (
                    <BillDocumentTextToggle
                      documentId={document.id}
                      preview={document.textPreview}
                      labels={{
                        show: document.documentKind === "proposal" ? labels.showProjectText : labels.showText,
                        hide: labels.hideText,
                        loading: labels.loadingText,
                        failed: labels.failedText,
                        status: labels.automaticTextStatus,
                        note: labels.automaticTextNote
                      }}
                    />
                  ) : document.textStatus && document.textStatus !== "pending" ? (
                    <div className="mt-2 text-xs text-slate-500">{labels.textUnavailable}</div>
                  ) : null}
                </div>
              ))}
              {documents.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{locale === "ro" ? "Nu există documente oficiale importate." : "No official documents have been imported."}</div> : null}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

const billPageLabels = {
  ro: {
    publicInterest: "Marchează interes",
    decisionChamber: "Cameră decizională",
    timeline: "Procedură legislativă",
    committees: "Comisii",
    documents: "Documente oficiale",
    showProjectText: "Vezi textul proiectului",
    showText: "Vezi text extras",
    hideText: "Ascunde textul",
    loadingText: "Se încarcă textul...",
    failedText: "Textul extras nu este disponibil.",
    textUnavailable: "Textul extras nu este disponibil pentru acest document.",
    automaticTextStatus: "Extras automat",
    automaticTextNote: "Pentru citare, verificați PDF-ul oficial.",
    textSearchTitle: "Caută în textul extras",
    textSearchPlaceholder: "Cuvânt sau expresie...",
    textSearchButton: "Caută",
    textSearchEmpty: "Nu există rezultate în text verificat.",
    textSearchNoQuery: "Căutarea folosește doar text extras acceptat sau fără semnale OCR deschise.",
    textSearchLoading: "Se caută...",
    textSearchFailed: "Căutarea nu este disponibilă momentan.",
    chambers: {
      deputies: "Camera Deputaților",
      senate: "Senat"
    }
  },
  en: {
    publicInterest: "Mark interest",
    decisionChamber: "Decision chamber",
    timeline: "Legislative procedure",
    committees: "Committees",
    documents: "Official documents",
    showProjectText: "Show bill text",
    showText: "Show extracted text",
    hideText: "Hide text",
    loadingText: "Loading text...",
    failedText: "Extracted text is not available.",
    textUnavailable: "Extracted text is not available for this document.",
    automaticTextStatus: "Automatic extraction",
    automaticTextNote: "Use the official PDF for citation.",
    textSearchTitle: "Search extracted text",
    textSearchPlaceholder: "Word or phrase...",
    textSearchButton: "Search",
    textSearchEmpty: "No results in verified text.",
    textSearchNoQuery: "Search only uses accepted extracted text or text without open OCR signals.",
    textSearchLoading: "Searching...",
    textSearchFailed: "Search is not available right now.",
    chambers: {
      deputies: "Chamber of Deputies",
      senate: "Senate"
    }
  }
} satisfies Record<AppLocale, {
  publicInterest: string;
  decisionChamber: string;
  timeline: string;
  committees: string;
  documents: string;
  showProjectText: string;
  showText: string;
  hideText: string;
  loadingText: string;
  failedText: string;
  textUnavailable: string;
  automaticTextStatus: string;
  automaticTextNote: string;
  textSearchTitle: string;
  textSearchPlaceholder: string;
  textSearchButton: string;
  textSearchEmpty: string;
  textSearchNoQuery: string;
  textSearchLoading: string;
  textSearchFailed: string;
  chambers: Record<"deputies" | "senate", string>;
}>;
