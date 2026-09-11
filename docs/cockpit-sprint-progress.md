# Cockpit sprint — implementation and validation record

Updated 2026-09-11. **430 new verified votes are published; the cockpit foundation is implemented, with the remaining review gates tracked in [current-state.md](current-state.md).** Chamber release `release-edf4f9634e5c43bd` added 268 votes and Senate release `release-8d16e269d5614ae8` added 162. Both have durable receipts and completed read-model/cache refreshes. Public May–September coverage is 505 votes; 45 Senate drafts remain withheld. The party-logo/count UI is deployed on cumvoteaza.vercel.app. Gemini caching and cockpit review are implemented but explicitly disabled at the user's request; a successful live generation has not been verified. See `may-september-refresh.md` and `vote-explanations.md`.

Release validation: workspace TypeScript checks and Vercel production build pass; 51 ingestion, six model-package and eight Python-pipeline tests pass. Ten isolated PostgreSQL tests pass, including explanation review history. The 33 core workbench tests pass after isolating a health-check test from the running local cockpit; the other workbench tests passed in the preceding suite run. Four explanation evidence-contract tests pass. The final public audit reports 505 published / 550 local votes for May 1–September 10.

## Local operating workspace

- FastAPI/React cockpit at http://127.0.0.1:8787 with Romanian/English navigation, coverage, import recipes, record inspection, versioned analysis, review, website editing, releases and recovery controls.
- Dedicated PostgreSQL16 container on localhost55432, with independent baseline, working and release databases. Existing PostgreSQL service preserved. Canonical PostgreSQL18 data copied read-only using a consistent COPY snapshot.
- SQLite owns workflow jobs and proposal state. Legacy proposal JSONL files remain migration inputs/backups; mutations and audit events commit transactionally.
- Browser-independent worker, cancellation, checkpoints, retries, disabled-by-default schedules and backups. Recorded child process identity permits cleanup after a hard worker crash without signaling a reused PID.
- Manual corrections apply to working data through durable review jobs. Source conflicts preserve approved fields; resolution records the original source values and prepares any replacement for review.

## Actual validation performed

- Three queued Chamber of Deputies votes imported locally: 901 added factual rows, with derived search/statistics tables excluded from review. Existing mandate dates preserved.
- Nine source discovery commands traversed 2024–2026. Six Chamber of Deputies ranges returned dossier/vote links. Senate discovery now submits the official year search form and maps returned rows to verified `nr_cls` dossier URLs; a live dry run returned 605 rows for 2026. The earlier zero-link runs remain recorded as failed/unverified history in `cockpit-discovery-validation.json` and must be retried with the adapter.
- Fixed 25-family 2020–2024 sample: source-document text extracted for all 25. Two initial missing-document cases resolved through verified Senate aliases. Retry retained successful stages. Senate document links are now classified by their official labels, and proposal extraction refuses to fall back to an arbitrary explanatory document. See `cockpit-historical-validation.json`.
- Fixed 25-family current pilot: 24 successful extractions; L81/2025's selected official PDF returned HTTP404. See `cockpit-current-pilot-validation.json`. No missing source counts as completed coverage.
- Qwen3:8b installed locally. Initial model outputs were incomplete; citation-required output and a smaller, task-specific prompt produced a verifiable draft. That draft still misclassified a bill creating a public service. The resumed 50-family run `run-a291c553ae514cb3` completed 50/50: 27 drafts and 23 incomplete results, all still pending individual human review under profile `profile-3da292d1115742fa`. Evaluation correctly reports no held-out comparison until reference examples are approved.
- The 50 pilot reference examples remain unapproved. Development/held-out separation is retained; teaching snapshots are versioned. No political scores or model labels have been human-approved by the agent.
- Four stable routine workflows are seeded for votes, bills/documents, rosters/affiliations and assets without overwriting operator edits. The Results view now exposes the full pilot metric set and human-review counts. Evaluation remains available when PostgreSQL is offline, marks source freshness unknown and excludes those results from quality metrics rather than reporting them as current or stale.
- Portable backup restored into three separate recovery databases; SQLite integrity check passed. Active workspace was unchanged.
- Synthetic release rendered in the real Next.js website in both languages. English displayed the Romanian fallback marker. Outdated release links returned409; mutation endpoints returned405; the website database connection rejected a zero-row update with SQLSTATE25006. Synthetic preview server stopped after validation.
- PostgreSQL release tests cover missing dependencies, atomic rollback, stale baselines, idempotent receipts, optimistic reversal, selected edit chains, competing edits, and replayable working corrections. Nine isolated database tests passed.
- Full repository tests, workbench tests, type checks and cockpit build have passed at checkpoints. Re-run after final changes. The Next production build passed against local release data after permitting Turbopack's local subprocess port.
- Actual hard-crash smoke test killed a temporary worker and verified recovery stopped its recorded orphan. No active workspace or production involved.
- Browser screenshots checked at desktop and983px split width; sidebar height adjusted so language controls remain reachable. Artifacts under `output/playwright/` are ignored.

## Release implementation

- Selected approved changes build a baseline-based snapshot; chains require every selected prerequisite, and competing edits cannot silently overwrite one another.
- Actual website preview confirms release identity before reporting ready. Failed startup is explicit.
- Canonical baseline preflight runs read-only before asset preparation; commit rechecks under transaction locks. Durable receipts prevent republishing after a lost response.
- Read-model refresh and cache invalidation are retryable after commit. UI exposes exact manifests, gated publication, refresh retry and reviewed reversal preparation. Production publication remains disabled.
- Stale AI input evidence blocks publication. Political outputs remain local; only individually approved categories are eligible.
- Original parliamentary PDFs remain external. Local derived assets are prepared for storage before canonical references commit.

## Remaining work / review gates

- Senate form discovery has been rerun locally: 745 rows for 2024, 683 for 2025 and 605 for 2026. The old zero-link attempts remain historical failures; generated candidate numbers are not used as verified discoveries.
- Review the completed 50-family model results, resolve source404 where possible, and approve development/held-out reference examples. Human reference-label review remains required; no calibrated accuracy claim is justified yet.
- Complete political profile UX, explicit motion/baseline review, party splits and method comparisons. Refine evaluation metrics and evidence controls before trusting scores.
- Extend the website section registry to control existing public sections/charts, beyond current editorial sections. Verify editing/reloading across all supported page types.
- Exercise the new correction/conflict/release controls end to end in the browser; complete source-change/rebase and publication fault-path audits, including assets and local receipt recovery.
- Recheck migration backup details, restore-content equivalence, roster/date filters, and repeat-import idempotency on the same real source records.
- Final automated tests, type checks and cockpit UI build pass. Human reference-label review, website editor review, release preview inspection and explicit production approval remain before deployment.
