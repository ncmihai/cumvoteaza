"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { arc } from "d3-shape";
import { Check, ChevronDown, Circle, ExternalLink, Info, Minus, Search, Slash, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { voteChoiceLabels, type ChamberId, type GroupVoteTotal, type IndividualVote, type Locale, type Member, type ParliamentaryGroup, type VoteChoice } from "@cumsevoteaza/parliament-model";
import { presentMemberIdentity } from "@/lib/public-presentation";
import { nominalShortfalls, nominalSurpluses } from "@/lib/vote-integrity";
import { matchesVoteSearch, normalizeVoteSearch } from "@/lib/vote-search";
import { readVoteMapState, updateVoteMapUrl } from "@/lib/vote-map-url";
import { placeMapLabels } from "@/lib/map-labels";
import type { VoteTotals } from "@cumsevoteaza/parliament-model";
import { countyLabel } from "@/lib/text";
import { NominalTable } from "./ui/NominalTable";
import { PartyMark, type PartyMarkParty } from "./ui/PartyMark";
import { SplitBar } from "./ui/SplitBar";

type Seat = { vote: IndividualVote; member?: Member; group?: ParliamentaryGroup; name: string; left: number; top: number; progress: number; row: number };
const choices: VoteChoice[] = ["for", "against", "abstention", "present_not_voting", "absent", "unknown"];
// The same meaning and colours as everywhere else (ui/vote-meaning.ts): fills for the seats, text colours for the small icons that sit on white.
const seatVoteColors: Record<VoteChoice, string> = {
  for: "#16a34a",
  against: "#dc2626",
  abstention: "#d97706",
  present_not_voting: "#94a3b8",
  // A seat with no vote on the list is drawn pale, like an empty chair, so it cannot be mistaken for "present, did not vote" (slate grey).
  absent: "#e2e8f0",
  unknown: "#e2e8f0"
};
const symbolColors: Record<VoteChoice, string> = { for: "#15803d", against: "#b91c1c", abstention: "#b45309", present_not_voting: "#475569", absent: "#64748b", unknown: "#64748b" };
const noVote = (choice: VoteChoice) => choice === "absent" || choice === "unknown";

export function VoteChamberExplorer({ voteId, locale, chamber, groups, members, seatVotes, seatConstituencies = {}, seatPhotoUrls = {}, nominalVotes, groupTotals, officialTotals, capacity, groupMarks = {} }: {
  voteId: string; locale: Locale; chamber: ChamberId; groups: ParliamentaryGroup[]; members: Member[];
  seatVotes: IndividualVote[]; seatConstituencies?: Record<string, string>; seatPhotoUrls?: Record<string, string>; nominalVotes: IndividualVote[]; groupTotals: GroupVoteTotal[];
  officialTotals: VoteTotals; capacity?: number; groupMarks?: Record<string, PartyMarkParty>;
}) {
  const searchParams = useSearchParams();
  const urlState = readVoteMapState(new URLSearchParams(searchParams.toString()));
  const query = urlState.query;
  const groupFilter = groups.some((group) => group.id === urlState.group) ? urlState.group : null;
  const choiceFilter = urlState.choice;
  const selectedId = urlState.selected;
  function updateMap(key: "mapSearch" | "mapGroup" | "mapChoice" | "mapSeat", value: string | null, replace = false) {
    const next = updateVoteMapUrl(window.location.href, key, value);
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (replace) window.history.replaceState(null, "", next);
    else window.history.pushState(null, "", next);
  }
  const setQuery = (value: string) => updateMap("mapSearch", value, true);
  const setGroupFilter = (value: string | null) => updateMap("mapGroup", value);
  const setChoiceFilter = (value: VoteChoice | null) => updateMap("mapChoice", value);
  const selectionOriginRef = useRef<HTMLElement | null>(null);
  const focusSelectionRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const setSelectedId = (value: string | null, origin?: HTMLElement | null) => {
    if (value) {
      selectionOriginRef.current = origin ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      focusSelectionRef.current = true;
      // Selecting the same person does not change the URL, but must still reach their panel.
      if (value === selectedId) {
        focusSelectionRef.current = false;
        sectionRef.current?.querySelector<HTMLElement>('[role="dialog"] a, [role="dialog"] button')?.focus();
      }
    } else {
      focusSelectionRef.current = false;
      const origin = selectionOriginRef.current;
      const index = seats.findIndex((seat) => seat.vote.id === selectedId);
      const target = origin?.isConnected && origin.getClientRects().length ? origin : buttonRefs.current[index >= 0 ? index : focusedIndex];
      target?.focus();
      setPreviewedId(null);
    }
    updateMap("mapSeat", value);
  };
  useEffect(() => {
    if (!focusSelectionRef.current) return;
    focusSelectionRef.current = false;
    sectionRef.current?.querySelector<HTMLElement>('[role="dialog"] a, [role="dialog"] button')?.focus();
  }, [selectedId]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [previewedId, setPreviewedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mobileGroupOpen, setMobileGroupOpen] = useState(false);
  const [view, setView] = useState<"map" | "table">("map");
  const markOf = (group: ParliamentaryGroup): PartyMarkParty => groupMarks[group.id] ?? { shortName: group.shortName, color: group.color ?? "#94a3b8" };
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const labels = copy[locale];
  const searchLabel = chamber === "senate" ? labels.searchSenator : labels.search;
  const seats = useMemo(() => {
    const memberById = new Map(members.map((member) => [member.id, member]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const counts = new Map<string, number>();
    seatVotes.forEach((vote) => counts.set(vote.groupId ?? "", (counts.get(vote.groupId ?? "") ?? 0) + 1));
    const orderedGroups = groups.filter((group) => group.chamber === chamber && counts.has(group.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.shortName.localeCompare(b.shortName, "ro"));
    const groupOrder = new Map(orderedGroups.map((group, index) => [group.id, index]));
    const ordered = [...seatVotes].sort((a, b) => (groupOrder.get(a.groupId ?? "") ?? 999) - (groupOrder.get(b.groupId ?? "") ?? 999) || (memberById.get(a.memberId)?.displayName ?? a.memberId).localeCompare(memberById.get(b.memberId)?.displayName ?? b.memberId, "ro"));
    const slots = buildSlots(ordered.length);
    return ordered.map((vote, index) => ({ vote, member: memberById.get(vote.memberId), group: groupById.get(vote.groupId ?? ""), name: memberById.has(vote.memberId) ? presentMemberIdentity(memberById.get(vote.memberId)!).name : vote.memberId, ...slots[index]! }));
  }, [chamber, groups, members, seatVotes]);
  const groupsShown = useMemo(() => [...new Map(seats.filter((seat) => seat.group).map((seat) => [seat.group!.id, seat.group!])).values()], [seats]);
  const groupArcs = useMemo(() => groupsShown.map((group) => {
    const groupSeats = seats.filter((seat) => seat.group?.id === group.id);
    const first = groupSeats[0]!.progress;
    const last = groupSeats[groupSeats.length - 1]!.progress;
    const start = -Math.PI / 2 + Math.max(0, first - .003) * Math.PI;
    const end = -Math.PI / 2 + Math.min(1, last + .003) * Math.PI;
    return { group, count: groupSeats.length, middle: (start + end) / 2, path: arc()({innerRadius:.992,outerRadius:1,startAngle:start,endAngle:end}) ?? "", hitPath: arc()({innerRadius:.95,outerRadius:1.06,startAngle:start,endAngle:end}) ?? "" };
  }), [groupsShown, seats]);
  // Labels sit outside the arc and are pushed apart where small groups crowd the ends (lib/map-labels.ts). A group of fewer than 8 seats gets a one-line label.
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartBox, setChartBox] = useState({ width: 900, height: 480 });
  useEffect(() => {
    const node = chartRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setChartBox({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const groupLabels = useMemo(() => {
    const sizes = new Map(groupArcs.map(({ group, count }) => {
      const name = group.shortName.length;
      return [group.id, count < 8 ? { tiny: true, width: 16 + 24 + name * 7 + 18, height: 24 } : { tiny: false, width: Math.max(44, name * 7 + 12), height: 56 }] as const;
    }));
    const placed = placeMapLabels(groupArcs.map(({ group, middle }) => ({ id: group.id, angle: middle, ...sizes.get(group.id)! })), chartBox);
    return groupArcs.map(({ group, count }) => ({ group, count, ...sizes.get(group.id)!, ...placed.find((item) => item.id === group.id)! }));
  }, [groupArcs, chartBox]);
  const highlightedGroupId = hoveredGroupId ?? groupFilter;
  const counts = useMemo(() => Object.fromEntries(choices.map((choice) => [choice, seats.filter((seat) => seat.vote.choice === choice).length])) as Record<VoteChoice, number>, [seats]);
  const normalizedQuery = normalizeVoteSearch(query);
  const matches = (seat: Seat) => (!groupFilter || seat.group?.id === groupFilter) && (!choiceFilter || seat.vote.choice === choiceFilter) && matchesVoteSearch(query, [seat.name, seat.group?.shortName, seat.group?.name, seatConstituencies[seat.vote.memberId]]);
  const matchingSeats = seats.filter(matches);
  const namedResults = normalizedQuery ? matchingSeats.slice(0, 8) : [];
  const nominalIds = new Set(nominalVotes.map((vote) => vote.id));
  const filteredNominalSeats = matchingSeats.filter((seat) => nominalIds.has(seat.vote.id));
  const selected = seats.find((seat) => seat.vote.id === selectedId);
  const previewed = seats.find((seat) => seat.vote.id === previewedId);
  const selectedGroupSeats = groupFilter ? matchingSeats : [];
  const present = counts.for + counts.against + counts.abstention + counts.present_not_voting;
  const profileHref = (seat: Seat) => seat.member ? `/${locale}/members/${seat.member.slug}?fromVote=${encodeURIComponent(voteId)}` : undefined;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") return; // The section handles dismissal in layer order.
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const current = seats[index]!;
    const next = seats.map((seat, seatIndex) => ({ seatIndex, dx: seat.left - current.left, dy: seat.top - current.top }))
      .filter(({ seatIndex, dx, dy }) => seatIndex !== index && dx * direction[0]! + dy * direction[1]! > 0)
      .sort((a, b) => (a.dx * a.dx + a.dy * a.dy) - (b.dx * b.dx + b.dy * b.dy))[0];
    if (next) { setFocusedIndex(next.seatIndex); buttonRefs.current[next.seatIndex]?.focus(); }
  }

  function nearestSeat(element: HTMLElement, clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect();
    return seats.map((seat) => ({ seat, distance: Math.hypot(rect.left + seat.left / 100 * rect.width - clientX, rect.top + seat.top / 100 * rect.height - clientY) }))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  function selectSeatAt(event: MouseEvent<HTMLDivElement>) {
    if (event.detail === 0) return;
    const nearest = nearestSeat(event.currentTarget, event.clientX, event.clientY);
    if (nearest && nearest.distance <= (window.innerWidth < 768 ? 20 : 16)) {
      const index = seats.indexOf(nearest.seat);
      setFocusedIndex(index);
      setSelectedId(nearest.seat.vote.id, buttonRefs.current[index]);
    }
  }

  function previewSeatAt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const nearest = nearestSeat(event.currentTarget, event.clientX, event.clientY);
    const nearbySeat = nearest && nearest.distance <= 16 ? nearest.seat : null;
    setPreviewedId(nearbySeat?.vote.id ?? null);
  }

  return <section ref={sectionRef} className="min-w-0" aria-label={labels.chamberMap} onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (filtersOpen) { setFiltersOpen(false); filterButtonRef.current?.focus(); }
    else if (selectedId) setSelectedId(null);
  }}>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 text-ink focus-within:border-brand"><Search size={20} aria-hidden="true"/><span className="sr-only">{searchLabel}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#617293]"/></label>
      <button ref={filterButtonRef} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-line-strong"><SlidersHorizontal size={18}/>{labels.filters}<ChevronDown size={15}/></button>
    </div>
    <div className="mt-3 inline-flex rounded-full border border-line bg-wash p-0.5 text-sm font-semibold" role="group" aria-label={locale === "ro" ? "Mod de afișare" : "Display"}>
      {(["map", "table"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`rounded-full px-4 py-1.5 ${view === mode ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>{mode === "map" ? (locale === "ro" ? "Hartă" : "Map") : (locale === "ro" ? "Tabel nominal" : "Name list")}</button>)}
    </div>
    {filtersOpen ? <div className="mt-2 rounded-card border border-line bg-wash p-3 text-xs">
      <p className="font-bold uppercase tracking-wide text-muted">{labels.groups}</p><div className="mt-2 flex flex-wrap gap-1.5"><Filter active={!groupFilter} onClick={() => { setGroupFilter(null); setMobileGroupOpen(false); }}>{labels.allGroups}</Filter>{groupsShown.map((group) => <Filter key={group.id} active={groupFilter === group.id} onClick={() => { setGroupFilter(groupFilter === group.id ? null : group.id); setMobileGroupOpen(false); }}>{group.shortName}</Filter>)}</div>
      <p className="mt-3 font-bold uppercase tracking-wide text-muted">{labels.votes}</p><div className="mt-2 flex flex-wrap gap-1.5"><Filter active={!choiceFilter} onClick={() => setChoiceFilter(null)}>{labels.allVotes}</Filter>{choices.filter((choice) => counts[choice]).map((choice) => <Filter key={choice} active={choiceFilter === choice} onClick={() => setChoiceFilter(choiceFilter === choice ? null : choice)}>{voteChoiceLabels[locale][choice]} · {counts[choice]}</Filter>)}</div>
    </div> : null}
    <p className="mt-2 text-xs text-muted">{locale === "ro" ? "Grupurile afișate sunt cele asociate înregistrărilor acestui vot, nu neapărat afilierea actuală." : "Groups shown are those linked to this vote’s records, not necessarily current affiliations."}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{groupFilter ? groupsShown.find((group) => group.id === groupFilter)?.shortName : labels.allGroups} · {choiceFilter ? voteChoiceLabels[locale][choiceFilter] : labels.allVotes}{normalizedQuery ? ` · ${matchingSeats.length} ${labels.matches}` : ""}</span><span className={view === "map" ? "hidden md:block" : "hidden"}>{labels.instructions}</span></div>
    {normalizedQuery ? <div className="mt-2 rounded-card border border-line bg-surface p-2" aria-label={labels.results}>{namedResults.length ? <div className="grid gap-1 sm:grid-cols-2">{namedResults.map((seat) => <button key={seat.vote.id} type="button" onClick={() => setSelectedId(seat.vote.id)} className="flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-wash"><strong className="truncate text-ink">{seat.name}</strong><span className="shrink-0 text-muted">{seat.group?.shortName ?? labels.unknownGroup} · {voteChoiceLabels[locale][seat.vote.choice]}</span></button>)}</div> : <p className="px-2 py-2 text-sm text-muted">{labels.noResults}</p>}</div> : null}
    <div className={view === "map" ? undefined : "hidden"}>
    <div className="mt-3 flex flex-wrap gap-1.5 lg:hidden" aria-label={labels.chooseGroup}>{groupsShown.map((group) => <button key={group.id} type="button" aria-pressed={groupFilter === group.id} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setHoveredGroupId(group.id)} onBlur={() => setHoveredGroupId(null)} onClick={() => { setGroupFilter(groupFilter === group.id ? null : group.id); setMobileGroupOpen(window.innerWidth < 768); }} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${groupFilter === group.id ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink"}`}><PartyMark party={markOf(group)} size={16}/>{group.shortName} · {seats.filter((seat) => seat.group?.id === group.id).length}</button>)}</div>
    <div className="md:hidden">{groupFilter ? <><button type="button" onClick={() => setMobileGroupOpen((open) => !open)} className="mt-2 w-full border border-line bg-white px-3 py-2 text-sm font-semibold text-brand rounded-control">{mobileGroupOpen ? labels.hideGroup : labels.enlargeGroup} · {groupsShown.find((group) => group.id === groupFilter)?.shortName}</button>{mobileGroupOpen ? <div className="mt-2 max-h-64 overflow-auto border border-line bg-white p-2">{!selectedGroupSeats.length ? <p className="p-2 text-sm">{labels.noResults}</p> : null}{selectedGroupSeats.map((seat) => <button key={seat.vote.id} type="button" onClick={() => setSelectedId(seat.vote.id)} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-line px-2 py-2 text-left text-sm last:border-0"><span>{seat.name}</span><span className="ml-2 inline-flex shrink-0 items-center gap-1 text-xs"><VoteSymbol choice={seat.vote.choice}/>{voteChoiceLabels[locale][seat.vote.choice]}</span></button>)}</div> : null}</> : <p className="mt-2 text-xs text-muted">{labels.mobileHint}</p>}</div>
    <div className="relative mx-auto mt-4 aspect-[2/1] min-h-[190px] w-full max-w-[1060px]" aria-label={`${labels.chamberMap}: ${seats.length} ${labels.seats}`}>
      <div ref={chartRef} className="absolute left-1/2 top-0 h-[85%] w-[85%] -translate-x-1/2 lg:h-full lg:w-[84%]">
      <svg viewBox="0 0 1000 500" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden="true"><g transform="translate(500 440) scale(480 360)">{groupArcs.map(({group, path, hitPath}) => <g key={group.id} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onClick={() => setGroupFilter(groupFilter === group.id ? null : group.id)} className={`cursor-pointer transition-opacity duration-200 motion-reduce:transition-none ${highlightedGroupId && highlightedGroupId !== group.id ? "opacity-35" : "opacity-100"}`}><path d={path} fill={group.color ?? "#94a3b8"} stroke={group.color ?? "#94a3b8"} className="pointer-events-auto transition-[stroke-width,filter] duration-200 motion-reduce:transition-none" style={{strokeWidth:hoveredGroupId === group.id ? .008 : 0,filter:hoveredGroupId === group.id ? `drop-shadow(0 0 5px ${group.color ?? "#94a3b8"})` : "none"}}/><path d={hitPath} fill="transparent" className="pointer-events-auto"/></g>)}</g></svg>
      {groupLabels.map(({ group, count, tiny, x, y, translateX, translateY }) => <button key={group.id} type="button" aria-pressed={groupFilter === group.id} aria-label={`${group.shortName}, ${count} ${labels.seats}; ${labels.filterGroup}`} title={group.name} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setHoveredGroupId(group.id)} onBlur={() => setHoveredGroupId(null)} onClick={() => setGroupFilter(groupFilter === group.id ? null : group.id)} className={`absolute z-30 hidden whitespace-nowrap rounded-md font-display text-xs font-bold leading-tight text-ink shadow-sm ring-1 transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-brand lg:flex ${tiny ? "items-center gap-1.5 px-1.5 py-0.5" : "flex-col items-center px-1.5 py-1 text-center"} ${groupFilter === group.id ? "bg-brand-soft ring-brand" : "bg-surface/90 ring-line"}`} style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${translateX}%, ${translateY}%)` }}><PartyMark party={markOf(group)} size={16}/><span>{group.shortName}</span><span className="font-medium text-muted">{count}</span></button>)}
      <div className="absolute inset-0" onPointerMove={previewSeatAt} onPointerLeave={() => setPreviewedId(null)} onClick={selectSeatAt}>
      <Image src={chamber === "senate" ? "/chambers/senate-dais.png" : "/chambers/deputies-dais.png"} width={2098} height={750} sizes="144px" alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[63%] z-0 hidden w-28 -translate-x-1/2 opacity-45 md:block lg:w-36"/>
      <div className="pointer-events-none absolute left-1/2 top-[77%] -translate-x-1/2 text-center md:top-[80%]"><div className="font-serif text-2xl font-bold leading-none text-ink md:text-4xl">{seats.length}</div><div className="mt-0.5 text-xs font-bold uppercase text-muted">{labels.seats}</div></div>
      {seats.map((seat, index) => <button key={seat.vote.id} ref={(node) => { buttonRefs.current[index] = node; }} type="button" tabIndex={index === focusedIndex ? 0 : -1} aria-label={`${seat.name}, ${seat.group?.shortName ?? labels.unknownGroup}, ${voteChoiceLabels[locale][seat.vote.choice]}`} aria-pressed={selectedId === seat.vote.id} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredGroupId(seat.group?.id ?? null); }} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setFocusedIndex(index)} onKeyDown={(event) => moveFocus(event, index)} onClick={(event) => { if (event.detail === 0) setSelectedId(seat.vote.id); }} title={`${seat.name} · ${seat.group?.shortName ?? labels.unknownGroup} · ${voteChoiceLabels[locale][seat.vote.choice]}`} className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border shadow-sm outline-offset-2 transition-[opacity,scale,box-shadow] duration-200 motion-reduce:transition-none focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${selectedId === seat.vote.id ? "z-20 ring-2 ring-ink ring-offset-1" : "z-10"} ${(highlightedGroupId && seat.group?.id !== highlightedGroupId) || (matchingSeats.length !== seats.length && !matches(seat)) ? "opacity-35 hover:opacity-100 focus-visible:opacity-100" : "opacity-100"}`} style={{ left: `${seat.left}%`, top: `${seat.top}%`, width: "clamp(6px, 1.45vw, 16px)", height: "clamp(6px, 1.45vw, 16px)", scale: hoveredGroupId === seat.group?.id ? 1.18 : 1, borderWidth: "clamp(0.75px, 0.1vw, 1.5px)", borderColor: seat.group?.color ?? "#94a3b8", backgroundColor: seatVoteColors[seat.vote.choice] }}><span className="hidden xl:block"><VoteSymbol choice={seat.vote.choice} inverse/></span></button>)}
      {previewed && previewed.vote.id !== selectedId ? <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 hidden -translate-x-1/2 border border-line bg-white px-3 py-1.5 text-xs shadow-md md:block rounded-control"><strong>{previewed.name}</strong> · {previewed.group?.shortName ?? labels.unknownGroup} · {voteChoiceLabels[locale][previewed.vote.choice]}</div> : null}
      </div>
      </div>
    </div>
    </div>
    <div className={`mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line py-3 text-xs sm:grid-cols-3 xl:grid-cols-6 ${view === "map" ? "" : "hidden"}`}>{choices.filter((choice) => counts[choice]).map((choice) => <button key={choice} type="button" aria-pressed={choiceFilter === choice} onClick={() => setChoiceFilter(choiceFilter === choice ? null : choice)} className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${choiceFilter === choice ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-line-strong hover:bg-wash"}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wash"><VoteSymbol choice={choice}/></span><span className="text-muted">{voteChoiceLabels[locale][choice]} <strong className="text-ink">{counts[choice]}</strong></span></button>)}</div>
    <p className={`-mt-1 text-xs text-muted ${view === "map" ? "" : "hidden"}`}>{choiceFilter ? <>{labels.legendActive} <button type="button" onClick={() => setChoiceFilter(null)} className="font-semibold text-brand underline">{labels.legendClear}</button></> : labels.legendHint}</p>
    {nominalShortfalls(nominalVotes, officialTotals).map((item) => <p key={item.choice} role="note" className="mt-2 rounded-card border border-vote-abstain-fill bg-vote-abstain-bg p-2.5 text-xs text-vote-abstain">{locale === "ro" ? `Sursa oficială anunță ${item.announced} voturi „${choiceLabelsRo[item.choice]}”, dar lista nominală publicată conține ${item.listed}. Nu completăm diferența.` : `The official source announces ${item.announced} "${choiceLabelsEn[item.choice]}" votes, but its published name list contains ${item.listed}. We do not fill in the difference.`}</p>)}
    {nominalSurpluses(nominalVotes, officialTotals).map((item) => <p key={item.choice} role="note" className="mt-2 rounded-card border border-vote-abstain-fill bg-vote-abstain-bg p-2.5 text-xs text-vote-abstain">{locale === "ro" ? `Sursa oficială anunță ${item.announced} voturi „${choiceLabelsRo[item.choice]}”, dar lista nominală publicată conține ${item.listed}. Nu corectăm diferența.` : `The official source announces ${item.announced} "${choiceLabelsEn[item.choice]}" votes, but its published name list contains ${item.listed}. We do not correct the difference.`}</p>)}
    {counts.absent + counts.unknown > 0 ? <p className="mt-2 flex gap-2 rounded-card border border-line bg-wash p-3 text-xs leading-5 text-ink-soft"><Info size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden="true"/><span>{locale === "ro" ? <><strong className="text-ink">„{voteChoiceLabels.ro.unknown}”</strong> înseamnă că parlamentarul avea un loc în {chamber === "senate" ? "Senat" : "Camera Deputaților"} la data votului, dar lista nominală oficială nu are niciun vot pentru el. Sursa numără drept prezenți doar pe cei de pe listă ({officialTotals.present}) și nu spune de ce lipsește cineva. Nu este vot secret: la un vot secret nu se publică nicio listă și nu afișăm harta.</> : <><strong className="text-ink">“{voteChoiceLabels.en.unknown}”</strong> means the member held a seat in the {chamber === "senate" ? "Senate" : "Chamber of Deputies"} on the day of the vote, but the official name list has no vote for them. The source counts only the people on the list as present ({officialTotals.present}) and does not say why anyone is missing. This is not a secret ballot: for a secret ballot no list is published and we show no map.</>}</span></p> : null}
    {capacity !== undefined && capacity !== seats.length ? <p className="mt-2 text-xs leading-5 text-muted">{locale === "ro" ? `Harta are ${seats.length} de locuri din cele ${capacity} ale camerei. Diferența poate fi locuri vacante sau mandate pe care sursele oficiale nu ne permit să le stabilim.` : `The map has ${seats.length} of the chamber's ${capacity} seats. The difference may be vacant seats or mandates the official sources do not let us establish.`}</p> : null}
    <div className={view === "map" ? undefined : "hidden"}>
    {selected ? <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-auto rounded-t-card border-t-2 border-brand bg-surface p-4 shadow-[0_-10px_30px_rgba(20,18,43,.18)] md:static md:mt-3 md:w-full md:max-h-none md:rounded-card md:border md:border-line md:shadow-lift" role="dialog" aria-modal="false" aria-label={labels.selectedPerson}><div className="flex items-start gap-4">{seatPhotoUrls[selected.vote.memberId] ? <img src={seatPhotoUrls[selected.vote.memberId]} alt="" className="h-24 w-[4.5rem] shrink-0 rounded-control border border-line object-cover object-top"/> : null}<div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-brand">{labels.selectedPerson}</p><h3 className="mt-1 font-serif text-xl font-bold text-ink">{selected.name}</h3><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted"><span className="inline-flex items-center gap-2">{selected.group ? <PartyMark party={markOf(selected.group)} size={24}/> : null}{selected.group?.shortName ?? labels.unknownGroup}</span>{seatConstituencies[selected.vote.memberId] ? <span>{seatConstituencies[selected.vote.memberId]}</span> : null}<span className="inline-flex items-center gap-2"><VoteSymbol choice={selected.vote.choice}/><strong className="text-ink">{voteChoiceLabels[locale][selected.vote.choice]}</strong></span></div>{profileHref(selected) ? <Link href={profileHref(selected)!} className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand-soft">{labels.profile}<ExternalLink size={14}/></Link> : null}</div><button type="button" onClick={() => setSelectedId(null)} aria-label={labels.close} className="grid min-h-11 min-w-11 shrink-0 place-items-center text-ink"><X size={20}/></button></div></div> : <div className="mt-3 hidden rounded-card border border-line bg-wash px-4 py-3 text-sm text-muted md:block">{labels.selectPrompt}</div>}
    <span className="sr-only" aria-live="polite">{selected ? `${selected.name}, ${selected.group?.shortName ?? labels.unknownGroup}, ${voteChoiceLabels[locale][selected.vote.choice]}` : ""}</span>
    </div>
    {view === "table" ? <div className="mt-4"><NominalTable locale={locale} caption={labels.nominalList} rows={filteredNominalSeats.map((seat) => ({ id: seat.vote.id, name: seat.name, href: profileHref(seat), groupKey: seat.group?.id ?? "", groupLabel: seat.group?.shortName ?? labels.unknownGroup, groupMark: seat.group ? markOf(seat.group) : { shortName: "?", color: "#94a3b8" }, county: seatConstituencies[seat.vote.memberId] ? countyLabel(seatConstituencies[seat.vote.memberId]!, locale) : undefined, choice: seat.vote.choice }))} /></div> : null}
    <section className="mt-6" aria-label={labels.groupBreakdown}>
      <h3 className="font-display text-lg font-bold text-ink">{labels.groupBreakdown}</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {groupsShown.map((group) => {
          const rows = seatVotes.filter((vote) => vote.groupId === group.id);
          const tally = { for: rows.filter((vote) => vote.choice === "for").length, against: rows.filter((vote) => vote.choice === "against").length, abstain: rows.filter((vote) => vote.choice === "abstention").length, present: rows.filter((vote) => vote.choice === "present_not_voting").length, absent: rows.filter((vote) => vote.choice === "absent").length };
          return (
            <li key={group.id} className="rounded-card border border-line p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><PartyMark party={markOf(group)} size={24}/>{group.shortName}<span className="ml-auto font-normal tabular-nums text-muted">{rows.length}</span></p>
              <div className="mt-2"><SplitBar counts={tally} locale={locale} height="h-2" showAbsent/></div>
              <p className="mt-1.5 text-xs tabular-nums"><span className="font-semibold text-vote-for">{tally.for}</span> · <span className="font-semibold text-vote-against">{tally.against}</span> · <span className="font-semibold text-vote-abstain">{tally.abstain}</span>{tally.present ? <> · <span className="text-vote-present">{tally.present}</span></> : null}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">{nominalVotes.length} {labels.nominalRecords} · {groupTotals.length} {labels.groupRecords}</p>
    </section>
  </section>;
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-line-strong"}`}>{children}</button>; }
function VoteSymbol({ choice, inverse = false }: { choice: VoteChoice; inverse?: boolean }) { const props = { size: inverse ? 9 : 12, strokeWidth: 3, color: inverse && !noVote(choice) ? "#fff" : symbolColors[choice], "aria-hidden": true as const }; if (choice === "for") return <Check {...props}/>; if (choice === "against") return <X {...props}/>; if (choice === "abstention") return <Minus {...props}/>; if (choice === "present_not_voting") return <Circle {...props}/>; return <Slash {...props}/>; }
function buildSlots(total: number) { const rows = total > 260 ? 8 : total > 170 ? 7 : 6; const weights = Array.from({length:rows}, (_, index) => .7 + index * .25); const sum = weights.reduce((a,b) => a+b,0); const counts = weights.map((weight) => Math.max(1, Math.round(total * weight / sum))); while (counts.reduce((a,b) => a+b,0) > total) counts[counts.indexOf(Math.max(...counts))]!--; while (counts.reduce((a,b) => a+b,0) < total) counts[counts.length-1]!++; const slots: Array<{left:number;top:number;progress:number;row:number}> = []; counts.forEach((count,row) => { const fraction = row / Math.max(rows-1,1); const radiusX = 24 + fraction * 21; const radiusY = 34 + fraction * 32; for (let index=0;index<count;index++) { const progress = count===1 ? .5 : index/(count-1); const angle = (-.5 + progress)*Math.PI; slots.push({left:Math.round((50+Math.sin(angle)*radiusX)*1000)/1000,top:Math.round((88-Math.cos(angle)*radiusY)*1000)/1000,progress,row}); } }); return slots.sort((a,b)=>a.progress-b.progress||b.row-a.row); }

const copy = {
  ro: { chamberMap:"Harta votului în plen", search:"Găsește un deputat (nume, partid, județ)", searchSenator:"Găsește un senator (nume, partid, județ)", filters:"Filtre", groups:"Grupuri parlamentare", votes:"Voturi", allGroups:"Toate grupurile", allVotes:"Toate voturile", matches:"rezultate", instructions:"Cursor: previzualizare · Click: fixează · Tastatură: săgeți + Enter", results:"Rezultate căutare", noResults:"Niciun parlamentar nu corespunde căutării și filtrelor.", unknownGroup:"Grup necunoscut", seats:"mandate", chooseGroup:"Alege un grup pentru a inspecta parlamentarii", filterGroup:"Filtrează grupul", enlargeGroup:"Mărește grupul", hideGroup:"Ascunde lista grupului", legendHint:"Apasă pe un vot de mai sus ca să vezi pe hartă exact cine l-a dat.", legendActive:"Harta arată doar parlamentarii cu acest vot.", legendClear:"Arată toate voturile", mobileHint:"Pentru selecție mai ușoară, alege un grup de mai sus și deschide lista membrilor.", selectedPerson:"Parlamentar selectat", close:"Închide fișa", profile:"Vezi profilul", selectPrompt:"Selectează un loc pentru a vedea persoana și votul său.", groupBreakdown:"Vot pe grupuri", nominalList:"Lista nominală", nominalRecords:"înregistrări nominale", groupRecords:"grupuri cu date", previous:"Înapoi", next:"Următorii" },
  en: { chamberMap:"Chamber voting map", search:"Find a deputy (name, party, constituency)", searchSenator:"Find a senator (name, party, constituency)", filters:"Filters", groups:"Parliamentary groups", votes:"Votes", allGroups:"All groups", allVotes:"All votes", matches:"matches", instructions:"Pointer: preview · Click: pin · Keyboard: arrows + Enter", results:"Search results", noResults:"No members match the search and filters.", unknownGroup:"Unknown group", seats:"seats", chooseGroup:"Choose a group to inspect its members", filterGroup:"Filter group", enlargeGroup:"Enlarge group", hideGroup:"Hide group list", legendHint:"Press a vote above to see on the map exactly who cast it.", legendActive:"The map shows only the members with this vote.", legendClear:"Show all votes", mobileHint:"For easier selection, choose a group above and open its member list.", selectedPerson:"Selected member", close:"Close panel", profile:"View profile", selectPrompt:"Select a seat to see the person and their vote.", groupBreakdown:"Group votes", nominalList:"Nominal list", nominalRecords:"nominal records", groupRecords:"groups with data", previous:"Previous", next:"Next" }
} satisfies Record<Locale, Record<string,string>>;

const choiceLabelsRo = { for: "pentru", against: "contra", abstention: "abținere", present_not_voting: "prezent, nu a votat" } as const;
const choiceLabelsEn = { for: "for", against: "against", abstention: "abstention", present_not_voting: "present, not voting" } as const;
