"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, BarChart3, FileText, Filter, LoaderCircle, Search } from "lucide-react";
import { chamberLabels, formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "@/lib/i18n";
import { presentBill, presentVote } from "@/lib/public-presentation";
import type { BillExplorerItem, DirectoryFilterOptions, ExplorerFilters, ExplorerPageData, VoteExplorerItem } from "@/lib/explorer-data";
import { HotButton } from "./HotButton";
import { VotePreview } from "./VotePreview";
import { DismissibleDetails } from "./DismissibleDetails";

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
  const [navigatingId, setNavigatingId] = useState<string>();
  const router = useRouter();
  const selected = items.find((item) => item.vote.id === selectedId) ?? items[0];

  useEffect(() => {
    setItems(initialData.items);
    setNextCursor(initialData.nextCursor);
    setHasMore(initialData.hasMore);
    const selectedFromUrl = new URL(window.location.href).searchParams.get("selected");
    setSelectedId(initialData.items.some((item) => item.vote.id === selectedFromUrl) ? selectedFromUrl ?? undefined : initialData.items[0]?.vote.id);
  }, [initialData]);

  useEffect(() => {
    const syncSelection = () => {
      const selectedFromUrl = new URL(window.location.href).searchParams.get("selected");
      if (selectedFromUrl && items.some((item) => item.vote.id === selectedFromUrl)) setSelectedId(selectedFromUrl);
    };
    window.addEventListener("popstate", syncSelection);
    return () => window.removeEventListener("popstate", syncSelection);
  }, [items]);

  function selectVote(id: string) {
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setNavigatingId(id);
      router.push(`/${locale}/votes/${id}`);
      return;
    }
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("selected", id);
    window.history.pushState({}, "", url);
  }

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
      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="divide-y divide-slate-200 border border-slate-300 bg-white">
          {items.map(({ vote, bill, source, hotCount }) => {
            const presentation = presentVote(vote, { locale, bill, source });
            return (
            <div key={vote.id} role="button" tabIndex={0} aria-pressed={selected?.vote.id === vote.id} aria-busy={navigatingId === vote.id} onClick={() => selectVote(vote.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectVote(vote.id); } }} className={`group relative w-full cursor-pointer border-l-4 px-5 py-5 text-left transition ${selected?.vote.id === vote.id ? "border-[#f7b500] bg-[#fffdf6]" : "border-transparent hover:border-[#f7b500] hover:bg-[#fbfcfd]"} ${navigatingId === vote.id ? "pointer-events-none opacity-60" : ""}`}>
              {navigatingId === vote.id ? <span className="absolute right-4 top-4 inline-flex items-center gap-2 bg-white px-2 py-1 text-xs font-bold text-[#075fc6]"><LoaderCircle className="animate-spin" size={15}/>{locale === "ro" ? "Se deschide…" : "Opening…"}</span> : null}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase text-blue-800">
                  <BarChart3 size={16} aria-hidden="true" />
                  {formatDate(vote.heldOn, locale)} · {chamberLabels[locale][vote.chamber]}
                </div>
                {locale === "en" ? <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Official title in Romanian</div> : null}
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 font-serif text-2xl font-semibold leading-tight text-[#071a3a]">{presentation.heading}</h2><span className="shrink-0 border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{vote.voteType}</span></div>
                {presentation.subject ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{presentation.subject}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-3" onClick={(event) => event.stopPropagation()}>
                  <HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.hot} />
                  <Link href={`/${locale}/votes/${vote.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#075fc6]">{locale === "ro" ? "Vezi votul complet" : "Open full vote"}<ArrowRight size={14}/></Link>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm sm:grid-cols-4">
                <StatLine label={voteChoiceLabels[locale].for} value={vote.totals.for} tone="text-emerald-700" />
                <StatLine label={voteChoiceLabels[locale].against} value={vote.totals.against} tone="text-red-700" />
                <StatLine label={voteChoiceLabels[locale].abstention} value={vote.totals.abstention} tone="text-amber-700" />
                <StatLine label={labels.present} value={vote.totals.present} tone="text-slate-700" />
              </div>
            </div>
          );})}
          {isPending ? <DirectorySkeleton /> : null}
        </div>
        {selected ? <VotePreview locale={locale} item={selected} /> : null}
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
      <section className="mt-6 border border-slate-300 bg-white">
        <div className="divide-y divide-slate-200">
          {items.map(({ bill, submittedOn, latestEventOn, voteCount, hotCount }) => {
            const presentation = presentBill(bill);
            return (
            <Link key={bill.id} href={`/${locale}/bills/${bill.slug}`} className="grid gap-4 px-4 py-4 hover:bg-slate-50 md:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase text-blue-800">
                  <FileText size={16} aria-hidden="true" />
                  {bill.identifiers.deputies ? <span>{locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies"}: {bill.identifiers.deputies}</span> : null}
                  {bill.identifiers.senate ? <span className="border-l border-slate-300 pl-2">Senat: {bill.identifiers.senate}</span> : null}
                  {!bill.identifiers.senate && !bill.identifiers.deputies ? bill.id : null}
                </div>
                {locale === "en" ? <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Official title in Romanian</div> : null}
                <h2 className="mt-2 line-clamp-2 font-serif text-xl font-semibold text-[#061a47]">{presentation.heading}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{presentation.status}</p>
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
          );})}
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
  const activeFilters = Object.entries(filters).filter(([, value]) => Boolean(value));

  return (
    <form
      ref={formRef}
      className="relative mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]"
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
      <DismissibleDetails className="relative" summary={<summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 border border-[#9eabc0] bg-white text-sm font-semibold text-[#061a47]"><Filter size={19}/>{locale === "ro" ? "Filtre" : "Filters"}{activeFilters.length ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#061a47] px-1 text-[11px] text-white">{activeFilters.length}</span> : null}<span aria-hidden="true">⌄</span></summary>} panelClassName="absolute right-0 z-30 mt-2 w-[min(620px,calc(100vw-32px))] border border-slate-300 bg-white p-4 shadow-xl"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select name="legislature" label={labels.legislature} defaultValue={filters.legislature ?? ""} options={filterOptions.legislatures.map((legislature) => [legislature.id, legislature.label])} />
        <Select name="year" label={labels.year} defaultValue={filters.year ?? ""} options={years.map((year) => [year, year])} />
        <Select name="month" label={labels.month} defaultValue={filters.month ?? ""} options={monthOptions(locale)} />
        <Select name="chamber" label={labels.chamber} defaultValue={filters.chamber ?? ""} options={[["senate", chamberLabels[locale].senate],["deputies", chamberLabels[locale].deputies]]} />
        <Select name="sourceStatus" label={labels.sourceStatus} defaultValue={filters.sourceStatus ?? ""} options={[["parsed", locale === "ro" ? "Verificată" : "Verified"],["partial", locale === "ro" ? "Parțială" : "Partial"],["failed", locale === "ro" ? "Cu eroare" : "Failed"]]} />
        <Select name="group" label={labels.group} defaultValue={filters.group ?? ""} options={filterOptions.groups.map((group) => [group.id, `${group.shortName} · ${chamberLabels[locale][group.chamber]}`])} />
      </div><div className="mt-4 flex gap-2"><Link href={path} className="flex-1 border border-slate-300 px-4 py-2.5 text-center text-sm font-bold text-[#061a47]">{locale === "ro" ? "Resetează" : "Reset"}</Link><button className="flex-1 bg-[#061a47] px-4 py-2.5 text-sm font-bold text-white" type="submit">{labels.apply}</button></div></DismissibleDetails>
      {activeFilters.length ? <div className="flex flex-wrap gap-2 sm:col-span-2">{activeFilters.map(([key, value]) => <span key={key} className="border border-[#cbd5e1] bg-white px-2.5 py-1 text-xs text-[#4b608a]">{key}: <strong className="text-[#061a47]">{value}</strong></span>)}</div> : null}
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
