"use client";

import Link from "next/link";
import { Check, Circle, CircleHelp, Minus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  ChamberId,
  GroupVoteTotal,
  IndividualVote,
  Locale,
  Member,
  ParliamentaryGroup,
  VoteChoice
} from "@cumsevoteaza/parliament-model";
import { voteChoiceColors, voteChoiceLabels } from "@cumsevoteaza/parliament-model";

interface VoteExplorerProps {
  voteId: string;
  locale: Locale;
  chamber: ChamberId;
  groups: ParliamentaryGroup[];
  groupLogoUrls?: Record<string, string>;
  members: Member[];
  seatVotes: IndividualVote[];
  nominalVotes: IndividualVote[];
  groupTotals: GroupVoteTotal[];
}

interface PositionedSeat {
  vote: IndividualVote;
  member?: Member;
  group?: ParliamentaryGroup;
  left: number;
  top: number;
}

const choiceOrder: VoteChoice[] = ["for", "against", "abstention", "present_not_voting", "absent", "unknown"];

interface SeatSlot {
  left: number;
  top: number;
  progress: number;
  rowIndex: number;
}

export function VoteExplorer({ voteId, locale, chamber, groups, groupLogoUrls = {}, members, seatVotes, nominalVotes, groupTotals }: VoteExplorerProps) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const [activeGroups, setActiveGroups] = useState<string[]>([]);
  const [activeChoices, setActiveChoices] = useState<VoteChoice[]>([]);
  const [pinnedSeatId, setPinnedSeatId] = useState<string | undefined>();
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const chamberGroups = useMemo(() => {
    const usedGroupIds = new Set([
      ...seatVotes.flatMap((vote) => (vote.groupId ? [vote.groupId] : [])),
      ...groupTotals.map((total) => total.groupId)
    ]);
    return groups
      .filter((group) => group.chamber === chamber && usedGroupIds.has(group.id))
      .sort((a, b) => countSeats(seatVotes, b.id) - countSeats(seatVotes, a.id) || a.shortName.localeCompare(b.shortName, "ro"));
  }, [chamber, groupTotals, groups, seatVotes]);

  const orderedVotes = useMemo(
    () =>
      orderVotesByGroup({
        votes: seatVotes,
        groups: chamberGroups,
        members: memberById
      }),
    [chamberGroups, memberById, seatVotes]
  );
  const seats = useMemo(() => positionSeats(orderedVotes, memberById, groupById), [groupById, memberById, orderedVotes]);
  const breakdown = useMemo(() => buildBreakdown(seatVotes, chamberGroups), [chamberGroups, seatVotes]);
  const groupCounts = useMemo(() => countGroups(seatVotes), [seatVotes]);
  const voteCounts = useMemo(() => countChoices(seatVotes), [seatVotes]);
  const filteredNominalVotes = useMemo(
    () =>
      nominalVotes.filter((vote) => {
        const groupMatches = activeGroups.length === 0 || (vote.groupId ? activeGroups.includes(vote.groupId) : false);
        const choiceMatches = activeChoices.length === 0 || activeChoices.includes(vote.choice);
        return groupMatches && choiceMatches;
      }),
    [activeChoices, activeGroups, nominalVotes]
  );
  const labels = explorerLabels[locale];

  return (
    <div className="space-y-6">
    <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
      <div className="min-w-0 border border-slate-300 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setActiveGroups([])} className={buttonClass(activeGroups.length === 0)}>
            {labels.allGroups}
          </button>
          {chamberGroups.map((group) => (
            <button
              type="button"
              key={group.id}
              title={group.name}
              aria-label={`${group.name}: ${groupCounts[group.id] ?? 0}`}
              aria-pressed={activeGroups.includes(group.id)}
              onClick={() => setActiveGroups((current) => toggleValue(current, group.id))}
              className={buttonClass(activeGroups.includes(group.id))}
            >
              {groupLogoUrls[group.id] && !failedLogos.includes(group.id) ? (
                <img src={groupLogoUrls[group.id]} alt="" className="h-7 w-9 rounded-sm bg-white object-contain p-0.5"
                  onError={() => setFailedLogos((current) => [...current, group.id])} />
              ) : <span className="text-xs">{group.shortName}</span>}
              <span className="text-xs opacity-70">{groupCounts[group.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setActiveChoices([])} className={buttonClass(activeChoices.length === 0)}>
            {labels.allVotes}
            <span className="text-xs opacity-70">{seatVotes.length}</span>
          </button>
          {choiceOrder.map((choice) => (
            <button
              type="button"
              key={choice}
              onClick={() => setActiveChoices((current) => toggleValue(current, choice))}
              className={buttonClass(activeChoices.includes(choice))}
            >
              <VoteMark choice={choice} className="h-3.5 w-3.5" />
              {voteChoiceLabels[locale][choice]}
              <span className="text-xs opacity-70">{voteCounts[choice]}</span>
            </button>
          ))}
        </div>

        <div className="relative isolate mx-auto aspect-[2/1] min-h-[250px] w-full max-w-5xl overflow-visible">
          <div className="pointer-events-none absolute left-1/2 top-[77%] z-0 -translate-x-1/2 text-center">
            <div className="text-5xl font-semibold leading-none tracking-normal text-slate-950 md:text-6xl">{seatVotes.length}</div>
            <div className="mt-1 text-xs font-semibold uppercase text-slate-500">{labels.seats}</div>
          </div>
          {seats.map((seat) => {
            const muted =
              (activeGroups.length > 0 && (!seat.vote.groupId || !activeGroups.includes(seat.vote.groupId))) ||
              (activeChoices.length > 0 && !activeChoices.includes(seat.vote.choice));
            const pinned = pinnedSeatId === seat.vote.id;
            const memberLabel = seat.member?.displayName ?? seat.vote.memberId;
            const groupLabel = seat.group?.shortName ?? labels.unknownGroup;
            const voteLabel = voteChoiceLabels[locale][seat.vote.choice];
            const popupClass = [
              "absolute top-0 z-[400] min-w-max -translate-y-[calc(100%+8px)] border border-slate-300 bg-white px-2 py-1 text-left text-[11px] font-medium leading-tight text-slate-950 shadow-md",
              tooltipPositionClass(seat.left),
              pinned ? "block" : "hidden group-hover/seat:block group-focus-within/seat:block",
              seat.member ? "hover:border-blue-500 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600" : ""
            ].join(" ");
            const popupContent = (
              <>
                {memberLabel}
                <span className="mt-0.5 block font-normal text-slate-600">
                  {groupLabel} · {voteLabel}
                </span>
              </>
            );
            return (
              <div
                key={seat.vote.id}
                title={`${memberLabel} · ${groupLabel} · ${voteLabel}`}
                className={[
                  "group/seat absolute z-10 block rounded-full border border-white text-left shadow-sm outline-offset-2 transition hover:z-[200] focus-within:z-[200] focus:z-[200]",
                  muted ? "opacity-20 hover:opacity-100 focus-within:opacity-100" : "opacity-100",
                  pinned ? "z-[210] opacity-100 ring-2 ring-slate-950 ring-offset-2" : ""
                ].join(" ")}
                style={{
                  left: percent(seat.left),
                  top: percent(seat.top),
                  width: seatSize(seatVotes.length),
                  height: seatSize(seatVotes.length),
                  backgroundColor: seat.group?.color ?? "#94a3b8",
                  transform: "translate(-50%, -50%)"
                }}
              >
                <button
                  type="button"
                  onClick={() => setPinnedSeatId(pinned ? undefined : seat.vote.id)}
                  className="block h-full w-full rounded-full p-0"
                >
                  <span className="absolute bottom-0 right-0 z-10 grid h-[62%] w-[62%] translate-x-1/5 translate-y-1/5 place-items-center rounded-full border border-white bg-white">
                    <VoteMark choice={seat.vote.choice} className="h-[80%] w-[80%]" />
                  </span>
                  <span className="sr-only">
                    {memberLabel} {groupLabel} {voteLabel}
                  </span>
                </button>
                {seat.member ? (
                  <Link
                    href={`/${locale}/members/${seat.member.slug}?fromVote=${encodeURIComponent(voteId)}`}
                    aria-label={`${labels.openProfile}: ${memberLabel}`}
                    className={popupClass}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {popupContent}
                  </Link>
                ) : (
                  <div className={popupClass}>{popupContent}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-4 py-3 text-sm font-semibold text-slate-950">
          {labels.groupBreakdown}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,minmax(30px,42px))] items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase text-slate-500">
          <span>{labels.group}</span>
          <span className="text-right">{voteChoiceLabels[locale].for}</span>
          <span className="text-right">{voteChoiceLabels[locale].against}</span>
          <span className="text-right">{voteChoiceLabels[locale].abstention}</span>
          <span className="text-right">{voteChoiceLabels[locale].present_not_voting}</span>
          <span className="text-right">{labels.notVoting}</span>
        </div>
        <div className="divide-y divide-slate-200">
          {breakdown.map((row) => (
            <div
              key={row.group.id}
              className="grid grid-cols-[minmax(0,1fr)_repeat(5,minmax(30px,42px))] items-center gap-2 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.group.color }} />
                <span className="truncate">{row.group.shortName}</span>
              </div>
              <span className="text-right text-emerald-700">{row.counts.for}</span>
              <span className="text-right text-red-700">{row.counts.against}</span>
              <span className="text-right text-amber-700">{row.counts.abstention}</span>
              <span className="text-right text-slate-600">{row.counts.present_not_voting}</span>
              <span className="text-right text-slate-400">{row.counts.absent + row.counts.unknown}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
    <section className="max-w-[calc(100vw-2rem)] resize-y overflow-auto border border-slate-300 bg-white" style={{ minHeight: 280, maxHeight: 560 }}>
      <div className="sticky top-0 z-10 border-b border-slate-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-950">{labels.nominalVotes}</h2>
          <span className="text-xs text-slate-500">
            {filteredNominalVotes.length} / {nominalVotes.length}
          </span>
        </div>
      </div>
      <table className="min-w-[760px] w-full text-sm">
        <thead className="sticky top-[45px] z-10 bg-slate-100 text-left text-xs uppercase text-slate-600">
          <tr>
            <th className="px-3 py-2">{labels.name}</th>
            <th className="px-3 py-2">{labels.groupAtVoteDate}</th>
            <th className="px-3 py-2">{labels.vote}</th>
            <th className="px-3 py-2">{labels.method}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {filteredNominalVotes.map((individualVote) => {
            const member = memberById.get(individualVote.memberId);
            const group = individualVote.groupId ? groupById.get(individualVote.groupId) : undefined;
            return (
              <tr key={individualVote.id}>
                <td className="px-3 py-3">
                  {member ? (
                    <Link className="font-medium underline" href={`/${locale}/members/${member.slug}?fromVote=${encodeURIComponent(voteId)}`}>
                      {member.displayName}
                    </Link>
                  ) : (
                    individualVote.memberId
                  )}
                </td>
                <td className="px-3 py-3">{group?.shortName ?? "-"}</td>
                <td className="px-3 py-3">{voteChoiceLabels[locale][individualVote.choice]}</td>
                <td className="px-3 py-3 text-slate-600">{individualVote.voteMethod ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
    </div>
  );
}

function orderVotesByGroup(input: {
  votes: IndividualVote[];
  groups: ParliamentaryGroup[];
  members: Map<string, Member>;
}): IndividualVote[] {
  const groupOrder = new Map(input.groups.map((group, index) => [group.id, index]));
  return [...input.votes].sort((a, b) => {
    const groupA = a.groupId ? groupOrder.get(a.groupId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const groupB = b.groupId ? groupOrder.get(b.groupId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const memberA = input.members.get(a.memberId)?.displayName ?? a.memberId;
    const memberB = input.members.get(b.memberId)?.displayName ?? b.memberId;
    return groupA - groupB || memberA.localeCompare(memberB, "ro");
  });
}

function positionSeats(
  votes: IndividualVote[],
  members: Map<string, Member>,
  groups: Map<string, ParliamentaryGroup>
): PositionedSeat[] {
  const slots = buildSeatSlots(votes.length);
  return votes.flatMap((vote, index) => {
    const slot = slots[index];
    if (!slot) return [];
    return {
      vote,
      member: members.get(vote.memberId),
      group: vote.groupId ? groups.get(vote.groupId) : undefined,
      left: slot.left,
      top: slot.top
    };
  });
}

function buildSeatSlots(total: number): SeatSlot[] {
  const rows = total > 260 ? 8 : total > 170 ? 7 : 6;
  const counts = distributeCounts(total, rows);
  const slots: SeatSlot[] = [];

  counts.forEach((count, rowIndex) => {
    const radius = 22 + (rowIndex / Math.max(rows - 1, 1)) * 34;
    const startAngle = 210;
    const endAngle = 330;
    for (let seatIndex = 0; seatIndex < count; seatIndex += 1) {
      const progress = count === 1 ? 0.5 : seatIndex / (count - 1);
      const angle = startAngle + progress * (endAngle - startAngle);
      const radians = (angle * Math.PI) / 180;
      slots.push({
        left: 50 + Math.cos(radians) * radius,
        top: 86 + Math.sin(radians) * radius,
        progress,
        rowIndex
      });
    }
  });

  return slots.sort((a, b) => a.progress - b.progress || b.rowIndex - a.rowIndex);
}

function distributeCounts(total: number, rows: number): number[] {
  if (total <= 0) return [];
  const weights = Array.from({ length: rows }, (_, index) => 0.62 + index * 0.34);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const counts = weights.map((weight) => Math.max(1, Math.round((total * weight) / weightTotal)));
  while (counts.reduce((sum, count) => sum + count, 0) > total) {
    const maxIndex = counts.indexOf(Math.max(...counts));
    counts[maxIndex] = (counts[maxIndex] ?? 1) - 1;
  }
  while (counts.reduce((sum, count) => sum + count, 0) < total) {
    const lastIndex = counts.length - 1;
    counts[lastIndex] = (counts[lastIndex] ?? 0) + 1;
  }
  return counts;
}

function buildBreakdown(votes: IndividualVote[], groups: ParliamentaryGroup[]) {
  return groups.map((group) => ({
    group,
    counts: countChoices(votes.filter((vote) => vote.groupId === group.id))
  }));
}

function countChoices(votes: IndividualVote[]): Record<VoteChoice, number> {
  return choiceOrder.reduce(
    (counts, choice) => ({
      ...counts,
      [choice]: votes.filter((vote) => vote.choice === choice).length
    }),
    {
      for: 0,
      against: 0,
      abstention: 0,
      present_not_voting: 0,
      absent: 0,
      unknown: 0
    }
  );
}

function countSeats(votes: IndividualVote[], groupId: string): number {
  return votes.filter((vote) => vote.groupId === groupId).length;
}

function countGroups(votes: IndividualVote[]): Record<string, number> {
  return votes.reduce<Record<string, number>>((counts, vote) => {
    if (!vote.groupId) return counts;
    counts[vote.groupId] = (counts[vote.groupId] ?? 0) + 1;
    return counts;
  }, {});
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function seatSize(total: number): string {
  if (total > 260) return "clamp(6px, 1.45vw, 13px)";
  if (total > 150) return "clamp(7px, 1.75vw, 14px)";
  return "clamp(9px, 2.15vw, 16px)";
}

function percent(value: number): string {
  return `${value.toFixed(4)}%`;
}

function tooltipPositionClass(left: number): string {
  if (left < 18) return "left-0 translate-x-0";
  if (left > 82) return "right-0 translate-x-0";
  return "left-1/2 -translate-x-1/2";
}

function VoteMark({ choice, className }: { choice: VoteChoice; className?: string }) {
  const color = voteChoiceColors[choice];
  if (choice === "for") return <Check aria-hidden="true" className={className} color={color} strokeWidth={3.2} />;
  if (choice === "against") return <X aria-hidden="true" className={className} color={color} strokeWidth={3.2} />;
  if (choice === "abstention") return <Minus aria-hidden="true" className={className} color={color} strokeWidth={3.2} />;
  if (choice === "present_not_voting") return <Circle aria-hidden="true" className={className} color={color} strokeWidth={2.7} />;
  if (choice === "unknown") return <CircleHelp aria-hidden="true" className={className} color={color} strokeWidth={2.7} />;
  return <Minus aria-hidden="true" className={className} color={color} strokeWidth={3.2} />;
}

function buttonClass(active: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
    active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  ].join(" ");
}

const explorerLabels = {
  ro: {
    allGroups: "Toate grupurile",
    allVotes: "Toate voturile",
    groupBreakdown: "Distribuție pe grupuri",
    group: "Grup",
    groupAtVoteDate: "Grup la data votului",
    method: "Metodă",
    name: "Nume",
    nominalVotes: "Voturi nominale",
    notVoting: "Absent/nec.",
    seats: "mandate",
    unknownGroup: "Grup necunoscut",
    openProfile: "Deschide profilul",
    vote: "Vot"
  },
  en: {
    allGroups: "All groups",
    allVotes: "All votes",
    groupBreakdown: "Breakdown by group",
    group: "Group",
    groupAtVoteDate: "Group at vote date",
    method: "Method",
    name: "Name",
    nominalVotes: "Nominal votes",
    notVoting: "Absent/unk.",
    seats: "seats",
    unknownGroup: "Unknown group",
    openProfile: "Open profile",
    vote: "Vote"
  }
} satisfies Record<Locale, Record<string, string>>;
