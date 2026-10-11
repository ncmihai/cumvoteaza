import path from "node:path";
import { PoliteFetcher, FetchStoppedError } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";
import { BUCHAREST_SECTORS, type AreaList, type AreaReading, type AreaResult } from "./areas";
import { resolveLocality, type NameIndex } from "./areas-2012";

/**
 * The 2019 presidential rounds by commune (D-043 follow-up). The AEP's own 2019 files are not at hand (no program can read the AEP's portal, data.gov.ro's certificate has expired and holds no 2019
 * presidential dataset), but Code for Romania's "Rezultate Vot" shows the AEP's results by locality and answers a public JSON API (api.rezultatevot.ro, the code is MPL 2.0; no licence is stated
 * for the data, which are the AEP's public results). Every answer is saved byte for byte; the numbers are checked against the Constitutional Court's national totals before anything is used.
 * One request at a time, a second apart, resumable, about 6,800 requests for both rounds.
 */
export const REZULTATEVOT_API = "https://api.rezultatevot.ro/api";

interface County {
  id: number;
  name: string;
}
interface Locality {
  id: number;
  name: string;
  countyId: number;
}
interface Country {
  id: number;
  name: string;
}

export interface FetchRezultatevotResult {
  ballots: number[];
  requested: number;
  cached: number;
  failed: string[];
  stopped?: string;
  /** The requests still to make (known only after the lists of places are read). */
  remaining: number;
}

const rawKey = (parts: Array<string | number>) => parts.join("-");

async function getJson<T>(cache: RawCache, fetcher: PoliteFetcher, key: string, url: string, live: boolean, counters: { cached: number; requested: number }): Promise<T | undefined> {
  const saved = await cache.read("rezultatevot", key);
  if (saved) {
    counters.cached += 1;
    return JSON.parse(saved.toString("utf8")) as T;
  }
  if (!live) return undefined;
  const response = await fetcher.get(url, { accept: "application/json" });
  counters.requested += 1;
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  JSON.parse(response.body.toString("utf8"));
  await cache.write("rezultatevot", key, response.body, { url, status: 200 });
  return JSON.parse(response.body.toString("utf8")) as T;
}

