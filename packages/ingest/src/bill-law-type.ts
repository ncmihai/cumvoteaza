import { sql } from "drizzle-orm";
import type { DbSession } from "@cumsevoteaza/db";
import { chamberSeatCountOnDate, voteOutcome, type ChamberId, type LawType } from "@cumsevoteaza/parliament-model";
import { fetchOfficialSource } from "./fetch-source";
import { parseDeputiesBill } from "./parsers/deputies-bill";
import { parseSenateBill } from "./parsers/senate-bill";

type Candidate = {
  billId: string;
  sourceUrl?: string;
  /** "deputies-vote": no bill page is stored; the CDEP vote page links to it. */
  parser?: "senate-bill" | "deputies-bill" | "deputies-vote";
  votes: number;
};

export type BillLawTypeResult = {
  billId: string;
  sourceUrl?: string;
  lawType?: LawType;
  error?: string;
};

/**
 * Bills without a stored law type whose votes cannot be decided without it (A1b).
 * Reads the official bill page: the Senate page when the bill has a Senate number, otherwise the stored CDEP page.
 */
export async function findBillsNeedingLawType(db: DbSession["db"]): Promise<{ candidates: Candidate[]; withoutSource: string[] }> {
  const rows = await db.execute<{
    bill_id: string;
    chamber: ChamberId;
    held_on: string;
    title: string;
    bill_title: string;
    motion_kind: string;
    yes_meaning: string;
    for_count: number;
    present: number;
    senate_id: string | null;
    deputies_url: string | null;
    vote_url: string | null;
  }>(sql`
    select v.bill_id, v.chamber, v.held_on::text as held_on, v.title, b.title as bill_title, v.motion_kind, v.yes_meaning,
      v.for_count, v.present, b.identifiers->>'senate' as senate_id,
      (select ss.source_url from jsonb_array_elements_text(b.source_snapshot_ids) sid
         join source_snapshots ss on ss.id = sid where ss.parser = 'deputies-bill' order by ss.fetched_at desc limit 1) as deputies_url,
      case when v.chamber = 'deputies' then vs.source_url end as vote_url
    from votes v join bills b on b.id = v.bill_id join source_snapshots vs on vs.id = v.source_snapshot_id
    where b.law_type is null
  `);
  const byBill = new Map<string, Candidate>();
  const withoutSource = new Set<string>();
  for (const row of rows) {
    const outcome = voteOutcome({
      motionKind: row.motion_kind, yesMeaning: row.yes_meaning, title: row.title, billTitle: row.bill_title,
      forCount: row.for_count, present: row.present, members: chamberSeatCountOnDate(row.chamber, row.held_on)
    });
    if (outcome.rule !== "depends_on_law_type") continue;
    const existing = byBill.get(row.bill_id);
    if (existing) {
      existing.votes += 1;
      continue;
    }
    const senateUrl = senateBillUrl(row.senate_id);
    const candidate: Candidate = senateUrl
      ? { billId: row.bill_id, sourceUrl: senateUrl, parser: "senate-bill", votes: 1 }
      : row.deputies_url
        ? { billId: row.bill_id, sourceUrl: row.deputies_url, parser: "deputies-bill", votes: 1 }
        : row.vote_url
          ? { billId: row.bill_id, sourceUrl: row.vote_url, parser: "deputies-vote", votes: 1 }
          : { billId: row.bill_id, votes: 1 };
    if (!candidate.sourceUrl) withoutSource.add(row.bill_id);
    byBill.set(row.bill_id, candidate);
  }
  return { candidates: [...byBill.values()].filter((item) => item.sourceUrl), withoutSource: [...withoutSource] };
}

export function senateBillUrl(identifier?: string | null): string | undefined {
  const match = identifier?.match(/^(L|B)(\d+)\/(\d{4})$/);
  return match ? `https://www.senat.ro/legis/lista.aspx?an_cls=${match[3]}&nr_cls=${match[1]}${match[2]}` : undefined;
}

/** Fetches each page sequentially with a pause; only reads the law type, never rewrites the bill's other fields. */
export async function readBillLawTypes(
  candidates: Candidate[],
  options: { delayMs: number; fetchPage?: (url: string) => Promise<string> }
): Promise<BillLawTypeResult[]> {
  const fetchPage = options.fetchPage ?? fetchOfficialSource;
  const results: BillLawTypeResult[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (index > 0 && options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    try {
      let sourceUrl = candidate.sourceUrl!;
      let html = await fetchPage(sourceUrl);
      if (candidate.parser === "deputies-vote") {
        const billUrl = cdepBillLinkFromVotePage(html, sourceUrl);
        if (!billUrl) throw new Error("vote page has no bill link");
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        sourceUrl = billUrl;
        html = await fetchPage(sourceUrl);
      }
      const bill = candidate.parser === "senate-bill" ? parseSenateBill(html, sourceUrl).bill : parseDeputiesBill(html, sourceUrl).bill;
      results.push({ billId: candidate.billId, sourceUrl, lawType: bill.lawType });
    } catch (error) {
      results.push({ billId: candidate.billId, sourceUrl: candidate.sourceUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

/** CDEP nominal-vote pages link to the bill's page ("upl_pck2015.proiect?idp=22232"). */
export function cdepBillLinkFromVotePage(html: string, pageUrl: string): string | undefined {
  const href = html.match(/href="([^"]*upl_pck2015\.proiect\?[^"]*idp=\d+[^"]*)"/i)?.[1];
  return href ? new URL(href.replace(/&amp;/g, "&"), pageUrl).toString() : undefined;
}

export async function persistBillLawTypes(db: DbSession["db"], results: BillLawTypeResult[]): Promise<number> {
  let written = 0;
  for (const result of results) {
    if (!result.lawType) continue;
    await db.execute(sql`update bills set law_type = ${result.lawType} where id = ${result.billId} and law_type is null`);
    written += 1;
  }
  return written;
}
