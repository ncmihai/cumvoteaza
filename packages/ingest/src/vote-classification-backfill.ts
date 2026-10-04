import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import type { ChamberId, VoteClassificationBasis } from "@cumsevoteaza/parliament-model";
import { classifyVote, VOTE_CLASSIFIER_VERSION, type VoteClassification } from "./vote-classification";

export interface VoteClassificationBackfillOptions {
  chamber?: ChamberId;
  year?: number;
  limit?: number;
  persist?: boolean;
}

interface VoteRow extends Record<string, unknown> {
  id: string;
  title: string;
  vote_type: string;
  chamber: ChamberId;
  bill_id: string | null;
  classification_basis: VoteClassificationBasis;
}

export interface VoteClassificationBackfillResult {
  classifierVersion: string;
  dryRun: boolean;
  candidates: number;
  classified: number;
  needsReview: number;
  manualOverridesSkipped: number;
}

export async function backfillVoteClassifications(
  options: VoteClassificationBackfillOptions = {}
): Promise<VoteClassificationBackfillResult> {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<VoteRow>(sql`
      select id, title, vote_type, chamber, bill_id, classification_basis
      from votes
      where true
        ${options.chamber ? sql`and chamber = ${options.chamber}` : sql``}
        ${options.year ? sql`and held_on >= ${`${options.year}-01-01`} and held_on < ${`${options.year + 1}-01-01`}` : sql``}
      order by held_on desc, id
      ${options.limit ? sql`limit ${options.limit}` : sql``}
    `);

    let classified = 0;
    let needsReview = 0;
    let manualOverridesSkipped = 0;
    const classifiedRows: Array<{ row: VoteRow; classification: VoteClassification }> = [];

    for (const row of rows) {
      if (row.classification_basis === "manual_review") {
        manualOverridesSkipped += 1;
        continue;
      }
      const classification = classifyVote({
        title: row.title,
        voteType: row.vote_type,
        billId: row.bill_id,
        chamber: row.chamber
      });
      classified += 1;
      if (classification.motionKind === "unknown") needsReview += 1;
      classifiedRows.push({ row, classification });
    }

    if (options.persist) {
      for (const batch of chunks(classifiedRows, 250)) {
        const values = sql.join(batch.map(({ row, classification }) => sql`(
          ${row.id}, ${classification.motionKind}, ${classification.prominence}, ${classification.yesMeaning},
          ${classification.confidence}, ${classification.basis}, ${classification.version}, ${classification.reason}
        )`), sql`, `);
        await session.db.execute(sql`
          update votes as v
          set motion_kind = c.motion_kind::vote_motion_kind,
              prominence = c.prominence::vote_prominence,
              yes_meaning = c.yes_meaning::vote_yes_meaning,
              classification_confidence = c.confidence::vote_classification_confidence,
              classification_basis = c.basis::vote_classification_basis,
              classification_version = c.version,
              classification_reason = c.reason,
              classified_at = now()
          from (values ${values}) as c(id, motion_kind, prominence, yes_meaning, confidence, basis, version, reason)
          where v.id = c.id
            and v.classification_basis <> 'manual_review'
        `);
      }
    }

    return {
      classifierVersion: VOTE_CLASSIFIER_VERSION,
      dryRun: !options.persist,
      candidates: rows.length,
      classified,
      needsReview,
      manualOverridesSkipped
    };
  } finally {
    await session.close();
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