/** Saves the county, locality and country answers of the given ballots (3 is the first round of 2019, 2 the second). Without `live` it only counts what is saved. */
export async function fetchRezultatevot(options: { repoRoot: string; live: boolean; ballots: number[]; /** The ballot whose list of localities is used for every ballot (the first by default; the second round's own list adds every village). */ listBallot?: number; /** "i/n": only the counties whose position in the list is i modulo n, so that several runs can share the work. */ shard?: string; delayMs?: number; maxRequests?: number; log?: (line: string) => void }): Promise<FetchRezultatevotResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const fetcher = new PoliteFetcher({ maxRequests: options.maxRequests ?? 8000, delayMs: options.delayMs ?? 1000, timeoutMs: 60_000, retries: 2, maxConsecutiveFailures: 5, userAgent: "cumvoteaza-research/0.1 (+https://cumvoteaza.vercel.app; one request at a time)" });
  const counters = { cached: 0, requested: 0 };
  const failed: string[] = [];
  let remaining = 0;
  let stopped: string | undefined;
  const first = options.listBallot ?? options.ballots[0]!;
  try {
    const counties = (await getJson<County[]>(cache, fetcher, "counties", `${REZULTATEVOT_API}/counties`, options.live, counters)) ?? [];
    const localities: Locality[] = [];
    const [shardIndex, shardCount] = (options.shard ?? "0/1").split("/").map(Number) as [number, number];
    const mine = (county: County) => counties.indexOf(county) % shardCount === shardIndex;
    for (const county of counties) {
      const list = await getJson<Array<{ id: number; name: string; countyId?: number }>>(cache, fetcher, rawKey(["localities", `b${first}`, `c${county.id}`]), `${REZULTATEVOT_API}/localities?countyId=${county.id}&ballotId=${first}`, options.live, counters);
      for (const item of list ?? []) if (mine(county)) localities.push({ id: item.id, name: item.name, countyId: county.id });
    }
    const countries: Country[] = [];
    for (const ballot of options.ballots) {
      const list = await getJson<Country[]>(cache, fetcher, rawKey(["countries", `b${ballot}`]), `${REZULTATEVOT_API}/countries?ballotId=${ballot}`, options.live, counters);
      if (countries.length === 0) countries.push(...(list ?? []));
    }
    // The totals the pages of the county and the country give: what the sums of the localities are checked against.
    const queue: Array<{ key: string; url: string }> = [];
    for (const ballot of options.ballots) {
      if (shardIndex === 0) {
        queue.push({ key: rawKey([`b${ballot}`, "national"]), url: `${REZULTATEVOT_API}/ballot?BallotId=${ballot}&Division=national` });
        queue.push({ key: rawKey([`b${ballot}`, "diaspora"]), url: `${REZULTATEVOT_API}/ballot?BallotId=${ballot}&Division=diaspora` });
      }
      for (const county of counties.filter(mine)) queue.push({ key: rawKey([`b${ballot}`, `c${county.id}`]), url: `${REZULTATEVOT_API}/ballot?BallotId=${ballot}&Division=county&CountyId=${county.id}` });
      for (const place of localities) queue.push({ key: rawKey([`b${ballot}`, `c${place.countyId}`, `l${place.id}`]), url: `${REZULTATEVOT_API}/ballot?BallotId=${ballot}&Division=locality&CountyId=${place.countyId}&LocalityId=${place.id}` });
      for (const country of shardIndex === 0 ? countries : []) queue.push({ key: rawKey([`b${ballot}`, `country${country.id}`]), url: `${REZULTATEVOT_API}/ballot?BallotId=${ballot}&Division=diaspora_country&CountryId=${country.id}` });
    }
    for (const item of queue) {
      if (await cache.has("rezultatevot", item.key)) {
        counters.cached += 1;
        continue;
      }
      if (!options.live) {
        remaining += 1;
        continue;
      }
      try {
        await getJson(cache, fetcher, item.key, item.url, true, counters);
        if (counters.requested % 250 === 0) options.log?.(`${counters.requested} requests made, ${queue.length} wanted in all`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        failed.push(`${item.key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    stopped = error.message;
  }
  return { ballots: options.ballots, requested: counters.requested, cached: counters.cached, failed, ...(stopped ? { stopped } : {}), remaining };
}

interface BallotAnswer {
  scope?: { type?: string; countyName?: string; localityName?: string; countryName?: string; countyId?: number; localityId?: number; countryId?: number };
  results?: { eligibleVoters?: number; totalVotes?: number; validVotes?: number; nullVotes?: number; candidates?: Array<{ name: string; votes: number }> };
}

const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export { COUNTY_NAMES, circumscriptionOfCounty } from "./circumscriptions";
import { circumscriptionOfCounty } from "./circumscriptions";
import { placeVillagesByOrder, unitOfPlace, type SettlementIndex } from "./siruta";

export interface RezultatevotReading extends AreaReading {
  /** Localities that no commune of the later elections answers to (kept out of the map under "unknown:<county>"). */
  unmatched: Array<{ circumscription: number; name: string; votes: number }>;
  /** Answers that could not be read, and places the lists name that have no saved answer. */
  problems: string[];
  /** The candidates' votes summed over everything read, to check against the national totals. */
  totalsByCandidate: Map<string, number>;
}

/** One ballot's saved answers as commune results, the communes found by name (as the 2012 stations are). */
export async function readRezultatevotAreas(repoRoot: string, ballotId: number, index: NameIndex, listBallotId = ballotId, settlements?: SettlementIndex): Promise<RezultatevotReading> {
  const cache = new RawCache(path.join(repoRoot, "data/coverage/raw"));
  const keys = await cache.keys("rezultatevot");
  const prefix = `b${ballotId}-`;
  const areas = new Map<string, AreaResult>();
  const lists = new Map<string, AreaList>();
  const unmatched = new Map<string, { circumscription: number; name: string; votes: number }>();
  const problems: string[] = [];
  const totalsByCandidate = new Map<string, number>();
  // The second round's list of localities also names the villages of each commune (their answers add up to the commune's, which is in the list too), so only the places of the first round's list are read.
  const allowed = new Set<string>();
  for (const key of keys.filter((name) => name.startsWith(`localities-b${listBallotId}-`))) {
    try {
      for (const place of JSON.parse((await cache.read("rezultatevot", key))!.toString("utf8")) as Array<{ id: number; countyId?: number }>) allowed.add(`c${place.countyId ?? key.split("-c")[1]}-l${place.id}`);
    } catch (error) {
      problems.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // Villages whose name several units of the county share are placed by the order of the list (see `placeVillagesByOrder`).
  const placedByOrder = new Map<string, string>();
  if (settlements) {
    const counties = JSON.parse((await cache.read("rezultatevot", "counties"))?.toString("utf8") ?? "[]") as Array<{ id: number; name: string }>;
    for (const key of keys.filter((name) => name.startsWith(`localities-b${listBallotId}-`))) {
      const countyId = Number(key.split("-c")[1]);
      const circumscription = circumscriptionOfCounty(counties.find((county) => county.id === countyId)?.name ?? "");
      if (!circumscription || circumscription === 42) continue;
      try {
        const list = JSON.parse((await cache.read("rezultatevot", key))!.toString("utf8")) as Array<{ id: number; name: string }>;
        for (const [id, unit] of placeVillagesByOrder(settlements, circumscription, list)) placedByOrder.set(`c${countyId}-l${id}`, unit);
      } catch {
        // The same unreadable list is reported above.
      }
    }
  }
  const add = (key: string, circumscriptionNumber: number, name: string, answer: BallotAnswer) => {
    const results = answer.results;
    if (!results) return;
    let area = areas.get(key);
    if (!area) {
      area = { key, circumscriptionNumber, name, sections: 0, registered: 0, present: 0, valid: 0, invalid: 0, votes: new Map() };
      areas.set(key, area);
    }
    area.registered += results.eligibleVoters ?? 0;
    area.present += results.totalVotes ?? 0;
    area.valid += results.validVotes ?? 0;
    area.invalid += results.nullVotes ?? 0;
    for (const candidate of results.candidates ?? []) {
      if (!candidate.votes) continue;
      const listKey = plain(candidate.name);
      if (!lists.has(listKey)) lists.set(listKey, { name: candidate.name, independents: false });
      area.votes.set(listKey, (area.votes.get(listKey) ?? 0) + candidate.votes);
      totalsByCandidate.set(listKey, (totalsByCandidate.get(listKey) ?? 0) + candidate.votes);
    }
  };
  for (const key of keys.filter((name) => name.startsWith(prefix))) {
    const rest = key.slice(prefix.length);
    let answer: BallotAnswer;
    try {
      const bytes = await cache.read("rezultatevot", key);
      answer = JSON.parse(bytes!.toString("utf8")) as BallotAnswer;
    } catch (error) {
      problems.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (/^country\d+$/.test(rest)) {
      const name = answer.scope?.countryName ?? rest;
      add(`abroad:${plain(name).replace(/ /g, "-")}`, 43, name, answer);
    } else if (/^c\d+-l\d+$/.test(rest)) {
      if (allowed.size > 0 && !allowed.has(rest)) continue;
      const countyName = answer.scope?.countyName ?? "";
      const circumscription = circumscriptionOfCounty(countyName);
      const place = answer.scope?.localityName ?? "";
      if (!circumscription) {
        problems.push(`${key}: county "${countyName}" is none of the 43 circumscriptions`);
        continue;
      }
      if (!answer.results || (answer.results.validVotes ?? 0) + (answer.results.nullVotes ?? 0) === 0) continue;
      if (circumscription === 42) {
        const sector = /sector\w*\s*(\d)/.exec(plain(place))?.[1];
        const siruta = sector ? BUCHAREST_SECTORS[sector] : undefined;
        if (!siruta) {
          problems.push(`${key}: "${place}" is not a sector of Bucharest`);
          continue;
        }
        add(siruta, 42, `BUCUREŞTI SECTORUL ${sector}`, answer);
        continue;
      }
      // The second round is by locality: a commune's villages are added up under the commune the SIRUTA register says they belong to. Without the register the names are those of units (the first round's).
      const unit = settlements ? unitOfPlace(settlements, circumscription, place, answer.scope?.localityId) ?? placedByOrder.get(rest) : undefined;
      const found = settlements ? (unit ? { siruta: unit } : undefined) : resolveLocality(index, circumscription, place);
      if (found) add(found.siruta, circumscription, settlements?.unitNames.get(found.siruta) ?? place, answer);
      else {
        add(`unknown:${circumscription}`, circumscription, "?", answer);
        const entry = unmatched.get(`${circumscription}|${place}`) ?? { circumscription, name: place, votes: 0 };
        entry.votes += answer.results.validVotes ?? 0;
        unmatched.set(`${circumscription}|${place}`, entry);
      }
    }
  }
  return {
    areas: [...areas.values()],
    lists,
    aliases: [],
    withoutCommune: [...areas.values()].filter((area) => area.key.startsWith("unknown:")).length,
    unmatched: [...unmatched.values()].sort((a, b) => b.votes - a.votes),
    problems,
    totalsByCandidate
  };
}
