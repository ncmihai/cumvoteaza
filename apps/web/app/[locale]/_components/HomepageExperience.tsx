"use client";

import { OfficialText } from "./OfficialText";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Filter, LoaderCircle, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { VoteExplorerItem } from "@/lib/explorer-data";
import { presentVote, voteOutcomeTone, type VoteOutcome } from "@/lib/public-presentation";
import { HotButton } from "./HotButton";
import { VotePreview } from "./VotePreview";
import styles from "./HomepageExperience.module.css";

type Locale = "ro" | "en";

export function HomepageExperience({ locale, votes }: { locale: Locale; votes: VoteExplorerItem[] }) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(votes[1]?.vote.id ?? votes[0]?.vote.id ?? "");
  const [navigatingId, setNavigatingId] = useState<string>();
  const touchStartX = useRef<number | undefined>(undefined);
  const filterRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const featuredVotes = useMemo(() => votes.slice(0, Math.min(5, votes.length)), [votes]);
  const featured = featuredVotes[Math.min(featuredIndex, featuredVotes.length - 1)] ?? votes[0];
  const selected = votes.find((item) => item.vote.id === selectedId) ?? votes[1] ?? votes[0];
  const filtered = useMemo(() => votes.filter((item) => item.vote.id !== featured?.vote.id).filter(({ vote }) => `${vote.title} ${vote.voteType}`.toLowerCase().includes(query.toLowerCase())), [featured?.vote.id, query, votes]);
  const copy = labels[locale];

  useEffect(() => {
    const readSelection = () => {
      const requested = new URL(window.location.href).searchParams.get("vote");
      if (requested && votes.some((item) => item.vote.id === requested)) setSelectedId(requested);
    };
    readSelection();
    window.addEventListener("popstate", readSelection);
    return () => window.removeEventListener("popstate", readSelection);
  }, [votes]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (filtersOpen && !filterRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        filterRef.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filtersOpen]);

  function selectVote(id: string) {
    if (window.matchMedia("(max-width: 1099px)").matches) {
      setNavigatingId(id);
      router.push(`/${locale}/votes/${id}`);
      return;
    }
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("vote", id);
    window.history.pushState({}, "", url);
  }

  function moveFeatured(delta: number) {
    setFeaturedIndex((current) => (current + delta + featuredVotes.length) % featuredVotes.length);
  }

  if (!selected || !featured) return <main className={styles.empty}>{copy.noVotes}</main>;

  return <main className={styles.layout}>
    <div className={styles.contentColumn}>
      <section className={styles.hero}>
        <time>{new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</time>
        <h1>{copy.title}</h1>
        <h2>{copy.deck}</h2>
        <p>{copy.intro}</p>
      </section>

      <div className={styles.searchRow} ref={filterRef}>
        <form className={styles.searchBox} action={`/${locale}/votes`}>
          <Search size={24} aria-hidden="true" />
          <label className={styles.srOnly} htmlFor="homepage-search">{copy.search}</label>
          <input id="homepage-search" name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} type="search" />
          <button type="submit">{copy.searchButton}</button>
        </form>
        <button className={styles.filterButton} type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><Filter size={21} />{copy.filters}<ChevronDown size={16} /></button>
        {filtersOpen ? <div className={styles.filterPopover}><strong>{copy.quickFilters}</strong><div className={styles.quickFilters}><Link href={`/${locale}/votes?chamber=deputies`}>{copy.deputies}</Link><Link href={`/${locale}/votes?chamber=senate`}>{copy.senate}</Link><Link href={`/${locale}/votes`}>{copy.allVotes} <ArrowRight size={15} /></Link></div></div> : null}
      </div>

      <div onKeyDown={(event) => { if (event.key === "ArrowLeft") moveFeatured(-1); if (event.key === "ArrowRight") moveFeatured(1); }} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => { const start = touchStartX.current; const end = event.changedTouches[0]?.clientX; if (start !== undefined && end !== undefined && Math.abs(end - start) > 45) moveFeatured(end < start ? 1 : -1); touchStartX.current = undefined; }} tabIndex={0} aria-roledescription="carousel" aria-label={copy.hotWindow}>
        <FeaturedVote locale={locale} item={featured} />
        {featuredVotes.length > 1 ? <div className={styles.carouselControls}>
          <button type="button" onClick={() => moveFeatured(-1)} aria-label={copy.previous}><ChevronLeft/></button>
          <div>{featuredVotes.map((item, index) => <button key={item.vote.id} type="button" onClick={() => setFeaturedIndex(index)} aria-label={`${copy.slide} ${index + 1}`} aria-current={index === featuredIndex ? "true" : undefined} className={index === featuredIndex ? styles.activeDot : ""}/>)}</div>
          <span>{featuredIndex + 1} / {featuredVotes.length}</span>
          <button type="button" onClick={() => moveFeatured(1)} aria-label={copy.next}><ChevronRight/></button>
        </div> : null}
      </div>

      <section className={styles.otherVotes}>
        <div className={styles.sectionHeading}><h2>{copy.recent}</h2><Link href={`/${locale}/votes`}>{copy.allVotes} <ArrowRight size={16} /></Link></div>
        <div className={styles.voteList}>{filtered.slice(0, 5).map((item) => { const row = presentVote(item.vote, { locale, bill: item.bill, source: item.source }); return <button type="button" className={`${styles.voteRow} ${navigatingId === item.vote.id ? styles.navigating : ""}`} key={item.vote.id} onClick={() => selectVote(item.vote.id)} aria-pressed={item.vote.id === selected.vote.id} disabled={Boolean(navigatingId)}>
          <time>{formatDate(item.vote.heldOn, locale)}</time>
          <strong>{row.heading}</strong>
          <span lang="ro">{row.subject ?? row.officialTitle}</span>
          <Outcome outcome={row.outcome} label={row.outcomeLabel} compact />
          {navigatingId === item.vote.id ? <LoaderCircle className={styles.spinner} size={17}/> : <ArrowRight size={17} />}
        </button>; })}</div>
      </section>
    </div>
    <VotePreview locale={locale} item={selected} />
  </main>;
}

