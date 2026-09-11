"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, ChevronDown, FileText, Filter, Search, Share2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDate, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { VoteExplorerItem } from "@/lib/explorer-data";
import { HotButton } from "./HotButton";
import styles from "./HomepageExperience.module.css";

type Locale = "ro" | "en";

export function HomepageExperience({ locale, votes }: { locale: Locale; votes: VoteExplorerItem[] }) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(votes[0]?.vote.id ?? "");
  const selected = votes.find((item) => item.vote.id === selectedId) ?? votes[0];
  const filtered = useMemo(() => votes.slice(1).filter(({ vote }) => `${vote.title} ${vote.voteType}`.toLowerCase().includes(query.toLowerCase())), [query, votes]);
  const copy = labels[locale];

  if (!selected) return <main className={styles.empty}>{copy.noVotes}</main>;

  return <main className={styles.layout}>
    <div className={styles.contentColumn}>
      <section className={styles.hero}>
        <time>{new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</time>
        <h1>{copy.title}</h1>
        <h2>{copy.deck}</h2>
        <p>{copy.intro}</p>
      </section>

      <div className={styles.searchRow}>
        <label className={styles.searchBox}>
          <Search size={24} aria-hidden="true" />
          <span className={styles.srOnly}>{copy.search}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} />
          <button type="button">{copy.searchButton}</button>
        </label>
        <button className={styles.filterButton} type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><Filter size={21} />{copy.filters}<ChevronDown size={16} /></button>
        {filtersOpen ? <div className={styles.filterPopover}><strong>{copy.dataScope}</strong><p>{copy.scopeCopy}</p><Link href={`/${locale}/votes`}>{copy.allVotes} <ArrowRight size={15} /></Link></div> : null}
      </div>

      <FeaturedVote locale={locale} item={selected} onOpen={() => setSelectedId(selected.vote.id)} />

      <section className={styles.otherVotes}>
        <div className={styles.sectionHeading}><h2>{copy.recent}</h2><Link href={`/${locale}/votes`}>{copy.allVotes} <ArrowRight size={16} /></Link></div>
        <div className={styles.voteList}>{filtered.slice(0, 5).map((item) => <button type="button" className={styles.voteRow} key={item.vote.id} onClick={() => setSelectedId(item.vote.id)}>
          <time>{formatDate(item.vote.heldOn, locale)}</time>
          <strong>{shortTitle(item.vote.title)}</strong>
          <span>{item.vote.title}</span>
          <Outcome title={item.vote.title} locale={locale} compact />
          <ArrowRight size={17} />
        </button>)}</div>
      </section>
    </div>
    <DetailPanel locale={locale} item={selected} />
  </main>;
}

function FeaturedVote({ locale, item, onOpen }: { locale: Locale; item: VoteExplorerItem; onOpen: () => void }) {
  const { vote } = item;
  const copy = labels[locale];
  return <article className={styles.featuredVote}>
    <div className={styles.voteKicker}><span>{copy.hotWindow} · {vote.voteType} · {chamberLabel(vote.chamber, locale)}</span><time>{formatDate(vote.heldOn, locale)}</time></div>
    <div className={styles.voteTitleRow}><h2>{shortTitle(vote.title)}</h2><div className={styles.titleActions}><Outcome title={vote.title} locale={locale} /><HotButton entityType="vote" entityId={vote.id} initialCount={item.hotCount} label={copy.hot} /></div></div>
    <p>{vote.title}</p>
    <div className={styles.why}><Users size={29} /><div><h3>{copy.why}</h3><p>{copy.whyCopy}</p><button type="button" onClick={onOpen}>{copy.readBrief} <ArrowRight size={16} /></button></div></div>
    <div className={styles.counts}>
      <Count number={vote.totals.for} label={voteChoiceLabels[locale].for} tone="for" />
      <Count number={vote.totals.against} label={voteChoiceLabels[locale].against} tone="against" />
      <Count number={vote.totals.abstention} label={voteChoiceLabels[locale].abstention} tone="abstain" />
      <Count number={vote.totals.present} label={copy.present} tone="present" />
    </div>
    <div className={styles.voteActions}><Link className={styles.primary} href={`/${locale}/votes/${vote.id}`}>{copy.details}</Link><Link href={`/${locale}/votes/${vote.id}`}>{copy.official} <ArrowRight size={16} /></Link></div>
  </article>;
}

