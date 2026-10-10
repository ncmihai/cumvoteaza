"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { officialCase } from "@/lib/text";
import { BRAND_COLOUR, MAP_METRICS, leaderOf, listColours, metricValue, paintFor, pickableLists, rampRange, shareOf, sumByCircumscription, turnoutOf, invalidShareOf, type MapArea, type MapList, type MapMetric } from "@/lib/election-map";

/**
 * Sprint 17 (D-041): the election map. The shapes are SVG paths read from two static files (counties first, communes when asked for), the results come from one request for the chosen election
 * and chamber, and every colour is worked out here from the same numbers the tables show. No map service, no tiles, no third-party request.
 */
interface CountyShape { n: number; name: string; d: string; x: number; y: number; b: [number, number, number, number] }
interface CountiesFile { viewBox: [number, number, number, number]; attribution: string; counties: CountyShape[]; inset: { viewBox: [number, number, number, number]; sectors: Array<{ s: string; d: string }> } }
interface CommunesFile { viewBox: [number, number, number, number]; communes: Array<{ s: string; c: number; d: string }> }
interface MapPayload { election: string; chamber: "deputies" | "senate"; lists: MapList[]; areas: MapArea[] }

export interface ElectionMapProps {
  locale: "ro" | "en";
  elections: Array<{ id: string; label: string }>;
  initial: { election: string; chamber: "deputies" | "senate"; metric: MapMetric; list?: number; circ?: number; level: "counties" | "communes" };
}