function FeaturedVote({ locale, item }: { locale: Locale; item: VoteExplorerItem }) {
  const { vote } = item;
  const presentation = presentVote(vote, { locale, bill: item.bill, source: item.source });
  const copy = labels[locale];
  return <article className={styles.featuredVote}>
    <div className={styles.voteKicker}><span>{copy.hotWindow} · {vote.voteType} · {chamberLabel(vote.chamber, locale)}</span><time>{formatDate(vote.heldOn, locale)}</time></div>
    <div className={styles.voteTitleRow}><h2>{presentation.heading}</h2><div className={styles.titleActions}><Outcome outcome={presentation.outcome} label={presentation.outcomeLabel} /><HotButton entityType="vote" entityId={vote.id} initialCount={item.hotCount} label={copy.hot} /></div></div>
    <OfficialText text={presentation.subject ?? presentation.officialTitle} locale={locale}/>
    <div className={styles.why}><Users size={29} /><div><h3>{copy.why}</h3><p>{copy.whyCopy}</p><Link href={`/${locale}/votes/${vote.id}`}>{copy.readBrief} <ArrowRight size={16} /></Link></div></div>
    <div className={styles.counts}>
      <Count number={vote.totals.for} label={voteChoiceLabels[locale].for} tone="for" />
      <Count number={vote.totals.against} label={voteChoiceLabels[locale].against} tone="against" />
      <Count number={vote.totals.abstention} label={voteChoiceLabels[locale].abstention} tone="abstain" />
      <Count number={vote.totals.present} label={copy.present} tone="present" />
    </div>
    <div className={styles.voteActions}><Link className={styles.primary} href={`/${locale}/votes/${vote.id}`}>{copy.details}</Link>{item.source?.sourceUrl ? <a href={item.source.sourceUrl} target="_blank" rel="noreferrer">{copy.official} <ArrowRight size={16} /></a> : null}</div>
  </article>;
}

function Outcome({ outcome, label, compact = false }: { outcome: VoteOutcome; label: string; compact?: boolean }) {
  const tone = voteOutcomeTone(outcome);
  return <span className={`${styles.outcome} ${tone === "negative" ? styles.rejected : tone === "positive" ? styles.adopted : ""} ${compact ? styles.compact : ""}`}>{tone === "negative" ? <X /> : tone === "positive" ? <Check /> : null}{label}</span>;
}

function Count({ number, label, tone }: { number: number; label: string; tone: string }) { return <div className={`${styles.count} ${styles[tone]}`}><strong>{number}</strong><span>{label}</span></div>; }
function chamberLabel(chamber: string, locale: Locale) { return chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies"); }

const labels = {
  ro: { title: "Astăzi în Parlament", deck: "Ce s-a decis și de ce contează", intro: "Urmărim voturile finale, pe înțelesul tuturor. Află rapid ce s-a decis, de ce contează pentru tine și cum au votat parlamentarii.", search: "Caută voturi și proiecte...", searchButton: "Caută", filters: "Filtre", quickFilters: "Filtre rapide", deputies: "Camera Deputaților", senate: "Senat", allVotes: "Vezi toate voturile", noVotes: "Nu există voturi disponibile.", recent: "Alte voturi recente", why: "De ce contează?", whyCopy: "Votul arată decizia plenului asupra măsurii și poziția exprimată de fiecare parlamentar prezent.", readBrief: "Vezi contextul complet", present: "prezenți", details: "Vezi detalii", official: "Sursa oficială", hot: "Popular", hotWindow: "Popular în ultimele 30 de zile", previous: "Votul anterior", next: "Votul următor", slide: "Vot" },
  en: { title: "Today in Parliament", deck: "What was decided and why it matters", intro: "We follow final votes in plain language. See what was decided, why it matters and how members voted.", search: "Search votes and bills...", searchButton: "Search", filters: "Filters", quickFilters: "Quick filters", deputies: "Chamber of Deputies", senate: "Senate", allVotes: "View all votes", noVotes: "No votes are available.", recent: "Other recent votes", why: "Why does it matter?", whyCopy: "The vote records the plenary decision and the position expressed by every member present.", readBrief: "View full context", present: "present", details: "View details", official: "Official source", hot: "Popular", hotWindow: "Popular in the last 30 days", previous: "Previous vote", next: "Next vote", slide: "Vote" }
};
