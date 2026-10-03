# CumVoteaza current state and roadmap

Updated 24 September 2026. This is the authoritative project handoff. Detailed logs remain linked from [README.md](README.md), but this file decides what is current. The [24 September review](review-2026-09-24.md) qualifies earlier completion claims: the current browser gate is not green, and data-integrity and interaction defects remain open.

## Product today

CumVoteaza has two connected products:

1. A bilingual public Next.js website for votes, bills, members, parties, parliamentary composition and data health.
2. A local FastAPI/React cockpit for imports, inspection, analysis drafts, review, editorial changes, release previews, backups and recovery.

The public website uses the editorial visual system from the five approved mockups. The homepage, vote and bill directories, member directory and profile, party profile, composition page and core detail pages use real database records and official-source links. Desktop uses the list/detail or content/context layouts from the references; narrow layouts use the compact header and single-column flow.

The local cockpit runs independently from the public website. It uses a dedicated PostgreSQL service for baseline, working and release-preview data, while SQLite stores jobs, methods, proposals, review decisions and receipts.

## Verified data and releases

- The May–September 2026 refresh published 430 newly verified votes: 268 Chamber votes and 162 Senate votes.
- Public May–September coverage recorded on 10 September was 505 votes. Forty-five Senate drafts were withheld because validation did not support publication.
- Local staging recorded 6,983 members, 221 parties, 2,532 bill dossiers, 1,099 votes and 9,507 stored assets during the 11 September UI audit.
- Official PDFs remain external. Derived text, photos, logos and small assets follow the storage policy.
- Public political scores have not been published.

These numbers are dated observations, not live counters. Use the cockpit and data-health queries for current totals.

## What is complete

### Public website

- Shared CumVoteaza shell, Romanian/English navigation and responsive mobile menu.
- Editorial homepage with a Popular-ranked recent vote, search, explanation panel and vote detail context.
- Compact vote and bill directories with working search, filters and stable links.
- Database-backed member directory, member profiles, party profiles and parliamentary compositions.
- Member profiles now separate imported offices from names, expose a source-aware parliamentary career across legislatures and affiliations, scope activity to the selected legislature, feature the latest vote, and show documented roles, committees and initiatives without inventing missing facts.
- Parliament history is separated from the current-composition overview and includes the current legislature's earlier governments. Ministry/government pages and source-linked government roles extend member career histories.
- Homepage and vote-directory previews share one compact detail language, filters dismiss on outside click or Escape, and member sorting/pagination use the current editorial controls.
- Wide desktop screens use an 80% presentation scale from 1200px upward; tablet and mobile retain normal sizing.
- Stored portraits and party logos with safe fallbacks.
- Official sources and evidence links remain reachable.
- Presentation cleanup prevents importer metadata from leaking into directory cards without modifying canonical records.
- Shared detail pages have responsive headings intended for the 320–1920px matrix; the full matrix needs re-verification. Vote details now prioritize the chamber map with party arcs, vote-colored seats, hover previews and a pinned person panel/mobile sheet; group summaries and the paginated nominal list are expandable. Bill initiators are grouped with progressive disclosure.
- Public controls have localized accessible names. English pages explicitly identify unmodified Romanian parliamentary titles, while normalized member identities keep institutional offices out of names across directories, maps and timelines.
- Vote and bill directories show deliberate empty and incremental-load error states. Data-health queues initially mount no more than 20 rows per category and mount review controls only after reviewer credentials are provided.
- A bilingual production-build browser gate covers representative routes, keyboard dismissal, image fallbacks, application console/network failures, the application icon and data-health progressive loading.

### Imports and reliability

- Reusable Senate and Chamber discovery/import scripts, capped execution and explicit source failures.
- Durable import jobs, progress, cancellation, checkpoints, retry and restart recovery in the cockpit.
- Separate local baseline, working and release-preview databases.
- Release manifests, dependency checks, stale-baseline detection, transactional receipts and retryable read-model refresh.
- Local backup and restore workflow tested into separate databases.

### Analysis foundations

