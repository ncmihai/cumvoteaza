import Link from "next/link";
import { clip } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { chamberLabels, formatDate } from "@cumsevoteaza/parliament-model";
import { getBillTextComparisons } from "@/lib/bill-text-features";
import { getBillPageData, getCurrentBillSlug } from "@/lib/data";
import { getDocumentConfidenceMap } from "@/lib/document-confidence";
import { getHotCount } from "@/lib/explorer-data";
import { isLocale, messagesFor, type AppLocale } from "@/lib/i18n";
import { presentBill } from "@/lib/public-presentation";
import { confidenceForDocument, confidenceForSource } from "@/lib/source-confidence";
import { ArrowLeft } from "lucide-react";
import { BillDocumentDiffPanel } from "../../_components/BillDocumentDiffPanel";
import { BillFatePanel, BillTimeline } from "../../_components/BillDossierPanels";
import { BillTextSearch } from "../../_components/BillTextSearch";
import { ConfidenceBadge } from "../../_components/ConfidenceBadge";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { BillDocumentTextToggle } from "../../_components/BillDocumentTextToggle";
import { GovernmentContextPanel } from "../../_components/GovernmentContextPanel";
import { HotButton } from "../../_components/HotButton";
import { SourceBadge } from "../../_components/SourceBadge";
import { ShareButton } from "../../_components/ShareButton";
import { DetailPageHeader } from "../../_components/DetailPageHeader";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const data = await getBillPageData(id);
  if (!data) return { title: locale === "ro" ? "Proiect negăsit" : "Bill not found" };
  const presentation = presentBill(data.bill);
  return { title: `${presentation.identifier}: ${clip(presentation.heading, 70)}` };
}

