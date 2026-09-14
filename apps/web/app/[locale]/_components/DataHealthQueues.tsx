"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DataHealthReviewStatus } from "@cumsevoteaza/parliament-model";
import type { DataHealthData, HealthIssue } from "@/lib/data-health";
import { confidenceClass } from "@/lib/source-confidence";
import type { AppLocale } from "@/lib/i18n";
import { DataHealthReviewControls } from "./DataHealthReviewControls";

type SectionKey = keyof DataHealthData["sections"];
type StatusFilter = "all" | DataHealthReviewStatus;

export interface DataHealthLabels {
  eyebrow: string;
  title: string;
  subtitle: string;
  totalOpen: string;
  ocr: string;
  unlinkedVotes: string;
  duplicates: string;
  missingProcedures: string;
  weakTitles: string;
  weakParses: string;
  sectionNote: string;
  empty: string;
  openApp: string;
  official: string;
  candidates: string;
  note: string;
  reviewMode: string;
  statusFilter: string;
  allStatuses: string;
  tokenHelp: string;
  review: {
    token: string;
    note: string;
    reviewer: string;
    save: string;
    saved: string;
    failed: string;
    missingToken: string;
  };
}

const statuses: StatusFilter[] = ["all", "open", "reviewed", "ignored", "accepted", "fixed"];

