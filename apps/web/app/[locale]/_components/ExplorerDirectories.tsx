"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, BarChart3, CalendarDays, FileText, Filter, Search, Share2 } from "lucide-react";
import { chamberLabels, formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "@/lib/i18n";
import type { BillExplorerItem, DirectoryFilterOptions, ExplorerFilters, ExplorerPageData, VoteExplorerItem } from "@/lib/explorer-data";
import { HotButton } from "./HotButton";

export function VoteDirectoryExplorer({
  locale,
  initialData,
  filterOptions,
  initialFilters,
  labels
}: {
  locale: AppLocale;
  initialData: ExplorerPageData<VoteExplorerItem>;
  filterOptions: DirectoryFilterOptions;
  initialFilters: ExplorerFilters;
  labels: DirectoryLabels;
}) {
  const [items, setItems] = useState(initialData.items);
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(initialData.items[0]?.vote.id);
  const selected = items.find((item) => item.vote.id === selectedId) ?? items[0];

  useEffect(() => {
    setItems(initialData.items);
    setNextCursor(initialData.nextCursor);
    setHasMore(initialData.hasMore);
  }, [initialData]);

  async function loadMore() {
    if (!hasMore || !nextCursor || isPending) return;
    startTransition(async () => {
      const response = await fetch(`/api/directory/votes?${queryString(initialFilters, nextCursor)}`);
      const data = await response.json() as ExplorerPageData<VoteExplorerItem>;
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    });
  }

  return (
    <>
      <DirectoryFilters locale={locale} kind="votes" filters={initialFilters} filterOptions={filterOptions} labels={labels} />
      <AutoLoadTrigger enabled={hasMore && !isPending} onVisible={loadMore} />
      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="divide-y divide-slate-200 border border-slate-300 bg-white">
          {items.map(({ vote, bill, hotCount }) => (
            <div key={vote.id} role="button" tabIndex={0} onClick={() => setSelectedId(vote.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(vote.id); } }} className={`group grid w-full cursor-pointer gap-4 border-l-4 px-5 py-5 text-left transition md:grid-cols-[1fr_310px] ${selected?.vote.id === vote.id ? "border-[#f7b500] bg-[#fffdf6]" : "border-transparent hover:border-[#f7b500] hover:bg-[#fbfcfd]"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase text-blue-800">
                  <BarChart3 size={16} aria-hidden="true" />
                  {formatDate(vote.heldOn, locale)} · {chamberLabels[locale][vote.chamber]}
                </div>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><h2 className="font-serif text-2xl font-semibold leading-tight text-[#071a3a]">{vote.title}</h2><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{vote.voteType}</span></div>
                {bill ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{bill.title}</p> : null}
                <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                  <HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.hot} />
                  <Link href={`/${locale}/votes/${vote.id}`} className="ml-3 inline-flex items-center gap-1 text-xs font-bold text-[#075fc6] xl:hidden">{locale === "ro" ? "Vezi detalii" : "View details"}<ArrowRight size={14}/></Link>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm md:text-right">
                <StatLine label={voteChoiceLabels[locale].for} value={vote.totals.for} tone="text-emerald-700" />
                <StatLine label={voteChoiceLabels[locale].against} value={vote.totals.against} tone="text-red-700" />
                <StatLine label={voteChoiceLabels[locale].abstention} value={vote.totals.abstention} tone="text-amber-700" />
                <StatLine label={labels.present} value={vote.totals.present} tone="text-slate-700" />
              </div>
            </div>
          ))}
          {isPending ? <DirectorySkeleton /> : null}
        </div>
        {selected ? <aside className="self-start border border-slate-300 bg-white p-5 xl:sticky xl:top-24">
          <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-[#075fc6]"><span>{chamberLabels[locale][selected.vote.chamber]}</span><Share2 size={17} aria-hidden="true" /></div>
          <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-[#061a47]">{selected.vote.title}</h2>
          {selected.bill ? <p className="mt-3 text-sm leading-6 text-[#4b608a]">{selected.bill.title}</p> : null}
          <div className="mt-4 flex items-center gap-2 border-y border-slate-200 py-3 text-sm text-[#4b608a]"><CalendarDays size={17} />{formatDate(selected.vote.heldOn, locale)} · {selected.vote.voteType}</div>
          <div className="mt-5 grid grid-cols-2 gap-3"><StatLine label={voteChoiceLabels[locale].for} value={selected.vote.totals.for} tone="text-emerald-700" /><StatLine label={voteChoiceLabels[locale].against} value={selected.vote.totals.against} tone="text-red-700" /><StatLine label={voteChoiceLabels[locale].abstention} value={selected.vote.totals.abstention} tone="text-amber-700" /><StatLine label={labels.present} value={selected.vote.totals.present} tone="text-[#061a47]" /></div>
          <Link href={`/${locale}/votes/${selected.vote.id}`} className="mt-5 flex items-center justify-center gap-2 bg-[#061a47] px-4 py-3 text-sm font-bold !text-white hover:bg-[#102d5b]">{locale === "ro" ? "Vezi votul complet" : "Open full vote"}<ArrowRight size={17} /></Link>
        </aside> : null}
      </section>
      <LoadMoreButton hasMore={hasMore} isPending={isPending} labels={labels} onClick={loadMore} />
    </>
  );
}

export function BillDirectoryExplorer({
  locale,
  initialData,
  filterOptions,
  initialFilters,
  labels
}: {
  locale: AppLocale;
  initialData: ExplorerPageData<BillExplorerItem>;
  filterOptions: DirectoryFilterOptions;
  initialFilters: ExplorerFilters;
  labels: DirectoryLabels;
}) {
  const [items, setItems] = useState(initialData.items);
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor);
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialData.items);
    setNextCursor(initialData.nextCursor);
    setHasMore(initialData.hasMore);
  }, [initialData]);

  async function loadMore() {
    if (!hasMore || !nextCursor || isPending) return;
    startTransition(async () => {
      const response = await fetch(`/api/directory/bills?${queryString(initialFilters, nextCursor)}`);
      const data = await response.json() as ExplorerPageData<BillExplorerItem>;
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    });
  }

  return (
    <>
      <DirectoryFilters locale={locale} kind="bills" filters={initialFilters} filterOptions={filterOptions} labels={labels} />
      <AutoLoadTrigger enabled={hasMore && !isPending} onVisible={loadMore} />
      <section className="mt-6 border border-slate-300 bg-white">
        <div className="divide-y divide-slate-200">
          {items.map(({ bill, submittedOn, latestEventOn, voteCount, hotCount }) => (
            <Link key={bill.id} href={`/${locale}/bills/${bill.slug}`} className="grid gap-4 px-4 py-4 hover:bg-slate-50 md:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase text-blue-800">
                  <FileText size={16} aria-hidden="true" />
                  {bill.identifiers.senate ?? bill.identifiers.deputies ?? bill.id}
                </div>
                <h2 className="mt-2 line-clamp-2 font-serif text-xl font-semibold text-[#061a47]">{cleanBillTitle(bill.title)}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{cleanBillStatus(bill.status)}</p>
                <div className="mt-3" onClick={(event) => event.preventDefault()}>
                  <HotButton entityType="bill" entityId={bill.id} initialCount={hotCount} label={labels.hot} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm md:text-right">
                <Metric label={labels.submitted} value={submittedOn ? formatDate(submittedOn, locale) : "-"} />
                <Metric label={labels.latestEvent} value={latestEventOn ? formatDate(latestEventOn, locale) : "-"} />
                <Metric label={labels.votes} value={String(voteCount)} />
                <Metric label={labels.origin} value={bill.chamberOfOrigin === "unknown" ? "—" : chamberLabels[locale][bill.chamberOfOrigin]} />
              </dl>
            </Link>
          ))}
          {isPending ? <DirectorySkeleton /> : null}
        </div>
      </section>
      <LoadMoreButton hasMore={hasMore} isPending={isPending} labels={labels} onClick={loadMore} />
    </>
  );
}

function DirectoryFilters({
  locale,
  kind,
  filters,
  filterOptions,
  labels
}: {
  locale: AppLocale;
  kind: "votes" | "bills";
  filters: ExplorerFilters;
  filterOptions: DirectoryFilterOptions;
  labels: DirectoryLabels;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const years = useMemo(() => ["2024", "2025", "2026"], []);
  const path = `/${locale}/${kind}`;

  return (
    <form
      ref={formRef}
      className="relative mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const key of ["q", "legislature", "year", "month", "chamber", "sourceStatus", "group"]) {
          const value = String(data.get(key) ?? "").trim();
          if (value) params.set(key, value);
        }
        router.push(`${path}${params.toString() ? `?${params}` : ""}`);
      }}
    >
      <div className="flex min-w-0 border border-[#bac6d8] bg-white focus-within:outline focus-within:outline-3 focus-within:outline-blue-100"><label className="flex min-w-0 flex-1 items-center gap-3 px-4"><Search size={21} className="shrink-0 text-[#061a47]" aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" name="q" defaultValue={filters.q ?? ""} placeholder={labels.search} /></label><button className="bg-[#061a47] px-6 text-sm font-bold text-white hover:bg-[#102d5b]" type="submit">{locale === "ro" ? "Caută" : "Search"}</button></div>
      <details className="group relative"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 border border-[#9eabc0] bg-white text-sm font-semibold text-[#061a47]"><Filter size={19}/>{locale === "ro" ? "Filtre" : "Filters"}<span aria-hidden="true">⌄</span></summary><div className="absolute right-0 z-30 mt-2 w-[min(620px,calc(100vw-32px))] border border-slate-300 bg-white p-4 shadow-xl"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select name="legislature" label={labels.legislature} defaultValue={filters.legislature ?? ""} options={filterOptions.legislatures.map((legislature) => [legislature.id, legislature.label])} />
        <Select name="year" label={labels.year} defaultValue={filters.year ?? ""} options={years.map((year) => [year, year])} />
        <Select name="month" label={labels.month} defaultValue={filters.month ?? ""} options={monthOptions(locale)} />
        <Select name="chamber" label={labels.chamber} defaultValue={filters.chamber ?? ""} options={[["senate", chamberLabels[locale].senate],["deputies", chamberLabels[locale].deputies]]} />
        <Select name="sourceStatus" label={labels.sourceStatus} defaultValue={filters.sourceStatus ?? ""} options={[["parsed", locale === "ro" ? "Verificată" : "Verified"],["partial", locale === "ro" ? "Parțială" : "Partial"],["failed", locale === "ro" ? "Cu eroare" : "Failed"]]} />
        <Select name="group" label={labels.group} defaultValue={filters.group ?? ""} options={filterOptions.groups.map((group) => [group.id, `${group.shortName} · ${chamberLabels[locale][group.chamber]}`])} />
      </div><button className="mt-4 w-full bg-[#061a47] px-4 py-2.5 text-sm font-bold text-white" type="submit">{labels.apply}</button></div></details>
    </form>
  );
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[][] }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase text-[#4b608a]">
      {label}
      <select name={name} defaultValue={defaultValue} className="min-w-0 border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case text-slate-900">
        <option value="">{name === "year" || name === "month" ? ("—") : ("Toate")}</option>
        {options.map(([value, optionLabel]) => (
          <option key={value} value={value}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function AutoLoadTrigger({ enabled, onVisible }: { enabled: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onVisible();
    }, { rootMargin: "600px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, onVisible]);

  return <div ref={ref} className="h-px" aria-hidden="true" />;
}

function LoadMoreButton({ hasMore, isPending, labels, onClick }: { hasMore: boolean; isPending: boolean; labels: DirectoryLabels; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="mt-5 flex justify-center">
      <button disabled={isPending} type="button" onClick={onClick} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
        {isPending ? labels.loading : labels.loadMore}
      </button>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_280px]">
          <div>
            <div className="h-4 w-40 animate-pulse bg-slate-200" />
            <div className="mt-3 h-5 w-4/5 animate-pulse bg-slate-200" />
            <div className="mt-2 h-4 w-2/3 animate-pulse bg-slate-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 animate-pulse bg-slate-200" />
            <div className="h-10 animate-pulse bg-slate-200" />
          </div>
        </div>
      ))}
    </>
  );
}

function StatLine({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function queryString(filters: ExplorerFilters, cursor: string): string {
  const params = new URLSearchParams({ limit: "10", cursor });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function monthOptions(locale: AppLocale): string[][] {
  return Array.from({ length: 12 }).map((_, index) => {
    const month = String(index + 1);
    const label = new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-US", { month: "long" }).format(new Date(Date.UTC(2025, index, 1)));
    return [month, label];
  });
}

function cleanBillTitle(value: string): string {
  return value
    .replace(/\s+în termenul acordat pentru avize[\s\S]*$/i, "")
    .replace(/\s+inițiator(?:i)?:[\s\S]*$/i, "")
    .replace(/\s+initiator(?:i)?:[\s\S]*$/i, "")
    .trim();
}

function cleanBillStatus(value: string): string {
  const metadataStart = /\s+(?:inițiator(?:i)?|initiator(?:i)?|consultare publică|consultați|consultati|prioritate legislativă|prioritate legislativa|data acțiunea|data actiunea):/i;
  return value.split(metadataStart, 1)[0]?.trim() || "—";
}

export interface DirectoryLabels {
  title: string;
  subtitle: string;
  present: string;
  submitted: string;
  latestEvent: string;
  origin: string;
  votes: string;
  hot: string;
  loadMore: string;
  loading: string;
  apply: string;
  search: string;
  legislature: string;
  year: string;
  month: string;
  chamber: string;
  sourceStatus: string;
  group: string;
}
