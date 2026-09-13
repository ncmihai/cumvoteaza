import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import type { ChamberId, VoteMotionKind, VoteProminence } from "@cumsevoteaza/parliament-model";
import { classifyVote, VOTE_CLASSIFIER_VERSION, type VoteClassification } from "./vote-classification";

export interface VoteClassificationAuditOptions {
  chamber?: ChamberId;
  year?: number;
  limit?: number;
  examplesPerKind?: number;
  reviewLimit?: number;
}

interface VoteRow extends Record<string, unknown> {
  id: string;
  title: string;
  vote_type: string;
  chamber: ChamberId;
  held_on: string;
  bill_id: string | null;
  bill_title: string | null;
  motion_kind: VoteMotionKind;
  prominence: VoteProminence;
  classification_confidence: VoteClassification["confidence"];
  classification_basis: VoteClassification["basis"];
  classification_version: string | null;
}

export interface VoteClassificationExample extends VoteRow {
  classification: VoteClassification;
}

export interface VoteClassificationAuditResult {
  dryRun: true;
  classifierVersion: string;
  filters: VoteClassificationAuditOptions;
  total: number;
  byMotionKind: Record<VoteMotionKind, number>;
  byProminence: Record<VoteProminence, number>;
  needsReview: number;
  storedClassificationMismatches: number;
  manualOverrides: number;
  reviewCandidates: VoteClassificationExample[];
  examples: Partial<Record<VoteMotionKind, VoteClassificationExample[]>>;
}

export async function auditVoteClassifications(
  options: VoteClassificationAuditOptions = {}
): Promise<VoteClassificationAuditResult> {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<VoteRow>(sql`
      select
        v.id,
        v.title,
        v.vote_type,
        v.chamber,
        v.held_on,
        v.bill_id,
        b.title as bill_title
        ,v.motion_kind
        ,v.prominence
        ,v.classification_confidence
        ,v.classification_basis
        ,v.classification_version
      from votes v
      left join bills b on b.id = v.bill_id
      where true
        ${options.chamber ? sql`and v.chamber = ${options.chamber}` : sql``}
        ${options.year ? sql`and v.held_on >= ${`${options.year}-01-01`} and v.held_on < ${`${options.year + 1}-01-01`}` : sql``}
      order by v.held_on desc, v.id
      ${options.limit ? sql`limit ${options.limit}` : sql``}
    `);

    const byMotionKind = emptyMotionKindCounts();
    const byProminence = emptyProminenceCounts();
    const examples: VoteClassificationAuditResult["examples"] = {};
    const examplesPerKind = options.examplesPerKind ?? 5;
    let needsReview = 0;
    let storedClassificationMismatches = 0;
    let manualOverrides = 0;
    const reviewCandidates: VoteClassificationExample[] = [];

    for (const row of rows) {
      const classification = classifyVote({
        title: row.title,
        voteType: row.vote_type,
        billTitle: row.bill_title,
        billId: row.bill_id,
        chamber: row.chamber
      });
      byMotionKind[classification.motionKind] += 1;
      byProminence[classification.prominence] += 1;
      if (row.classification_basis === "manual_review") manualOverrides += 1;
      else if (
        row.motion_kind !== classification.motionKind ||
        row.prominence !== classification.prominence ||
        row.classification_confidence !== classification.confidence ||
        row.classification_basis !== classification.basis ||
        row.classification_version !== classification.version
      ) storedClassificationMismatches += 1;
      if (classification.confidence === "low" || classification.motionKind === "unknown") {
        needsReview += 1;
        if (reviewCandidates.length < (options.reviewLimit ?? 100)) reviewCandidates.push({ ...row, classification });
      }
      const bucket = examples[classification.motionKind] ?? [];
      if (bucket.length < examplesPerKind) bucket.push({ ...row, classification });
      examples[classification.motionKind] = bucket;
    }

    return {
      dryRun: true,
      classifierVersion: VOTE_CLASSIFIER_VERSION,
      filters: options,
      total: rows.length,
      byMotionKind,
      byProminence,
      needsReview,
      storedClassificationMismatches,
      manualOverrides,
      reviewCandidates,
      examples
    };
  } finally {
    await session.close();
  }
}

function emptyMotionKindCounts(): Record<VoteMotionKind, number> {
  return {
    final_adoption: 0,
    final_rejection: 0,
    rejection_report: 0,
    amendment: 0,
    committee_referral: 0,
    reconsideration: 0,
    confidence: 0,
    no_confidence: 0,
    institutional_resolution: 0,
    procedural_timing: 0,
    agenda_or_schedule: 0,
    quorum_or_presence: 0,
    internal_procedure: 0,
    unknown: 0
  };
}

function emptyProminenceCounts(): Record<VoteProminence, number> {
  return { major: 0, standard: 0, routine: 0, unclassified: 0 };
}
