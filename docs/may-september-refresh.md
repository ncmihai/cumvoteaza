# May–September 2026 refresh

Requested window: 2026-05-01 through 2026-09-10, inclusive. All importer writes target local `cockpit_working`; publication remains a separate reviewed action.

## Confirmed Chamber result

- Official daily-list discovery: 541 links; 273 pending imports.
- 268 imported, 2 failed nominal parsing, 3 unsupported joint-chamber votes.
- Public directory comparison: 75 already published across both chambers (70 Chamber, 5 Senate); 268 additional Chamber votes.
- Every new vote's nominal choices match its for/against/abstention/present-not-voting totals.
- Staged dependencies: 131 bills, 68,735 individual votes, source snapshots.
- Unresolved official IDs: 37021 and 37322 (no nominal rows); 37134, 37135, 37136 (joint sittings).
- Job: `run-4bb76de1a7dd4979`. Failed status honestly reflects the unresolved records; successful data is retained.

## Roster findings

The existing refresh replaced enriched member identity fields with sparse roster data and omitted failed profile requests from its returned source list. Batch `run-8a31a318ffa34756` is rejected for publication. Restored 2,380 existing records whose values still matched that batch; 2,362 additions or subsequently changed records remain local drafts. Do not use working data as a release snapshot.

Persistence now preserves existing member identities, URLs and source keys. Persisting a roster with a failed profile fetch or failed source is blocked. Government seed data is not a live government updater; official government/presidency fetches timed out in this run. No new government claims are approved.

## Senate scan

Added `ingest:discover:senate-votes`, using the official ASP.NET calendar and validating its selected date. Calendar scans every date within explicit bounds; empty dates are retained as observations, wrong-date responses become failures. Existing vote parser and pending-import persistence are reused.

The adapter passed a live dry run for September 8 (15 links) and automated wrong-date tests. Full scan/import job `run-569cbd754c0a47a0` succeeded. Calendar discovery returned 214 links; together with existing aliases, 217 URLs resolve to 212 distinct official AppIDs. Every AppID is represented. The public comparison identifies 207 additional Senate votes. Seventeen stored Senate votes have nominal-choice totals inconsistent with their aggregate totals; the Senate batch remains unapproved and excluded from the release.

September 10 follow-up: fixed a parser comparison that normalized source labels but not the hyphenated lookup label. Fresh official fetches verified and corrected all 16 present-not-voting mismatches. The remaining nominal mismatch has no individual rows. Deeper validation found 44 votes whose official group totals disagree with individual group assignments; these are explicitly withheld rather than silently rewritten. `prepare_senate_release.py` checks vote totals, group totals, unique official AppIDs and baseline dependencies; unknown blank nominal rows remain outside the directional denominator.

Published Senate release `release-8d16e269d5614ae8`: 162 votes, 17,497 individual votes, 1,132 group totals, 124 bills and 162 source snapshots. Its selected local preview was verified before transactional publication. Receipt status is published, with read models and cache refresh complete. The other 45 new Senate votes remain local and require further evidence/review. Combined with the Chamber release, 430 new votes have been published.

## Cheap document analysis

`keyword_ranker.py` ranks seven starter topics with editable phrase weights, Romanian diacritic normalization, capped repetition, original matching passages, text hashes and rule hashes. No model calls. Scores measure relevance only; political direction is always unset. The cockpit now uses this as a bounded preflight for public-sector, topic and political runs: likely-relevant dossiers are processed first, unmatched dossiers remain eligible as controls, duplicate document versions cannot inflate a score, and the preflight evidence is stored with each result.

Recommended workflow: extract once → cache text/chunks → rank topics → review relevant legal changes and motion meaning → apply reviewed two-axis indicators. Use corrected examples to adjust phrase weights, not party names as topic evidence. A phrase about public services cannot distinguish expanding, cutting or merely mentioning them.

`refresh_audit.py` paginates the real Vercel directory and writes new/missing vote IDs plus local document rankings. It uses stored text chunks and explicitly marks preview-only fallbacks. On the initial audit, 421 of 444 linked documents still had pending extraction; keyword absence is not proof of irrelevance.

## Website

Vote-map filters use verified official logos for PSD, PNL, AUR, USR and UDMR, plus counts. Short labels remain for missing logos. Accessible names and toggle states are retained. Existing membership election logos are deliberately not treated as parliamentary-group logos because they can represent a previous party.

Validation: 50 ingest tests passed; 73 workbench tests completed with 9 PostgreSQL tests skipped; TypeScript checks and the production build passed. Five party logos were visually verified in the actual release preview.

## Published release

`release-edf4f9634e5c43bd` was published with user authorization on September 10. It contains 69,402 insert-only records: 268 votes, 68,735 individual votes, 131 bills and 268 source snapshots. No roster changes, government changes, political scores or unrelated drafts are included. Migration 0016 was applied after backup. The transactional release receipt reports published, read models complete and cache refresh successful. Live verification returns vote 37356 dated September 9. Nine isolated PostgreSQL integration tests passed after optimizing insert-only validation and publication in batches.

Before-publication comparison: 550 local votes in the window, 75 already published, 475 additional local votes (268 Chamber, 207 Senate). The 268 Chamber votes are now published; the Senate batch remains excluded. The report ranks seven of 778 linked documents with starter keyword rules. This is draft relevance prioritization, not a coverage or accuracy claim.
