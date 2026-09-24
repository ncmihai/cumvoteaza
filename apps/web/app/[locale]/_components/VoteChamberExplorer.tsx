"use client";

import Link from "next/link";
import Image from "next/image";
import { arc } from "d3-shape";
import { Check, ChevronDown, Circle, CircleHelp, ExternalLink, Minus, Search, Slash, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { voteChoiceLabels, type ChamberId, type GroupVoteTotal, type IndividualVote, type Locale, type Member, type ParliamentaryGroup, type VoteChoice } from "@cumsevoteaza/parliament-model";
import { presentMemberIdentity } from "@/lib/public-presentation";
import { reconcileVoteSeats } from "@/lib/vote-integrity";
import type { VoteTotals } from "@cumsevoteaza/parliament-model";

type Seat = { vote: IndividualVote; member?: Member; group?: ParliamentaryGroup; name: string; left: number; top: number; progress: number; row: number };
const choices: VoteChoice[] = ["for", "against", "abstention", "present_not_voting", "absent", "unknown"];
const seatVoteColors: Record<VoteChoice, string> = {
  for: "#16804a",
  against: "#c22c3a",
  abstention: "#b77912",
  present_not_voting: "#7547a8",
  absent: "#697586",
  unknown: "#a8b1bf"
};

export function VoteChamberExplorer({ voteId, locale, chamber, groups, members, seatVotes, seatConstituencies = {}, seatPhotoUrls = {}, nominalVotes, groupTotals, officialTotals, capacity }: {
  voteId: string; locale: Locale; chamber: ChamberId; groups: ParliamentaryGroup[]; members: Member[];
  seatVotes: IndividualVote[]; seatConstituencies?: Record<string, string>; seatPhotoUrls?: Record<string, string>; nominalVotes: IndividualVote[]; groupTotals: GroupVoteTotal[];
  officialTotals: VoteTotals; capacity?: number;
}) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [choiceFilter, setChoiceFilter] = useState<VoteChoice | null>(null);
  const [previewedId, setPreviewedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mobileGroupOpen, setMobileGroupOpen] = useState(false);
  const [nominalPage, setNominalPage] = useState(1);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
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
    const middle = (start + end) / 2;
    return { group, count: groupSeats.length, path: arc()({innerRadius:.992,outerRadius:1,startAngle:start,endAngle:end}) ?? "", hitPath: arc()({innerRadius:.95,outerRadius:1.06,startAngle:start,endAngle:end}) ?? "", left: Math.max(6, Math.min(94, 50 + Math.sin(middle) * 52)), top: Math.max(0, 88 - Math.cos(middle) * 79) };
  }), [groupsShown, seats]);
  const highlightedGroupId = hoveredGroupId ?? groupFilter;
  const counts = useMemo(() => Object.fromEntries(choices.map((choice) => [choice, seats.filter((seat) => seat.vote.choice === choice).length])) as Record<VoteChoice, number>, [seats]);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const matches = (seat: Seat) => (!groupFilter || seat.group?.id === groupFilter) && (!choiceFilter || seat.vote.choice === choiceFilter) && (!normalizedQuery || `${seat.name} ${seat.group?.shortName ?? ""}`.toLocaleLowerCase(locale).includes(normalizedQuery));
  const matchingSeats = seats.filter(matches);
  const namedResults = normalizedQuery ? matchingSeats.slice(0, 8) : [];
  const nominalIds = new Set(nominalVotes.map((vote) => vote.id));
  const filteredNominalSeats = matchingSeats.filter((seat) => nominalIds.has(seat.vote.id));
  const nominalPageCount = Math.max(1, Math.ceil(filteredNominalSeats.length / 30));
  const visibleNominalSeats = filteredNominalSeats.slice((Math.min(nominalPage, nominalPageCount) - 1) * 30, Math.min(nominalPage, nominalPageCount) * 30);
  const selected = seats.find((seat) => seat.vote.id === selectedId);
  const previewed = seats.find((seat) => seat.vote.id === previewedId);
  const selectedGroupSeats = groupFilter ? seats.filter((seat) => seat.group?.id === groupFilter && (!choiceFilter || seat.vote.choice === choiceFilter)) : [];
  const present = counts.for + counts.against + counts.abstention + counts.present_not_voting;
  const profileHref = (seat: Seat) => seat.member ? `/${locale}/members/${seat.member.slug}?fromVote=${encodeURIComponent(voteId)}` : undefined;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") { setSelectedId(null); setPreviewedId(null); return; }
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
    if (nearest && nearest.distance <= (window.innerWidth < 768 ? 20 : 16)) setSelectedId(nearest.seat.vote.id);
  }

  function previewSeatAt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const nearest = nearestSeat(event.currentTarget, event.clientX, event.clientY);
    const nearbySeat = nearest && nearest.distance <= 16 ? nearest.seat : null;
    setPreviewedId(nearbySeat?.vote.id ?? null);
  }

  return <section className="min-w-0" aria-label={labels.chamberMap} onKeyDown={(event) => { if (event.key === "Escape") { setSelectedId(null); setPreviewedId(null); } }}>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-3 border border-[#b8c8df] bg-white px-4 py-2.5 text-[#061a47]"><Search size={20} aria-hidden="true"/><span className="sr-only">{searchLabel}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#617293]"/></label>
      <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center justify-center gap-2 border border-[#b8c8df] bg-white px-4 py-2.5 text-sm font-semibold text-[#061a47]"><SlidersHorizontal size={18}/>{labels.filters}<ChevronDown size={15}/></button>
    </div>
    {filtersOpen ? <div className="mt-2 border border-[#b8c8df] bg-[#f7faff] p-3 text-xs">
      <p className="font-bold uppercase tracking-wide text-[#4b608a]">{labels.groups}</p><div className="mt-2 flex flex-wrap gap-1.5"><Filter active={!groupFilter} onClick={() => { setGroupFilter(null); setMobileGroupOpen(false); }}>{labels.allGroups}</Filter>{groupsShown.map((group) => <Filter key={group.id} active={groupFilter === group.id} onClick={() => { setGroupFilter(groupFilter === group.id ? null : group.id); setMobileGroupOpen(false); }}>{group.shortName}</Filter>)}</div>
      <p className="mt-3 font-bold uppercase tracking-wide text-[#4b608a]">{labels.votes}</p><div className="mt-2 flex flex-wrap gap-1.5"><Filter active={!choiceFilter} onClick={() => setChoiceFilter(null)}>{labels.allVotes}</Filter>{choices.filter((choice) => counts[choice]).map((choice) => <Filter key={choice} active={choiceFilter === choice} onClick={() => setChoiceFilter(choiceFilter === choice ? null : choice)}>{voteChoiceLabels[locale][choice]} · {counts[choice]}</Filter>)}</div>
    </div> : null}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4b608a]"><span>{groupFilter ? groupsShown.find((group) => group.id === groupFilter)?.shortName : labels.allGroups} · {choiceFilter ? voteChoiceLabels[locale][choiceFilter] : labels.allVotes}{normalizedQuery ? ` · ${matchingSeats.length} ${labels.matches}` : ""}</span><span className="hidden md:block">{labels.instructions}</span></div>
    {normalizedQuery ? <div className="mt-2 border border-[#d2e0f1] bg-white p-2" aria-label={labels.results}>{namedResults.length ? <div className="grid gap-1 sm:grid-cols-2">{namedResults.map((seat) => <button key={seat.vote.id} type="button" onClick={() => setSelectedId(seat.vote.id)} className="flex items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-[#eef6fd]"><strong className="truncate text-[#061a47]">{seat.name}</strong><span className="shrink-0 text-[#4b608a]">{seat.group?.shortName ?? labels.unknownGroup} · {voteChoiceLabels[locale][seat.vote.choice]}</span></button>)}</div> : <p className="px-2 py-2 text-sm text-[#4b608a]">{labels.noResults}</p>}</div> : null}
    <div className="mt-3 flex flex-wrap gap-1.5 lg:hidden" aria-label={labels.chooseGroup}>{groupsShown.map((group) => <button key={group.id} type="button" aria-pressed={groupFilter === group.id} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setHoveredGroupId(group.id)} onBlur={() => setHoveredGroupId(null)} onClick={() => { setGroupFilter(groupFilter === group.id ? null : group.id); setMobileGroupOpen(window.innerWidth < 768); }} className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold ${groupFilter === group.id ? "border-[#061a47] bg-[#061a47] text-white" : "border-[#b8c8df] bg-white text-[#061a47]"}`}><span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{backgroundColor:group.color ?? "#94a3b8"}}/>{group.shortName} · {seats.filter((seat) => seat.group?.id === group.id).length}</button>)}</div>
    <div className="md:hidden">{groupFilter ? <><button type="button" onClick={() => setMobileGroupOpen((open) => !open)} className="mt-2 w-full border border-[#b8c8df] bg-white px-3 py-2 text-sm font-semibold text-[#075fc6]">{mobileGroupOpen ? labels.hideGroup : labels.enlargeGroup} · {groupsShown.find((group) => group.id === groupFilter)?.shortName}</button>{mobileGroupOpen ? <div className="mt-2 max-h-64 overflow-auto border border-[#d2e0f1] bg-white p-2">{selectedGroupSeats.map((seat) => <button key={seat.vote.id} type="button" onClick={() => setSelectedId(seat.vote.id)} className="flex w-full items-center justify-between border-b border-slate-100 px-2 py-2 text-left text-sm last:border-0"><span>{seat.name}</span><span className="ml-2 shrink-0"><VoteSymbol choice={seat.vote.choice}/></span></button>)}</div> : null}</> : <p className="mt-2 text-xs text-[#4b608a]">{labels.mobileHint}</p>}</div>
    <div className="relative mx-auto mt-4 aspect-[2/1] min-h-[190px] w-full max-w-[1060px]" aria-label={`${labels.chamberMap}: ${seats.length} ${labels.seats}`}>
      <svg viewBox="0 0 1000 500" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-20 h-[85%] w-[85%] overflow-visible lg:h-full lg:w-[92%]" aria-hidden="true"><g transform="translate(500 440) scale(480 360)">{groupArcs.map(({group, path, hitPath}) => <g key={group.id} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onClick={() => setGroupFilter(groupFilter === group.id ? null : group.id)} className={`cursor-pointer transition-opacity duration-200 motion-reduce:transition-none ${highlightedGroupId && highlightedGroupId !== group.id ? "opacity-35" : "opacity-100"}`}><path d={path} fill={group.color ?? "#94a3b8"} stroke={group.color ?? "#94a3b8"} className="pointer-events-auto transition-[stroke-width,filter] duration-200 motion-reduce:transition-none" style={{strokeWidth:hoveredGroupId === group.id ? .008 : 0,filter:hoveredGroupId === group.id ? `drop-shadow(0 0 5px ${group.color ?? "#94a3b8"})` : "none"}}/><path d={hitPath} fill="transparent" className="pointer-events-auto"/></g>)}</g></svg>
      {groupArcs.map(({group, count, left, top}) => <button key={group.id} type="button" aria-pressed={groupFilter === group.id} aria-label={`${group.shortName}, ${count} ${labels.seats}; ${labels.filterGroup}`} title={group.name} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setHoveredGroupId(group.id)} onBlur={() => setHoveredGroupId(null)} onClick={() => setGroupFilter(groupFilter === group.id ? null : group.id)} className={`absolute z-30 flex -translate-y-1/2 whitespace-nowrap border border-transparent px-0.5 py-0.5 font-serif font-bold leading-none text-[#061a47] transition-colors hover:border-[#b8c8df] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#075fc6] lg:hidden ${left < 20 || left > 80 ? "translate-x-0" : "-translate-x-1/2"} ${groupFilter === group.id ? "border-[#075fc6] bg-[#f0f6fc]" : ""}`} style={{left:left > 80 ? "86%" : `${left*.85}%`,top:`${(left < 20 ? top - 12 : top)*.85}%`,fontSize:"clamp(9px, 1vw, 12px)"}}>{group.shortName}</button>)}
      {groupArcs.map(({group, count, left, top}) => <button key={group.id} type="button" aria-pressed={groupFilter === group.id} aria-label={`${group.shortName}, ${count} ${labels.seats}; ${labels.filterGroup}`} title={group.name} onPointerEnter={() => setHoveredGroupId(group.id)} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setHoveredGroupId(group.id)} onBlur={() => setHoveredGroupId(null)} onClick={() => setGroupFilter(groupFilter === group.id ? null : group.id)} className={`absolute z-30 hidden min-w-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center whitespace-nowrap border border-transparent px-1.5 py-1 text-center font-serif text-xs font-bold leading-tight text-[#061a47] transition-colors hover:border-[#b8c8df] hover:bg-white focus-visible:outline-2 focus-visible:outline-[#075fc6] lg:flex ${groupFilter === group.id ? "border-[#075fc6] bg-[#f0f6fc]" : ""}`} style={{left:`${left}%`,top:`${top}%`}}><span>{group.shortName}</span><span>{count}</span></button>)}
      <div className="relative h-[85%] w-[85%] lg:h-full lg:w-[92%]" onPointerMove={previewSeatAt} onPointerLeave={() => setPreviewedId(null)} onClick={selectSeatAt}>
      <Image src={chamber === "senate" ? "/chambers/senate-dais.png" : "/chambers/deputies-dais.png"} width={2098} height={750} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[63%] z-0 hidden w-28 -translate-x-1/2 opacity-45 md:block lg:w-36"/>
      <div className="pointer-events-none absolute left-1/2 top-[77%] -translate-x-1/2 text-center md:top-[80%]"><div className="font-serif text-2xl font-bold leading-none text-[#061a47] md:text-4xl">{seats.length}</div><div className="mt-0.5 text-[9px] font-bold uppercase text-[#4b608a]">{labels.seats}</div></div>
      {seats.map((seat, index) => <button key={seat.vote.id} ref={(node) => { buttonRefs.current[index] = node; }} type="button" tabIndex={index === focusedIndex ? 0 : -1} aria-label={`${seat.name}, ${seat.group?.shortName ?? labels.unknownGroup}, ${voteChoiceLabels[locale][seat.vote.choice]}`} aria-pressed={selectedId === seat.vote.id} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredGroupId(seat.group?.id ?? null); }} onPointerLeave={() => setHoveredGroupId(null)} onFocus={() => setFocusedIndex(index)} onKeyDown={(event) => moveFocus(event, index)} onClick={(event) => { if (event.detail === 0) setSelectedId(seat.vote.id); }} title={`${seat.name} · ${seat.group?.shortName ?? labels.unknownGroup} · ${voteChoiceLabels[locale][seat.vote.choice]}`} className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border shadow-sm outline-offset-2 transition-[opacity,scale,box-shadow] duration-200 motion-reduce:transition-none focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#075fc6] ${selectedId === seat.vote.id ? "z-20 ring-2 ring-[#061a47] ring-offset-1" : "z-10"} ${(highlightedGroupId && seat.group?.id !== highlightedGroupId) || (matchingSeats.length !== seats.length && !matches(seat)) ? "opacity-35 hover:opacity-100 focus-visible:opacity-100" : "opacity-100"}`} style={{ left: `${seat.left}%`, top: `${seat.top}%`, width: "clamp(6px, 1.45vw, 16px)", height: "clamp(6px, 1.45vw, 16px)", scale: hoveredGroupId === seat.group?.id ? 1.18 : 1, borderWidth: "clamp(0.75px, 0.1vw, 1.5px)", borderColor: seat.group?.color ?? "#94a3b8", backgroundColor: seatVoteColors[seat.vote.choice] }}><span className="hidden xl:block"><VoteSymbol choice={seat.vote.choice} inverse/></span></button>)}
      {previewed && previewed.vote.id !== selectedId ? <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 hidden -translate-x-1/2 border border-[#b8c8df] bg-white px-3 py-1.5 text-xs shadow-md md:block"><strong>{previewed.name}</strong> · {previewed.group?.shortName ?? labels.unknownGroup} · {voteChoiceLabels[locale][previewed.vote.choice]}</div> : null}
      </div>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#d2e0f1] py-3 text-xs sm:grid-cols-3 xl:grid-cols-6">{choices.filter((choice) => counts[choice]).map((choice) => <div key={choice} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef3fa]"><VoteSymbol choice={choice}/></span><span className="text-[#4b608a]">{voteChoiceLabels[locale][choice]} <strong className="text-[#061a47]">{counts[choice]}</strong></span></div>)}</div>
    {!reconcileVoteSeats(seatVotes, officialTotals, capacity) ? <p role="status" className="border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{labels.reconciliationWarning} {locale === "ro" ? "Locurile fără date nu sunt absențe confirmate. Diferența față de capacitate nu dovedește mandate vacante." : "Seats without data are not confirmed absences. A capacity difference does not establish vacant mandates."}{capacity !== undefined ? ` (${seats.length} / ${capacity})` : ""}</p> : null}
    {selected ? <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-auto border-t-2 border-[#075fc6] bg-white p-4 shadow-[0_-10px_30px_rgba(6,26,71,.18)] md:static md:mt-3 md:w-full md:max-h-none md:border md:border-[#b8c8df] md:shadow-md" role="dialog" aria-modal="false" aria-label={labels.selectedPerson}><div className="flex items-start gap-4">{seatPhotoUrls[selected.vote.memberId] ? <img src={seatPhotoUrls[selected.vote.memberId]} alt="" className="h-20 w-16 shrink-0 border border-[#d2e0f1] object-cover"/> : null}<div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wide text-[#075fc6]">{labels.selectedPerson}</p><h3 className="mt-1 font-serif text-xl font-bold text-[#061a47]">{selected.name}</h3><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#4b608a]"><span className="inline-flex items-center gap-2"><i className="h-4 w-4 rounded-full border-[4px] bg-white" style={{borderColor:selected.group?.color ?? "#94a3b8"}}/>{selected.group?.shortName ?? labels.unknownGroup}</span>{seatConstituencies[selected.vote.memberId] ? <span>{seatConstituencies[selected.vote.memberId]}</span> : null}<span className="inline-flex items-center gap-2"><VoteSymbol choice={selected.vote.choice}/><strong className="text-[#061a47]">{voteChoiceLabels[locale][selected.vote.choice]}</strong></span></div>{profileHref(selected) ? <Link href={profileHref(selected)!} className="mt-3 inline-flex items-center gap-2 border border-[#075fc6] px-4 py-2 text-sm font-semibold text-[#075fc6]">{labels.profile}<ExternalLink size={14}/></Link> : null}</div><button type="button" onClick={() => setSelectedId(null)} aria-label={labels.close} className="shrink-0 p-1 text-[#061a47]"><X size={20}/></button></div></div> : <div className="mt-3 hidden border border-[#d2e0f1] bg-[#f7faff] px-4 py-3 text-sm text-[#4b608a] md:block">{labels.selectPrompt}</div>}
    <span className="sr-only" aria-live="polite">{selected ? `${selected.name}, ${selected.group?.shortName ?? labels.unknownGroup}, ${voteChoiceLabels[locale][selected.vote.choice]}` : ""}</span>
    <details className="mt-4 border border-[#d2e0f1] bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#061a47]">{labels.groupBreakdown} · {labels.nominalList}</summary><div className="border-t border-[#d2e0f1] p-4"><div className="grid gap-2 text-xs sm:grid-cols-2">{groupsShown.map((group) => <div key={group.id} className="border border-slate-200 p-2"><strong>{group.shortName}</strong><span className="ml-2 text-[#4b608a]">{choices.map((choice) => `${voteChoiceLabels[locale][choice]} ${seatVotes.filter((vote) => vote.groupId === group.id && vote.choice === choice).length}`).join(" · ")}</span></div>)}</div><h3 className="mt-5 border-b border-slate-200 pb-2 font-serif text-lg font-semibold text-[#061a47]">{labels.nominalList} · {filteredNominalSeats.length} / {nominalVotes.length}</h3><div className="divide-y divide-slate-100">{visibleNominalSeats.map((seat) => <div key={seat.vote.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_90px_150px]">{profileHref(seat) ? <Link href={profileHref(seat)!} className="min-w-0 font-semibold text-[#075fc6] hover:underline">{seat.name}</Link> : <strong className="min-w-0">{seat.name}</strong>}<span className="text-[#4b608a]">{seat.group?.shortName ?? labels.unknownGroup}</span><span className="text-right font-semibold text-[#061a47]">{voteChoiceLabels[locale][seat.vote.choice]}</span></div>)}{!filteredNominalSeats.length ? <p className="py-3 text-xs text-[#4b608a]">{labels.noResults}</p> : null}</div>{nominalPageCount > 1 ? <nav className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-xs" aria-label={labels.nominalList}><button type="button" disabled={nominalPage <= 1} onClick={() => setNominalPage((page) => Math.max(1, page - 1))} className="border border-slate-300 px-3 py-1.5 disabled:opacity-40">{labels.previous}</button><span>{Math.min(nominalPage,nominalPageCount)} / {nominalPageCount}</span><button type="button" disabled={nominalPage >= nominalPageCount} onClick={() => setNominalPage((page) => Math.min(nominalPageCount, page + 1))} className="border border-slate-300 px-3 py-1.5 disabled:opacity-40">{labels.next}</button></nav> : null}<p className="mt-3 text-xs text-[#4b608a]">{nominalVotes.length} {labels.nominalRecords} · {groupTotals.length} {labels.groupRecords}</p></div></details>
  </section>;
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`border px-2 py-1.5 text-xs font-semibold ${active ? "border-[#061a47] bg-[#061a47] text-white" : "border-[#b8c8df] bg-white text-[#4b608a]"}`}>{children}</button>; }
function VoteSymbol({ choice, inverse = false }: { choice: VoteChoice; inverse?: boolean }) { const props = { size: inverse ? 9 : 12, strokeWidth: 3, color: inverse ? "#fff" : seatVoteColors[choice], "aria-hidden": true as const }; if (choice === "for") return <Check {...props}/>; if (choice === "against") return <X {...props}/>; if (choice === "abstention") return <Minus {...props}/>; if (choice === "present_not_voting") return <Circle {...props}/>; if (choice === "absent") return <Slash {...props}/>; return <CircleHelp {...props}/>; }
function buildSlots(total: number) { const rows = total > 260 ? 8 : total > 170 ? 7 : 6; const weights = Array.from({length:rows}, (_, index) => .7 + index * .25); const sum = weights.reduce((a,b) => a+b,0); const counts = weights.map((weight) => Math.max(1, Math.round(total * weight / sum))); while (counts.reduce((a,b) => a+b,0) > total) counts[counts.indexOf(Math.max(...counts))]!--; while (counts.reduce((a,b) => a+b,0) < total) counts[counts.length-1]!++; const slots: Array<{left:number;top:number;progress:number;row:number}> = []; counts.forEach((count,row) => { const fraction = row / Math.max(rows-1,1); const radiusX = 24 + fraction * 21; const radiusY = 34 + fraction * 32; for (let index=0;index<count;index++) { const progress = count===1 ? .5 : index/(count-1); const angle = (-.5 + progress)*Math.PI; slots.push({left:50+Math.sin(angle)*radiusX,top:88-Math.cos(angle)*radiusY,progress,row}); } }); return slots.sort((a,b)=>a.progress-b.progress||b.row-a.row); }

const copy = {
  ro: { chamberMap:"Harta votului în plen", search:"Găsește un deputat (nume, partid)", searchSenator:"Găsește un senator (nume, partid)", filters:"Filtre", groups:"Grupuri parlamentare", votes:"Voturi", allGroups:"Toate grupurile", allVotes:"Toate voturile", matches:"rezultate", instructions:"Cursor: previzualizare · Click: fixează · Tastatură: săgeți + Enter", results:"Rezultate căutare", noResults:"Niciun parlamentar nu corespunde căutării și filtrelor.", unknownGroup:"Grup necunoscut", seats:"mandate", reconciliationWarning:"Datele nominale nu se reconciliază complet cu numărul de locuri afișate.", chooseGroup:"Alege un grup pentru a inspecta parlamentarii", filterGroup:"Filtrează grupul", enlargeGroup:"Mărește grupul", hideGroup:"Ascunde lista grupului", mobileHint:"Pentru selecție mai ușoară, alege un grup de mai sus și deschide lista membrilor.", selectedPerson:"Parlamentar selectat", close:"Închide fișa", profile:"Vezi profilul", selectPrompt:"Selectează un loc pentru a vedea persoana și votul său.", groupBreakdown:"Vot pe grupuri", nominalList:"Lista nominală", nominalRecords:"înregistrări nominale", groupRecords:"grupuri cu date", previous:"Înapoi", next:"Următorii" },
  en: { chamberMap:"Chamber voting map", search:"Find a deputy (name, party)", searchSenator:"Find a senator (name, party)", filters:"Filters", groups:"Parliamentary groups", votes:"Votes", allGroups:"All groups", allVotes:"All votes", matches:"matches", instructions:"Pointer: preview · Click: pin · Keyboard: arrows + Enter", results:"Search results", noResults:"No members match the search and filters.", unknownGroup:"Unknown group", seats:"seats", reconciliationWarning:"Nominal data do not fully reconcile with the displayed seat count.", chooseGroup:"Choose a group to inspect its members", filterGroup:"Filter group", enlargeGroup:"Enlarge group", hideGroup:"Hide group list", mobileHint:"For easier selection, choose a group above and open its member list.", selectedPerson:"Selected member", close:"Close panel", profile:"View profile", selectPrompt:"Select a seat to see the person and their vote.", groupBreakdown:"Group votes", nominalList:"Nominal list", nominalRecords:"nominal records", groupRecords:"groups with data", previous:"Previous", next:"Next" }
} satisfies Record<Locale, Record<string,string>>;