const tab = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-semibold ${active ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft hover:border-line-strong"}`;

export function ElectionMap({ locale, elections, initial }: ElectionMapProps) {
  const ro = locale === "ro";
  const [election, setElection] = useState(initial.election);
  const [chamber, setChamber] = useState(initial.chamber);
  const [metric, setMetric] = useState<MapMetric>(initial.metric);
  const [listChoice, setListChoice] = useState<number | undefined>(initial.list);
  const [level, setLevel] = useState(initial.level);
  const [circ, setCirc] = useState<number | undefined>(initial.circ);
  const [selected, setSelected] = useState<string | undefined>();
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | undefined>();
  const [payload, setPayload] = useState<MapPayload | undefined>();
  const [failed, setFailed] = useState(false);
  const [counties, setCounties] = useState<CountiesFile | undefined>();
  const [communes, setCommunes] = useState<CommunesFile | undefined>();
  const frame = useRef<HTMLDivElement>(null);

  const number = (value: number) => value.toLocaleString(ro ? "ro-RO" : "en-GB");
  const percent = (value: number | undefined, digits = 1) => (value === undefined ? "–" : `${(value * 100).toLocaleString(ro ? "ro-RO" : "en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`);

  useEffect(() => {
    let cancelled = false;
    fetch("/geo/ro-counties.json").then((response) => (response.ok ? response.json() : Promise.reject(new Error("geometry")))).then((file: CountiesFile) => { if (!cancelled) setCounties(file); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (level !== "communes" || communes) return;
    let cancelled = false;
    fetch("/geo/ro-communes.json").then((response) => (response.ok ? response.json() : Promise.reject(new Error("geometry")))).then((file: CommunesFile) => { if (!cancelled) setCommunes(file); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [level, communes]);

  useEffect(() => {
    const controller = new AbortController();
    setPayload(undefined);
    setFailed(false);
    fetch(`/api/elections/map?election=${encodeURIComponent(election)}&chamber=${chamber}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("data"))))
      .then((data: MapPayload) => setPayload(data))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [election, chamber]);

  // The address always says what is on the screen, so that it can be shared.
  useEffect(() => {
    const params = new URLSearchParams({ election, chamber, metric, level });
    if (metric === "share" && listChoice !== undefined) params.set("list", String(listChoice));
    if (circ !== undefined) params.set("circ", String(circ));
    try { window.history.replaceState(null, "", `?${params.toString()}`); } catch { /* the address stays as it was */ }
  }, [election, chamber, metric, listChoice, level, circ]);

  const lists = payload?.lists ?? [];
  const listByCode = useMemo(() => new Map(lists.map((list) => [list.code, list])), [lists]);
  const colours = useMemo(() => listColours(lists), [lists]);
  const listName = (code: number) => {
    const list = listByCode.get(code);
    return list ? (list.independents ? (ro ? "Candidați independenți" : "Independent candidates") : officialCase(list.name)) : String(code);
  };
  const choices = useMemo(() => pickableLists(lists), [lists]);
  const listCode = listChoice !== undefined && listByCode.has(listChoice) ? listChoice : (choices.find((list) => !list.independents)?.code ?? 0);

  const domestic = useMemo(() => (payload?.areas ?? []).filter((area) => area.c !== 43), [payload]);
  const countyAreas = useMemo(() => sumByCircumscription(domestic), [domestic]);
  const countyByNumber = useMemo(() => new Map(countyAreas.map((area) => [area.c, area])), [countyAreas]);
  const communeByKey = useMemo(() => new Map(domestic.map((area) => [area.k, area])), [domestic]);
  const countyName = (n: number) => counties?.counties.find((county) => county.n === n)?.name ?? String(n);

  const drawn = level === "counties" ? countyAreas : domestic;
  const range = useMemo(() => rampRange(drawn.map((area) => metricValue(area, metric, listCode)).filter((value): value is number => value !== undefined)), [drawn, metric, listCode]);
  const paint = (area: MapArea | undefined) => (area ? paintFor(area, { metric, listCode, colours, range }) : undefined);

  const wins = useMemo(() => {
    const counts = new Map<number, number>();
    for (const area of drawn) { const leader = leaderOf(area); if (leader) counts.set(leader.code, (counts.get(leader.code) ?? 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [drawn]);

  const areaOf = (key: string | undefined) => (key ? (key.startsWith("c") ? countyByNumber.get(Number(key.slice(1))) : communeByKey.get(key)) : undefined);
  const hoverArea = areaOf(hover?.key);
  const selectedArea = areaOf(selected);

  const zoom = circ !== undefined ? counties?.counties.find((county) => county.n === circ)?.b : undefined;
  const fullBox = counties?.viewBox ?? [0, 0, 1000, 711];
  const viewBox = level === "communes" && zoom ? (() => { const pad = 12; const w = zoom[2] - zoom[0] + 2 * pad; const h = zoom[3] - zoom[1] + 2 * pad; const side = Math.max(w, h * 1.4); return [zoom[0] - pad - (side - w) / 2, zoom[1] - pad - (side / 1.4 - h) / 2, side, side / 1.4]; })() : [0, 0, fullBox[2], fullBox[3]];

  const metricLabel: Record<MapMetric, string> = {
    winner: ro ? "Câștigătorul" : "The winner",
    share: ro ? "Ponderea unei liste" : "One list's share",
    turnout: ro ? "Prezența" : "Turnout",
    invalid: ro ? "Voturi nule" : "Null votes"
  };

  function lineFor(area: MapArea): string[] {
    const lines: string[] = [];
    const leader = leaderOf(area);
    if (leader) lines.push(`${listName(leader.code)} ${percent(leader.share)}${area.l.length > 1 ? ` · ${ro ? "față de" : "ahead of"} ${listName(area.l[1]!)} ${percent(shareOf(area, area.l[1]!))}` : ""}`);
    lines.push(`${ro ? "Prezență" : "Turnout"} ${percent(turnoutOf(area))} · ${ro ? "nule" : "null"} ${percent(invalidShareOf(area))}`);
    return lines;
  }

  function title(area: MapArea): string {
    return area.k.startsWith("c") ? countyName(area.c) : officialCase(area.n);
  }

  function select(key: string) {
    if (level === "counties" && key.startsWith("c")) {
      setCirc(Number(key.slice(1)));
      setLevel("communes");
      setSelected(undefined);
      return;
    }
    setSelected(key);
  }

  function pointer(event: React.PointerEvent) {
    const target = (event.target as Element).closest("[data-k]") as HTMLElement | SVGElement | null;
    const box = frame.current?.getBoundingClientRect();
    if (!target || !box) { setHover(undefined); return; }
    setHover({ key: target.getAttribute("data-k")!, x: event.clientX - box.left, y: event.clientY - box.top });
  }

  const ready = Boolean(payload && counties && (level === "counties" || communes));
  const sectorAreas = counties?.inset.sectors.map((sector) => ({ ...sector, area: communeByKey.get(sector.s) })) ?? [];
  const countyList = [...(counties?.counties ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ro"));
  const circCommunes = circ !== undefined ? domestic.filter((area) => area.c === circ).sort((a, b) => b.v - a.v) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label={ro ? "Alegerea hărții" : "Map choices"}>
        <ul className="flex flex-wrap gap-2" aria-label={ro ? "Alegeri" : "Elections"}>
          {elections.map((item) => <li key={item.id}><button type="button" className={tab(item.id === election)} aria-pressed={item.id === election} onClick={() => { setElection(item.id); setSelected(undefined); }}>{item.label}</button></li>)}
        </ul>
        <ul className="flex flex-wrap gap-2" aria-label={ro ? "Camera" : "Chamber"}>
          {(["deputies", "senate"] as const).map((item) => <li key={item}><button type="button" className={tab(item === chamber)} aria-pressed={item === chamber} onClick={() => { setChamber(item); setSelected(undefined); }}>{item === "deputies" ? (ro ? "Camera Deputaților" : "Chamber of Deputies") : "Senat"}</button></li>)}
        </ul>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ul className="flex flex-wrap gap-2" aria-label={ro ? "Ce arată harta" : "What the map shows"}>
          {MAP_METRICS.map((item) => <li key={item}><button type="button" className={tab(item === metric)} aria-pressed={item === metric} onClick={() => setMetric(item)}>{metricLabel[item]}</button></li>)}
        </ul>
        {metric === "share" ? (
          <label className="flex items-center gap-2 text-sm text-ink-soft">{ro ? "Lista" : "List"}
            <select className="rounded-control border border-line bg-surface px-2 py-1.5 text-sm text-ink" value={listCode} onChange={(event) => setListChoice(Number(event.target.value))}>
              {choices.map((list) => <option key={list.code} value={list.code}>{listName(list.code)}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ul className="flex flex-wrap gap-2" aria-label={ro ? "Nivelul hărții" : "Map level"}>
          <li><button type="button" className={tab(level === "counties")} aria-pressed={level === "counties"} onClick={() => { setLevel("counties"); setCirc(undefined); setSelected(undefined); }}>{ro ? "Pe județe" : "By county"}</button></li>
          <li><button type="button" className={tab(level === "communes")} aria-pressed={level === "communes"} onClick={() => setLevel("communes")}>{ro ? "Pe comune" : "By commune"}</button></li>
        </ul>
        {level === "communes" ? (
          <label className="flex items-center gap-2 text-sm text-ink-soft">{ro ? "Județ" : "County"}
            <select className="rounded-control border border-line bg-surface px-2 py-1.5 text-sm text-ink" value={circ ?? ""} onChange={(event) => { setCirc(event.target.value ? Number(event.target.value) : undefined); setSelected(undefined); }}>
              <option value="">{ro ? "Toată țara" : "Whole country"}</option>
              {countyList.map((county) => <option key={county.n} value={county.n}>{county.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div ref={frame} className="relative min-w-0 rounded-card border border-line bg-surface p-2" onPointerMove={pointer} onPointerLeave={() => setHover(undefined)}>
          {failed ? <p className="p-6 text-sm text-muted">{ro ? "Harta nu s-a putut încărca; tabelul de mai jos are aceleași cifre." : "The map could not be loaded; the table below has the same figures."}</p> : null}
          {!ready && !failed ? <div className="grid aspect-[1000/711] place-items-center text-sm text-muted" role="status">{ro ? "Se încarcă harta…" : "Loading the map…"}</div> : null}
          {ready && counties ? (
            <svg viewBox={viewBox.join(" ")} className="block h-auto w-full touch-manipulation" role="group" aria-label={`${metricLabel[metric]}, ${ro ? "harta României" : "map of Romania"}`}>
              {level === "counties" ? (
                <g>
                  {counties.counties.map((county) => {
                    const area = countyByNumber.get(county.n);
                    const colour = paint(area);
                    return <path key={county.n} d={county.d} data-k={`c${county.n}`} fill={colour?.fill ?? "#e5e7eb"} fillOpacity={colour?.opacity ?? 1} stroke="#ffffff" strokeWidth={0.8} className="cursor-pointer transition-[fill-opacity] duration-300 motion-reduce:transition-none" role="button" tabIndex={0} aria-label={`${county.name}${area ? `: ${lineFor(area).join(", ")}` : ""}`} onClick={() => select(`c${county.n}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(`c${county.n}`); } }} />;
                  })}
                </g>
              ) : communes ? (
                <g>
                  {communes.communes.map((commune) => {
                    const area = communeByKey.get(commune.s);
                    const colour = paint(area);
                    const dimmed = circ !== undefined && commune.c !== circ;
                    return <path key={commune.s} d={commune.d} data-k={commune.s} fill={colour?.fill ?? "#e5e7eb"} fillOpacity={dimmed ? 0.12 : (colour?.opacity ?? 1)} stroke="#ffffff" strokeWidth={0.25} strokeOpacity={0.9} vectorEffect="non-scaling-stroke" className={dimmed ? "" : "cursor-pointer"} onClick={() => !dimmed && select(commune.s)} />;
                  })}
                  {counties.counties.map((county) => <path key={county.n} d={county.d} fill="none" stroke="#1f2937" strokeWidth={circ === county.n ? 1.6 : 0.6} strokeOpacity={circ === undefined || circ === county.n ? 0.7 : 0.25} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
                </g>
              ) : null}
            </svg>
          ) : null}
          {hover && hoverArea ? (
            <div className="pointer-events-none absolute z-10 max-w-[16rem] rounded-control border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink shadow-lift" style={{ left: Math.min(hover.x + 14, (frame.current?.clientWidth ?? 400) - 260), top: hover.y + 14 }} role="presentation">
              <p className="font-bold">{title(hoverArea)}</p>
              {lineFor(hoverArea).map((line) => <p key={line} className="text-ink-soft">{line}</p>)}
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <section aria-label={ro ? "Legenda" : "Legend"} className="rounded-card border border-line bg-surface p-4 text-sm">
            <h3 className="font-display text-base font-bold text-ink">{metricLabel[metric]}</h3>
            {metric === "winner" ? (
              <>
                <ul className="mt-2 space-y-1.5">
                  {wins.slice(0, 7).map(([code, count]) => <li key={code} className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: colours.get(code) }} /><span className="min-w-0 flex-1 truncate text-ink-soft">{listName(code)}</span><span className="tabular-nums text-muted">{number(count)}</span></li>)}
                </ul>
                <p className="mt-2 text-xs leading-5 text-muted">{level === "counties" ? (ro ? "județe câștigate" : "counties won") : (ro ? "comune câștigate" : "communes won")}. {ro ? "Culoarea e mai intensă cu cât diferența față de locul doi e mai mare." : "The colour is stronger the larger the lead over second place."}</p>
              </>
            ) : (
              <>
                <div aria-hidden="true" className="mt-2 h-3 rounded-sm" style={{ background: `linear-gradient(to right, ${metric === "share" ? colours.get(listCode) ?? BRAND_COLOUR : BRAND_COLOUR}1f, ${metric === "share" ? colours.get(listCode) ?? BRAND_COLOUR : BRAND_COLOUR})` }} />
                <p className="mt-1 flex justify-between text-xs tabular-nums text-muted"><span>{percent(range.min)}</span><span>{percent(range.max)}</span></p>
                <p className="mt-2 text-xs leading-5 text-muted">{metric === "share" ? `${listName(listCode)}: ${ro ? "ponderea din voturile valabile" : "share of the valid votes"}.` : metric === "turnout" ? (ro ? "Alegătorii care au votat, din cei înscriși pe listele permanente (coloanele b și a1 ale AEP)." : "Voters who came, of those on the permanent lists (the AEP's columns b and a1).") : (ro ? "Voturile nule din voturile exprimate (coloana f, din b)." : "Null votes of the votes cast (column f of b).")}</p>
              </>
            )}
          </section>

          {counties ? (
            <section aria-label={ro ? "București pe sectoare" : "Bucharest by sector"} className="rounded-card border border-line bg-surface p-4">
              <h3 className="font-display text-base font-bold text-ink">{ro ? "București, pe sectoare" : "Bucharest, by sector"}</h3>
              <svg viewBox={counties.inset.viewBox.join(" ")} className="mx-auto mt-2 block h-auto w-full max-w-[12rem]" role="group" aria-label={ro ? "Sectoarele Bucureștiului" : "The sectors of Bucharest"}>
                {sectorAreas.map(({ s, d, area }) => {
                  const colour = paint(area);
                  return <path key={s} d={d} data-k={s} fill={colour?.fill ?? "#e5e7eb"} fillOpacity={colour?.opacity ?? 1} stroke="#ffffff" strokeWidth={4} className="cursor-pointer transition-[fill-opacity] duration-300 motion-reduce:transition-none" onClick={() => area && setSelected(s)} />;
                })}
              </svg>
              <p className="mt-1 text-xs text-muted">{ro ? "Sectorul 1 la nord, apoi în sensul acelor de ceasornic." : "Sector 1 in the north, then clockwise."}</p>
            </section>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-card border border-line bg-surface p-4" aria-live="polite">
        {selectedArea ? (
          <>
            <h3 className="font-display text-lg font-bold text-ink">{title(selectedArea)}{selectedArea.k.startsWith("c") ? "" : <span className="font-normal text-muted"> · {countyName(selectedArea.c)}</span>}</h3>
            <p className="mt-1 text-sm text-muted">{number(selectedArea.v)} {ro ? "voturi valabile" : "valid votes"} · {number(selectedArea.s)} {ro ? "secții" : "polling stations"} · {ro ? "prezență" : "turnout"} {percent(turnoutOf(selectedArea))} · {ro ? "nule" : "null"} {percent(invalidShareOf(selectedArea))}</p>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {selectedArea.l.slice(0, 6).map((code, index) => <li key={code} className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: colours.get(code) }} /><span className="min-w-0 flex-1 truncate text-ink-soft">{listName(code)}</span><span className="tabular-nums text-ink">{percent(selectedArea.x[index]! / selectedArea.v)}</span></li>)}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">{ro ? "Treceți cu mouse-ul peste hartă sau atingeți un județ ori o comună ca să vedeți cifrele." : "Move over the map, or tap a county or a commune, to see its figures."}</p>
        )}
      </div>

      {level === "communes" && circ !== undefined && circCommunes.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="px-4 pt-4 text-left font-display text-lg font-bold text-ink">{ro ? "Comunele județului" : "The communes of"} {countyName(circ)}</caption>
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th scope="col" className="px-4 py-2 font-semibold">{ro ? "Localitate" : "Place"}</th><th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Voturi valabile" : "Valid votes"}</th><th scope="col" className="px-2 py-2 font-semibold">{ro ? "Primul loc" : "First place"}</th><th scope="col" className="px-2 py-2 text-right font-semibold">{ro ? "Prezență" : "Turnout"}</th></tr>
            </thead>
            <tbody>
              {circCommunes.map((area) => {
                const leader = leaderOf(area);
                return (
                  <tr key={area.k} className="border-t border-line">
                    <th scope="row" className="px-4 py-2 text-left font-semibold text-ink"><button type="button" className="text-left hover:text-brand" onClick={() => setSelected(area.k)}>{officialCase(area.n)}</button></th>
                    <td className="px-2 py-2 text-right tabular-nums">{number(area.v)}</td>
                    <td className="px-2 py-2">{leader ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: colours.get(leader.code) }} />{listName(leader.code)} <span className="tabular-nums text-muted">{percent(leader.share)}</span></span> : "–"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{percent(turnoutOf(area))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
