"use client";

import { OfficialText } from "./OfficialText";
import Link from "next/link";
import { ArrowRight, CalendarDays, Landmark, Users } from "lucide-react";
import { chamberLabels, formatDate, voteChamberLabels, voteChoiceLabels } from "@cumsevoteaza/parliament-model";
import type { VoteExplorerItem, VotePreviewGroup } from "@/lib/explorer-data";
import { presentVote } from "@/lib/public-presentation";
import { ShareButton } from "./ShareButton";

type Locale = "ro" | "en";

export function VotePreview({ locale, item, className = "" }: { locale: Locale; item: VoteExplorerItem; className?: string }) {
  const { vote } = item;
  const copy = labels[locale];
  const presentation = presentVote(vote, { locale, bill: item.bill, source: item.source });
  const groups = (item.groupBreakdown ?? []).slice(0, 6);
  const represented = groups.reduce((sum, group) => sum + groupTotal(group), 0);
  const attendanceBase = vote.totals.absent === undefined ? undefined : vote.totals.present + vote.totals.absent;
  const attendance = attendanceBase ? Math.round(vote.totals.present / attendanceBase * 100) : undefined;

  return <aside className={`self-start border border-slate-300 bg-white p-5 xl:sticky xl:top-24 ${className}`} aria-live="polite">
    <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-[#075fc6]">
      <span className={vote.chamber === "joint" ? "bg-[#061a47] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" : undefined}>{voteChamberLabels[locale][vote.chamber]}</span>
      <ShareButton href={`/${locale}/votes/${vote.id}`} title={presentation.heading} label={copy.share} copiedLabel={copy.copied} errorLabel={copy.copyError} className="bg-transparent text-[#4b608a]" />
    </div>
    <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-[#061a47]">{presentation.heading}</h2>
    {presentation.subject ? <OfficialText className="mt-3 line-clamp-3 text-sm leading-6 text-[#4b608a]" text={presentation.subject} locale={locale}/> : null}
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-slate-200 py-3 text-xs text-[#4b608a]">
      <span className="inline-flex items-center gap-1.5"><CalendarDays size={15}/>{formatDate(vote.heldOn, locale)}</span>
      <span className="inline-flex items-center gap-1.5"><Landmark size={15}/>{vote.voteType}</span>
      {attendance !== undefined ? <span className="inline-flex items-center gap-1.5"><Users size={15}/>{attendance}% {copy.attendance}</span> : null}
    </div>

    <div className="mt-5 grid grid-cols-4 gap-2">
      <Tally label={voteChoiceLabels[locale].for} value={vote.totals.for} tone="text-emerald-700" />
      <Tally label={voteChoiceLabels[locale].against} value={vote.totals.against} tone="text-red-700" />
      <Tally label={voteChoiceLabels[locale].abstention} value={vote.totals.abstention} tone="text-amber-700" />
      <Tally label={copy.present} value={vote.totals.present} tone="text-[#061a47]" />
    </div>
    <VoteBalance item={item} />

    <section className="mt-6 border-t border-slate-200 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl font-semibold text-[#061a47]">{copy.parties}</h3>
        {represented ? <span className="text-[11px] text-slate-500">{represented} {copy.groupVotes}</span> : null}
      </div>
      {groups.length ? <div className="mt-3 space-y-3">{groups.map((group) => <PartyRow key={group.groupId} group={group} locale={locale} />)}</div> : <p className="mt-3 border border-dashed border-slate-300 bg-slate-50 p-3 text-sm leading-5 text-slate-600">{copy.noGroups}</p>}
    </section>

    <Link href={`/${locale}/votes/${vote.id}`} className="mt-6 flex items-center justify-center gap-2 bg-[#061a47] px-4 py-3 text-sm font-bold !text-white transition hover:bg-[#102d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075fc6]">
      {copy.complete}<ArrowRight size={17}/>
    </Link>
  </aside>;
}

function VoteBalance({ item }: { item: VoteExplorerItem }) {
  const total = Math.max(1, item.vote.totals.for + item.vote.totals.against + item.vote.totals.abstention + item.vote.totals.presentNotVoting);
  const pieces = [
    { value: item.vote.totals.for, color: "#07845f" },
    { value: item.vote.totals.against, color: "#d92d3a" },
    { value: item.vote.totals.abstention, color: "#c9640c" },
    { value: item.vote.totals.presentNotVoting, color: "#94a3b8" }
  ].filter((piece) => piece.value > 0);
  return <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">{pieces.map((piece) => <span key={piece.color} style={{ width: `${piece.value / total * 100}%`, backgroundColor: piece.color }} />)}</div>;
}

function PartyRow({ group, locale }: { group: VotePreviewGroup; locale: Locale }) {
  const total = Math.max(1, groupTotal(group));
  const leading = [
    { label: voteChoiceLabels[locale].for, value: group.for, color: "#07845f" },
    { label: voteChoiceLabels[locale].against, value: group.against, color: "#d92d3a" },
    { label: voteChoiceLabels[locale].abstention, value: group.abstention, color: "#c9640c" }
  ].sort((left, right) => right.value - left.value)[0]!;
  return <div>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
      <span className="flex min-w-0 items-center gap-2 font-bold text-[#061a47]" title={group.name}><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }}/><span className="truncate">{group.shortName}</span></span>
      <span className="shrink-0 text-slate-600"><strong style={{ color: leading.color }}>{leading.value}</strong> {leading.label.toLowerCase()}</span>
    </div>
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" title={`${group.for} / ${group.against} / ${group.abstention}`}>
      <span className="bg-emerald-600" style={{ width: `${group.for / total * 100}%` }}/>
      <span className="bg-red-600" style={{ width: `${group.against / total * 100}%` }}/>
      <span className="bg-amber-600" style={{ width: `${group.abstention / total * 100}%` }}/>
      <span className="bg-slate-400" style={{ width: `${group.presentNotVoting / total * 100}%` }}/>
    </div>
  </div>;
}

function groupTotal(group: VotePreviewGroup) { return group.for + group.against + group.abstention + group.presentNotVoting; }
function Tally({ label, value, tone }: { label: string; value: number; tone: string }) { return <div><div className={`font-serif text-xl font-semibold ${tone}`}>{value}</div><div className="truncate text-[10px] uppercase tracking-wide text-slate-500">{label}</div></div>; }

const labels = {
  ro: { share: "Distribuie", copied: "Link copiat", copyError: "Copiază manual", attendance: "prezență", present: "Prezenți", parties: "Cum au votat grupurile", groupVotes: "voturi grupate", noGroups: "Parlamentul nu a publicat o defalcare pe grupuri pentru acest vot. Rezultatul total rămâne verificabil în pagina completă.", complete: "Vezi votul complet" },
  en: { share: "Share", copied: "Link copied", copyError: "Copy manually", attendance: "attendance", present: "Present", parties: "How groups voted", groupVotes: "grouped votes", noGroups: "Parliament did not publish a group breakdown for this vote. The total result remains verifiable on the full page.", complete: "Open full vote" }
};
