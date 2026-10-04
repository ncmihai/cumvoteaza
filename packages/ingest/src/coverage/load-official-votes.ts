import { parseCdepDayVotes } from "./cdep-official-votes";
import { decodeOfficialBytes, type RawCache } from "./raw-cache";
import { officialFromCdep, officialFromSenate, type OfficialVoteRecord } from "./vote-coverage";
import { parseSenateDayVotes } from "./senate-official-votes";

export interface LoadedOfficialVotes {
  records: OfficialVoteRecord[];
  daysFetched: { cdep: Set<string>; senate: Set<string> };
  /** Cached files that no longer parse; the report must not silently skip them. */
  unreadable: Array<{ kind: string; key: string; error: string }>;
}

/** Reads the saved official lists back, offline. Files outside [from, to] are ignored. */
export async function loadOfficialVotes(cache: RawCache, from: string, to: string): Promise<LoadedOfficialVotes> {
  const loaded: LoadedOfficialVotes = { records: [], daysFetched: { cdep: new Set(), senate: new Set() }, unreadable: [] };

  for (const key of await cache.keys("cdep-day")) {
    const date = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
    if (date < from || date > to) continue;
    try {
      const votes = parseCdepDayVotes(decodeOfficialBytes((await cache.read("cdep-day", key))!));
      loaded.daysFetched.cdep.add(date);
      loaded.records.push(...votes.map(officialFromCdep));
    } catch (error) {
      loaded.unreadable.push({ kind: "cdep-day", key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const key of await cache.keys("senate-day")) {
    if (key < from || key > to) continue;
    try {
      const votes = parseSenateDayVotes(decodeOfficialBytes((await cache.read("senate-day", key))!), key);
      loaded.daysFetched.senate.add(key);
      loaded.records.push(...votes.map(officialFromSenate));
    } catch (error) {
      loaded.unreadable.push({ kind: "senate-day", key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return loaded;
}