- Versioned analysis profiles, examples, model settings, evaluation records and review states.
- Deterministic keyword relevance now runs as a bounded preflight before public-sector, topic and political model jobs. It prioritizes likely-relevant dossiers, retains unmatched controls, records exact source passages and never assigns political direction.
- A 50-family local model pilot completed with drafts and explicit incomplete results.
- Evidence contracts and gold-set seeds exist for taxonomy, OCR, citation and dossier-diff tasks.
- Gemini explanation caching/review code exists but remains disabled because live paid API use was deferred.

## Known limits

- The 24 September review identifies silent demo fallback on query failure, unsupported inferred absences and ineffective map reconciliation. Treat these as data-trust repair priorities, not presentation polish.
- Map search is diacritic-sensitive and excludes constituency; Escape does not close its filter panel. The automated vote test still targets removed map/list tabs.
- Ministry-directory cache invalidation and cabinet verification-date wording need correction. A query's effective date is not evidence of an editorial verification on that date.
- The 50-family reference labels still need human review. No model-quality claim is justified before that review.
- Political direction and member/party profiles are experimental and remain internal. Motion meaning, legal version, evidence coverage and minimum thresholds still need an operator-approved method.
- Some historical records lack portraits, curated party history, clean titles, documents or reliable cross-chamber links. The UI must show absence or uncertainty rather than invent values.
- Forty-five Senate vote drafts remain withheld. Source disagreement and incomplete nominal data must be resolved case by case.
- The cockpit editor does not yet control every public section and chart.
- Production publication remains a deliberate reviewed action. Scheduled imports stop before publication.

## Next roadmap

### 1. Maintain public-site quality

The September redesign and Phase 1–4 completion audit are implemented. Keep the production-sized Romanian/English browser gates mandatory after data or layout changes. Expand fixtures when a new empty, partial or failure state is discovered; fix presentation at reusable boundaries rather than with record-specific exceptions.

### 2. Make routine refresh boring

Implemented: the cockpit seeds stable saved workflows for votes, bills/documents, rosters/affiliations and assets. Existing operator edits are preserved. Import previews and completed batches expose added, changed, conflicting, unchanged and failed records; selected changes feed the existing release-preview flow and approved corrections retain conflict protection.

### 3. Review the analysis pilot

Tooling complete; human review remains: the 50-family queue exposes pending, accepted, rejected, incomplete and stale states plus precision, recall, citation validity, ambiguity, coverage and agreement metrics. Development and held-out families remain separate. Metrics exclude stale results and results whose source freshness cannot be checked while the local database is offline. The examples still require individual operator decisions before any quality claim or expansion.

### 4. Build political analysis carefully

Implemented internally; human validation remains: the saved method has ten editable indicators, explicit motions, evidence thresholds, duplicate and aggregation policies. Bill version and legal baseline gates precede vote interpretation. Neutral, mixed, disputed, not-applicable and insufficient-evidence states remain distinct. Outputs show evidence, exclusions, coverage and axis readiness and never emit a combined score.

### 5. Complete editorial release control

Implemented: the fixed editorial registry now reaches every supported public surface, including the homepage and data-health page. Preview, correction conflict, atomic publication, asset/read-model/cache failure and reviewed reversal paths are covered by the cockpit and isolated PostgreSQL suite. A local browser-backed selected-release preview is part of the final drill; production publication remains deliberately token-gated.

## Definition of the next stable release

The next release is ready when a saved local import workflow can refresh a selected date range, the operator can review every conflict and AI suggestion, the actual website preview contains only selected approved changes, Romanian and English route checks pass, and publication produces a durable receipt without allowing scheduled jobs to write directly to production.

## Verification baseline

Checked on 24 September:

- TypeScript checks and the Next.js production build pass.
- Working-tree tests pass: 17 web, 90 ingestion, 6 parliament-model and 8 Python pipeline tests. Four ingestion tests belong to pre-existing untracked political-state candidate work, not the committed baseline.
- The responsive runner discovered 13 checks: its HTTP-only bilingual route/icon check passed; 12 browser checks were blocked before application assertions by macOS Chromium launch permissions. This is not twelve confirmed app regressions.
- In-app browser observations cover the homepage, local/deployed vote directory, deployed vote map/search/filter behavior and mobile composition. They do not replace the full seven-width, bilingual interactive regression matrix.

Re-run these checks after changes; do not treat this dated baseline as proof of a later build.
