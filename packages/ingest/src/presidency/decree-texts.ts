import path from "node:path";
import * as cheerio from "cheerio";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { classifyDecree } from "./decree-types";
import type { DecreeRecord } from "./decrees";
import { REGISTER_KINDS } from "./decrees";

/**
 * Sprint 14 (D-037): the page of one decree on the legislative portal (`DetaliiDocument/<id>`), whose text is what the list does not carry: who signed it (the signature at its end) and,
 * for the decrees that name a public office-holder, the name. The text is read from the saved page and is not stored in the database. Only the decrees that need it are requested:
 * every one of an office-holding kind, and the first and last decree of each month, so that the signer of a month can be read where the signature is not on the other decrees.
 */
export const textKey = (portalId: string) => `d${portalId}`;
export const decreePageUrl = (portalId: string) => `http://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;

/** The text of a saved decree page: every tag becomes a space (paragraphs would otherwise run together), entities are decoded, white space is collapsed. */
export function decreePageText(html: string): string {
  const stripped = html.replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ");
  return cheerio.load(`<p>${stripped.replace(/</g, "&lt;")}</p>`).text().replace(/[\u00a0\ufeff]/g, " ").replace(/\s+/g, " ").trim();
}

/** The portal ids to fetch, the ones the importer needs a text for. */
export function textTargets(decrees: DecreeRecord[]): string[] {
  const ids = new Set<string>();
  const byMonth = new Map<string, DecreeRecord[]>();
  for (const decree of decrees) {
    if (!decree.portalId) continue;
    if (REGISTER_KINDS.has(classifyDecree(decree.subject).kind)) ids.add(decree.portalId);
    const month = decree.issuedOn.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), decree]);
  }
  for (const list of byMonth.values()) {
    list.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.number - b.number);
    if (list[0]?.portalId) ids.add(list[0].portalId);
    if (list.at(-1)?.portalId) ids.add(list.at(-1)!.portalId!);
  }
  return [...ids];
}

export interface FetchDecreeTextsResult {
  wanted: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: string[];
  stoppedBy?: string;
}

export async function fetchDecreeTexts(options: { repoRoot: string; live: boolean; ids: string[]; limit: number; delayMs: number; log?: (line: string) => void }): Promise<FetchDecreeTextsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchDecreeTextsResult = { wanted: options.ids.length, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const todo: string[] = [];
  for (const id of options.ids) {
    if (await cache.has("legislatie-decree-text", textKey(id))) result.cached += 1;
    else todo.push(id);
  }
  result.remaining = todo.length;
  if (!options.live) return result;
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 60_000, retries: 1 });
  let failedInARow = 0;
  try {
    for (const id of todo.slice(0, options.limit)) {
      if (failedInARow >= 5) throw new FetchStoppedError("Five pages in a row could not be read; stopping to look at why", "failures");
      try {
        const response = await fetcher.get(decreePageUrl(id));
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (!/DECRET/i.test(decodeOfficialBytes(response.body, response.contentType))) throw new Error("the page is not a decree");
        await cache.write("legislatie-decree-text", textKey(id), response.body, { url: decreePageUrl(id), status: 200 });
        result.fetchedNow += 1;
        result.remaining -= 1;
        failedInARow = 0;
        if (result.fetchedNow % 100 === 0) options.log?.(`${result.fetchedNow} decree pages saved, ${result.remaining} to go`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        failedInARow += 1;
        result.failed.push(id);
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
