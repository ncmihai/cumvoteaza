import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import { dataHealthIssueKey } from "@cumsevoteaza/parliament-model";
import { importStoredAssetsFromInventory, type AssetType } from "./asset-import";
import { importBillText, importBillTextBatch } from "./bill-text";
import { auditBillTextQuality } from "./bill-text-quality-audit";
import { runIdentityJob } from "./identity/identity-job";
import { runIntegrityChecks } from "./integrity/checks";
import { applyMemberMergePlan, planMemberMerges } from "./identity/member-merge";
import { importCdepHistoryProfiles } from "./cdep-history-import";
import { auditCurrentLegislature } from "./current-legislature-audit";
import { auditGovernmentHistory, governmentHistoryAuditMarkdown } from "./government-history-audit";
import { auditDossierReconciliation } from "./dossier-reconciliation-audit";
import { auditVoteClassifications } from "./vote-classification-audit";
import { backfillVoteClassifications } from "./vote-classification-backfill";
import { parseChamberNominalVote } from "./parsers/chamber-vote";
import { classifyDeputiesDocumentKind, parseDeputiesBill } from "./parsers/deputies-bill";
import { parseDeputiesMemberProfile, parseDeputiesRosterGroup, parseDeputiesRosterIndex } from "./parsers/deputies-roster";
import { legislatureFromFlag, partyCatalog, uniqueBy, type ParsedMemberProfile, type ParsedRoster } from "./parsers/roster";
import { parseSenateBill } from "./parsers/senate-bill";
import { parseSenateMemberProfile, parseSenateRosterGroup, parseSenateRosterIndex } from "./parsers/senate-roster";
import { parseSenateVote } from "./parsers/senate-vote";
import { fetchOfficialSource } from "./fetch-source";
import { governmentSkeletonData } from "./government-skeleton";
import { auditCabinetManifests } from "./government-cabinet-manifests";
import { ministryCatalog } from "./ministry-catalog";
import { classifyBillMinistryRelations } from "./ministry-relations";
import { canonicalizeOfficialUrl } from "./official-urls";
import {
  persistChamberVote,
  persistDeputiesBill,
  persistGovernmentSkeleton,
  persistRoster,
  SENATE_ROSTER_POLICY,
  DEPUTIES_ROSTER_POLICY,
  persistSenateBill,
  persistSenateVote
} from "./persist";
import { snapshotFor } from "./parsers/utils";
import { refreshReadModels } from "./read-models";
import { writePoliticalEntityCandidates } from "./political-entity-candidates";
import { seedPoliticalFormationEvents } from "./political-formation-events";
import {
  discoverDeputiesSources,
  discoverDeputiesVoteSources,
  discoverSenateVoteSources,
  discoverSenateSources,
  importPendingDiscoveries,
  runDailySync
} from "./sync";

