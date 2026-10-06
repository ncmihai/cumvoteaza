"use client";

import { OfficialText } from "./OfficialText";
import Link from "next/link";
import { ArrowRight, CalendarDays, Landmark, Users } from "lucide-react";
import { formatDate, voteChamberLabels } from "@cumsevoteaza/parliament-model";
import type { VoteExplorerItem, VotePreviewGroup } from "@/lib/explorer-data";
import { presentVote } from "@/lib/public-presentation";
import { ShareButton } from "./ShareButton";
import { OutcomeBadge } from "./ui/OutcomeBadge";
import { PartyMark } from "./ui/PartyMark";
import { SplitBar, countsOfTotals } from "./ui/SplitBar";
import { VoteDot } from "./ui/VoteIcon";
import { VOTE_LABEL, VOTE_STYLE, type VoteKind } from "./ui/vote-meaning";

type Locale = "ro" | "en";

/** The side panel of the votes list: the result, the split by group and, at the top, the way to the full vote. */
export function VotePreview({ locale, item, className = "" }: { locale: Locale; item: VoteExplorerItem; className?: string }) {
  const { vote } = item;
  const copy = labels[locale];
  const presentation = presentVote(vote, { locale, bill: item.bill, source: item.source });
  const groups = (item.groupBreakdown ?? []).slice(0, 6);
  const represented = groups.reduce((sum, group) => sum + groupTotal(group), 0);
  const attendanceBase = vote.totals.absent === undefined ? undefined : vote.totals.present + vote.totals.absent;
  const attendance = attendanceBase ? Math.round(vote.totals.present / attendanceBase * 100) : undefined;
  const counts = countsOfTotals(presentation.totals);
  const kinds: Array<{ kind: VoteKind; value: number }> = [
    { kind: "for", value: counts.for ?? 0 },
    { kind: "against", value: counts.against ?? 0 },
    { kind: "abstain", value: counts.abstain ?? 0 },
    { kind: "present", value: counts.present ?? 0 }
  ];

  return <aside className={`self-start rounded-card border border-line bg-surface p-5 shadow-sm xl:sticky xl:top-24 ${className}`} aria-live="polite">
    <div className="flex items-center justify-between gap-3">
      <span className="rounded-full bg-wash px-2.5 py-0.5 text-sm font-medium text-ink-soft">{voteChamberLabels[locale][vote.chamber]}</span>
      <ShareButton href={`/${locale}/votes/${vote.id}`} title={presentation.heading} label={copy.share} copiedLabel={copy.copied} errorLabel={copy.copyError} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium text-muted hover:bg-wash hover:text-ink" />
    </div>
    <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">{presentation.heading}</h2>
    {presentation.subject ? <OfficialText className="mt-2 line-clamp-3 text-sm leading-6 text-muted" text={presentation.subject} locale={locale}/> : null}

    <Link href={`/${locale}/votes/${vote.id}`} className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
      {copy.complete}<ArrowRight size={17} aria-hidden="true"/>
    </Link>

    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3 text-sm text-muted">
      <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true"/>{formatDate(vote.heldOn, locale)}</span>
      <span className="inline-flex items-center gap-1.5"><Landmark size={15} aria-hidden="true"/>{vote.voteType}</span>
      {attendance !== undefined ? <span className="inline-flex items-center gap-1.5"><Users size={15} aria-hidden="true"/>{attendance}% {copy.attendance}</span> : null}
    </div>

    <div className="mt-4"><OutcomeBadge outcome={presentation.outcome} label={presentation.outcomeLabel} /></div>
    <div className="mt-3"><SplitBar counts={counts} locale={locale} height="h-3" /></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
      {kinds.map(({ kind, value }) => (
        <div key={kind} className="flex items-center gap-2.5">
          <VoteDot kind={kind} size={24} locale={locale} />
          <div>
            <dd className={`font-display text-xl font-bold leading-none tabular-nums ${VOTE_STYLE[kind].text}`}>{value}</dd>
            <dt className="mt-0.5 text-xs leading-4 text-muted">{VOTE_LABEL[locale][kind]}</dt>
          </div>
        </div>
      ))}
    </dl>

    <section className="mt-6 border-t border-line pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-ink">{copy.parties}</h3>
        {represented ? <span className="text-xs text-muted">{represented} {copy.groupVotes}</span> : null}
      </div>
      {groups.length ? <div className="mt-3 space-y-3">{groups.map((group) => <PartyRow key={group.groupId} group={group} locale={locale} />)}</div> : <p className="mt-3 rounded-card border border-dashed border-line-strong bg-wash p-3 text-sm leading-5 text-muted">{copy.noGroups}</p>}
    </section>
  </aside>;
}

function PartyRow({ group, locale }: { group: VotePreviewGroup; locale: Locale }) {
  const leading = ([
    { kind: "for" as const, value: group.for },
    { kind: "against" as const, value: group.against },
    { kind: "abstain" as const, value: group.abstention }
  ]).sort((left, right) => right.value - left.value)[0]!;
  const counts = { for: group.for, against: group.against, abstain: group.abstention, present: group.presentNotVoting };
  const name = group.partyShortName ?? group.shortName;
  return <div>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-ink" title={group.name}><PartyMark party={{ shortName: name, color: group.color, logoAssetId: group.logoAssetId }} size={24}/><span className="truncate">{name}</span></span>
      <span className="shrink-0 text-muted"><strong className={`tabular-nums ${VOTE_STYLE[leading.kind].text}`}>{leading.value}</strong> {VOTE_LABEL[locale][leading.kind].toLowerCase()}</span>
    </div>
    <SplitBar counts={counts} locale={locale} height="h-2" />
  </div>;
}

function groupTotal(group: VotePreviewGroup) { return group.for + group.against + group.abstention + group.presentNotVoting; }

const labels = {
  ro: { share: "Distribuie", copied: "Link copiat", copyError: "Copiază manual", attendance: "prezență", parties: "Cum au votat grupurile", groupVotes: "voturi grupate", noGroups: "Parlamentul nu a publicat o defalcare pe grupuri pentru acest vot. Rezultatul total rămâne verificabil în pagina completă.", complete: "Vezi votul complet" },
  en: { share: "Share", copied: "Link copied", copyError: "Copy manually", attendance: "attendance", parties: "How groups voted", groupVotes: "grouped votes", noGroups: "Parliament did not publish a group breakdown for this vote. The total result remains verifiable on the full page.", complete: "Open full vote" }
};
