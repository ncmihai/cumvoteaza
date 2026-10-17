import path from "node:path";
import * as cheerio from "cheerio";
import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { PoliteFetcher, FetchStoppedError } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";

/**
 * D-050 (e): a senator's own biography. The Senate's card (`FisaSenator.aspx?ParlamentarID=...`) shows it behind a tab that is an ASP.NET postback, so it is read the way a browser reads it: the card
 * already saved (`senate-card`) supplies the form's hidden fields and the tab's own link is the event target; one POST per senator, one at a time, `delayMs` apart, each answer saved byte for
 * byte (`senate-bio`) before it is read. The run stops at the first sign of a block (403, 429, a security-check page) or after five failures in a row.
 */
export const BIOGRAPHY_TARGET_PATTERN = /__doPostBack\('([^']*lnkBiog)'/;
export const senateCardUrl = (guid: string) => `https://www.senat.ro/FisaSenator.aspx?ParlamentarID=${guid}`;

export interface BiographyTarget { memberId: string; guid: string; displayName: string }

export async function biographyTargets(): Promise<BiographyTarget[]> {
  const session = createDbSession();
  try {
    const legislature = [...(await session.db.execute<{ id: string }>(sql`select id from legislatures order by starts_on desc limit 1`))][0]!.id;
    const rows = await session.db.execute<{ id: string; guid: string; display_name: string }>(sql`
      select m.id, m.source_ids->>'senatRoGuid' as guid, m.display_name from members m join member_mandates mm on mm.member_id = m.id
      where mm.chamber = 'senate' and mm.legislature_id = ${legislature} and m.source_ids ? 'senatRoGuid' order by m.display_name`);
    return [...rows].map((row) => ({ memberId: row.id, guid: row.guid.toLowerCase(), displayName: row.display_name }));
  } finally {
    await session.close();
  }
}

/** The form a browser would post for the biography tab, from the saved card page; undefined when the card has no such tab. */
export function biographyForm(cardHtml: string): URLSearchParams | undefined {
  const target = BIOGRAPHY_TARGET_PATTERN.exec(cardHtml.replace(/&#39;/g, "'"))?.[1];
  if (!target) return undefined;
  const $ = cheerio.load(cardHtml);
  const form = new URLSearchParams();
  $("#aspnetForm input[type=hidden]").each((_, element) => {
    const name = $(element).attr("name");
    if (name) form.set(name, $(element).attr("value") ?? "");
  });
  if (!form.has("__VIEWSTATE")) return undefined;
  form.set("__EVENTTARGET", target);
  form.set("__EVENTARGUMENT", "");
  return form;
}

export interface FetchBiographiesResult {
  targets: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: Array<{ key: string; error: string }>;
  stoppedBy?: string;
}

/** Without `live` nothing is requested; it only counts what is saved. */
export async function fetchSenateBiographies(options: { repoRoot: string; live: boolean; limit: number; delayMs: number; refresh?: boolean; log?: (line: string) => void }): Promise<FetchBiographiesResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const targets = await biographyTargets();
  const result: FetchBiographiesResult = { targets: targets.length, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const todo: BiographyTarget[] = [];
  for (const target of targets) {
    if (!options.refresh && (await cache.has("senate-bio", target.guid))) result.cached += 1;
    else todo.push(target);
  }
  result.remaining = todo.length;
  if (!options.live) return result;
  const fetcher = new PoliteFetcher({ maxRequests: options.limit, delayMs: options.delayMs, timeoutMs: 45_000, retries: 0 });
  try {
    for (const target of todo.slice(0, options.limit)) {
      try {
        if (!(await cache.has("senate-card", target.guid))) throw new Error("the senator's card is not saved yet (ingest:leadership:senate:cards)");
        const card = decodeOfficialBytes((await cache.read("senate-card", target.guid))!);
        const form = biographyForm(card);
        if (!form) throw new Error("the card has no biography tab");
        const response = await fetcher.post(senateCardUrl(target.guid), form, { "content-type": "application/x-www-form-urlencoded", referer: senateCardUrl(target.guid) });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        await cache.write("senate-bio", target.guid, response.body, { url: senateCardUrl(target.guid), status: 200 });
        result.fetchedNow += 1;
        result.remaining -= 1;
        if (result.fetchedNow % 20 === 0) options.log?.(`${result.fetchedNow} biographies saved`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push({ key: target.displayName, error: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    if (!(error instanceof FetchStoppedError)) throw error;
    result.stoppedBy = error.message;
  }
  return result;
}