export function DataHealthQueues({ data, labels, locale }: { data: DataHealthData; labels: DataHealthLabels; locale: AppLocale }) {
  const [token, setToken] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [visibleCounts, setVisibleCounts] = useState<Partial<Record<SectionKey, number>>>({});
  const sections = useMemo<Array<[SectionKey, string, HealthIssue[]]>>(() => [
    ["ocr", labels.ocr, data.sections.ocr],
    ["weakSectionParses", labels.weakParses, data.sections.weakSectionParses],
    ["unlinkedVotes", labels.unlinkedVotes, data.sections.unlinkedVotes],
    ["duplicateIdentifiers", labels.duplicates, data.sections.duplicateIdentifiers],
    ["missingProcedures", labels.missingProcedures, data.sections.missingProcedures],
    ["weakVoteTitles", labels.weakTitles, data.sections.weakVoteTitles]
  ], [data, labels]);

  return (
    <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthStat label={labels.totalOpen} value={data.counts.totalOpen} />
        <HealthStat label={labels.ocr} value={data.counts.ocr} />
        <HealthStat label={labels.weakParses} value={data.counts.weakSectionParses} />
        <HealthStat label={labels.unlinkedVotes} value={data.counts.unlinkedVotes} />
        <HealthStat label={labels.duplicates} value={data.counts.duplicateIdentifiers} />
        <HealthStat label={labels.missingProcedures} value={data.counts.missingProcedures} />
        <HealthStat label={labels.weakTitles} value={data.counts.weakVoteTitles} />
      </section>

      <details className="mt-6 border border-slate-300 bg-white p-4">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-[#061a47]">{labels.reviewMode}</summary>
        <p className="mt-2 text-xs leading-5 text-slate-600">{labels.tokenHelp}</p>
        <form className="mt-3 grid gap-2 md:grid-cols-[1fr_220px_180px]" onSubmit={(event) => event.preventDefault()}>
          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500"><span>{labels.review.token}</span><input aria-label={labels.review.token} type="password" value={token} onChange={(event) => setToken(event.target.value)} className="border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold uppercase text-slate-500"><span>{labels.review.reviewer}</span><input aria-label={labels.review.reviewer} value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-900" /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="shrink-0 text-xs font-semibold uppercase text-slate-500">{labels.statusFilter}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="min-w-0 flex-1 border border-slate-300 px-2 py-2"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>{status === "all" ? labels.allStatuses : status}</option>
              ))}
            </select>
          </label>
        </form>
      </details>

      <nav className="mt-6 flex flex-wrap gap-2 text-sm">
        {sections.map(([key, label, rows]) => (
          <a key={key} href={`#${key}`} className="border border-slate-300 bg-white px-3 py-2 font-medium text-[#061a47] hover:bg-slate-50">
            {label} <span className="text-slate-500">{filterIssues(rows, statusFilter).length}</span>
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-8">
        {sections.map(([key, label, rows]) => {
          const filteredRows = filterIssues(rows, statusFilter);
          const visibleCount = visibleCounts[key] ?? 20;
          const visibleRows = filteredRows.slice(0, visibleCount);
          return (
            <section key={key} id={key} className="border border-slate-300 bg-white">
              <div className="border-b border-slate-300 px-4 py-3">
                <h2 className="font-serif text-2xl font-semibold text-[#061a47]">{label}</h2>
                <p className="mt-1 text-sm text-slate-600">{labels.sectionNote}</p>
              </div>
              <div className="divide-y divide-slate-200">
                {filteredRows.length === 0 ? <div className="px-4 py-4 text-sm text-slate-600">{labels.empty}</div> : null}
                {visibleRows.map((issue) => (
                  <IssueRow key={issue.issueKey} issue={issue} labels={labels} locale={locale} token={token} reviewer={reviewer} reviewEnabled={Boolean(token.trim() && reviewer.trim())} />
                ))}
                {visibleRows.length < filteredRows.length ? <div className="px-4 py-4"><button type="button" onClick={() => setVisibleCounts((current) => ({ ...current, [key]: visibleCount + 20 }))} className="min-h-11 w-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-[#061a47]">{locale === "ro" ? `Arată încă ${Math.min(20, filteredRows.length - visibleRows.length)}` : `Show ${Math.min(20, filteredRows.length - visibleRows.length)} more`}</button></div> : null}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function HealthStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-300 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-serif text-3xl font-semibold text-[#061a47]">{value}</div>
    </div>
  );
}

function IssueRow({
  issue,
  labels,
  locale,
  token,
  reviewer,
  reviewEnabled
}: {
  issue: HealthIssue;
  labels: DataHealthLabels;
  locale: AppLocale;
  token: string;
  reviewer: string;
  reviewEnabled: boolean;
}) {
  const href = issue.href?.replace(/^\/ro\//, `/${locale}/`);
  const open = issue.status === "open";
  return (
    <article className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`border px-2 py-1 text-xs font-semibold uppercase ${open ? confidenceClass("needs_review") : confidenceClass("accepted_ocr")}`}>
              {issue.status}
            </span>
            <span className="font-mono text-xs text-slate-500">{issue.issueKey}</span>
          </div>
          <h3 className="mt-2 font-semibold text-slate-950">{issue.title}</h3>
          <p className="mt-1 text-sm text-slate-700">{issue.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {href ? <Link href={href} className="border border-slate-300 px-3 py-2 font-medium text-blue-800 hover:bg-slate-50">{labels.openApp}</Link> : null}
          {issue.officialUrl ? <a href={issue.officialUrl} target="_blank" rel="noreferrer" className="border border-slate-300 px-3 py-2 font-medium text-blue-800 hover:bg-slate-50">{labels.official}</a> : null}
        </div>
      </div>

      {issue.metrics ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
          {Object.entries(issue.metrics).map(([key, value]) => (
            <span key={key} className="border border-slate-200 bg-slate-50 px-2 py-1">{key}: {value}</span>
          ))}
        </div>
      ) : null}

      {issue.candidates.length > 0 ? (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase text-slate-500">{labels.candidates}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {issue.candidates.map((candidate) => (
              <div key={`${issue.issueKey}-${candidate.id}`} className="border border-slate-200 px-3 py-2 text-sm">
                {candidate.href ? <Link href={candidate.href.replace(/^\/ro\//, `/${locale}/`)} className="font-medium text-slate-950 underline">{candidate.title}</Link> : <span className="font-medium">{candidate.title}</span>}
                <div className="mt-1 text-xs text-slate-600">{candidate.reason}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{issue.action}</div>
      {issue.note ? <div className="mt-2 text-sm text-slate-600">{labels.note}: {issue.note}</div> : null}
      {reviewEnabled ? <DataHealthReviewControls issue={issue} labels={labels.review} token={token} reviewer={reviewer} /> : null}
    </article>
  );
}

function filterIssues(rows: HealthIssue[], statusFilter: StatusFilter): HealthIssue[] {
  if (statusFilter === "all") return rows;
  return rows.filter((row) => row.status === statusFilter);
}
