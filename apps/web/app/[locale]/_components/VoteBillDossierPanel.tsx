"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate, type Bill, type BillProcedureStep, type DocumentSource, type GovernanceAlignment } from "@cumsevoteaza/parliament-model";
import type { BillSponsorContext } from "@/lib/data";
import type { AppLocale } from "@/lib/i18n";
import type { SourceConfidence } from "@/lib/source-confidence";
import { confidenceForDocument } from "@/lib/source-confidence";
import { BillDocumentTextToggle } from "./BillDocumentTextToggle";
import { ConfidenceBadge } from "./ConfidenceBadge";

type VoteBillDossierLabels = {
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
};

export function VoteBillDossierPanel({
  locale,
  bill,
  billHref,
  voteDate,
  procedureSteps,
  documents,
  documentConfidence = {},
  sponsorNames,
  sponsorOverflowCount,
  sponsorContexts = [],
  labels
}: {
  locale: AppLocale;
  bill: Bill;
  billHref: string;
  voteDate: string;
  procedureSteps: BillProcedureStep[];
  documents: DocumentSource[];
  documentConfidence?: Record<string, SourceConfidence>;
  sponsorNames: string[];
  sponsorOverflowCount: number;
  sponsorContexts?: BillSponsorContext[];
  labels: VoteBillDossierLabels;
}) {
  const [open, setOpen] = useState(false);
  const billIdentifiers = [bill.identifiers.senate, bill.identifiers.deputies].filter(Boolean).join(" / ");
  const previewSteps = procedureSteps
    .filter((step) => step.occurredOn <= voteDate)
    .slice(-3)
    .reverse();
  const documentKinds = uniqueDisplayNames(documents.flatMap((document) => (document.documentKind ? [document.documentKind] : []))).slice(0, 4);
  const storedTextDocuments = documents.filter((document) => document.textStatus === "stored");

  return (
    <section className="mt-3 max-w-5xl border border-line bg-white text-sm">
      <div className="p-4">
        <div className="text-xs font-semibold uppercase text-brand-strong">{labels.billDossier}</div>
        <Link href={billHref} className="font-medium text-ink underline">
          {billIdentifiers ? `${billIdentifiers} · ` : null}
          {bill.title}
        </Link>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
          {bill.status ? <span>{bill.status}</span> : null}
          {bill.decisionChamber ? <span>{labels.decisionChamber}: {labels.chambers[bill.decisionChamber] ?? bill.decisionChamber}</span> : null}
          {documents.length > 0 ? <span>{labels.documents}: {documents.length}</span> : null}
          {documentKinds.length > 0 ? (
            <span>{documentKinds.map((kind) => labels.documentKinds[kind] ?? kind).join(", ")}</span>
          ) : null}
        </div>
        {sponsorNames.length > 0 ? (
          <div className="mt-3 text-xs text-ink-soft">
            <span className="font-semibold uppercase text-muted">{labels.initiators}</span>{" "}
            {sponsorNames.join(", ")}
            {sponsorOverflowCount > 0 ? ` +${sponsorOverflowCount}` : null}
          </div>
        ) : null}
        {sponsorContexts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sponsorContexts.slice(0, 8).map((item) => (
              <span key={item.sponsor.id} className="inline-flex items-center gap-1 border border-line px-2 py-1 text-xs text-ink-soft">
                <span className="font-medium">{item.group?.shortName ?? item.party?.shortName ?? item.sponsor.name}</span>
                <span className="text-muted">{alignmentLabel(item.alignment, locale)}</span>
              </span>
            ))}
            {sponsorContexts.length > 8 ? <span className="border border-line px-2 py-1 text-xs text-muted">+{sponsorContexts.length - 8}</span> : null}
          </div>
        ) : null}
      </div>

      {previewSteps.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <div className="text-xs font-semibold uppercase text-muted">{labels.recentProcedure}</div>
          <ol className="mt-2 grid gap-2 text-xs text-ink-soft">
            {previewSteps.map((step) => (
              <li key={step.id} className="grid gap-1 md:grid-cols-[7rem_1fr]">
                <span className="font-semibold text-muted">{formatDate(step.occurredOn, locale)}</span>
                <span>
                  <span className="font-medium text-ink">{step.title}</span>
                  {step.committeeName ? <span className="text-muted"> · {step.committeeName}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="border-t border-line p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-wash"
          aria-expanded={open}
        >
          {open ? labels.hideFullDossier : labels.showFullDossier}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line">
          <section className="p-4">
            <div className="font-semibold text-ink">{labels.fullProcedure}</div>
            <ol className="mt-3 divide-y divide-line border border-line">
              {procedureSteps.map((step) => (
                <li key={step.id} className="grid gap-2 md:grid-cols-[8rem_1fr]">
                  <div className="bg-wash px-3 py-3 text-sm font-semibold text-muted">
                    {formatDate(step.occurredOn, locale)}
                  </div>
                  <div className="px-3 py-3">
                    <div className="font-medium text-ink">{step.title}</div>
                    {step.description ? <div className="mt-1 text-sm leading-6 text-ink-soft">{step.description}</div> : null}
                    {step.committeeName ? <div className="mt-2 text-sm font-medium text-brand-strong">{step.committeeName}</div> : null}
                    <div className="mt-1 text-xs uppercase text-muted">{labels.chambers[step.chamber] ?? step.chamber}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="border-t border-line p-4">
            <div className="font-semibold text-ink">{labels.extractedText}</div>
            {storedTextDocuments.length > 0 ? (
              <div className="mt-3 grid gap-3">
                {storedTextDocuments.map((document) => (
                  <div key={document.id} className="border border-line p-3">
                    <div className="font-medium text-ink">{document.label}</div>
                    <div className="mt-1 text-xs uppercase text-muted">
                      {document.documentKind ? labels.documentKinds[document.documentKind] ?? document.documentKind : labels.documentKinds.other}
                    </div>
                    <div className="mt-2">
                      <ConfidenceBadge confidence={documentConfidence[document.id] ?? confidenceForDocument({ textStatus: document.textStatus })} locale={locale} />
                    </div>
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">{labels.noExtractedText}</p>
            )}
          </section>

          {documents.length > 0 ? (
            <section className="border-t border-line p-4">
              <div className="font-semibold text-ink">{labels.officialDocuments}</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {documents.map((document) => (
                  <a
                    key={document.id}
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-line px-3 py-2 text-sm hover:bg-wash"
                  >
                    <span className="font-medium text-ink underline">{document.label}</span>
                    <span className="mt-1 block text-xs uppercase text-muted">
                      {document.documentKind ? labels.documentKinds[document.documentKind] ?? document.documentKind : labels.documentKinds.other}
                    </span>
                    <span className="mt-2 block">
                      <ConfidenceBadge confidence={documentConfidence[document.id] ?? confidenceForDocument({ textStatus: document.textStatus })} locale={locale} />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <div className="border-t border-line p-4">
            <Link href={billHref} className="text-sm font-medium text-brand-strong underline">
              {labels.fullBillPage}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function alignmentLabel(alignment: GovernanceAlignment, locale: AppLocale): string {
  const labels = {
    ro: {
      government: "guvern",
      governing_support: "susținere",
      opposition: "opoziție",
      mixed: "mixt",
      unaffiliated: "neafiliat",
      unknown: "necunoscut"
    },
    en: {
      government: "government",
      governing_support: "support",
      opposition: "opposition",
      mixed: "mixed",
      unaffiliated: "unaffiliated",
      unknown: "unknown"
    }
  } satisfies Record<AppLocale, Record<GovernanceAlignment, string>>;
  return labels[locale][alignment];
}

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
