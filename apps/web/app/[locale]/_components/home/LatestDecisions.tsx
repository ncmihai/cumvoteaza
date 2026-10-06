import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDate } from "@cumsevoteaza/parliament-model";
import type { VoteExplorerItem } from "@/lib/explorer-data";
import { presentVote } from "@/lib/public-presentation";
import { OutcomeBadge } from "../ui/OutcomeBadge";
import { SectionHeader } from "../ui/SectionHeader";
import { SplitBar, countsOfTotals } from "../ui/SplitBar";
import { VOTE_LABEL, VOTE_STYLE } from "../ui/vote-meaning";

type Locale = "ro" | "en";

function chamberName(chamber: string, locale: Locale) {
  if (chamber === "joint") return locale === "ro" ? "Ședință comună" : "Joint sitting";
  if (chamber === "senate") return locale === "ro" ? "Senat" : "Senate";
  return locale === "ro" ? "Camera Deputaților" : "Chamber of Deputies";
}

function VoteCard({ item, locale, featured }: { item: VoteExplorerItem; locale: Locale; featured?: boolean }) {
  const view = presentVote(item.vote, { locale, bill: item.bill, source: item.source });
  const counts = countsOfTotals(view.totals);
  return (
    <article className={`group relative flex flex-col rounded-card border border-line bg-surface p-5 transition hover:border-line-strong hover:shadow-lift ${featured ? "lg:flex-row lg:items-center lg:gap-10 lg:p-7" : ""}`}>
      <div className={featured ? "min-w-0 flex-1" : "min-w-0"}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="rounded-full bg-wash px-2.5 py-0.5 font-medium text-ink-soft">{chamberName(view.chamber, locale)}</span>
          <time dateTime={view.heldOn}>{formatDate(view.heldOn, locale)}</time>
        </p>
        <h3 className={`mt-3 font-display font-bold leading-tight text-ink ${featured ? "text-2xl sm:text-3xl" : "text-xl"}`}>
          <Link href={`/${locale}/votes/${view.id}`} className="after:absolute after:inset-0 after:content-['']">{view.heading}</Link>
        </h3>
        <p lang="ro" className={`mt-2 text-ink-soft ${featured ? "line-clamp-3 text-base" : "line-clamp-2 text-sm"}`}>{view.subject ?? view.officialTitle}</p>
      </div>
      <div className={featured ? "mt-5 w-full lg:mt-0 lg:w-[22rem] lg:shrink-0" : "mt-4"}>
        <div className="mb-3"><OutcomeBadge outcome={view.outcome} label={view.outcomeLabel} size={featured ? "lg" : "md"} /></div>
        <SplitBar counts={counts} locale={locale} height={featured ? "h-3" : "h-2.5"} />
        <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(["for", "against", "abstain"] as const).map((kind) => (
            <div key={kind} className="flex items-baseline gap-1.5">
              <dt className="sr-only">{VOTE_LABEL[locale][kind]}</dt>
              <dd className={`font-display text-lg font-bold tabular-nums ${VOTE_STYLE[kind].text}`}>{counts[kind] ?? 0}</dd>
              <span aria-hidden="true" className="text-muted">{VOTE_LABEL[locale][kind].toLowerCase()}</span>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

/** The newest votes: the first one large, the next ones as cards. Each card shows the result and the split of the vote at a glance. */
export function LatestDecisions({ votes, locale }: { votes: VoteExplorerItem[]; locale: Locale }) {
  const ro = locale === "ro";
  if (votes.length === 0) return null;
  const [featured, ...others] = votes;
  return (
    <section className="mx-auto max-w-page px-4 py-10 lg:px-8">
      <SectionHeader eyebrow={ro ? "Voturi" : "Votes"} title={ro ? "Ultimele decizii" : "Latest decisions"} href={`/${locale}/votes`} linkLabel={ro ? "Toate voturile" : "All votes"} />
      <div className="mt-6 grid grid-cols-1 gap-4">
        <div className="reveal"><VoteCard item={featured!} locale={locale} featured /></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {others.slice(0, 6).map((item, index) => <div key={item.vote.id} className="reveal" style={{ transitionDelay: `${index * 60}ms` }}><VoteCard item={item} locale={locale} /></div>)}
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted"><ArrowRight size={14} aria-hidden="true" />{ro ? "Rezultatul este calculat după regula din Constituție pentru fiecare tip de vot; o regulă care depinde de tipul legii este spusă ca atare." : "The result is computed by the Constitution's rule for each kind of vote; a rule that depends on the type of law is stated as such."}</p>
    </section>
  );
}
