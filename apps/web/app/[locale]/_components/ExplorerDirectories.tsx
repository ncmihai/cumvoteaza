"use client";

import { OfficialText } from "./OfficialText";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, FileText, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { chamberLabels, formatDate, voteChamberLabels, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "@/lib/i18n";
import { presentBill, presentVote } from "@/lib/public-presentation";
import type { BillExplorerItem, DirectoryFilterOptions, ExplorerFilters, ExplorerPageData, VoteExplorerItem } from "@/lib/explorer-data";
import { HotButton } from "./HotButton";
import { VotePreview } from "./VotePreview";
import { DismissibleDetails } from "./DismissibleDetails";
import { OutcomeBadge } from "./ui/OutcomeBadge";
import { SplitBar, countsOfTotals } from "./ui/SplitBar";
import { VOTE_LABEL, VOTE_STYLE } from "./ui/vote-meaning";

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
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
      try {
        const response = await fetch(`/api/directory/votes?${queryString(initialFilters, nextCursor)}`);
        if (!response.ok) throw new Error(`Vote directory request failed: ${response.status}`);
        const data = await response.json() as ExplorerPageData<VoteExplorerItem>;
        setItems((current) => [...current, ...data.items]);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch {
        setLoadError(true);
      }
    });
  }

  return (
    <>
      <DirectoryFilters locale={locale} kind="votes" filters={initialFilters} filterOptions={filterOptions} labels={labels} />
      {loadError ? <DirectoryMessage tone="error" message={labels.error} /> : null}
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div data-testid="vote-directory-list" className="grid content-start gap-3">
          {items.length === 0 ? <DirectoryMessage message={labels.empty} /> : null}
          {items.map(({ vote, bill, source, hotCount }) => {
            const presentation = presentVote(vote, { locale, bill, source });
            const counts = countsOfTotals(presentation.totals);
            const isSelected = selected?.vote.id === vote.id;
            return (
            <article key={vote.id} aria-current={isSelected ? "true" : undefined} aria-busy={navigatingId === vote.id} className={`group relative rounded-card border bg-surface p-4 transition hover:shadow-lift sm:p-5 ${isSelected ? "border-brand shadow-lift ring-1 ring-brand" : "border-line hover:border-line-strong"} ${navigatingId === vote.id ? "pointer-events-none opacity-60" : ""}`}>
              {navigatingId === vote.id ? <span className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-surface px-2 py-1 text-xs font-semibold text-brand"><LoaderCircle className="animate-spin" size={15} aria-hidden="true"/>{locale === "ro" ? "Se deschide…" : "Opening…"}</span> : null}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <span className="rounded-full bg-wash px-2.5 py-0.5 font-medium text-ink-soft">{voteChamberLabels[locale][vote.chamber]}</span>
                <time dateTime={vote.heldOn}>{formatDate(vote.heldOn, locale)}</time>
                <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-soft">{vote.voteType}</span>
              </div>
              {locale === "en" ? <p className="mt-2 text-xs font-medium text-muted">Official title in Romanian</p> : null}
              <h2 className="mt-2 font-display text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">
                <button type="button" aria-pressed={isSelected} onClick={() => selectVote(vote.id)} className="text-left after:absolute after:inset-0 after:content-[''] after:rounded-card focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-brand">{presentation.heading}</button>
              </h2>
              {presentation.subject ? <OfficialText className="mt-1 line-clamp-2 text-sm leading-6 text-muted" text={presentation.subject} locale={locale}/> : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <OutcomeBadge outcome={presentation.outcome} label={presentation.outcomeLabel} size="sm" />
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {(["for", "against", "abstain"] as const).map((kind) => (
                    <div key={kind} className="flex items-baseline gap-1.5">
                      <dt className="sr-only">{VOTE_LABEL[locale][kind]}</dt>
                      <dd className={`font-display text-lg font-bold tabular-nums ${VOTE_STYLE[kind].text}`}>{counts[kind] ?? 0}</dd>
                      <span aria-hidden="true" className="text-muted">{VOTE_LABEL[locale][kind].toLowerCase()}</span>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-3"><SplitBar counts={counts} locale={locale} height="h-2" /></div>
              <div className="relative z-10 mt-3 flex flex-wrap items-center gap-3">
                <HotButton entityType="vote" entityId={vote.id} initialCount={hotCount} label={labels.hot} />
                <Link href={`/${locale}/votes/${vote.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-strong">{locale === "ro" ? "Vezi votul complet" : "Open full vote"}<ArrowRight size={14} aria-hidden="true"/></Link>
              </div>
            </article>
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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setItems(initialData.items);
    setNextCursor(initialData.nextCursor);
    setHasMore(initialData.hasMore);
  }, [initialData]);

  async function loadMore() {
    if (!hasMore || !nextCursor || isPending) return;
    startTransition(async () => {
      setLoadError(false);
      try {
        const response = await fetch(`/api/directory/bills?${queryString(initialFilters, nextCursor)}`);
        if (!response.ok) throw new Error(`Bill directory request failed: ${response.status}`);
        const data = await response.json() as ExplorerPageData<BillExplorerItem>;
        setItems((current) => [...current, ...data.items]);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch {
        setLoadError(true);
      }
    });
  }

  return (
    <>
      <DirectoryFilters locale={locale} kind="bills" filters={initialFilters} filterOptions={filterOptions} labels={labels} />
      {loadError ? <DirectoryMessage tone="error" message={labels.error} /> : null}
      <section className="mt-6 grid gap-3">
        {items.length === 0 ? <DirectoryMessage message={labels.empty} /> : null}
        {items.map(({ bill, submittedOn, latestEventOn, voteCount, hotCount }) => {
          const presentation = presentBill(bill);
          return (
          <article key={bill.id} className="group relative grid gap-4 rounded-card border border-line bg-surface p-4 transition hover:border-line-strong hover:shadow-lift sm:p-5 md:grid-cols-[1fr_280px]">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <FileText size={16} aria-hidden="true" className="text-brand" />
                {bill.identifiers.deputies ? <span className="rounded-full bg-wash px-2.5 py-0.5 font-medium text-ink-soft">{locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies"}: {bill.identifiers.deputies}</span> : null}
                {bill.identifiers.senate ? <span className="rounded-full bg-wash px-2.5 py-0.5 font-medium text-ink-soft">Senat: {bill.identifiers.senate}</span> : null}
                {!bill.identifiers.senate && !bill.identifiers.deputies ? <span>{bill.id}</span> : null}
              </p>
              {locale === "en" ? <p className="mt-2 text-xs font-medium text-muted">Official title in Romanian</p> : null}
              <h2 className="mt-2 line-clamp-2 font-display text-xl font-bold leading-tight text-ink">
                <Link href={`/${locale}/bills/${bill.slug}`} className="after:absolute after:inset-0 after:rounded-card after:content-['']">{presentation.heading}</Link>
              </h2>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{presentation.status}</p>
              <div className="relative z-10 mt-3">
                <HotButton entityType="bill" entityId={bill.id} initialCount={hotCount} label={labels.hot} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm md:text-right">
              <Metric label={labels.submitted} value={submittedOn ? formatDate(submittedOn, locale) : "-"} />
              <Metric label={labels.latestEvent} value={latestEventOn ? formatDate(latestEventOn, locale) : "-"} />
              <Metric label={labels.votes} value={String(voteCount)} />
              <Metric label={labels.origin} value={bill.chamberOfOrigin === "unknown" ? "—" : chamberLabels[locale][bill.chamberOfOrigin]} />
            </dl>
          </article>
        );})}
        {isPending ? <DirectorySkeleton /> : null}
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
  const ro = locale === "ro";
  const path = `/${locale}/${kind}`;
  const hrefWith = (change: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...change })) if (value) params.set(key, value);
    return `${path}${params.toString() ? `?${params}` : ""}`;
  };
  // The chamber is a row of buttons of its own, so it is left out of the drop-down and from the count of filters in it.
  const dropdownFilters = Object.entries(filters).filter(([key, value]) => Boolean(value) && key !== "chamber" && key !== "q");
  const chambers: Array<[string, string]> = [["", ro ? "Toate" : "All"], ["deputies", chamberLabels[locale].deputies], ["senate", chamberLabels[locale].senate], ...(kind === "votes" ? [["joint", voteChamberLabels[locale].joint] as [string, string]] : [])];
  const sourceLabels: Record<string, string> = { parsed: ro ? "Preluată complet" : "Fully parsed", partial: ro ? "Parțială" : "Partial", failed: ro ? "Cu eroare" : "Failed" };
  const chipText = (key: string, value: string): string => {
    if (key === "legislature") return `${labels.legislature}: ${filterOptions.legislatures.find((item) => item.id === value)?.label ?? value}`;
    if (key === "group") { const group = filterOptions.groups.find((item) => item.id === value); return `${labels.group}: ${group ? `${group.shortName} · ${chamberLabels[locale][group.chamber]}` : value}`; }
    if (key === "month") return `${labels.month}: ${monthOptions(locale).find(([id]) => id === value)?.[1] ?? value}`;
    if (key === "year") return `${labels.year}: ${value}`;
    if (key === "sourceStatus") return `${labels.sourceStatus}: ${sourceLabels[value] ?? value}`;
    return `${key}: ${value}`;
  };

  return (
    <div className="mt-5">
      <form
        ref={formRef}
        className="relative grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
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
        <input type="hidden" name="chamber" value={filters.chamber ?? ""} />
        <div className="flex min-w-0 overflow-hidden rounded-full border border-line-strong bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft">
          <label className="flex min-w-0 flex-1 items-center gap-3 pl-4">
            <Search size={20} className="shrink-0 text-muted" aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted" name="q" defaultValue={filters.q ?? ""} placeholder={labels.search} aria-label={labels.search} />
          </label>
          <button type="submit" className="m-1 rounded-full bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-strong">{ro ? "Caută" : "Search"}</button>
        </div>
        <DismissibleDetails
          className="relative"
          summary={<summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-wash"><SlidersHorizontal size={18} aria-hidden="true"/>{ro ? "Filtre" : "Filters"}{dropdownFilters.length ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-xs text-white">{dropdownFilters.length}</span> : null}</summary>}
          panelClassName="absolute right-0 top-14 z-40 w-[min(92vw,34rem)] rounded-card border border-line bg-surface p-4 shadow-lift"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Select name="legislature" label={labels.legislature} defaultValue={filters.legislature ?? ""} options={filterOptions.legislatures.map((legislature) => [legislature.id, legislature.label])} />
            <Select name="year" label={labels.year} defaultValue={filters.year ?? ""} options={years.map((year) => [year, year])} />
            <Select name="month" label={labels.month} defaultValue={filters.month ?? ""} options={monthOptions(locale)} />
            <Select name="sourceStatus" label={labels.sourceStatus} defaultValue={filters.sourceStatus ?? ""} options={Object.entries(sourceLabels)} />
            <Select name="group" label={labels.group} defaultValue={filters.group ?? ""} options={filterOptions.groups.map((group) => [group.id, `${group.shortName} · ${chamberLabels[locale][group.chamber]}`])} />
          </div>
          <div className="mt-4 flex gap-2">
            <Link href={path} className="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-semibold text-ink hover:bg-wash">{ro ? "Resetează" : "Reset"}</Link>
            <button className="flex-1 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong" type="submit">{labels.apply}</button>
          </div>
        </DismissibleDetails>
      </form>
      <nav aria-label={labels.chamber} className="mt-3 flex flex-wrap items-center gap-2">
        {chambers.map(([value, label]) => {
          const active = (filters.chamber ?? "") === value;
          return <Link key={value || "all"} href={hrefWith({ chamber: value || undefined })} aria-current={active ? "true" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:bg-wash"}`}>{label}</Link>;
        })}
      </nav>
      {dropdownFilters.length || filters.q ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={ro ? "Filtre active" : "Active filters"}>
          {filters.q ? <li><Link href={hrefWith({ q: undefined })} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm text-brand-strong hover:bg-line">„{filters.q}”<X size={14} aria-label={ro ? "Șterge" : "Remove"} /></Link></li> : null}
          {dropdownFilters.map(([key, value]) => <li key={key}><Link href={hrefWith({ [key]: undefined })} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm text-brand-strong hover:bg-line">{chipText(key, String(value))}<X size={14} aria-label={ro ? "Șterge" : "Remove"} /></Link></li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[][] }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted">
      {label}
      <select name={name} defaultValue={defaultValue} className="min-w-0 rounded-control border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal text-ink">
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
      <button disabled={isPending} type="button" onClick={onClick} className="rounded-full border border-line-strong bg-surface px-6 py-2.5 text-sm font-semibold text-ink hover:bg-wash">
        {isPending ? labels.loading : labels.loadMore}
      </button>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-card border border-line bg-surface p-5" aria-hidden="true">
          <div className="h-4 w-40 animate-pulse rounded bg-line" />
          <div className="mt-3 h-5 w-4/5 animate-pulse rounded bg-line" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-line" />
          <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-line" />
        </div>
      ))}
    </>
  );
}

function DirectoryMessage({ message, tone = "empty" }: { message: string; tone?: "empty" | "error" }) {
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-card px-5 py-8 text-center text-sm ${tone === "error" ? "border border-vote-against-fill bg-vote-against-bg text-vote-against" : "border border-dashed border-line-strong bg-wash text-muted"}`}>{message}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function queryString(filters: ExplorerFilters, cursor: string): string {
  const params = new URLSearchParams({ limit: "20", cursor });
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
  empty: string;
  error: string;
}