type RosterGroupRef = {
  group?: ParsedRoster["groups"][number];
  url: string;
  expectedCount?: number;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

loadLocalEnv();

async function main() {
  const command = process.argv[2];

  if (command === "senate:bill") {
    const cod = flag("cod") ?? "27035";
    const url = flag("url") ?? `https://www.senat.ro/Legis/Lista.aspx?cod=${cod}`;
    const html = await loadHtml(url);
    const parsed = parseSenateBill(html, url);
    await writeImport("senate-bill", parsed, html);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistSenateBill(parsed), null, 2));
    }
    return;
  }

  if (command === "bill:deputies") {
    const url = canonicalizeOfficialUrl(flag("url") ?? "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=22820");
    const html = await loadHtml(url);
    const parsed = parseDeputiesBill(html, url);
    await writeImport("deputies-bill", parsed, html);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistDeputiesBill(parsed), null, 2));
    }
    return;
  }

  if (command === "bill:senate") {
    const cod = flag("cod") ?? "27035";
    const url = flag("url") ?? `https://www.senat.ro/Legis/Lista.aspx?cod=${cod}`;
    const html = await loadHtml(url);
    const parsed = parseSenateBill(html, url);
    await writeImport("senate-bill", parsed, html);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistSenateBill(parsed), null, 2));
    }
    return;
  }

  if (command === "bill-documents:classify") {
    const result = await reclassifyBillDocuments({
      year: numberFlag("year"),
      limit: numberFlag("limit"),
      persist: hasFlag("persist")
    });
    await writeImport("bill-documents-classify", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to update document_kind on existing document rows.");
    }
    return;
  }

  if (command === "bill-dossiers:refresh") {
    const result = await refreshDeputiesBillDossiers({
      year: numberFlag("year"),
      limit: numberFlag("limit") ?? 10,
      persist: hasFlag("persist"),
      allowIdMismatch: hasFlag("allow-id-mismatch")
    });
    await writeImport("bill-dossiers-refresh", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to update bill dossier rows.");
    }
    return;
  }

  if (command === "bill-text") {
    const result = await importBillText({
      billId: flag("bill"),
      documentId: flag("document"),
      documentKind: flag("document-kind"),
      timeoutMs: numberFlag("timeout-ms"),
      insecure: hasFlag("insecure"),
      persist: hasFlag("persist")
    });
    await writeImport("bill-text", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to fetch the official PDF temporarily and store derived text.");
    }
    return;
  }

  if (command === "bill-text:batch") {
    const result = await importBillTextBatch({
      year: numberFlag("year"),
      limit: numberFlag("limit"),
      documentKind: flag("document-kind"),
      includeFailed: hasFlag("include-failed"),
      includeUnsupported: hasFlag("include-unsupported"),
      timeoutMs: numberFlag("timeout-ms"),
      insecure: hasFlag("insecure"),
      persist: hasFlag("persist")
    });
    await writeImport("bill-text-batch", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(hasFlag("summary-only") ? compactBillTextBatchResult(result) : result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to fetch official PDFs temporarily and store derived text.");
    }
    return;
  }

  if (command === "audit:bill-text-quality") {
    const result = await auditBillTextQuality({
      year: numberFlag("year"),
      documentKind: flag("document-kind"),
      limit: numberFlag("limit"),
      suspiciousOnly: hasFlag("suspicious-only"),
      minChars: numberFlag("min-chars")
    });
    await writeImport("bill-text-quality-audit", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "audit:vote-classification") {
    const result = await auditVoteClassifications({
      chamber: chamberFlag(),
      year: numberFlag("year"),
      limit: numberFlag("limit"),
      examplesPerKind: numberFlag("examples"),
      reviewLimit: numberFlag("review-limit")
    });
    console.log(JSON.stringify(hasFlag("review-only") ? {
      classifierVersion: result.classifierVersion,
      filters: result.filters,
      total: result.total,
      needsReview: result.needsReview,
      reviewCandidates: result.reviewCandidates
    } : result, null, 2));
    console.log("Dry run only. This command never updates vote rows.");
    return;
  }

  if (command === "votes:classify") {
    const result = await backfillVoteClassifications({
      chamber: chamberFlag(),
      year: numberFlag("year"),
      limit: numberFlag("limit"),
      persist: hasFlag("persist")
    });
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) console.log("Dry run only. Re-run with --persist after reviewing the audit report.");
    return;
  }

  if (command === "senate:vote") {
    const url =
      flag("url") ??
      "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=EF4EE11F-7327-4C71-9B76-2CB5C930E88C&Cod=27035&Data=2025-10-27";
    const html = await loadHtml(url);
    const parsed = parseSenateVote(html, url);
    await writeImport("senate-vote", parsed, html);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistSenateVote(parsed), null, 2));
    }
    return;
  }

  if (command === "chamber:vote") {
    const url = canonicalizeOfficialUrl(flag("url") ?? "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=35953");
    try {
      const html = await loadHtml(url);
      const parsed = parseChamberNominalVote(html, url);
      await writeImport("chamber-vote", parsed, html);
      if (hasFlag("persist")) {
        console.log(JSON.stringify(await persistChamberVote(parsed), null, 2));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const snapshot = snapshotFor("chamber-nominal-vote", url, message, "failed", message);
      await writeImport("chamber-vote-failed", { sourceSnapshot: snapshot, error: message }, message);
    }
    return;
  }

  if (command === "senate:roster") {
    const parsed = await importSenateRoster();
    await writeImport("senate-roster", parsed, JSON.stringify(parsed, null, 2));
    logRosterSummary(parsed);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistRoster(parsed, SENATE_ROSTER_POLICY), null, 2));
    }
    return;
  }

  if (command === "deputies:roster") {
    const parsed = await importDeputiesRoster();
    await writeImport("deputies-roster", parsed, JSON.stringify(parsed, null, 2));
    logRosterSummary(parsed);
    if (hasFlag("persist")) {
      console.log(JSON.stringify(await persistRoster(parsed, DEPUTIES_ROSTER_POLICY), null, 2));
    }
    return;
  }

  if (command === "cdep-history:import") {
    const result = await importCdepHistoryProfiles({
      profilesPath: flag("profiles") ?? path.join(repoRoot, "data/cdep-history/parsed/profiles.jsonl"),
      legislature: flag("legislature") ?? "2004",
      chamber: chamberFlag() ?? "both",
      persist: hasFlag("persist")
    });
    await writeCdepHistoryWarningFiles(result);
    await writeImport("cdep-history-import", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(compactCdepHistoryImportResult(result), null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to write these official CDEP roster rows.");
    }
    return;
  }

  if (command === "assets:import") {
    const result = await importStoredAssetsFromInventory({
      assetsPath: resolveRepoPath(flag("assets") ?? "data/cdep-history/parsed/assets.jsonl"),
      assetType: assetTypeFlag(),
      legislature: flag("legislature"),
      limit: numberFlag("limit"),
      maxUniqueOfficialUrls: numberFlag("max-unique-official-urls"),
      uniqueOfficialUrlOffset: numberFlag("unique-official-url-offset"),
      delayMs: numberFlag("delay-ms"),
      timeoutMs: numberFlag("timeout-ms"),
      insecure: hasFlag("insecure"),
      optimizePhotos: !hasFlag("no-optimize-photos"),
      photoWidth: numberFlag("photo-width"),
      photoHeight: numberFlag("photo-height"),
      force: hasFlag("force"),
      persist: hasFlag("persist")
    });
    await writeImport("assets-import", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to upload to the configured asset store and write stored_assets metadata.");
    }
    return;
  }

  if (command === "roster:all") {
    const senate = await importSenateRoster();
    const deputies = await importDeputiesRoster();
    const parsed = { senate, deputies };
    await writeImport("roster-all", parsed, JSON.stringify(parsed, null, 2));
    if (hasFlag("persist")) {
      console.log(
        JSON.stringify(
          {
            senate: await persistRoster(senate, SENATE_ROSTER_POLICY),
            deputies: await persistRoster(deputies, DEPUTIES_ROSTER_POLICY)
          },
          null,
          2
        )
      );
    }
    return;
  }

  if (command === "site:revalidate") {
    // Purges the public site's cached data (profiles, directories) after a data repair or import.
    const secret = process.env.CRON_SECRET ?? readRootEnvValue("CRON_SECRET");
    if (!secret) throw new Error("CRON_SECRET is not set in the environment or .env");
    const site = flag("site") ?? "https://cumvoteaza.vercel.app";
    const response = await fetch(`${site}/api/cron/daily-import?revalidateOnly=1`, { headers: { authorization: `Bearer ${secret}` } });
    console.log(response.status, await response.text());
    if (!response.ok) process.exitCode = 1;
    return;
  }

  if (command === "urls:snapshot" || command === "urls:check") {
    // Profile URL continuity: every member slug that existed before a repair must still resolve afterwards,
    // either directly or through a retired-slug alias (the site redirects those).
    const file = flag("file");
    if (!file) throw new Error("--file=<path> is required");
    const session = createDbSession();
    try {
      if (command === "urls:snapshot") {
        // Public profiles: members with a mandate or recorded votes (others were never linked from the site).
        const rows = await session.db.execute<{ slug: string }>(sql`
          select slug from members m
          where exists (select 1 from member_mandates x where x.member_id = m.id) or exists (select 1 from individual_votes x where x.member_id = m.id)
          order by slug`);
        await writeFile(file, rows.map((row) => row.slug).join("\n") + "\n");
        console.log(JSON.stringify({ snapshot: file, slugs: rows.length }));
      } else {
        const before = (await readFile(file, "utf8")).split("\n").filter(Boolean);
        const rows = await session.db.execute<{ slug: string }>(sql`
          select slug from members union select substring(alias_id from 6) from id_aliases where kind = 'member-slug'`);
        const resolvable = new Set(rows.map((row) => row.slug));
        const broken = before.filter((slug) => !resolvable.has(slug));
        console.log(JSON.stringify({ before: before.length, broken: broken.length, sample: broken.slice(0, 20) }, null, 2));
      }
    } finally {
      await session.close();
    }
    return;
  }

  if (command === "integrity:check") {
    const results = await runIntegrityChecks();
    for (const result of results) {
      const mark = result.count === 0 ? "PASS" : result.severity === "error" ? "FAIL" : "WARN";
      console.log(`${mark.padEnd(4)} ${result.name.padEnd(36)} ${String(result.count >= 1000 ? "1000+" : result.count).padStart(6)}  ${result.description}`);
    }
    await writeImport("integrity-check", results, JSON.stringify(results, null, 2));
    if (results.some((result) => result.severity === "error" && result.count > 0)) process.exitCode = 1;
    return;
  }

  if (command === "identity:merge-members") {
    const session = createDbSession();
    try {
      const plan = await planMemberMerges(session.db);
      if (hasFlag("persist")) await session.db.transaction((tx) => applyMemberMergePlan(tx as unknown as typeof session.db, plan));
      await writeImport("identity-merge-members", plan, JSON.stringify(plan, null, 2));
      console.log(JSON.stringify({
        persisted: hasFlag("persist"),
        reattributedVotes: plan.reattributions.reduce((total, row) => total + row.votes, 0),
        merges: plan.merges.length,
        deletions: plan.deletions.length,
        unresolved: plan.unresolved
      }, null, 2));
      if (!hasFlag("persist")) console.log("Dry run only. Run identity:resolve --persist first, then re-run with --persist.");
    } finally {
      await session.close();
    }
    return;
  }

  if (command === "identity:resolve") {
    const plan = await runIdentityJob({ persist: hasFlag("persist"), decisionsPath: flag("decisions") });
    const report = {
      persisted: hasFlag("persist"),
      membersConsidered: plan.membersConsidered,
      peopleBefore: plan.peopleBefore,
      peopleAfter: new Set(plan.personByMember.values()).size,
      changes: plan.changes,
      newPeople: plan.newPeople,
      aliases: plan.aliases,
      orphanPeople: plan.orphanPeople.length,
      review: plan.review
    };
    await writeImport("identity-resolve", report, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, changes: report.changes.length, review: report.review.length }, null, 2));
    if (!hasFlag("persist")) console.log("Dry run only. Re-run with --persist to apply person assignments.");
    return;
  }

  if (command === "governments:skeleton") {
    console.log(JSON.stringify(await persistGovernmentSkeleton(governmentSkeletonData()), null, 2));
    return;
  }

  if (command === "audit:government-cabinets") {
    const audits = auditCabinetManifests(new Set(ministryCatalog.map((ministry) => ministry.name)));
    console.log(JSON.stringify(audits, null, 2));
    if (audits.some((audit) => audit.errors.length > 0)) process.exitCode = 1;
    return;
  }

  if (command === "ministries:classify-bills") {
    console.log(JSON.stringify(await classifyBillMinistryRelations(), null, 2));
    return;
  }

  if (command === "political-formations:seed") {
    console.log(JSON.stringify(await seedPoliticalFormationEvents({ eventsPath: flag("events") }), null, 2));
    return;
  }

  if (command === "political-entities:candidates") {
    console.log(JSON.stringify(await writePoliticalEntityCandidates({
      jsonPath: flag("json"),
      markdownPath: flag("markdown")
    }), null, 2));
    return;
  }

  if (command === "discover:senate") {
    logSyncResult(await discoverSenateSources(syncOptions()));
    return;
  }

  if (command === "discover:deputies") {
    logSyncResult(await discoverDeputiesSources(syncOptions()));
    return;
  }

  if (command === "discover:deputies-votes") {
    logSyncResult(await discoverDeputiesVoteSources(syncOptions()));
    return;
  }
  if (command === "discover:senate-votes") {
    logSyncResult(await discoverSenateVoteSources(syncOptions()));
    return;
  }

  if (command === "sync:daily") {
    logSyncResult(await runDailySync(syncOptions()));
    return;
  }

  if (command === "import:pending") {
    logSyncResult(await importPendingDiscoveries(syncOptions()));
    return;
  }

  if (command === "audit:current-legislature") {
    const result = await auditCurrentLegislature({
      legislatureId: flag("legislature-id") ?? (flag("legislature") ? `leg-${flag("legislature")}` : undefined),
      chamber: chamberFlag(),
      sampleLimit: numberFlag("sample-limit")
    });
    await writeImport("audit-current-legislature", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "audit:government-history") {
    const result = await auditGovernmentHistory();
    const markdown = governmentHistoryAuditMarkdown(result);
    await writeGovernmentHistoryAudit(result, markdown);
    console.log(JSON.stringify(result.summary, null, 2));
    console.log("Read-only audit. This command never modifies government data.");
    if (!result.summary.verified) process.exitCode = 1;
    return;
  }

  if (command === "audit:dossier-reconciliation") {
    const result = await auditDossierReconciliation({
      legislatureId: flag("legislature-id") ?? (flag("legislature") ? `leg-${flag("legislature")}` : undefined),
      chamber: chamberFlag(),
      sampleLimit: numberFlag("sample-limit")
    });
    await writeImport("audit-dossier-reconciliation", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "repair:link-vote-bill") {
    const result = await repairLinkVoteBill({
      voteId: requiredFlag("vote-id"),
      billId: requiredFlag("bill-id"),
      persist: hasFlag("persist"),
      allowWeakMatch: hasFlag("allow-weak-match"),
      allowRelink: hasFlag("allow-relink"),
      reviewer: flag("reviewer"),
      note: flag("note")
    });
    await writeImport("repair-link-vote-bill", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to update vote.bill_id and mark the data-health issue fixed.");
    }
    return;
  }

  if (command === "repair:refresh-missing-procedure") {
    const result = await refreshDeputiesBillDossiers({
      billId: requiredFlag("bill-id"),
      year: numberFlag("year"),
      limit: 1,
      persist: hasFlag("persist"),
      allowIdMismatch: hasFlag("allow-id-mismatch")
    });
    await writeImport("repair-refresh-missing-procedure", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!hasFlag("persist")) {
      console.log("Dry run only. Re-run with --persist to refetch and persist the bill dossier.");
    }
    return;
  }

  if (command === "repair:duplicate-bill-plan") {
    const result = await repairDuplicateBillPlan({
      primaryBillId: requiredFlag("primary-bill-id"),
      duplicateBillId: requiredFlag("duplicate-bill-id")
    });
    await writeImport("repair-duplicate-bill-plan", result, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "refresh-read-models") {
    console.log(JSON.stringify(await refreshReadModels(), null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(missing)"}`);
}

interface RefreshDeputiesDossiersOptions {
  billId?: string;
  year?: number;
  limit: number;
  persist: boolean;
  allowIdMismatch: boolean;
}

interface RepairLinkVoteBillOptions {
  voteId: string;
  billId: string;
  persist: boolean;
  allowWeakMatch: boolean;
  allowRelink: boolean;
  reviewer?: string;
  note?: string;
}

interface RepairDuplicateBillPlanOptions {
  primaryBillId: string;
  duplicateBillId: string;
}

interface RepairVoteRow extends Record<string, unknown> {
  id: string;
  title: string;
  held_on: string;
  bill_id: string | null;
  source_url: string | null;
}

interface RepairBillRow extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  identifiers: Record<string, string>;
}

interface RefreshDeputiesDossierCandidate extends Record<string, unknown> {
  id: string;
  title: string;
  source_url: string;
  event_on: string | null;
  procedure_steps: number;
  documents: number;
}

async function refreshDeputiesBillDossiers(options: RefreshDeputiesDossiersOptions) {
  const candidates = await loadDeputiesDossierRefreshCandidates(options);
  const refreshed = [];
  const skipped = [];
  const failed = [];

  for (const candidate of candidates) {
    const sourceUrl = canonicalizeOfficialUrl(candidate.source_url);
    try {
      const html = await fetchOfficialSource(sourceUrl, 3);
      const parsed = parseDeputiesBill(html, sourceUrl);
      const idMismatch = parsed.bill.id !== candidate.id;
      if (idMismatch && !options.allowIdMismatch) {
        skipped.push({
          billId: candidate.id,
          parsedBillId: parsed.bill.id,
          sourceUrl,
          reason: "parsed bill id differs from existing row; rerun with --allow-id-mismatch only after manual review"
        });
        continue;
      }

      const persisted = options.persist ? await persistDeputiesBill(parsed) : undefined;
      refreshed.push({
        billId: candidate.id,
        parsedBillId: parsed.bill.id,
        sourceUrl,
        procedureStepsBefore: candidate.procedure_steps,
        documentsBefore: candidate.documents,
        procedureSteps: parsed.procedureSteps.length,
        documents: parsed.documents.length,
        persisted
      });
      await sleep(500);
    } catch (error) {
      failed.push({
        billId: candidate.id,
        sourceUrl,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (options.persist && refreshed.length > 0) {
    await refreshReadModels();
  }

  return {
    filters: {
      billId: options.billId,
      year: options.year,
      limit: options.limit,
      persist: options.persist,
      allowIdMismatch: options.allowIdMismatch
    },
    candidates: candidates.length,
    refreshed: refreshed.length,
    skipped: skipped.length,
    failed: failed.length,
    rows: refreshed,
    skippedRows: skipped,
    failedRows: failed
  };
}

async function loadDeputiesDossierRefreshCandidates(options: RefreshDeputiesDossiersOptions): Promise<RefreshDeputiesDossierCandidate[]> {
  const session = createDbSession();
  try {
    return await session.db.execute<RefreshDeputiesDossierCandidate>(sql`
      select
        b.id,
        b.title,
        min(ss.source_url) filter (where ss.source_url ilike '%cdep.ro%upl_pck2015.proiect%') as source_url,
        coalesce(bvs.latest_event_on, bvs.submitted_on) as event_on,
        count(distinct bps.id)::int as procedure_steps,
        count(distinct d.id)::int as documents
      from bills b
      left join bill_vote_summaries bvs on bvs.bill_id = b.id
      left join lateral jsonb_array_elements_text(b.source_snapshot_ids) as sid(id) on true
      left join source_snapshots ss on ss.id = sid.id
      left join bill_procedure_steps bps on bps.bill_id = b.id
      left join documents d on d.bill_id = b.id
      where b.identifiers ? 'deputies'
        ${options.billId ? sql`and b.id = ${options.billId}` : sql``}
        ${options.year ? sql`and coalesce(bvs.latest_event_on, bvs.submitted_on) >= ${`${options.year}-01-01`}::date and coalesce(bvs.latest_event_on, bvs.submitted_on) < ${`${options.year + 1}-01-01`}::date` : sql``}
      group by b.id, b.title, bvs.latest_event_on, bvs.submitted_on
      having count(distinct bps.id) = 0
        and min(ss.source_url) filter (where ss.source_url ilike '%cdep.ro%upl_pck2015.proiect%') is not null
      order by coalesce(bvs.latest_event_on, bvs.submitted_on) desc nulls last, b.id
      limit ${options.limit}
    `);
  } finally {
    await session.close();
  }
}

async function repairLinkVoteBill(options: RepairLinkVoteBillOptions) {
  const session = createDbSession();
  try {
    const [voteRows, billRows] = await Promise.all([
      session.db.execute<RepairVoteRow>(sql`
        select v.id, v.title, v.held_on, v.bill_id, ss.source_url
        from votes v
        left join source_snapshots ss on ss.id = v.source_snapshot_id
        where v.id = ${options.voteId}
        limit 1
      `),
      session.db.execute<RepairBillRow>(sql`
        select id, slug, title, identifiers
        from bills
        where id = ${options.billId}
        limit 1
      `)
    ]);
    const vote = voteRows[0];
    const bill = billRows[0];
    if (!vote) return { status: "missing_vote", options };
    if (!bill) return { status: "missing_bill", options, vote };
    if (vote.bill_id && vote.bill_id !== bill.id && !options.allowRelink) {
      return {
        status: "blocked_existing_link",
        reason: "Vote already links to a different bill. Re-run with --allow-relink only after manual review.",
        vote,
        bill
      };
    }

    const evidence = voteBillEvidence(vote, bill);
    if (!evidence.hasStrongMatch && !options.allowWeakMatch) {
      return {
        status: "blocked_weak_match",
        reason: "No official identifier from the vote title/source matched the candidate bill identifiers. Re-run with --allow-weak-match only after manual review.",
        vote,
        bill,
        evidence
      };
    }

    const issueKey = dataHealthIssueKey({ type: "vote-unlinked", entityId: vote.id });
    const now = new Date();
    if (options.persist) {
      await session.db.transaction(async (tx) => {
        await tx.update(schema.votes).set({ billId: bill.id }).where(eq(schema.votes.id, vote.id));
        await tx
          .insert(schema.dataHealthReviews)
          .values({
            id: `data-health-review-${issueKey.replace(/[^a-zA-Z0-9._-]+/g, "-")}`,
            issueKey,
            issueType: "vote-unlinked",
            entityType: "vote",
            entityId: vote.id,
            status: "fixed",
            note: options.note ?? `Linked to ${bill.id} via repair:link-vote-bill.`,
            reviewer: options.reviewer ?? "cli",
            reviewedAt: now,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: schema.dataHealthReviews.issueKey,
            set: {
              issueType: "vote-unlinked",
              entityType: "vote",
              entityId: vote.id,
              status: "fixed",
              note: options.note ?? `Linked to ${bill.id} via repair:link-vote-bill.`,
              reviewer: options.reviewer ?? "cli",
              reviewedAt: now,
              updatedAt: now
            }
          });
      });
      await refreshReadModels();
    }

    return {
      status: options.persist ? "fixed" : "dry_run",
      persist: options.persist,
      vote: {
        id: vote.id,
        title: vote.title,
        heldOn: vote.held_on,
        previousBillId: vote.bill_id,
        nextBillId: bill.id,
        sourceUrl: vote.source_url
      },
      bill: {
        id: bill.id,
        slug: bill.slug,
        title: bill.title,
        identifiers: bill.identifiers
      },
      evidence,
      issueKey,
      nextAction: options.persist
        ? "Read models refreshed and data-health issue marked fixed."
        : "Review evidence, then re-run with --persist if the link is correct."
    };
  } finally {
    await session.close();
  }
}

async function repairDuplicateBillPlan(options: RepairDuplicateBillPlanOptions) {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<Record<string, unknown>>(sql`
      select
        b.id,
        b.slug,
        b.title,
        b.identifiers,
        (select count(*)::int from bill_events be where be.bill_id = b.id) as events,
        (select count(*)::int from bill_procedure_steps bps where bps.bill_id = b.id) as procedure_steps,
        (select count(*)::int from documents d where d.bill_id = b.id) as documents,
        (select count(*)::int from bill_sponsors bs where bs.bill_id = b.id) as sponsors,
        (select count(*)::int from votes v where v.bill_id = b.id) as votes,
        (select count(*)::int from bill_document_text_chunks c where c.bill_id = b.id) as text_chunks
      from bills b
      where b.id in (${options.primaryBillId}, ${options.duplicateBillId})
      order by b.id
    `);
    const presentIds = new Set(rows.map((row) => String(row.id)));
    return {
      status: presentIds.has(options.primaryBillId) && presentIds.has(options.duplicateBillId) ? "plan_only" : "missing_bill",
      warning: "No automatic merge is performed. This command only reports dependent rows so a merge migration can be reviewed explicitly.",
      primaryBillId: options.primaryBillId,
      duplicateBillId: options.duplicateBillId,
      rows,
      suggestedNextStep: "If this is a real duplicate lifecycle row, create a reviewed migration that rewrites dependent foreign keys to the primary bill and marks the duplicate issue fixed."
    };
  } finally {
    await session.close();
  }
}

function voteBillEvidence(vote: RepairVoteRow, bill: RepairBillRow) {
  const voteIdentifiers = extractedIdentifiers(`${vote.title} ${vote.source_url ?? ""}`);
  const billIdentifiers = Object.values(bill.identifiers ?? {});
  const matches = voteIdentifiers.filter((voteIdentifier) =>
    billIdentifiers.some((billIdentifier) => normalizeIdentifier(voteIdentifier) === normalizeIdentifier(billIdentifier))
  );
  return {
    voteIdentifiers,
    billIdentifiers,
    matches,
    hasStrongMatch: matches.length > 0
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importSenateRoster(): Promise<ParsedRoster> {
  const legislature = rosterLegislature();
  const groupUrls = listFlag("group-urls");
  const indexUrl = flag("url") ?? "https://www.senat.ro/EnumGrupuri.aspx";
  const index = groupUrls
    ? undefined
    : parseSenateRosterIndex(await loadHtml(indexUrl), indexUrl);
  const limitValue = Number(flag("limit") ?? "0");
  const groupRefs: RosterGroupRef[] = groupUrls
    ? groupUrls.map((url) => ({ url }))
    : (index?.groups ?? []);
  const groupsToFetch = limitValue > 0 ? groupRefs.slice(0, limitValue) : groupRefs;
  const groupParts = [];
  const profiles: ParsedMemberProfile[] = [];
  const concurrency = Number(flag("concurrency") ?? "6");

  for (const groupRef of groupsToFetch) {
    console.log(`Fetching Senate group ${groupRef.group?.shortName ?? groupRef.url}`);
    const html = await fetchWithFailureSnapshot(groupRef.url, "senate-roster-group");
    const group = parseSenateRosterGroup(html, groupRef.url, groupRef.group, { legislature });
    group.expectedCount = groupRef.expectedCount ?? group.expectedCount;
    if (groupRef.expectedCount && group.members.length > groupRef.expectedCount) {
      group.members = group.members.slice(0, groupRef.expectedCount);
    }
    groupParts.push(group);
    const membersToFetch = limitValue > 0 ? group.members.slice(0, limitValue) : group.members;
    profiles.push(
      ...(await mapLimit(membersToFetch, concurrency, async (memberRef) => {
        const profileHtml = await fetchOptional(memberRef.profileUrl, "senate-member-profile");
        if (!profileHtml && hasFlag("persist")) throw new Error(`Incomplete roster: ${memberRef.profileUrl}. Existing histories were not replaced.`);
        return profileHtml ? parseSenateMemberProfile(profileHtml, memberRef.profileUrl, { legislature }) : undefined;
      }))
    );
  }
  return {
    chamber: "senate",
    legislature,
    sourceSnapshots: uniqueBy(
      [
        ...(index ? [index.sourceSnapshot] : []),
        ...groupParts.map((group) => group.sourceSnapshot),
        ...profiles.map((profile) => profile.sourceSnapshot)
      ],
      (source) => source.id
    ),
    parties: uniqueBy(
      [
        ...(index?.groups ?? []).flatMap((group) => (group.party ? [group.party] : [])),
        ...groupParts.flatMap((group) => (group.party ? [group.party] : [])),
        ...profiles.flatMap((profile) => profile.parties ?? []),
        ...partiesFromGroups([...(index?.groups ?? []).map((group) => group.group), ...groupParts.map((group) => group.group)])
      ],
      (party) => party.id
    ),
    groups: uniqueBy([...(index?.groups ?? []).map((group) => group.group), ...groupParts.map((group) => group.group)], (group) => group.id),
    members: uniqueBy(
      [...groupParts.flatMap((group) => group.members.map((member) => member.member)), ...profiles.map((profile) => profile.member)],
      (member) => member.id
    ),
    mandates: uniqueBy(profiles.flatMap((profile) => (profile.mandate ? [profile.mandate] : [])), (mandate) => mandate.id),
    mandateRelations: uniqueBy(profiles.flatMap((profile) => profile.mandateRelations ?? []), (relation) => relation.id),
    groupMemberships: uniqueBy(
      [...profiles.flatMap((profile) => profile.groupMemberships), ...groupParts.flatMap((group) => group.members.map((member) => member.membership))],
      (membership) => membership.id
    ),
    partyAffiliations: uniqueBy(
      [
        ...groupParts.flatMap((group) => group.members.flatMap((member) => (member.partyAffiliation ? [member.partyAffiliation] : []))),
        ...profiles.flatMap((profile) => profile.partyAffiliations)
      ],
      (affiliation) => affiliation.id
    ),
    committeeMemberships: uniqueBy(profiles.flatMap((profile) => profile.committeeMemberships), (membership) => membership.id),
    roles: uniqueBy(
      [...groupParts.flatMap((group) => group.members.flatMap((member) => (member.role ? [member.role] : []))), ...profiles.flatMap((profile) => profile.roles)],
      (role) => role.id
    ),
    groupCounts: groupParts.map((group) => ({
      groupId: group.group.id,
      expected: group.expectedCount ?? 0,
      parsed: group.members.length
    }))
  };
}

async function importDeputiesRoster(): Promise<ParsedRoster> {
  const legislature = rosterLegislature();
  const memberIdFrom = numberFlag("member-id-from");
  const memberIdTo = numberFlag("member-id-to");
  if (memberIdFrom && memberIdTo) {
    return importDeputiesRosterByMemberIds(legislature, memberIdFrom, memberIdTo);
  }

  const groupUrls = listFlag("group-urls");
  const indexUrl = flag("url") ?? defaultDeputiesRosterUrl(legislature.label);
  const index = groupUrls
    ? undefined
    : parseDeputiesRosterIndex(await loadHtml(indexUrl), indexUrl, { legislature });
  const limitValue = Number(flag("limit") ?? "0");
  const groupRefs: RosterGroupRef[] = groupUrls
    ? groupUrls.map((url) => ({ url }))
    : (index?.groups ?? []);
  const groupsToFetch = limitValue > 0 ? groupRefs.slice(0, limitValue) : groupRefs;
  const groupParts = [];
  const profiles: ParsedMemberProfile[] = [];
  const concurrency = Number(flag("concurrency") ?? "6");

  for (const groupRef of groupsToFetch) {
    console.log(`Fetching Deputies group ${groupRef.group?.shortName ?? groupRef.url}`);
    const html = await fetchWithFailureSnapshot(groupRef.url, "deputies-roster-group");
    const group = parseDeputiesRosterGroup(html, groupRef.url, groupRef.group, { legislature });
    group.expectedCount = groupRef.expectedCount ?? group.expectedCount;
    if (groupRef.expectedCount && group.members.length > groupRef.expectedCount) {
      group.members = group.members.slice(0, groupRef.expectedCount);
    }
    groupParts.push(group);
    const membersToFetch = limitValue > 0 ? group.members.slice(0, limitValue) : group.members;
    profiles.push(
      ...(await mapLimit(membersToFetch, concurrency, async (memberRef) => {
        const profileHtml = await fetchOptional(memberRef.profileUrl, "deputies-member-profile");
        if (!profileHtml && hasFlag("persist")) throw new Error(`Incomplete roster: ${memberRef.profileUrl}. Existing histories were not replaced.`);
        return profileHtml ? parseDeputiesMemberProfile(profileHtml, memberRef.profileUrl, { legislature }) : undefined;
      }))
    );
  }
  const profiledMemberIdsWithParties = new Set(profiles.filter((profile) => profile.partyAffiliations.length > 0).map((profile) => profile.member.id));

  return {
    chamber: "deputies",
    legislature,
    sourceSnapshots: uniqueBy(
      [
        ...(index ? [index.sourceSnapshot] : []),
        ...groupParts.map((group) => group.sourceSnapshot),
        ...profiles.map((profile) => profile.sourceSnapshot)
      ],
      (source) => source.id
    ),
    parties: uniqueBy(
      [
        ...(index?.groups ?? []).flatMap((group) => (group.party ? [group.party] : [])),
        ...groupParts.flatMap((group) => (group.party ? [group.party] : [])),
        ...profiles.flatMap((profile) => profile.parties ?? []),
        ...partiesFromGroups([
          ...(index?.groups ?? []).map((group) => group.group),
          ...groupParts.map((group) => group.group),
          ...profiles.flatMap((profile) => profile.groups ?? [])
        ])
      ],
      (party) => party.id
    ),
    groups: uniqueBy(
      [
        ...(index?.groups ?? []).map((group) => group.group),
        ...groupParts.map((group) => group.group),
        ...profiles.flatMap((profile) => profile.groups ?? [])
      ],
      (group) => group.id
    ),
    members: uniqueBy(
      [...profiles.map((profile) => profile.member), ...groupParts.flatMap((group) => group.members.map((member) => member.member))],
      (member) => member.id
    ),
    mandates: uniqueBy(profiles.flatMap((profile) => (profile.mandate ? [profile.mandate] : [])), (mandate) => mandate.id),
    mandateRelations: uniqueBy(profiles.flatMap((profile) => profile.mandateRelations ?? []), (relation) => relation.id),
    groupMemberships: uniqueBy(
      [
        ...profiles.flatMap((profile) => profile.groupMemberships),
        ...groupParts.flatMap((group) => group.members.map((member) => member.membership))
      ],
      (membership) => membership.id
    ),
    partyAffiliations: uniqueBy(
      [
        ...groupParts.flatMap((group) =>
          group.members.flatMap((member) =>
            !profiledMemberIdsWithParties.has(member.member.id) && member.partyAffiliation ? [member.partyAffiliation] : []
          )
        ),
        ...profiles.flatMap((profile) => profile.partyAffiliations)
      ],
      (affiliation) => affiliation.id
    ),
    committeeMemberships: uniqueBy(profiles.flatMap((profile) => profile.committeeMemberships), (membership) => membership.id),
    roles: uniqueBy(
      [...groupParts.flatMap((group) => group.members.flatMap((member) => (member.role ? [member.role] : []))), ...profiles.flatMap((profile) => profile.roles)],
      (role) => role.id
    ),
    groupCounts: groupParts.map((group) => ({
      groupId: group.group.id,
      expected: group.expectedCount ?? 0,
      parsed: group.members.length
    }))
  };
}

async function importDeputiesRosterByMemberIds(
  legislature: ParsedRoster["legislature"],
  from: number,
  to: number
): Promise<ParsedRoster> {
  const concurrency = Number(flag("concurrency") ?? "8");
  const ids = Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
  const profiles = await mapLimit(ids, concurrency, async (officialId) => {
    const url = defaultDeputiesMemberProfileUrl(legislature.label, officialId);
    const profileHtml = await fetchOptional(url, "deputies-member-profile");
    if (!profileHtml) return undefined;
    const profile = parseDeputiesMemberProfile(profileHtml, url, { legislature });
    return looksLikeParsedDeputiesMember(profile) ? profile : undefined;
  });

  return {
    chamber: "deputies",
    legislature,
    sourceSnapshots: uniqueBy(profiles.map((profile) => profile.sourceSnapshot), (source) => source.id),
    parties: uniqueBy(
      [...profiles.flatMap((profile) => profile.parties ?? []), ...partiesFromGroups(profiles.flatMap((profile) => profile.groups ?? []))],
      (party) => party.id
    ),
    groups: uniqueBy(profiles.flatMap((profile) => profile.groups ?? []), (group) => group.id),
    members: uniqueBy(profiles.map((profile) => profile.member), (member) => member.id),
    mandates: uniqueBy(profiles.flatMap((profile) => (profile.mandate ? [profile.mandate] : [])), (mandate) => mandate.id),
    mandateRelations: uniqueBy(profiles.flatMap((profile) => profile.mandateRelations ?? []), (relation) => relation.id),
    groupMemberships: uniqueBy(profiles.flatMap((profile) => profile.groupMemberships), (membership) => membership.id),
    partyAffiliations: uniqueBy(profiles.flatMap((profile) => profile.partyAffiliations), (affiliation) => affiliation.id),
    committeeMemberships: uniqueBy(profiles.flatMap((profile) => profile.committeeMemberships), (membership) => membership.id),
    roles: uniqueBy(profiles.flatMap((profile) => profile.roles), (role) => role.id),
    groupCounts: []
  };
}

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function requiredFlag(name: string): string {
  const value = flag(name);
  if (!value) throw new Error(`Missing required --${name}=... flag.`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function partiesFromGroups(groups: ParsedRoster["groups"]): ParsedRoster["parties"] {
  const partiesById = new Map(Object.values(partyCatalog).map((party) => [party.id, party]));
  return groups.flatMap((group) => {
    if (!group.partyId) return [];
    const party = partiesById.get(group.partyId);
    return party ? [party] : [];
  });
}

function logRosterSummary(parsed: ParsedRoster) {
  console.log(
    JSON.stringify(
      {
        chamber: parsed.chamber,
        legislature: parsed.legislature.label,
        sources: parsed.sourceSnapshots.length,
        groups: parsed.groups.length,
        members: parsed.members.length,
        mandates: parsed.mandates.length,
        mandateRelations: parsed.mandateRelations?.length ?? 0,
        groupMemberships: parsed.groupMemberships.length,
        committeeMemberships: parsed.committeeMemberships.length,
        groupCounts: parsed.groupCounts
      },
      null,
      2
    )
  );
}

function rosterLegislature() {
  return legislatureFromFlag(flag("legislature") ?? flag("year"));
}

function defaultDeputiesRosterUrl(label: string): string {
  if (label === "2020-2024") {
    return "https://www.cdep.ro/pls/parlam/structura.gp?leg=2020";
  }
  return "https://cdep.ro/ords/pls/dic/site2015.home?idl=1";
}

function defaultDeputiesMemberProfileUrl(label: string, officialId: number): string {
  const leg = label.slice(0, 4);
  return `https://www.cdep.ro/ords/pls/parlam/structura2015.mp?cam=2&idl=1&idm=${officialId}&leg=${leg}&pag=1`;
}

function looksLikeParsedDeputiesMember(profile: ParsedMemberProfile): boolean {
  if (!profile.member.displayName || !profile.mandate) return false;
  return ![
    "activitate-parlamentara",
    "activitate-publica",
    "biografie",
    "camera-deputatilor",
    "curriculum-vitae",
    "declaratia-de-avere",
    "declaratia-de-interese",
    "votul-electronic"
  ].includes(profile.member.slug);
}

async function loadHtml(url: string): Promise<string> {
  const fixture = flag("fixture");
  if (fixture) {
    return readFile(path.join(repoRoot, "packages/ingest/src/fixtures", fixture), "utf8");
  }
  return fetchOfficialSource(url);
}

async function fetchWithFailureSnapshot(url: string, parser: string): Promise<string> {
  try {
    return await fetchOfficialSource(url, 3);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const snapshot = snapshotFor(parser, url, message, "failed", message);
    await writeImport(`${parser}-failed`, { sourceSnapshot: snapshot, error: message }, message);
    throw error;
  }
}

async function fetchOptional(url: string, parser: string): Promise<string | undefined> {
  try {
    return await fetchWithFailureSnapshot(url, parser);
  } catch {
    return undefined;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R | undefined>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (!current) continue;
      const result = await task(current);
      if (result) results.push(result);
    }
  });
  await Promise.all(workers);
  return results;
}

async function writeImport(name: string, payload: unknown, raw: string) {
  if (hasFlag("no-files") || process.env.VERCEL === "1") {
    console.log(`Skipped local file output for ${name}`);
    return;
  }
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const importDir = path.join(repoRoot, "data/imports");
  const snapshotDir = path.join(repoRoot, "data/snapshots");
  await mkdir(importDir, { recursive: true });
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(path.join(importDir, `${now}-${name}.json`), JSON.stringify(payload, null, 2));
  await writeFile(path.join(snapshotDir, `${now}-${name}.html`), raw);
  console.log(`Wrote ${name} import at ${now}`);
}

async function writeGovernmentHistoryAudit(payload: unknown, markdown: string) {
  if (hasFlag("no-files") || process.env.VERCEL === "1") return;
  const reportsDir = path.join(repoRoot, "data/government-history/reports");
  await mkdir(reportsDir, { recursive: true });
  await writeFile(path.join(reportsDir, "2024-2028-latest.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(reportsDir, "2024-2028-latest.md"), markdown);
  console.log(`Wrote government history audit to ${reportsDir}`);
}

async function writeCdepHistoryWarningFiles(result: Awaited<ReturnType<typeof importCdepHistoryProfiles>>) {
  if (hasFlag("no-files") || process.env.VERCEL === "1") return;
  const warnings = result.chambers.flatMap((chamber) => chamber.warningItems);
  if (warnings.length === 0) return;
  const reportsDir = path.join(repoRoot, "data/cdep-history/reports");
  const suffix = result.legislature.replace(/[^0-9A-Za-z-]+/g, "-");
  const jsonPath = path.join(reportsDir, `manual-warning-review-${suffix}.json`);
  const csvPath = path.join(reportsDir, `manual-warning-review-${suffix}.csv`);
  await mkdir(reportsDir, { recursive: true });
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: result.source,
        legislature: result.legislature,
        count: warnings.length,
        warnings
      },
      null,
      2
    )
  );
  await writeFile(csvPath, warningCsv(warnings));
  console.log(`Wrote CDEP manual warning review files: ${jsonPath} and ${csvPath}`);
}

function compactCdepHistoryImportResult(result: Awaited<ReturnType<typeof importCdepHistoryProfiles>>) {
  return {
    ...result,
    chambers: result.chambers.map((chamber) => ({
      ...chamber,
      warningItems: chamber.warningItems.length
    }))
  };
}

function warningCsv(warnings: Awaited<ReturnType<typeof importCdepHistoryProfiles>>["chambers"][number]["warningItems"]): string {
  const headers = [
    "type",
    "legislature",
    "chamber",
    "memberName",
    "officialId",
    "profileKey",
    "profileUrl",
    "validationDateRaw",
    "partyLabels",
    "groupLabels",
    "note"
  ];
  return [
    headers.join(","),
    ...warnings.map((warning) =>
      [
        warning.type,
        warning.legislature,
        warning.chamber,
        warning.memberName,
        warning.officialId,
        warning.profileKey,
        warning.profileUrl,
        warning.validationDateRaw ?? "",
        warning.partyLabels.join(" | "),
        warning.groupLabels.join(" | "),
        warning.note
      ]
        .map(csvCell)
        .join(",")
    )
  ].join("\n");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function logSyncResult(result: { failed: number; partial: number; errors: string[] }) {
  console.log(JSON.stringify(result, null, 2));
}

function syncOptions() {
  const years = flag("years")
    ?.split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
  return {
    years: years && years.length > 0 ? years : undefined,
    maxImports: numberFlag("max-imports"),
    maxRetries: numberFlag("max-retries"),
    refreshExisting: hasFlag("refresh-existing"),
    discoveryLimit: numberFlag("discovery-limit"),
    dryRun: hasFlag("dry-run"),
    chamber: chamberFlag(),
    kind: kindFlag(),
    deputiesVoteDates: listFlag("deputies-vote-dates"),
    deputiesVoteMonths: numberListFlag("deputies-vote-months"),
    dateFrom: flag("date-from"),
    dateTo: flag("date-to"),
    senateFrom: numberFlag("senate-from"),
    senateTo: numberFlag("senate-to"),
    senatePrefixes: senatePrefixesFlag(),
    officialId: flag("official-id"),
    sourceUrl: flag("source-url")
  };
}

async function reclassifyBillDocuments(options: { year?: number; limit?: number; persist?: boolean }) {
  const session = createDbSession();
  try {
    const filters = [
      "d.url like '%cdep.ro%'",
      options.year ? `(d.url like '%/${options.year}/%' or d.url like '%?${options.year}/%')` : undefined
    ].filter(Boolean);
    const query = `
      select d.id, d.bill_id, d.label, d.url, d.document_kind
      from documents d
      where ${filters.join(" and ")}
      order by d.bill_id, d.id
      ${options.limit ? `limit ${Math.max(1, options.limit)}` : ""}
    `;
    const rows = await session.db.execute<{
      id: string;
      bill_id: string;
      label: string;
      url: string;
      document_kind: string;
    }>(sql.raw(query));
    const changes = rows
      .map((row) => {
        const nextKind = classifyDeputiesDocumentKind(`${row.label} ${row.url}`);
        return {
          id: row.id,
          billId: row.bill_id,
          previousKind: row.document_kind,
          nextKind,
          url: row.url
        };
      })
      .filter((change) => change.nextKind !== change.previousKind);

    if (options.persist) {
      for (const change of changes) {
        await session.db
          .update(schema.documents)
          .set({ documentKind: change.nextKind })
          .where(eq(schema.documents.id, change.id));
      }
    }

    return {
      scanned: rows.length,
      changed: changes.length,
      persisted: Boolean(options.persist),
      sample: changes.slice(0, 25)
    };
  } finally {
    await session.close();
  }
}

function compactBillTextBatchResult(result: Awaited<ReturnType<typeof importBillTextBatch>>) {
  return {
    filters: result.filters,
    candidates: result.candidates,
    stored: result.stored,
    unsupported: result.unsupported,
    failed: result.failed,
    missing: result.missing,
    dryRun: result.dryRun,
    sample: result.rows.slice(0, 10).map((row) => ({
      documentId: row.documentId,
      billId: row.billId,
      previousTextStatus: row.previousTextStatus,
      result: row.result
    }))
  };
}

function numberFlag(name: string): number | undefined {
  const value = flag(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function listFlag(name: string): string[] | undefined {
  const value = flag(name);
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function extractedIdentifiers(value: string): string[] {
  return [...new Set([...value.matchAll(/\b(?:PL-x|PLX|L|B|BP)\s*[-]?\s*\d+\/\d{4}\b/gi)].map((match) => match[0].replace(/\s+/g, " ").trim()))];
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace("plx", "pl-x");
}

function numberListFlag(name: string): number[] | undefined {
  const values = listFlag(name)
    ?.map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
  return values && values.length > 0 ? values : undefined;
}

function senatePrefixesFlag(): Array<"B" | "BP" | "L" | "PLX"> | undefined {
  const value = flag("senate-prefixes");
  if (!value) return undefined;
  const prefixes = value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is "B" | "BP" | "L" | "PLX" => ["B", "BP", "L", "PLX"].includes(item));
  return prefixes.length > 0 ? prefixes : undefined;
}

function chamberFlag(): "senate" | "deputies" | undefined {
  const value = flag("chamber");
  return value === "senate" || value === "deputies" ? value : undefined;
}

function assetTypeFlag(): AssetType | undefined {
  const value = flag("asset-type");
  return value === "photo" || value === "party_logo" || value === "cv" || value === "bill_text" ? value : undefined;
}

function resolveRepoPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

function loadLocalEnv() {
  for (const file of [path.join(repoRoot, ".env"), path.join(repoRoot, ".env.local"), path.join(repoRoot, "apps/web/.env.local")]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue?.replace(/^['"]|['"]$/g, "") ?? "";
    }
  }
}

function kindFlag(): "bill" | "vote" | undefined {
  const value = flag("kind");
  return value === "bill" || value === "vote" ? value : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function readRootEnvValue(name: string): string | undefined {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8").split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^"|"$/g, "").trim() || undefined;
}