export default async function BillPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale: AppLocale = isLocale(rawLocale) ? rawLocale : "ro";
  const messages = messagesFor(locale);
  const labels = billPageLabels[locale];
  const data = await getBillPageData(id);
  if (!data) {
    const currentSlug = await getCurrentBillSlug(id);
    if (currentSlug && currentSlug !== id) permanentRedirect(`/${rawLocale}/bills/${currentSlug}`);
    notFound();
  }
  const { bill, dossier, events, procedureSteps, documents, votes, source, governmentContext, sponsorContexts } = data;
  const [hotCount, comparisons, documentConfidence] = await Promise.all([
    getHotCount("bill", bill.id),
    getBillTextComparisons(bill.id),
    getDocumentConfidenceMap(documents.map((document) => document.id))
  ]);
  const timeline = procedureSteps.length > 0 ? procedureSteps : events;
  const committees = [...new Set(procedureSteps.map((step) => step.committeeName).filter(Boolean))] as string[];
  const presentation = presentBill(bill);
  const primaryIdentifier = bill.identifiers.deputies ?? bill.identifiers.senate ?? presentation.identifier;
  const alternateIdentifiers = Object.values(bill.identifiers).filter((value, index, values) => value !== primaryIdentifier && values.indexOf(value) === index);
  const sponsorPreview = sponsorContexts.slice(0, 6);
  const sponsorGroupMap = new Map<string, typeof sponsorContexts>();
  for (const context of sponsorContexts) {
    const affiliation = context.party?.shortName ?? context.group?.shortName ?? context.sponsor.groupLabel ?? (context.sponsor.sponsorType === "government" ? (locale === "ro" ? "Guvern" : "Government") : (locale === "ro" ? "Apartenență neidentificată" : "Affiliation not identified"));
    const chamber = context.group?.chamber ?? context.sponsor.memberChamber ? chamberLabels[locale][(context.group?.chamber ?? context.sponsor.memberChamber)!] : (locale === "ro" ? "Cameră neidentificată" : "Chamber not identified");
    const label = `${affiliation} · ${chamber}`;
    sponsorGroupMap.set(label, [...(sponsorGroupMap.get(label) ?? []), context]);
  }
  const sponsorGroups = [...sponsorGroupMap.entries()];

  return (
    <main className="mx-auto max-w-[1440px] bg-[#fbfaf6] px-4 py-7 md:px-8 lg:px-10">
      
      <EngagementTracker entityType="bill" entityId={bill.id} locale={locale} />
      <nav className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/${locale}/bills`} className="inline-flex items-center gap-2 font-semibold text-[#075fc6]"><ArrowLeft size={17}/>{locale === "ro" ? "Înapoi la proiecte" : "Back to bills"}</Link>
        <ShareButton href={`/${locale}/bills/${bill.slug}`} title={presentation.heading} label={locale === "ro" ? "Distribuie" : "Share"} copiedLabel={locale === "ro" ? "Link copiat" : "Link copied"} errorLabel={locale === "ro" ? "Copiază manual" : "Copy manually"} className="bg-transparent text-[#4b608a]" />
      </nav>
      <DetailPageHeader
        eyebrow={presentation.identifier}
        title={presentation.heading}
        subtitle={presentation.status !== "—" ? presentation.status : undefined}
        trailing={<div className="flex flex-col items-start gap-2"><HotButton entityType="bill" entityId={bill.id} initialCount={hotCount} label={labels.publicInterest} />{source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale} /> : null}</div>}
      >
          {locale === "en" ? <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Official parliamentary title in Romanian</p> : null}
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-700">
            <span className="border border-slate-300 px-2 py-1"><b>{locale === "ro" ? "Identificator principal" : "Primary identifier"}:</b> {primaryIdentifier}</span>
            {alternateIdentifiers.length ? <span className="border border-slate-300 px-2 py-1"><b>{locale === "ro" ? "Identificatori alternativi" : "Alternate identifiers"}:</b> {alternateIdentifiers.join(", ")}</span> : null}
            <span className="border border-slate-300 px-2 py-1"><b>{locale === "ro" ? "Camera de origine" : "Source chamber"}:</b> {bill.chamberOfOrigin === "unknown" ? (locale === "ro" ? "Camera de origine nu a fost identificată" : "Source chamber not identified") : labels.chambers[bill.chamberOfOrigin]}</span>
            {bill.decisionChamber ? <span className="border border-slate-300 px-2 py-1">{labels.decisionChamber}: {labels.chambers[bill.decisionChamber]}</span> : null}
          </div>
      </DetailPageHeader>

      {dossier ? <BillFatePanel dossier={dossier} locale={locale} /> : null}

      {sponsorContexts.length ? <section className="mt-5 border border-slate-300 bg-white p-4"><h2 className="font-serif text-xl font-semibold text-[#061a47]">{locale === "ro" ? `Inițiatori (${sponsorContexts.length})` : `Sponsors (${sponsorContexts.length})`}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{sponsorPreview.map(({sponsor,member,party,group})=><div key={sponsor.id} className="min-w-0 border-l-2 border-[#075fc6] pl-3"><strong className="block [overflow-wrap:anywhere] text-[#061a47]">{member?<Link className="underline decoration-[#075fc6]/40 underline-offset-2 hover:decoration-[#075fc6]" href={`/${locale}/members/${member.slug}`}>{sponsor.name}</Link>:sponsor.name}</strong><span className="text-xs text-[#4b608a]">{party?.shortName??group?.shortName??sponsor.groupLabel??(sponsor.sponsorType==="government"?(locale==="ro"?"Guvern":"Government"):(locale==="ro"?"Apartenență neidentificată":"Affiliation not identified"))}{(group?.chamber??sponsor.memberChamber)?` · ${chamberLabels[locale][(group?.chamber??sponsor.memberChamber)!]}`:""}</span></div>)}</div>{sponsorContexts.length>sponsorPreview.length?<details className="mt-4 border-t border-slate-200 pt-3"><summary className="cursor-pointer text-sm font-semibold text-[#075fc6]">{locale==="ro"?`Vezi toți cei ${sponsorContexts.length} de inițiatori`:`See all ${sponsorContexts.length} sponsors`}</summary><div className="mt-4 space-y-5">{sponsorGroups.map(([label,contexts])=><section key={label}><h3 className="text-xs font-bold uppercase tracking-wide text-[#4b608a]">{label} · {contexts.length}</h3><ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">{contexts.map(({sponsor,member})=><li key={sponsor.id} className="[overflow-wrap:anywhere] text-sm text-[#061a47]">{member?<Link className="underline decoration-[#075fc6]/40 underline-offset-2 hover:decoration-[#075fc6]" href={`/${locale}/members/${member.slug}`}>{sponsor.name}</Link>:sponsor.name}</li>)}</ul></section>)}</div></details>:null}</section>:null}

      <GovernmentContextPanel context={governmentContext} billSponsors={sponsorContexts} locale={locale} />

      <section className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {procedureSteps.some((step) => step.source) ? (
            <BillTimeline steps={procedureSteps} documents={documents} locale={locale} title={labels.timeline} />
          ) : (
            <div className="min-w-0 border border-slate-300 bg-white">
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
          )}

          <BillDocumentDiffPanel comparisons={comparisons} locale={locale} />
        </div>

        <aside className="min-w-0 space-y-5">
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

          <details className="border border-slate-300 bg-white">
            <summary className="cursor-pointer border-b border-slate-300 px-4 py-3 font-semibold">{labels.documents} ({documents.length})</summary>
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
          </details>
        </aside>
      </section>
    </main>
  );
}

const billPageLabels = {
  ro: {
    publicInterest: "Popular",
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
    publicInterest: "Popular",
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
