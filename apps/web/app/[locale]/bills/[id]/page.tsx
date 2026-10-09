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
import { BillDocumentDiffPanel } from "../../_components/BillDocumentDiffPanel";
import { BillFatePanel, BillTimeline } from "../../_components/BillDossierPanels";
import { BillOrdinanceCard } from "../../_components/BillOrdinanceCard";
import { BillReportsOpinions } from "../../_components/BillReportsOpinions";
import { BillTextSearch } from "../../_components/BillTextSearch";
import { ConfidenceBadge } from "../../_components/ConfidenceBadge";
import { EngagementTracker } from "../../_components/EngagementTracker";
import { BillDocumentTextToggle } from "../../_components/BillDocumentTextToggle";
import { GovernmentContextPanel } from "../../_components/GovernmentContextPanel";
import { HotButton } from "../../_components/HotButton";
import { PartyMark } from "../../_components/ui/PartyMark";
import { SourceBadge } from "../../_components/SourceBadge";
import { ShareButton } from "../../_components/ShareButton";

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
  const { bill, dossier, events, procedureSteps, documents, votes, source, governmentContext, sponsorContexts, ordinances = [] } = data;
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
    <main className="mx-auto max-w-page px-4 py-6 lg:px-8">
      
      <EngagementTracker entityType="bill" entityId={bill.id} locale={locale} />
      <nav aria-label={locale === "ro" ? "Unde ești" : "Breadcrumb"} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <ol className="flex min-w-0 items-center gap-2 text-muted">
          <li><Link href={`/${locale}`} className="hover:text-brand">{locale === "ro" ? "Acasă" : "Home"}</Link></li><li aria-hidden="true">›</li>
          <li><Link href={`/${locale}/bills`} className="hover:text-brand">{locale === "ro" ? "Proiecte de lege" : "Bills"}</Link></li><li aria-hidden="true">›</li>
          <li aria-current="page" className="max-w-[28ch] truncate text-ink-soft sm:max-w-[48ch]">{presentation.identifier}</li>
        </ol>
        <ShareButton href={`/${locale}/bills/${bill.slug}`} title={presentation.heading} label={locale === "ro" ? "Distribuie" : "Share"} copiedLabel={locale === "ro" ? "Link copiat" : "Link copied"} errorLabel={locale === "ro" ? "Copiază manual" : "Copy manually"} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 font-semibold text-ink-soft hover:border-line-strong" />
      </nav>
      <header className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1 basis-[22rem]">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand-strong">{presentation.identifier}</span>
            {bill.chamberOfOrigin !== "unknown" ? <span className="rounded-full bg-wash px-3 py-1 font-medium text-ink-soft">{locale === "ro" ? "Cameră de origine" : "Origin"}: {labels.chambers[bill.chamberOfOrigin]}</span> : <span className="rounded-full bg-wash px-3 py-1 font-medium text-muted">{locale === "ro" ? "Camera de origine nu a fost identificată" : "Source chamber not identified"}</span>}
            {bill.decisionChamber ? <span className="rounded-full bg-wash px-3 py-1 font-medium text-ink-soft">{labels.decisionChamber}: {labels.chambers[bill.decisionChamber]}</span> : null}
          </div>
          <h1 lang="ro" className={`mt-3 font-display font-bold tracking-tight text-ink [overflow-wrap:anywhere] ${presentation.heading.length > 220 ? "text-xl leading-snug sm:text-2xl" : presentation.heading.length > 110 ? "text-2xl leading-tight sm:text-3xl" : "text-3xl leading-[1.1] sm:text-4xl lg:text-[2.6rem]"}`}>{presentation.heading}</h1>
          {locale === "en" ? <p className="mt-2 text-sm font-medium text-muted">Official parliamentary title, in Romanian</p> : null}
          {presentation.status !== "—" ? <p className="mt-2 text-lg text-ink-soft">{presentation.status}</p> : null}
          {alternateIdentifiers.length ? <p className="mt-2 text-sm text-muted">{locale === "ro" ? "Alte numere" : "Other numbers"}: {alternateIdentifiers.join(", ")}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-2"><HotButton entityType="bill" entityId={bill.id} initialCount={hotCount} label={labels.publicInterest} />{source ? <SourceBadge source={source} label={messages.common.source} confidence={confidenceForSource(source)} locale={locale} /> : null}</div>
      </header>

      {dossier ? <BillFatePanel dossier={dossier} steps={procedureSteps} locale={locale} /> : null}

      {sponsorContexts.length ? <section className="mt-5 border border-line bg-surface p-4 rounded-card"><h2 className="font-serif text-xl font-semibold text-ink">{locale === "ro" ? `Inițiatori (${sponsorContexts.length})` : `Sponsors (${sponsorContexts.length})`}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{sponsorPreview.map(({sponsor,member,party,group})=><div key={sponsor.id} className="min-w-0 border-l-2 border-brand pl-3"><strong className="block [overflow-wrap:anywhere] text-ink">{member?<Link className="underline decoration-brand/40 underline-offset-2 hover:decoration-brand" href={`/${locale}/members/${member.slug}`}>{sponsor.name}</Link>:sponsor.name}</strong><span className="flex items-center gap-1.5 text-xs text-muted">{party||group?<PartyMark party={{shortName:party?.shortName??group!.shortName,color:group?.color??party?.color??"#94a3b8",logoAssetId:party?.logoAssetId}} size={16}/>:null}<span>{party?.shortName??group?.shortName??sponsor.groupLabel??(sponsor.sponsorType==="government"?(locale==="ro"?"Guvern":"Government"):(locale==="ro"?"Apartenență neidentificată":"Affiliation not identified"))}{(group?.chamber??sponsor.memberChamber)?` · ${chamberLabels[locale][(group?.chamber??sponsor.memberChamber)!]}`:""}</span></span></div>)}</div>{sponsorContexts.length>sponsorPreview.length?<details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold text-brand">{locale==="ro"?`Vezi toți cei ${sponsorContexts.length} de inițiatori`:`See all ${sponsorContexts.length} sponsors`}</summary><div className="mt-4 space-y-5">{sponsorGroups.map(([label,contexts])=><section key={label}><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">{contexts[0]?.party||contexts[0]?.group?<PartyMark party={{shortName:contexts[0]!.party?.shortName??contexts[0]!.group!.shortName,color:contexts[0]!.group?.color??contexts[0]!.party?.color??"#94a3b8",logoAssetId:contexts[0]!.party?.logoAssetId}} size={16}/>:null}<span>{label} · {contexts.length}</span></h3><ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">{contexts.map(({sponsor,member})=><li key={sponsor.id} className="[overflow-wrap:anywhere] text-sm text-ink">{member?<Link className="underline decoration-brand/40 underline-offset-2 hover:decoration-brand" href={`/${locale}/members/${member.slug}`}>{sponsor.name}</Link>:sponsor.name}</li>)}</ul></section>)}</div></details>:null}</section>:null}

      <GovernmentContextPanel context={governmentContext} billSponsors={sponsorContexts} locale={locale} />

      <section className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <BillOrdinanceCard ordinances={ordinances} documents={documents} locale={locale} />
          <BillReportsOpinions steps={procedureSteps} documents={documents} locale={locale} />
          {procedureSteps.some((step) => step.source) ? (
            <BillTimeline steps={procedureSteps} documents={documents} locale={locale} title={labels.timeline} />
          ) : (
            <div className="min-w-0 border border-line bg-surface">
              <div className="border-b border-line px-4 py-3 font-semibold">{labels.timeline}</div>
              <div className="divide-y divide-line">
                {timeline.map((item) => (
                  <div key={item.id} className="grid gap-2 px-4 py-4 md:grid-cols-[140px_1fr]">
                    <div className="text-sm font-medium text-ink-soft">{formatDate(item.occurredOn, locale)}</div>
                    <div>
                      <div className="font-medium text-ink">{"title" in item ? item.title : item.label}</div>
                      {"description" in item && item.description ? <div className="mt-1 text-sm text-ink-soft">{item.description}</div> : null}
                      {"committeeName" in item && item.committeeName ? <div className="mt-2 text-sm font-medium text-brand-strong">{item.committeeName}</div> : null}
                      <div className="mt-1 text-sm text-muted">{item.chamber}</div>
                    </div>
                  </div>
                ))}
                {timeline.length === 0 ? <div className="px-4 py-4 text-sm text-muted">{locale === "ro" ? "Traseul legislativ nu este încă disponibil." : "The legislative timeline is not available yet."}</div> : null}
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

          <div className="border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 font-semibold">{messages.nav.votes}</div>
            <div className="divide-y divide-line">
              {votes.map((vote) => (
                <Link key={vote.id} className="block px-4 py-3 hover:bg-wash" href={`/${locale}/votes/${vote.id}`}>
                  <div className="font-medium">{vote.title}</div>
                  <div className="text-sm text-muted">{formatDate(vote.heldOn, locale)}</div>
                </Link>
              ))}
              {votes.length === 0 ? <div className="px-4 py-4 text-sm text-muted">{locale === "ro" ? "Nu există încă voturi conectate acestui proiect." : "No votes are connected to this bill yet."}</div> : null}
            </div>
          </div>

          {committees.length > 0 ? (
            <div className="border border-line bg-surface">
              <div className="border-b border-line px-4 py-3 font-semibold">{labels.committees}</div>
              <div className="divide-y divide-line">
                {committees.map((committee) => (
                  <div key={committee} className="px-4 py-3 text-sm text-ink-soft">
                    {committee}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <details className="border border-line bg-surface">
            <summary className="cursor-pointer border-b border-line px-4 py-3 font-semibold">{labels.documents} ({documents.length})</summary>
            <div className="divide-y divide-line">
              {documents.map((document) => (
                <div key={document.id} className="px-4 py-3 text-sm">
                  <a href={document.url} target="_blank" rel="noreferrer" className="font-medium underline">
                    {document.label}
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase text-muted">{document.documentKind ?? "other"}</span>
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
                    <div className="mt-2 text-xs text-muted">{labels.textUnavailable}</div>
                  ) : null}
                </div>
              ))}
              {documents.length === 0 ? <div className="px-4 py-4 text-sm text-muted">{locale === "ro" ? "Nu există documente oficiale importate." : "No official documents have been imported."}</div> : null}
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