function DetailPanel({ locale, item }: { locale: Locale; item: VoteExplorerItem }) {
  const { vote } = item;
  const copy = labels[locale];
  return <aside className={styles.detailPanel}>
    <div className={styles.detailToolbar}><Link href={`/${locale}/votes`}><ArrowLeft size={17} />{copy.back}</Link><button type="button" onClick={() => navigator.share?.({ title: vote.title, url: location.href })}><Share2 size={17} />{copy.share}</button></div>
    <div className={styles.detailTitle}><h2>{shortTitle(vote.title)}</h2><Outcome title={vote.title} locale={locale} /></div>
    <p className={styles.detailDescription}>{vote.title}</p>
    <div className={styles.metadata}><span><CalendarDays />{formatDate(vote.heldOn, locale)}</span><span><Building2 />{chamberLabel(vote.chamber, locale)}</span><span><FileText />{vote.voteType}</span></div>
    <section className={styles.summaryBox}><div><FileText /><h3>{copy.brief}</h3></div><p>{copy.briefCopy}</p><div><Users /><h3>{copy.why}</h3></div><p>{copy.whyCopy}</p></section>
    <section className={styles.resultSection}><h3>{copy.result}</h3><div className={styles.resultGrid}><Result value={vote.totals.for} label={voteChoiceLabels[locale].for} tone="for" /><Result value={vote.totals.against} label={voteChoiceLabels[locale].against} tone="against" /><Result value={vote.totals.abstention} label={voteChoiceLabels[locale].abstention} tone="abstain" /><Result value={vote.totals.present} label={copy.present} tone="present" /></div></section>
    <Link className={styles.officialButton} href={`/${locale}/votes/${vote.id}`}><FileText /><span>{copy.official}<small>{copy.officialCopy}</small></span><ArrowRight /></Link>
  </aside>;
}

function Outcome({ title, locale, compact = false }: { title: string; locale: Locale; compact?: boolean }) {
  const rejected = /respin|rejected/i.test(title);
  const adopted = /adopt|aprobat|passed/i.test(title);
  const text = rejected ? (locale === "ro" ? "Respins" : "Rejected") : adopted ? (locale === "ro" ? "Adoptat" : "Adopted") : (locale === "ro" ? "Verificat" : "Verified");
  return <span className={`${styles.outcome} ${rejected ? styles.rejected : styles.adopted} ${compact ? styles.compact : ""}`}>{rejected ? <X /> : <Check />}{text}</span>;
}

function Count({ number, label, tone }: { number: number; label: string; tone: string }) { return <div className={`${styles.count} ${styles[tone]}`}><strong>{number}</strong><span>{label}</span></div>; }
function Result({ value, label, tone }: { value: number; label: string; tone: string }) { return <div className={styles.resultItem}><i className={styles[tone]} /><strong>{value}</strong><span>{label}</span></div>; }
function shortTitle(title: string) { return title.split(" - ").slice(0, 2).join(" — "); }
function chamberLabel(chamber: string, locale: Locale) { return chamber === "senate" ? (locale === "ro" ? "Senat" : "Senate") : (locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies"); }

const labels = {
  ro: { title: "Astăzi în Parlament", deck: "Ce s-a decis și de ce contează", intro: "Urmărim voturile finale, pe înțelesul tuturor. Află rapid ce s-a decis, de ce contează pentru tine și cum au votat parlamentarii.", search: "Caută proiecte, parlamentari, partide...", searchButton: "Caută", filters: "Filtre", dataScope: "Date verificate", scopeCopy: "Folosește pagina Voturi pentru filtre după cameră, legislatură, an și lună.", allVotes: "Vezi toate voturile", noVotes: "Nu există voturi disponibile.", recent: "Alte voturi recente", why: "De ce contează?", whyCopy: "Votul arată decizia plenului asupra măsurii și poziția exprimată de fiecare parlamentar prezent.", readBrief: "Citește explicația pe scurt", present: "prezenți", details: "Vezi detalii", official: "Detalii oficiale", back: "Înapoi la voturi", share: "Distribuie", brief: "Pe scurt", briefCopy: "Această pagină folosește datele nominale publicate de Parlament și păstrează legătura către sursa oficială.", result: "Rezultatul votului", officialCopy: "Procedura completă, sursa și lista nominală", hot: "Hot", hotWindow: "Hot în ultimele 30 de zile" },
  en: { title: "Today in Parliament", deck: "What was decided and why it matters", intro: "We follow final votes in plain language. See what was decided, why it matters and how members voted.", search: "Search bills, members, parties...", searchButton: "Search", filters: "Filters", dataScope: "Verified data", scopeCopy: "Use the Votes page to filter by chamber, legislature, year and month.", allVotes: "View all votes", noVotes: "No votes are available.", recent: "Other recent votes", why: "Why does it matter?", whyCopy: "The vote records the plenary decision and the position expressed by every member present.", readBrief: "Read the short explanation", present: "present", details: "View details", official: "Official details", back: "Back to votes", share: "Share", brief: "In brief", briefCopy: "This page uses nominal data published by Parliament and retains the link to the official source.", result: "Vote result", officialCopy: "Full procedure, source and nominal list", hot: "Hot", hotWindow: "Hot in the last 30 days" }
};
