# Tasks

> Historical implementation checklist. It contains completed work and old open items; use [docs/current-state.md](docs/current-state.md) for the current roadmap.

Operational memory for the project. Keep this file current after meaningful
implementation steps.

## Current Status

- Production is deployed from `main` at `https://cumvoteaza.vercel.app`.
- The bilingual public UI redesign is complete across homepage, vote/bill/member directories and details, party profiles, composition/history and data health.
- Member profiles include scoped activity, source-aware multi-legislature careers, recent votes, roles, committees and initiative states; unsupported attendance, impact and affiliation dates remain explicit rather than inferred.
- Scope remains private-first, bilingual, data-first, and factual only.
- Architecture decision: keep Next.js as the public web/API layer; use Python as a local-first, file-first data pipeline for crawling, parsing, auditing, and backfill preparation. TypeScript remains the canonical DB persistence layer.
- The local Parliament Workbench provides the browser-first FastAPI + React/Vite operator workflow. Its local review state and generated artifacts remain separate from canonical public data.

## Active Milestone — Data Proof + First UI

- [x] Clone private GitHub repo locally.
- [x] Create split docs: planning, progress, sources.
- [x] Create monorepo workspace structure.
- [x] Add temporal parliamentary data model.
- [x] Add importer proof for Senate bill and Senate vote pages.
- [x] Add Chamber nominal vote importer attempt path.
- [x] Build bilingual app shell.
- [x] Build Transfermarkt-style member history page.
- [x] Build first vote explorer page with chamber visualization.
- [x] Install dependencies.
- [x] Run parser tests.
- [x] Run TypeScript checks.
- [x] Run production build.
- [x] Start local dev server and verify main pages.

## Active Milestone — V2 Persistence

- [x] Add Docker Compose local Postgres service.
- [x] Generate initial Drizzle migration.
- [x] Add root and web env examples for `DATABASE_URL`.
- [x] Add persistent Senate bill importer via `--persist`.
- [x] Add persistent Senate vote importer via `--persist`.
- [x] Add deterministic DB upserts for source snapshots, bills, events, documents, groups, members, memberships, votes, group totals, and nominal votes.
- [x] Switch bill and vote pages to read from Postgres first.
- [x] Keep demo fallback when `DATABASE_URL` is missing or DB is unreachable.
- [x] Run migration and persistent importer smoke test against local Postgres.

## Active Milestone — Deployment

- [x] Add Vercel build configuration at repo root.
- [x] Pin Node runtime for Vercel builds.
- [x] Add `.vercelignore` for local env, data snapshots, and build outputs.
- [x] Document Vercel settings and env vars in `docs/deployment.md`.
- [x] Add deployment Git remote for `ncmihai/cumvoteaza`.
- [x] Push deploy-ready branch to the Vercel repo.
- [ ] Connect Vercel project to `ncmihai/cumvoteaza`.
- [x] Set `CUMSEVOTEAZA_SITE_PASSWORD` in Vercel.
- [x] Add Neon `DATABASE_URL` locally and in Vercel.
- [x] Apply Drizzle migration to Neon.
- [x] Persist first Senate bill and vote proof dataset into Neon.
- [x] Verify Neon row counts and vote totals.

## Active Milestone — Real Rosters

- [x] Add shared normalized roster import shape.
- [x] Add Senate roster parser and importer.
- [x] Add Deputies roster parser and importer.
- [x] Add `senate:roster`, `deputies:roster`, and `roster:all` commands.
- [x] Add root scripts for roster import commands.
- [x] Add source snapshot traceability to mandates, committees, and roles.
- [x] Add parser fixtures for Senate and Deputies roster pages.
- [x] Add DB-backed member directory at `/[locale]/members`.
- [x] Switch member profile pages to DB-first data.
- [x] Switch party pages to DB-first data.
- [x] Verify local Docker Postgres roster import.
- [x] Apply roster migration to Neon.
- [x] Import verified rosters into Neon.
- [x] Smoke-check DB-backed member directory, member profile, and party page locally.

## Active Milestone — Official Member Careers + Compoziții Repairs

- [x] Add official CDEP career importer command:
  - `npm run ingest:official-careers -- --url=<structura.mp URL> --persist`
  - supports CDEP Deputies and CDEP-hosted Senate profiles via `cam=2` / `cam=1`
  - follows `Activitate parlamentară` links across legislatures and chambers
- [x] Parse and persist replacement relations:
  - `înlocuiește pe` / `inlocuieste pe`
  - replaced member name
  - replaced member official profile URL
  - source snapshot ID
- [x] Add `member_mandate_relations` table.
- [x] Add period-specific `logo_url` on group and party membership rows for official `/aleg/...` CDEP logo/sign images.
- [x] Fix old CDEP profile name parsing so generic page titles do not overwrite member names.
- [x] Normalize all-caps historical CDEP names, for example `Ion ROTARU` -> `Ion Rotaru`.
- [x] Scope non-party historical CDEP group fallback IDs by legislature for future imports.
- [x] Fix historical `Partidul Democrat-Liberal` recognition so 2008 PDL rows do not fall through to numeric fallback groups.
- [x] Repair existing Neon 2008 Deputies `group-deputies-1` memberships to `group-deputies-pdl` for the 2008-2012 legislature.
- [x] Update member history UI to show official logo cues and relation rows when available.
- [x] Update `Compoziții` PM summary:
  - latest legislature shows current PM first
  - older legislatures show non-interim PMs sorted by service length
  - 2012-2016 summary includes Ponta and Cioloș when data is present
- [x] Update `Compoziții` seat-map interaction:
  - hover previews a member
  - first click pins the popup
  - clicking the popup opens the member profile
- [x] Verify official sample imports against Neon:
  - Ion Rotaru Senate 2004 profile with replacement relation
  - Constantin Tămagă Deputies 2004 profile
- [x] Refresh people links and read models after official sample imports.
- [x] Add separate CDEP history probe under `tools/cdep-history-probe`:
  - file-first Python crawler, no DB writes
  - generates all official roster URL patterns from 1990-present
  - follows official `Activitate parlamentară` profile links as a deduped career graph
  - saves raw snapshots and parsed JSONL under ignored `data/cdep-history`
  - captures profile photos, period logos, career links, parties, groups, committees, constituency links, and activity links
- [x] Run the clean 2004 base batch without career expansion:
  - 541 official profiles
  - 378 Deputies profiles
  - 163 Senate profiles
  - 71 replacement relations
- [x] Add CDEP history audit command:
  - reads parsed JSONL
  - reports missing fields, duplicate names, replacement count, and profile distribution
  - optionally compares counts with Postgres through `psql` when available
- [x] Extend CDEP history audit to compare against Postgres through the repo's Node Postgres driver when local `psql` is unavailable.
- [x] Generate the 2004 audit against Neon:
  - Deputies matched exactly: probe 378, Postgres 378
  - Senate differed: probe 163, Postgres 167
  - Senate mismatch is mostly from Wikipedia-derived naming/dirty rows, including one `?` row; official CDEP import should replace this as canonical data.
- [x] Add CDEP import preview command:
  - `npm run probe:cdep-history -- preview-import`
  - creates person candidates from official career-link graph edges
  - separates imported profile keys from missing future career profile keys
- [x] Audit CDEP history probe output on a full 2004 Deputies/Senate sample before importing into Postgres.
- [x] Add dry-run CDEP history importer:
  - `npm run ingest:cdep-history:import -- --legislature=2004`
  - converts parsed official CDEP profile JSONL into the existing `ParsedRoster` shape
  - reuses the existing `persistRoster` path only when `--persist` is explicitly passed
  - keeps old Wikipedia-derived rows untouched until a deliberate cleanup/replacement pass
- [x] Dry-run the 2004 official CDEP import:
  - Deputies: 378 members, 378 mandates, 43 replacement relations
  - Senate: 163 members, 163 mandates, 21 replacement relations
  - warnings are explicit: 20 minority Deputy rows have no official constituency link; historical formations are stored separately from canonical parties.
- [x] Save manual review files for the 20 missing-constituency warnings:
  - `data/cdep-history/reports/manual-warning-review-2004-2008.json`
  - `data/cdep-history/reports/manual-warning-review-2004-2008.csv`
  - includes legislature, chamber, member name, official id, profile key, official profile URL, party labels, group labels, and validation date.
- [x] Apply the 2004 official CDEP import to Docker/local Postgres once Docker is reachable:
  - local migrations applied successfully
  - official local mandate counts: 378 Deputies, 163 Senate
  - official local replacement relations: 43 Deputies, 21 Senate
  - local missing constituency count: 20 Deputies, matching the manual review file
- [x] Refresh local people links and read models after the official 2004 import:
  - people backfill: 1,005 members read, 998 people upserted, 1,005 members linked
  - read models: 1,005 member legislature activity rows, 1,040 search-index rows
- [x] Apply the verified 2004 official CDEP import to Neon:
  - Deputies imported first: 378 official CDEP mandates
  - combined import stalled after Deputies, so roster persistence was changed from broad `Promise.all` writes to controlled sequential writes for Neon reliability
  - Senate imported after batching fix: 163 official CDEP mandates
  - replacement relations in Neon: 43 Deputies, 21 Senate
- [x] Clean superseded 2004 Senate Wikipedia-derived rows from Neon:
  - removed 166 old non-CDEP Senate mandates
  - final 2004 Neon counts: 378 Deputies, 163 Senate, 0 non-CDEP mandates
- [x] Refresh Neon read models after 2004 official import:
  - bill/vote summaries: 2,196
  - vote coverage summaries: 553
  - member legislature activity rows: 5,261
  - search-index rows: 8,436
  - linked members verified: 5,473
- [x] Add broader Python parliament pipeline umbrella:
  - `npm run pipeline:parliament -- domains`
  - `npm run pipeline:parliament -- plan historical-members`
  - `npm run pipeline:parliament -- cdep-members <command>`
  - current implemented domain delegates to the proven CDEP member-history probe
  - future `votes-projects` domain is documented as planned, file-first output under `data/parliament-pipeline/`
- [x] Add Python pipeline tests and wire them into root `npm run test`:
  - validates the file-first boundary
  - validates the historical-member workflow plan
  - validates the umbrella CLI delegates 2004 CDEP roster URL generation correctly

## Active Milestone — Chamber Vote Map

- [x] Add reusable semicircle chamber seat map for vote pages.
- [x] Encode party/group as seat color and vote choice as the seat mark.
- [x] Include absent/unknown chamber members when DB roster data is available.
- [x] Add group and vote-choice highlighting controls.
- [x] Keep nominal vote table as the audit layer below the visual map.
- [x] Verify desktop and mobile rendering locally.

## Active Milestone — 2024-Present Directories + Parliament Model

- [x] Clean early proof-import group artifacts from the 2024-present vote data.
- [x] Add `/[locale]/votes` page listing the latest 30 voted projects.
- [x] Add `/[locale]/bills` page listing the latest 30 submitted projects.
- [x] Update navigation so `Voturi` and `Proiecte` go to directory pages.
- [x] Document how the Romanian Parliament works using official sources plus Wikipedia as overview context.
- [x] Add reusable role/committee/procedure descriptions for future UI explainers.

## Active Milestone — Daily Auto-Import + 2024-Present Backfill

- [x] Add `ingestion_runs` table for cron/backfill observability.
- [x] Add `source_discoveries` table for resumable official URL discovery and checkpoints.
- [x] Add protected `/api/cron/daily-import` route.
- [x] Configure Vercel Cron to call the daily importer once per day.
- [x] Add `CRON_SECRET` env docs and examples.
- [x] Add shared sync functions used by both CLI and the cron route.
- [x] Add discovery/backfill CLI commands:
  - `ingest:discover:senate`
  - `ingest:discover:deputies`
  - `ingest:backfill:2024`
  - `ingest:sync:daily`
- [x] Add Chamber bill persistence path and Chamber nominal vote persistence path.
- [x] Make production importer output database-first instead of file-artifact-first.
- [x] Add discovery parser tests for official-style Senate and Chamber links.
- [x] Add bounded generated Senate `L<number>/<year>` discovery for backfill smoke and range runs.
- [x] Add `ingest:import:pending` command for bounded pending imports.
- [x] Add identifier normalization for Senate `B`, `BP`, `L`, compact `PLX`, and Chamber `PL-x`.
- [x] Add generated Senate discovery prefixes via `--senate-prefixes=B,BP,L,PLX`.
- [x] Add a dedicated Deputies yearly-list parser for `upl_pck2015.lista?anp=<year>` as the project backbone when the official endpoint is reachable.
- [x] Update Deputies yearly-list discovery to use the current official `/ords/pls/proiecte/upl_pck2015.lista?anp=<year>` URL.
- [x] Make `ingest:import:pending --years=<year>` filter pending discoveries by `discovered_on`.
- [x] Discover the official 2025 Deputies project list:
  - expected 592
  - discovered 592
- [x] Import the first bounded 2025 Deputies project batch:
  - 20 project pages imported
- [x] Verify the simplified member party/group filters on Vercel.
- [x] Run one bounded daily sync against Neon:
  - 399 discoveries
  - 3 imports
  - 0 failures
- [x] Import the next bounded 2025 Deputies project batch:
  - 10 project pages imported
  - 0 failures
- [x] Smoke-check Vercel after the latest import batch:
  - `/ro/votes`
  - `/ro/bills`
  - one member profile
  - one vote detail
  - one bill detail
- [x] Run March 2025 Deputies vote discovery:
  - 145 official links discovered
- [x] Re-run Senate `B1-B100` discovery and fix year-scoped generated Senate candidates.
- [x] Fix source discovery dedupe so deterministic discovery IDs are checked before insert.
- [x] Import a controlled Senate 2025 bill batch after the fix:
  - 5 pages imported
  - 0 failures
- [x] Add targeted pending import filters:
  - `--official-id`
  - `--source-url`
- [x] Retry and clean the old `L522/2025` Senate failure:
  - 1 page imported
  - 0 failures
  - stale error metadata cleared
- [x] Import the next bounded Senate 2025 bill batch:
  - 10 pages imported
  - 0 failures
  - Senate 2025 bill discoveries now 18 imported / 83 pending / 0 failed
- [x] Continue 2025 pending backfill checkpoint:
  - completed the first discovered Senate 2025 bill queue
  - imported pending Senate votes discovered so far
  - imported additional Deputies 2025 project batches
  - cleared related Senate bill and Deputies vote side discoveries produced by those batches
  - current 2025 status: 183 Senate bills imported, 57 Senate votes imported / 27 pending, 218 Deputies bills imported / 374 pending, 46 Deputies votes imported, 0 failed
- [x] Clear the remaining 2025 discovered queue before moving to 2026:
  - imported the remaining 27 Senate vote rows plus 2 new linked Senate vote rows
  - imported the remaining 374 Deputies bill rows
  - imported 110 additional Deputies vote rows discovered from those bill pages
  - skipped 2 additional Deputies vote pages that were not usable nominal vote pages
  - added a timeout to the CDEP insecure-TLS fetch fallback so slow official pages cannot hang a batch indefinitely
  - final 2025 discovery status: 185 Senate bills imported, 86 Senate votes imported, 592 Deputies bills imported, 156 Deputies votes imported, 4 Deputies vote pages skipped, 0 pending, 0 failed
- [x] Refresh and clear the discovered 2026 queue:
  - refreshed the Deputies 2026 yearly project list: 402 official projects discovered
  - refreshed Deputies vote discovery for January-May 2026
  - imported 399 pending Deputies bill rows plus 97 linked Senate bill rows
  - imported 81 linked Senate vote rows and 65 Deputies vote rows
  - skipped 2 Deputies vote pages that were not usable nominal vote pages
  - final 2026 discovery status: 100 Senate bills imported, 85 Senate votes imported, 402 Deputies bills imported, 63 Deputies votes imported, 2 Deputies vote pages skipped, 0 pending, 0 failed
- [x] Pause 2024 import with a recorded checkpoint:
  - stopped the active Deputies vote importer on request
  - 2024 imported so far: 684 Deputies bills, 5 Senate bill cross-links, 4 Senate vote cross-links, 126 Deputies votes
  - 2024 still pending: 29 dated Deputies vote pages
  - later lifecycle links discovered during the 2024 pass and still pending: 87 Senate 2025 bills, 78 Deputies 2025 votes, 10 Deputies 2026 votes
  - next import step: clear the 29 dated 2024 Deputies votes first, then inspect and clear the new cross-year lifecycle links
- [x] Fix `Compoziții` empty timeline:
  - attach government skeleton rows to legislatures by date when `legislature_id` is missing
  - verified 10 legislatures and 85 events render locally
- [x] Fix vote seat-map hover/click behavior:
  - first click pins the member popup
  - second click opens the member profile
  - muted seats can show popups above the graph
- [x] Fix homepage public-interest panels:
  - force the homepage dynamic
  - use database-side month boundary for reaction aggregates
  - make dashboard aggregates fail independently
- [x] Fix vote detail page annotation issues:
  - group filters now support multi-select and deselect
  - vote-choice filters now support multi-select and deselect
  - vote buttons include counts, replacing the duplicate legend under the seat map
  - group distribution includes table headers
  - nominal vote table is internally scrollable/resizable and shares the same filters as the seat map
  - seat popups render above the graph and contain the profile link
- [x] Fix vote popup profile interaction:
  - the popup itself links to the member profile
  - removed the visible `Deschide profilul` text from the popup
- [x] Repair 2024 Deputies identity corruption from vote imports:
  - Chamber vote imports now insert missing vote-page members without overwriting roster-backed member identity rows
  - reran the official 2024 Deputies roster against Neon
  - refreshed people links after the roster repair
  - verified `member-deputies-48` is Buzoianu Diana-Anda / USR and `member-deputies-56` is Ciobanu Adrian-Virgil / PNL
- [x] Fix inflated vote seat-map totals for 2024-2028:
  - synthetic absent seats are capped by known chamber seat counts for the vote date and legislature
  - the selected 2026 Deputies vote now renders 331 seats instead of 398
- [x] Patch daily cron behavior after 2026-05-18 check:
  - moved Vercel Cron from early morning to evening Bucharest time
  - lowered default daily import batch size
  - increased the cron route max duration
  - daily sync now discovers current-month Deputies vote pages in addition to bills
  - current limitation: Senate final-vote discovery still needs a first-class daily source path
- [x] Use Senate bill timelines as a complementary lifecycle/vote source by parsing dated lifecycle rows and nested Senate/Deputies vote or bill links.
- [x] Change source discovery dedupe to canonical official URLs plus official identifiers.
- [x] Fix member directory search so politician last-name queries work.
- [x] Reorder chamber seat allocation left-to-right by party sector.
- [x] Extract Chamber nominal vote subject metadata before broad 2025 backfill.
- [x] Add filtered pending importer support for `--chamber=deputies --kind=vote`.
- [x] Add controlled Deputies electronic-vote day discovery command.
- [x] Run a controlled Deputies vote sample before broader 2025 backfill.
- [x] Run month-scoped Deputies vote discovery for January and February 2025.
- [x] Skip unsupported joint Chamber/Senate CDEP vote pages instead of persisting them as failed Deputies votes.
- [x] Apply the new migration to Neon before deploying the cron route.
- [x] Add `CRON_SECRET` in Vercel before enabling cron in production.
- [ ] Tune Chamber seed/discovery URLs against full official 2024-present list pages before running a full backfill.
- [ ] Add a first-class joint-vote model/parser if joint Chamber/Senate sittings should be visible as their own vote type.
- [ ] Re-check Vercel Cron suitability after real daily sync runs; move to Render Cron if duration/reliability becomes a problem.
- [ ] Add first-class Senate final-vote daily discovery so same-day Senate votes do not depend only on bill lifecycle links.
- [ ] Model party visual identities by legislature/election period using official electoral-sign sources first, then party-site logos only as clearly marked fallback evidence.

## Proposed Milestone — Public-Ready Explorer UX

- [x] Replace fixed latest-30 vote/project directories with paginated server queries.
- [x] Load the first 10 vote/project cards, then fetch more as the user scrolls or presses a load-more control.
- [x] Add loading and skeleton states for initial page load and incremental loading.
- [x] Add filters for votes and projects:
  - year
  - month
  - chamber
  - party/group sponsor where the official data supports it
  - source/status health
- [ ] Add a later factual category model for projects, starting with conservative tags such as budget, tax, justice, health, education, defense, labor, administration, environment, EU, and procedure.
- [ ] Keep categories inspectable and source-linked; do not infer ideological labels or scores in v1.
- [x] Add database indexes for directory sort/filter fields before broad 2024-present backfill becomes large.
- [x] Replace the landing page demo cards with DB-backed dynamic panels:
  - latest votes
  - latest submitted projects
  - most searched members/projects
  - most viewed pages
  - recent high-participation or close votes
  - explainers for Parliament roles, committees, and legislative stages
- [x] Add a minimal event/analytics table for private first-party usage counts, avoiding personal tracking.
- [x] Add anonymous `hot` reactions for vote and project cards/pages.
- [x] Rename visible `hot` language to neutral public-interest wording while keeping the internal reaction key compatible.
- [x] Add durable read-model tables for member legislature activity, entity search, bill vote summaries, and vote coverage.
- [x] Add `ingest:refresh-read-models` to rebuild derived data after importer batches.
- [x] Add stale-running ingestion-run cleanup before starting a new run of the same kind.
- [ ] Add automated UI tests for directory filters, pagination/load-more, loading states, and landing-page dynamic panels.
- [ ] Set `ANALYTICS_SALT` in Vercel so production can record anonymous views, searches, and hot reactions.
- [x] Apply migrations `0005` and `0006` to Neon, then run `npm run ingest:refresh-read-models`.

## Active Milestone — Performance: Hybrid Cache + Postgres Search

- [x] Add a reusable web-runtime DB session helper so public reads and lightweight write APIs do not open a fresh one-connection client for every helper call.
- [x] Add development query timing logs with `CUMSEVOTEAZA_PERF_LOG=1` support.
- [x] Add `unstable_cache` wrappers and cache tags for:
  - homepage dashboard: 5 minutes
  - vote/project directories: 10 minutes
  - vote/project/member/party details: 15 minutes
  - composition timeline/current composition: 15-60 minutes
- [x] Revalidate public cache tags after the daily cron import:
  - `home`
  - `votes`
  - `bills`
  - `members`
  - `parties`
  - `composition`
  - `search`
- [x] Replace vote detail roster reads with scoped SQL for:
  - selected vote
  - linked bill/source
  - group totals
  - nominal votes
  - chamber roster seats valid on that vote date
- [x] Replace legacy vote/project directory reads with paginated explorer/read-model paths.
- [x] Make project directory queries use `bill_vote_summaries` instead of recomputing bill event and vote counts per request.
- [x] Make member directory DB-backed search/filter read a bounded SQL slice instead of loading all members, mandates, memberships, groups, and parties.
- [x] Limit party pages to scoped group/member/vote joins instead of loading all memberships and all votes.
- [x] Enable PostgreSQL performance/search support in Neon:
  - `pg_stat_statements`
  - `pg_trgm`
  - `unaccent`
- [x] Add performance indexes:
  - `individual_votes(member_id, vote_id)`
  - `member_group_memberships(group_id, member_id, starts_on, ends_on)`
  - `member_mandates(chamber, starts_on, ends_on)`
  - trigram GIN on `entity_search_index.search_text`
  - GIN on `bills.identifiers`
- [x] Normalize read-model search text for diacritics-insensitive member, bill, vote, and party search.
- [x] Apply migration `0008_lush_captain_america.sql` to Neon.
- [x] Refresh Neon read models after the search/read-model change:
  - 2196 bill summaries
  - 553 vote coverage rows
  - 5265 member-legislature activity rows
  - 8256 search-index rows
- [x] Verify query plans on Neon:
  - vote-date roster lookup: about 4 ms
  - search-index last-name lookup: about 0.2 ms using trigram GIN
  - bill directory by year: about 1.3 ms
  - party member join sample: about 13 ms
- [ ] Add automated regression tests for cached function keys and SQL-backed directory search.
- [ ] Add production log sampling for slow server data functions after the next deploy.

## Active Milestone — Historical Members + Compoziții Foundation

- [x] Pause broad `Voturi` / `Proiecte` expansion until the composition model is ready.
- [x] Add legislature/election-period filters to member, vote, and project directories.
- [x] Make member directory rows resolve mandate/group context inside the selected legislature period.
- [x] Make group/party filter options dynamic by selected legislature so historical periods show only period-relevant groups.
- [x] Add canonical `people` identity table for cross-legislature and cross-chamber person matching.
- [x] Link `members` to `people` with nullable `person_id` so existing imports remain valid.
- [x] Add government/cabinet tables for PM, ministers, and other official government roles.
- [x] Add party, group, and member governance-alignment tables with separate source/basis fields.
- [x] Add dated `composition_events` for legislature, government, coalition, group, member, committee, and role changes.
- [x] Add migration `0004_redundant_kate_bishop.sql`.
- [x] Add visible hover/focus labels to chamber seats with member name, group, and vote choice.
- [x] Fix vote chamber maps to use only mandates and groups active on the vote date.
- [x] Make the composition timeline pinned stage viewport-bounded so both chambers remain reachable while scrolling.
- [x] Compact composition timeline payloads so historical stops do not send full member/mandate records to the browser.
- [x] Apply composition migration locally.
- [x] Build first `people` backfill to create canonical person records from the current 2024-present roster.
- [x] Add first `Compoziții` read model for current legislature/chamber composition.
- [x] Add `/[locale]/compozitii` page with current Chamber/Senate seat maps and official/computed mode switch.
- [x] Apply composition migration to Neon.
- [x] Run the `people` backfill against Neon after migration.
- [x] Add `ingest:governments:skeleton` for post-1989 government timeline seeding.
- [x] Seed government skeleton locally and in Neon:
  - 27 PM/person rows
  - 35 government periods
  - 35 PM role rows
  - 69 composition events
- [x] Replace `/[locale]/compozitii` with scroll-driven timeline:
  - major event stops
  - sticky desktop stage
  - stacked mobile cards
  - manual/official verification badges
  - current composition stage when roster data exists
- [x] Change `Compoziții` timeline from cabinet-first stops to legislature-first sections with events nested inside each legislature.
- [x] Add a three-column desktop composition layout: legislature/event rail, government period panel, compact Senate/Deputies chamber maps.
- [x] Add a member profile legislature selector and period-scoped activity/votes/proposals sections.
- [x] Preserve the current route and query params when switching languages.
- [ ] Add current composition seat map that is not tied to a vote and uses alignment mode:
  - official investiture / coalition
  - computed governing support
- [ ] Add historical-roster import plan for post-1989 legislatures.
- [x] Add member photo fields after official source URLs were identified, with
  Blob-backed asset fallback support for stored files.

## Verification

- `npm run test` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed with escalation because Turbopack worker binding is sandbox-blocked.
- 2026-05-17 public-readiness pass:
  - `npm run typecheck` passed.
  - `npm run test` passed.
  - `npm run build` passed with escalation because Turbopack worker binding is sandbox-blocked.
  - Browser smoke passed for `/ro`, `/ro/compozitii`, `/ro/votes`, `/ro/bills`, and `/ro/members/andra-bica`.
  - Locale switch preserves member route and `legislature` query params.
  - Neon read-model refresh completed:
    101 bill summaries, 68 vote coverage rows, 4087 member-legislature activity rows, 4287 search-index rows.
- V2 `npm run test` — passed.
- V2 `npm run typecheck` — passed.
- V2 `npm run build` — passed.
- Local Postgres smoke test passed after Docker was started:
  - `npm run db:up` started the Postgres container.
  - `npm run db:migrate` applied the initial Drizzle migration.
  - `npm run ingest:senate:bill -- --cod=27035 --persist` persisted `bill-l316-2025`.
  - `npm run ingest:senate:vote -- --persist` persisted `vote-senate-l316-2025-10-27-final`.
  - Database row counts: 1 bill, 1 vote, 121 members, 121 nominal votes, 8 group totals, 2 source snapshots.
  - Vote totals verified: 121 present, 116 for, 0 against, 5 abstentions, 0 present-not-voting.
  - Bill events verified: one dated official event, `2025-09-04` registration at the Senate.
- Neon smoke test passed:
  - Drizzle migration applied successfully.
  - Senate bill `bill-l316-2025` persisted with 1 dated event and 28 documents.
  - Senate vote `vote-senate-l316-2025-10-27-final` persisted with 121 members, 121 nominal votes, 8 group totals, and 2 source snapshots.
  - Vote totals verified: 121 present, 116 for, 0 against, 5 abstentions, 0 present-not-voting.
- Real roster smoke test passed:
  - Senate: 134 mandates, 7 parsed current groups, 403 committee rows, 36 role rows.
  - Deputies: 330 mandates, 9 parsed current groups, 817 committee rows, 24 role rows.
  - Total members in Neon after roster import: 464.
  - Sample slugs verified in Neon: `andra-bica`, `popa-stefan-ovidiu`.
  - Local UI smoke returned `200` for `/ro/members`, `/en/members`, `/ro/members/popa-stefan-ovidiu`, and `/ro/parties/psd`.
- Browser smoke checks:
  - `/ro`
  - `/en`
  - `/ro/votes/vote-senate-l316-2025-10-27-final`
  - `/ro/members/andra-bica`
- Chamber vote map visual checks:
  - Desktop vote page renders party-colored semicircle seats with vote marks.
  - Mobile `390x844` viewport keeps controls and the chamber map inside the panel.
  - Hydration mismatch from generated seat coordinates fixed by rounding map positions.
- Directory smoke checks:
  - `/ro/votes` returned `200` and renders the latest imported voted projects list.
  - `/ro/bills` returned `200` and renders the latest imported submitted projects list.
  - `/ro/votes/vote-senate-l316-2025-10-27-final` returned `200` after artifact cleanup.
  - Cleaned vote page no longer renders `PIR` or `Fără grup`; it renders `PACE` and canonical `Neafiliați`.
- Daily auto-import checks:
  - `npm run test` passed with discovery parser coverage.
  - `npm run typecheck` passed.
  - `npm run build` passed outside the sandbox because Turbopack worker binding is sandbox-blocked.
  - New Drizzle migration applied successfully to local Docker Postgres.
  - New Drizzle migration applied successfully to Neon.
  - Local Senate discovery smoke against the default Senate search shell completed without errors but found `0` links, so full backfill still needs tuned source-specific list seeds.
  - Neon Senate generated-discovery smoke passed for `L316/2025`: discovered `1`, imported `1`.
  - Vercel deployment URL verified: `https://cumvoteaza.vercel.app/ro`, `/ro/bills`, and `/ro/votes` return `200`.
  - Initial production Senate start run:
    - discovered generated Senate candidates `L1/2025` through `L30/2025`
    - imported a capped batch of `10`
    - current discovery statuses in Neon: 11 Senate bills imported, 64 Senate bills pending, 9 Senate votes pending, 5 Deputies votes pending, 1 Deputies vote failed.
  - Identifier discovery smoke passed in Neon for `B1-B2`, `BP1-BP2`, and `PLX1-PLX2` 2025 candidates: discovered `6`.
  - Deputies yearly-list parser tests passed against fixture-style rows.
  - Live Deputies yearly-list request from the current runtime returns `404`; importer now records a failed `deputies-yearly-list` source snapshot instead of silently treating it as empty.
  - Senate lifecycle parser tests passed; Senate bill imports now enqueue nested official vote/bill links found in dated timeline rows.
  - Pending-import smoke imported `1` queued official source with `0` partials and `0` failures.
  - Bounded daily-style pass for 2025 completed with `10` imports, `1` failed CDEP nominal vote fetch, and no partials or top-level errors.
  - Same-page Senate hash-anchor discovery artifacts were marked `skipped` in Neon and the importer now ignores those links.
  - Chamber nominal vote links now canonicalize to the working `cdep.ro/ords/pls/steno` endpoint.
  - Repaired CDEP vote pass imported `6` Deputies votes into Neon with nominal row counts matching parsed totals.
  - Chamber vote persistence now batches members, derived mandates, and nominal rows so CDEP vote imports are cron-friendlier.
  - Source discovery now dedupes legacy and ORDS Chamber vote links to the same canonical official source URL.
  - Member directory search smoke passed for `/ro/members?q=bica`, returning the roster-backed `Andra Bică` result.
  - Deputies vote page smoke passed for `/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-35953`; Playwright screenshot confirmed party seats now allocate left-to-right.
  - Chamber nominal vote parser smoke passed for `idv=35797`: extracted `PL-x 61/2025`, the full voted subject, 293 nominal rows, and no warnings.
  - Re-imported `idv=35797` into Neon; deployed page now shows `Vot final - PL-x 61/2025 - Adoptare` and the linked bill subject.
  - Controlled CDEP vote-day discovery sample:
    - Dates: `20251022`, `20251203`.
    - Discovered 39 official links across vote and bill pages.
    - Canonicalized CDEP nominal vote URLs so lowercase `nominal` and `idl=1` variants do not duplicate canonical `idv` URLs.
    - Imported 10 pending Deputies votes with `0` partials and `0` failures.
    - Re-imported 5 older pre-fix Deputies votes with generic `VOT ELECTRONIC` titles.
    - Neon Deputies vote quality after repair: 16 parsed, 0 partial, 0 failed, 0 generic `VOT ELECTRONIC` titles.
  - Month-scoped CDEP 2025 discovery:
    - January 2025 discovered 0 electronic-vote links.
    - February 2025 discovered 395 electronic-vote/project links.
    - First February import batch imported 15 votes and exposed 5 unsupported joint Chamber/Senate pages.
    - Unsupported joint pages are now stored as failed source snapshots and marked `skipped` in the discovery queue, without creating Deputies vote rows.
    - Cleaned previously persisted failed joint-vote rows from Neon.
    - Follow-up February batches imported 39 more Deputies votes and skipped 21 unsupported/duplicate discoveries with 0 partials and 0 failures.
    - Current Neon Deputies vote quality after the guarded batches: 64 parsed visible Deputies votes, 0 partial, 0 failed, 0 generic `VOT ELECTRONIC` titles.
    - Current Deputies vote discovery queue: 287 pending, 70 imported, 40 skipped.
- Public-ready explorer UX checks:
  - Added migration `0003_chubby_whiplash` for engagement tables and directory indexes.
  - Applied the migration to the configured database; `engagement_events` and `content_reactions` exist.
  - `/ro`, `/ro/votes?year=2025&month=12`, and `/ro/bills?q=PL-x` returned `200` locally.
  - `/api/directory/votes?limit=3&year=2025` and `/api/directory/bills?limit=3&q=PL-x` returned paginated JSON locally.
  - `/api/reactions/hot` returns a controlled disabled response until `ANALYTICS_SALT` is configured.
- Composition foundation checks:
  - Drizzle migration generated for people, governments, alignments, and composition events.
  - Vote seat map hover/focus labels added for member name, group, and vote choice.
  - Local Docker Postgres migration applied with explicit local `DATABASE_URL`.
  - Local people backfill linked 464 members to 464 people.
  - `/ro/compozitii` and `/ro/compozitii?mode=computed` returned `200` locally and rendered DB-backed chamber counts.
  - Neon migration applied successfully.
  - Neon people backfill linked 468 members to 468 people.
  - Government skeleton seed rerun locally with stable counts, confirming idempotent upserts.
  - Local `/ro/compozitii` smoke rendered 69 timeline events, Bolojan first, manual skeleton badges, and current roster seat maps.
  - Neon government skeleton seed completed with stable counts.
- Historical roster start:
  - Roster importers now accept `--legislature=2020` / `--year=2020`.
  - Deputies historical profile-ID import path added:
    `npm run ingest:deputies:roster -- --legislature=2020 --member-id-from=1 --member-id-to=450`.
  - 2020-2024 Deputies persisted to the configured database:
    354 members, 354 mandates, 430 group memberships, 1000 committee memberships.
  - 2020-2024 Senate main groups persisted from verified official group pages:
    PSD, PNL, USR, AUR, UDMR; 123 members, 123 mandates, 385 committee memberships.
  - Senate 2020 unaffiliated members are not complete yet; keep this as a source-discovery gap.
  - People backfill refreshed after historical rosters:
    613 members read, 574 people upserted, 613 members linked.
  - `Compoziții` timeline stops now build chamber compositions for the stop date when data exists, instead of only showing today's composition.
  - Seat-map hover labels now render above graph seats/center text.
  - Fixed overlap bug where open-ended 2020-2024 mandates were counted together with 2024-2028 mandates in later government periods.
  - Added 2020, 2016, 2012, and 2008 Wikipedia elected-list pages to `docs/sources.md` as validation references.
  - Fixed CDEP historical ID collision:
    2020 Deputies now use `member-deputies-2020-<idm>`, while 2024 Deputies keep `member-deputies-<idm>` for vote compatibility.
  - Cleaned and reimported Deputies rosters after the ID fix:
    2024 Deputies: 330 members; 2020 Deputies: 354 members.
  - Member pages now aggregate all chamber/source member records connected to the same `people` row.
  - `drula-catalin` verification now shows Cătălin Drulă as USR only, with 2020 and 2024 mandate history and no PSD row.
  - Extended historical Deputies imports to 2016-2020 and 2012-2016 using official CDEP profile URLs:
    2016-2020 has 361 Deputies mandates, 9 groups, 508 group memberships, and 929 committee memberships;
    2012-2016 has 417 Deputies mandates, 10 groups, 702 group memberships, and 857 committee memberships.
  - Added parser support for older parties/formations:
    ALDE, PMP, PDL, PP-DD, PC, UNPR, and PRO România.
  - Fixed historical group-to-party persistence so groups referencing old parties create the party rows before parliamentary groups are upserted.
  - Fixed duplicate member slug persistence across legislatures by suffixing duplicate member slugs with deterministic member IDs.
  - People backfill after the 2016/2012 imports:
    1723 members read, 1280 people upserted, 1723 members linked.
  - Database check after the import:
    417 Deputies mandates for `leg-2012-2016`, 361 Deputies mandates for `leg-2016-2020`, and no unscoped Deputies IDs spanning multiple legislatures.
  - Corrected USL modelling: USL is not a party row; it belongs in future
    coalition/alignment data involving PSD and PNL.
  - Added 2008-2012 and 2004-2008 legislature support and parser support for
    PD, PRM, and PUR.
  - Added coalition-text guards so USL, PSD+PC, and DA PNL-PD do not create
    party rows.
  - Extended historical Deputies imports to 2008-2012 and 2004-2008 using official CDEP profile URLs:
    2008-2012 has 339 Deputies mandates, 8 groups, 456 group memberships, and 802 committee memberships;
    2004-2008 has 378 Deputies mandates, 8 groups, 504 group memberships, and 797 committee memberships.
  - People backfill after the 2008/2004 imports:
    2440 members read, 1679 people upserted, 2440 members linked.
  - Database check after the 2008/2004 import:
    339 Deputies mandates for `leg-2008-2012`, 378 Deputies mandates for
    `leg-2004-2008`, `party-usl` absent, and no unscoped Deputies IDs spanning
    multiple legislatures.
  - Confirmed the Wikipedia Deputies/Senate index pages link legislature pages
    back to 1990; use these as discovery/sanity-check maps, not canonical data.
  - Added 2000-2004, 1996-2000, 1992-1996, and 1990-1992 legislature support.
  - Added parser support for older parties observed in official CDEP rows:
    PDSR, PSDR, FSN, FDSN, PNȚCD, PUNR, PDAR, PER, MER, PSM, PAC, and PL '93.
  - Added CDR and USD to coalition/alliance guards so they do not create party rows.
  - Hardened member slug upserts so duplicate display-name slugs retry with the deterministic member-id suffix.
  - Extended historical Deputies imports through 1990 using official CDEP profile URLs:
    2000-2004 has 393 Deputies mandates;
    1996-2000 has 367 Deputies mandates;
    1992-1996 has 381 Deputies mandates;
    1990-1992 has 448 Deputies mandates.
  - People backfill after the full Deputies historical import:
    4029 members read, 2706 people upserted, 4029 members linked.

## Import Proof

- Senate bill fixture import wrote ignored local output under `data/imports/`.
- Senate vote fixture import wrote ignored local output under `data/imports/`.
- Live Senate bill import succeeded for `L316/2025` / `PL-x 429/2025`.
- Live Senate vote import succeeded with 121 nominal votes.
- Chamber nominal vote official URL was attempted and wrote a failed import snapshot for inspection.
- Chamber nominal vote import now succeeds through the ORDS endpoint; first repaired batch persisted 6 Deputies votes.
- Persistent import command shape:
  - `npm run ingest:senate:bill -- --cod=27035 --persist`
  - `npm run ingest:senate:vote -- --persist`

## Decision Log

- Repo: private GitHub repo is canonical.
- Stack: Next.js, TypeScript, Tailwind, local Postgres, Drizzle.
- Docs: split docs plus `tasks.md` active memory.
- Language: Romanian default, English secondary.
- Access: private deploy with env-password gate.
- Data range: `2024-2028` first.
- Long-term data range: post-1989, after the current-legislature composition model is proven.
- Ingestion: manual CLI commands first.
- Metrics: factual only in v1.
- Individual profiles: parliamentary-career history only, Transfermarkt-style dense table.
- Compoziții model: neutral factual composition history, with official
  investiture/coalition data stored separately from computed governing-support
  views.

## Next Actions

- Find an official, reliable source path for 2020 Senate unaffiliated members.
- Find official historical Senate roster paths for 2004-2008 through 2016-2020.
- Add coalition/alliance modelling for USL, PSD+PC, and DA PNL-PD in composition alignment data instead of `parties`.
- Add dated mandate end/replacement parsing so 2020-era compositions show exact seats-at-date, while member profiles can still show everyone who served during the term.
- Treat historical member imports as person-linked source records, not one globally stable chamber ID; CDEP `idm` can be reused by legislature.
- Smoke-check `/ro/compozitii` on Vercel after the 2020 roster deploy and confirm 2020 government stops show imported chamber data.
- Deputies are now imported from official CDEP profile pages for every legislature from 1990-present; next roster gap is historical Senate.
- Add composition alignment imports for governments/coalitions so seat maps can distinguish government support vs opposition by period.
  - [x] Seed first manual party-government alignments for recent governments and the Văcăroiu / Patrulaterul roșu support case.
  - [x] Make composition resolver default non-coalition parties/groups to `opposition` only when coalition data exists for that date.
  - [ ] Curate more government-party alignment periods from official sources and Romanian Wikipedia.
  - [x] Add a Python audit pipeline that extracts party/government/alliance history from Romanian Wikipedia into reviewable JSONL before DB import.
- Expand member profile importers for earlier legislatures.
- Replace member and party pages with DB read models after roster import exists.
- Add source snapshot inspection pages or admin-only views.
- Redeploy Vercel after Neon env vars are saved, then smoke-check the live URL.
- Add `CRON_SECRET` to Vercel.
- Push cron/backfill implementation to the Vercel repo.
- Tune official source seeds and run a small date-slice backfill before the full 2024-present backfill.
- Continue 2025 backfill one bounded batch at a time:
  - import more Senate `B` candidates in small batches;
  - continue Deputies yearly project imports;
  - run month-scoped Deputies vote discovery/imports.

## Latest Fix Notes

- [x] Fix Deputies profile parsing so constituency stops at the official
  constituency field instead of swallowing the whole CDEP profile page.
- [x] Parse Deputies month-level group/party movements such as `până în mai
  2026` and `din mai 2026` from profile rows.
- [x] Make roster persistence authoritative for member profile-derived group,
  party, committee, and role rows so stale parser rows are removed on reimport.
- [x] Reimport official 2024 Deputies roster into Neon after parser/persistence
  fixes; verified Gavrilă Anamaria now has clean `HUNEDOARA` constituency and
  temporal POT/UPR rows from the official profile.
- [x] Move chamber seat counts to a shared site-wide table:
  2024: 134 S / 331 D; 2020: 136 S / 330 D; 2016: 136 S / 329 D;
  2012: 176 S / 412 D; 2008: 137 S / 334 D; 2004: 137 S / 314 D;
  2000: 140 S / 345 D; 1996: 143 S / 343 D; 1992: 143 S / 341 D;
  1990: 119 S / 396 D.
- [x] Apply shared seat-count caps to composition and vote-seat helpers.
- [x] Fix `Compoziții` desktop scroll activation so the sticky chamber maps
  follow the legislature section under the viewport instead of staying on the
  first/current legislature.
- [x] Make the member directory table internally scrollable with a sticky
  header and defensive constituency cleanup.
- [ ] Add a `party_visual_identities` data model and importer that stores
  official logo/electoral-sign assets by party and legislature/election period.

## Roster Spring Cleaning

- [x] Add `ingest:roster:reset` as a dry-run-first command for clearing
  rebuildable roster/member-history tables without deleting bills, votes,
  nominal votes, parties, groups, source snapshots, or member identity rows.
- [x] Run `ingest:roster:reset -- --confirm` against Neon.
- [x] Reimport current official rosters:
  - 2024 Deputies: 330 active CDEP members parsed from official group/profile
    pages, with all advertised group counts matching parsed counts.
  - 2024 Senate: 134 active Senate members parsed from official group/profile
    pages, with all advertised group counts matching parsed counts.
- [x] Reimport official CDEP Deputies profile rosters for 2020, 2016, 2012,
  2008, 2004, 2000, 1996, 1992, and 1990 legislatures.
- [x] Crawl official CDEP `structura.de` roster/profile pages locally for both
  chambers across all post-1989 legislatures, 1990-2024.
- [x] Import the official CDEP-history crawl into local Docker Postgres for both
  chambers across 1990, 1992, 1996, 2000, 2004, 2008, 2012, 2016, 2020, and
  2024 legislatures.
- [x] Compare local mandate counts against the Python crawl counts:
  all CDEP-history counts match; local 2024 Senate still has 134 legacy
  `senate-member-profile` rows alongside 137 CDEP-history rows.
- [x] Decide canonical handling for duplicated 2024 Senate data: CDEP-history
  rows are canonical because they include cross-legislature and replacement
  information.
- [x] Add `ingest:cdep-history:cleanup` as a dry-run-first command that removes
  superseded non-CDEP mandate/profile rows where CDEP-history rows exist for
  the same legislature and chamber, while keeping member rows that still have
  vote references.
- [x] Run the cleanup locally for duplicated 2024 Senate rows:
  removed 134 `senate-member-profile` mandates and related legacy
  memberships/affiliations/committee/role rows; 2024 Senate now has 137
  CDEP-history mandates and 0 other mandate rows locally.
- [x] Make the public search read model ignore member rows that no longer have
  any mandate, so retained vote-reference-only legacy members do not appear as
  searchable parliamentarians.
- [x] Show the current period CDEP party/group logo in the member profile
  header, using the `logo_url` parsed from official CDEP profile pages.
- [x] Upgrade the member profile history table into grouped legislature
  sections with compact chamber/date summaries, internal scrolling, translated
  history row types, and period logo cues.
- [x] Promote the full official CDEP-history import to Neon for both chambers
  across all post-1989 legislatures.
- [x] Run `ingest:cdep-history:cleanup -- --confirm` against Neon after
  promotion: removed superseded Senate fallback/profile mandate rows wherever
  CDEP-history rows exist.
- [x] Rerun people backfill and read-model refresh against Neon after CDEP
  promotion and cleanup.
- [x] Optimize production promotion writes:
  - roster persistence now uses batched upserts instead of one DB round trip
    per row;
  - people backfill now updates member/person links in batches.
- [x] Rebuild people links and read models after roster cleanup.
- [x] Verify all imported mandate constituency fields are clean:
  `dirty_constituencies = 0` for every imported legislature/chamber.
- [x] Fix impossible imported periods where `ends_on < starts_on`.
- [x] Add Wikipedia election-page roster parsing as secondary evidence for
  cross-checks, not as canonical official data.
- [x] Add `ingest:wikipedia:roster`, `ingest:wikipedia:roster-index`, and
  `ingest:roster:crosscheck`.
- [x] Extend Wikipedia roster parsing across all post-1989 legislatures:
  - 2024 rowspans are normalized so carried county/party cells are not lost;
  - 2016/2020/2024 election-list pages parse as single combined chamber pages;
  - 2008/2012 and 1990-2004 use separate Senate/Deputies legislature pages.
- [x] Add `ingest:wikipedia:roster:all` and
  `ingest:roster:crosscheck:all` for read-only all-legislature verification.
- [x] Use the 2020 Wikipedia election roster to cross-check official CDEP
  Deputies rows; fixed the historical CDEP title parser where names like
  `Benga Tudor - Vlad` were being reduced to `Vlad`.
- [x] Reimport official 2020 CDEP Deputies profiles into Neon after the name
  parser fix, then rerun people backfill and read-model refresh.
- [ ] Inspect the remaining 2020 Deputies cross-check differences:
  Wikipedia has 331 Deputies rows while its own text says 330; one row
  (`Vlad Popescu`) still does not match the official CDEP imported rows; 24
  official rows are likely replacement/term movement rows not present in the
  elected-list page.
- [ ] Add mandate end-date parsing for CDEP profiles so current compositions can
  distinguish active members from people who served earlier in the same
  legislature but no longer hold the mandate.
- [x] Add a provenance-aware Wikipedia fallback import/staging flow for
  historical Senate and missing official rows; official 2024 Senate rows are
  skipped and protected.
- [x] Import Wikipedia fallback Senate rosters for 2020-2024 through
  1990-1992 into Neon, then rerun people backfill and read-model refresh.
- [x] Verify `Compoziții` Senate seat maps use fixed formal seat counts:
  2024: 134, 2020: 136, 2016: 136, 2012: 176, 2008: 137,
  2004: 137, 2000: 140, 1996: 143, 1992: 143, 1990: 119.
- [x] Find/import official historical Senate rosters locally before claiming
  complete bicameral post-1989 roster coverage in production; official CDEP
  profile pages now cover Senate and Deputies in the local Docker database.
- [x] Promote the verified local official Senate/Deputies history import to
  Neon after the duplicated 2024 Senate source-priority decision is settled.
- [ ] Model coalitions/electoral alliances such as `USL`, `ARD`, `PSD+PC`,
  `CDR`, and `DA PNL-PD` separately from parties.

## Composition Active-Date Maps

- [x] Change `Compoziții` maps to use a representative composition date per
  legislature:
  - current legislature uses today;
  - historical legislatures use the earliest date where chamber roster data is
    available, bounded by legislature start.
- [x] Use strict date-active memberships for composition maps; do not fall back
  to a later/future group label when a member has no active group on the
  displayed date.
- [x] Show the exact composition date in the pinned government stage.
- [ ] Add visible data-quality badges when active mandate counts are below or
  above formal seat counts for that date.

## Current Legislature Bill/Vote Reconciliation

- [x] Add a read-only current-legislature audit command:
  `npm run ingest:audit:current-legislature`.
- [x] Audit bills and votes using official identifier/source URL plus
  normalized title/date/chamber/totals fingerprints instead of ID-only checks.
- [x] Report high-signal issues:
  imported discoveries without DB matches, duplicate official bill
  identifiers, duplicate title/date/chamber fingerprints, votes without linked
  bills, generic vote subjects, and non-nominal coverage.
- [ ] Use the audit output to design the next persistence fix:
  cross-chamber bill lifecycle merging and vote-to-bill reconciliation.

## UI Polish + Member Directory Filters

- [x] Add a compact illustrated brand mark: newspaper-style ballot with a hand
  choosing between `DA` and `NU`.
- [x] Update homepage introductory Romanian/English copy.
- [x] Apply the first warm civic palette pass using `#309898`, `#FF9F00`,
  `#F4631E`, and `#CB0404`.
- [x] Replace the member legislature dropdown with period filter buttons under
  the search bar.
- [x] Default `/members` to the current legislature while preserving all-history
  URLs such as old group filters.
- [x] Allow multiple group/party chips to be selected at once in the member
  directory.
- [x] Deduplicate member directory rows by linked person identity where possible
  so multi-legislature politicians do not appear repeatedly in the same result
  list.
- [x] Add a homepage CTA from the parliamentary-groups explainer to the member
  directory filters.
- [ ] Add a proper parties/groups directory or popover with legislature filters.
- [ ] Add member ranking panels once absence, party-movement, and activity data
  are complete enough to avoid misleading users.

## Official Asset Pipeline

- [x] Add a Python file-first asset inventory command:
  `npm run pipeline:parliament -- cdep-members asset-inventory`.
- [x] Emit `data/cdep-history/parsed/assets.jsonl` and
  `data/cdep-history/reports/assets.json` from parsed CDEP profile rows.
- [x] Inventory official CDEP member photos and legislature-scoped party/logo
  image URLs without writing to the database.
- [x] Add `stored_assets` metadata table and Drizzle migrations for photos,
  CVs, party logos, source snapshots, reports, and provider-specific storage
  metadata.
- [x] Add `npm run ingest:assets:import` as a dry-run-first TypeScript command
  that reads `assets.jsonl`.
- [x] Add `--force` to `ingest:assets:import` for intentional provider
  migration of already stored legacy rows.
- [x] Group future member-photo Digi paths by legislature:
  `parliament-assets/photos/legislature-YYYY-YYYY/<chamber>/...`.
- [x] Upload assets to Vercel Blob only when `--persist` is passed and
  `BLOB_READ_WRITE_TOKEN` is present.
- [x] Add an FTP/FTPES asset storage provider for local importer runs using
  `ASSET_STORAGE_PROVIDER=ftp`, keeping Postgres as metadata-only storage.
- [x] Add a Digi Storage API asset provider using token auth, mount discovery,
  upload links, and metadata-only `storage_path` persistence.
- [x] Add `/api/assets/[id]` as the web asset gateway for Digi Storage: Digi
  shared links are HTML download pages, so the app streams raw bytes through a
  cached server route instead of exposing shared links in the UI.
- [x] Normalize member photos before Blob upload: future `photo` imports are
  resized to `150x200` WebP by default, keeping official source URLs in DB.
- [x] Add dry-run-first `npm run ingest:assets:delete-stored` for deleting
  oversized/superseded Blob objects and marking rows pending before reimport.
- [x] Store only asset metadata in Postgres: owner entity, source URL, provider,
  storage path, legacy Blob/public URL, dimensions, variant, content hash, MIME
  type, byte size, fetch status, and attempt timestamp.
- [x] Apply the `stored_assets` migration to local Docker Postgres.
- [x] Apply the Digi asset metadata migration to the configured Neon database
  before reimporting assets.
- [x] Reimport all party-logo rows to Digi Storage: `4,306` party-logo metadata
  rows now point to `79` unique Digi paths, about `2.78 MB` of unique files.
- [x] Smoke-check `/api/assets/<id>` for a migrated party logo locally:
  returned `200`, `image/jpeg`, cache headers, content length, and ETag.
- [x] Reimport current-legislature member photos to Digi Storage under
  `parliament-assets/photos/legislature-2024-2028/...`: `471` stored
  `150x200` WebP rows, `1` official 404.
- [x] Smoke-check `/api/assets/<id>` for a migrated current-legislature photo:
  returned `200`, `image/webp`, cache headers, content length, and ETag.
- [x] Reimport the full `2020-2024` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2020-2024/...`: `491`
  stored `150x200` WebP rows, `8` official 404 rows, `0` importer failures.
- [x] Smoke-check a deployed `/api/assets/<id>` URL for a migrated `2020-2024`
  photo: returned `200`, `image/webp`, cache headers, content length, and ETag.
- [x] Reimport the full `2016-2020` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2016-2020/...`: `502`
  stored `150x200` WebP rows, `0` missing, `0` importer failures.
- [x] Smoke-check a deployed `/api/assets/<id>` URL for a migrated `2016-2020`
  photo: returned `200`, `image/webp`, cache headers, content length, and ETag.
- [x] Reimport the full `2012-2016` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2012-2016/...`: `596`
  stored `150x200` WebP rows, `0` missing, `0` importer failures. One binary
  path is intentionally reused because CDEP has the same official photo URL for
  two Ovidiu Ioan Silaghi rows.
- [x] Reimport the full `2008-2012` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2008-2012/...`: `476`
  stored `150x200` WebP rows, `0` missing, `0` importer failures.
- [x] Smoke-check deployed `/api/assets/<id>` URLs for migrated `2012-2016` and
  `2008-2012` photos: both returned `200`, `image/webp`, cache headers,
  content length, and ETag.
- [x] Reimport the full `2004-2008` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2004-2008/...`: `541`
  stored `150x200` WebP rows, `0` missing, `0` importer failures.
- [x] Reimport the full `2000-2004` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-2000-2004/...`: `546`
  stored `150x200` WebP rows, `0` missing, `0` importer failures.
- [x] Smoke-check deployed `/api/assets/<id>` URLs for migrated `2004-2008` and
  `2000-2004` photos: both returned `200`, `image/webp`, cache headers,
  content length, and ETag.
- [x] Reimport the full `1996-2000` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-1996-2000/...`: `509`
  stored `150x200` WebP rows, `0` missing, `0` importer failures. One binary
  path is reused because CDEP has the same official URL for two rows
  (`gheorghm.jpg`).
- [x] Reimport the full `1992-1996` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-1992-1996/...`: `460`
  stored `150x200` WebP rows, `0` missing, `0` importer failures.
- [x] Reimport the full `1990-1992` legislature member-photo inventory to Digi
  Storage under `parliament-assets/photos/legislature-1990-1992/...`: `318`
  stored `150x200` WebP rows, `0` missing, `0` importer failures. One binary
  path is reused because CDEP has the same official URL for two rows
  (`stoica.jpg`).
- [x] Smoke-check deployed encoded `/api/assets/<id>` URLs for migrated
  `1996-2000`, `1992-1996`, and `1990-1992` photos: returned `200`,
  `image/webp`, cache headers, content length, and ETag.
- [ ] Rerun the Digi asset importer against a very small CV batch, then inspect
  `/api/assets/<id>` for one CV.
- [x] Wire stored member photos/logos into member profile data through the app
  asset resolver; missing assets now fall back to placeholders instead of live
  CDEP image URLs.
- [x] Add a Transfermarkt-style member career strip showing party/group periods
  under the profile header.
- [x] Add political formation events as a separate curated layer for member
  timelines, starting with USL, ACL, PLR, ALDE, and the PDL-to-PNL merger.
- [x] Use formation events to split/annotate overlapping imported party rows
  without deleting the underlying official mandate history.
- [ ] Wire CV assets into the profile once fresh CDEP crawls expose CV links and
  the Blob importer stores at least one successful CV row.

## Political Formation Events

- [x] Add `political_formation_events` and
  `political_formation_event_entities` tables.
- [x] Add `npm run ingest:political-formations:seed` to upsert curated
  formation events.
- [x] Render formation events as dated markers on member career timelines.
- [x] Add `npm run ingest:political-entities:candidates` to generate the full
  party/group/formation review backlog from imported DB labels.
- [x] Expand the curated event file with first source-reviewed historical
  events: PNL founding/re-establishment, CDR, PDSR/PSD, USD, DA PNL-PD,
  PD/PLD to PDL, PP-DD to UNPR, and USR PLUS.
- [x] Continue source review and seed exact-date events for FSN, UDMR, PRM,
  PC/PUR, PUNR absorption, ARD, PMP, PSD-UNPR-PC/ALDE, PRO România, AUR, and
  POT.
- [x] Add UNPR's 1 May 2010 congress/leadership milestone from Romanian
  Wikipedia as the first exact public party date.
- [x] Add Romanian-source refinement events for FSN becoming a party,
  PSD+PC protocol signing, ApR absorption into PNL, PIN absorption into UNPR,
  ALDE absorption into PNL, and S.O.S. România founding.
- [x] Add a file-first Tribunalul București registry pipeline for fetching and
  parsing party/alliance/association index pages into JSONL.
- [x] Run the Tribunal index fetch/parse locally:
  `382` parties, `10` alliances, `2` other associations.
- [x] Add Tribunal PDF download/extraction commands that keep raw PDFs under
  ignored local pipeline data and emit parsed JSONL metadata.
- [x] Run full Tribunal PDF pass locally, parse all `394` PDFs, and delete
  raw PDF files after extraction.
- [x] Add file-only Tribunal-to-app entity matcher with confidence levels and
  manual-review files.
- [x] Review safe Tribunal matches and promote `18` canonical party/formation
  source links into curated source files.
- [x] Promote a second manually reviewed Tribunal source batch for DA PNL-PD,
  ACD, USL, USR PLUS, PLD, PP-DD, and USR.
- [x] Add ACD as an official Tribunal-backed formation event for PNL/PC member
  timelines.
- [x] Document fragile CDEP access method and hotspot-safe crawl commands in
  `docs/cdep-access.md`.
- [x] Show approved Tribunal source links on party pages.
- [x] Deduplicate identical member career timeline segments.
- [x] Move the broader curated government-party alignment batch into a
  dedicated ingest module.
- [x] Add a human-review unresolved entity shortlist for labels that should
  not become parties/formations automatically.
- [x] Start revamping party pages around historical timeline events and
  government participation panels.
- [x] Refine dated government alignment periods for coalition changes:
  Cîțu/USR PLUS, Dăncilă/ALDE, Ponta II/III, Cioloș support, and
  minorities support in the current Bolojan skeleton.
- [x] Add reviewed high-impact party root events for PNȚCD, FDSN, PD, PUNR,
  PSM, PP-DD, USR, and PLUS so party/member timelines have cleaner
  post-1989 continuity markers.
- [x] Add the next reviewed early-1990s entity batch for MER, PER, PDAR, and
  the PAC absorption into PNL.
- [x] Add curated-event integrity tests for duplicate ids, duplicate relation
  ids, high-impact event coverage, and alliance-as-formation modeling.
- [x] Add government/support/opposition context to member career timeline
  segments, derived from curated government-party alignments.
- [x] Add government-context panels to vote and bill detail pages so imported
  items can be read against the active cabinet and curated coalition/support
  data for that date.
- [x] Add a protected `revalidateOnly=1` cron mode so production public-read
  caches can be flushed after data/code deploys without running scrapers.
- [x] Fix annotated composition/member UX issues: newest-first legislature
  event cards, explicit government/support/opposition borders on composition
  seat maps, and SQL-backed member ranking filters for absences, seniority,
  and party/group switches.
- [x] Improve member timeline semantics with merged same-party career periods,
  visible legislature boundary markers, government/support/opposition context
  bands, and clearer merger/alliance explanation notes.
- [x] Add party-page next layer: identity facts separated from broader
  political timeline, per-legislature chamber summaries with starting-seat
  estimates, imported-member counts, period logos, and sample members.
- [x] Add Romanian Wikipedia party-history candidate generator:
  file-first fetch/parse commands, review-only JSONL rows, and a manual review
  markdown report. Output is not imported automatically.
- [x] Sync current curated government alignments and political formation events
  to Neon, then refresh production read models.
- [x] Enrich vote and bill detail pages with political context:
  active government, group/sponsor alignment at the item date, and relevant
  prior party/alliance events.
- [x] Promote a third conservative Tribunal source batch for PUR/PC, PUNR,
  and PIN, keeping Tribunal dates as legal registry metadata.
- [x] Link party labels/logos on member pages to party profile pages where the
  party identity is known.
- [x] Apply immediate member-profile UI fixes: remove public `database` badges,
  restyle selected legislature buttons with the site palette, make vote/proposal
  lists internally scrollable, and resolve mismatched party logos after
  formation-event normalization.
- [x] Upgrade the member career timeline with clearer legislature boundary
  labels, hover/focus event detail cards, and party-aware logo fallback for
  normalized historical segments.
- [x] Make CDEP asset import resumable by unique official URL offset, with
  progress logging and optional insecure TLS mode for CDEP certificate issues.
- [x] Back up historical party-logo assets to Blob/`stored_assets` in cautious
  unique-URL batches; all `4,306` logo references were covered with no failed
  rows in the completed batch runs.
- [x] Complete current-legislature photo backup: all `472` current member photo
  references processed, with `471` stored and `1` official 404 recorded for
  manual review. Retried the missing official CDEP image on 2026-05-25; it
  still returned `404`.
- [x] Add a file-first `latest-historical-photos` selector for the second photo
  phase: one latest known CDEP photo per historical-only person.
- [x] Import the `2020-2024` historical-only latest-photo batch from
  `data/cdep-history/parsed/latest-historical-photos.jsonl`: `300` selected,
  `295` stored, `5` official 404 rows preserved for review.
- [x] Import the `2016-2020` historical-only latest-photo batch:
  `310` selected and `310` stored, with no official 404 rows.
- [x] Import the `2012-2016` historical-only latest-photo batch:
  `388` selected and `388` stored, with no official 404 rows.
- [x] Import the `2008-2012` historical-only latest-photo batch:
  `223` selected and `223` stored, with no official 404 rows.
- [x] Import the `2004-2008` historical-only latest-photo batch:
  `325` selected and `325` stored, with no official 404 rows.
- [ ] Resume the `2000-2004` historical-only latest-photo batch after the
  Vercel Blob store suspension is resolved: `337` selected; `65` stored before
  the suspension; `35` failed with `Vercel Blob: This store has been suspended`;
  resume at offset `50` so stored rows skip and failed rows retry.
- [x] Delete oversized existing photo blobs: `224` stored `photo` rows over
  `100000` bytes were removed from Blob and marked for reimport.
- [ ] Reimport the deleted oversized photos after Vercel Blob writes are
  unsuspended. The first optimized `2024-2028` retry resized photos correctly
  but failed to upload because Blob still returned
  `Vercel Blob: This store has been suspended`.
- [x] Add the current composition preview to the landing page under search,
  with compact Chamber/Senate maps, current PM, and active-government summary.
- [x] Replace text-only locale switch labels with Romania/UK flag buttons while
  preserving the current route and query params.
- [x] Make mobile `Compoziții` chamber maps visible through compact previews and
  a tap-to-open zoom modal that reuses the interactive seat map.
- [x] Fix Deputies vote discovery so CDEP nominal rows inherit the calendar date
  from `evot2015.data?dat=YYYYMMDD`, then import all discovered Deputies votes
  from 13 May 2026 through 25 May 2026.
- [ ] Continue `data/cdep-history/parsed/latest-historical-photos.jsonl` in
  small batches for older historical-only members, next by resuming the
  `2000-2004` latest-photo slice once Blob writes work again.
- [ ] Consolidate Git/deploy workflow around the `ncmihai/cumvoteaza` repo so
  Vercel deployment no longer depends on remembering to push both `cumsevoteaza`
  and `cumvoteaza` remotes.
- [ ] Review remaining Tribunal `needs_review` matches manually before
  promoting them.
- [ ] Add importer persistence for curated Tribunal source links if/when we want
  them queryable from Postgres instead of file-backed UI data.
- [ ] Continue source review for UNPR legal registration date at Tribunalul
  București, PSD+PC dissolution date, ApR founding date, and
  minority-organization modeling.
- [ ] Add an audit page or report that lists member rows affected by curated
  formation-event normalization.
- [x] Design party profile pages for legal parties, not alliances:
  post-1989 timeline first, original founding/re-establishment context,
  legislature vote/activity summaries, alliance/merger events, and dissolved
  state where applicable.

## Active Milestone — Local Data Cleanup + Hybrid Storage Planning

- [x] Add `npm run data:clean` as a dry-run-first local cleanup command.
- [x] Document the `data/` directory contract: curated files stay in git,
  generated crawl/import/snapshot artifacts remain local and rebuildable.
- [x] Remove safe system junk only: `.DS_Store`, Python bytecode, and
  `__pycache__` files. Deleted `7` files / `233470` bytes.
- [ ] Decide which generated local artifacts to archive or prune later:
  CDEP raw crawl files, importer JSON reports, raw HTML snapshots, and parsed
  JSONL outputs.
- [ ] Brainstorm the hybrid plan for bill texts and heavy documents: Neon for
  metadata/searchable facts, Digi Storage for full text/PDF/source artifacts,
  and cached read models for public pages.

## Active Milestone — Efficient Bill Dossiers

- [x] Add bill dossier schema for structured procedure steps, document kinds,
  document text status, extracted text chunks, and bill decision chamber.
- [x] Upgrade the CDEP bill parser to extract `upl_pck2015.proiect` procedure
  rows, committee names, document links, document kinds, initiator, status, and
  decision chamber while keeping legacy `bill_events` populated.
- [x] Add `ingest:bill:deputies`, `ingest:bill:senate`, and
  `ingest:bill-text` commands. Bill text fetches official PDFs temporarily,
  extracts text when possible, stores only cleaned `.txt` in Digi, and keeps
  PDF links pointed at official sources.
- [x] Add `/api/bill-documents/[id]/text` for cached, lazy loading of extracted
  text without exposing Digi credentials or temporary links.
- [x] Update bill pages into dossier pages: identifiers, status, decision
  chamber, government context, procedure timeline, committees, document list,
  and optional extracted text expansion.
- [x] Add a compact linked-bill dossier preview on vote detail pages.
- [x] Add CDEP `PL-x 158/2026` parser fixture coverage and bill text helper
  tests.
- [x] Apply the generated bill-dossier migrations to the configured Neon
  database before running the new import commands against real bill pages.
- [x] Import a real CDEP bill page:
  `https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=22820`, then
  run proposal text extraction for the main document as the first live check.
  Result: `bill-pl-x-158-2026`, `15` procedure steps, `12` documents,
  proposal text stored as `asset-bill-text-doc-bill-pl-x-158-2026-12`.
- [x] Smoke-check the local bill dossier page for `bill-pl-x-158-2026`.
  Verified structured procedure rows, official documents, government context,
  and lazy extracted text loading from `/api/bill-documents/[id]/text`.
- [x] Continue the first CDEP dossier batch from discovered 2026 Deputies bills.
  Result: `424` discovered from the 2026 yearly list, `5` imported in the first
  capped batch (`PL-x 424/2026` through `PL-x 420/2026`), and read models
  refreshed.
- [x] Inspect the first batch for parser failures. No failed rows appeared; the
  parser handled a Senate-first dedupe case where `PL-x 420/2026` mapped to the
  existing `bill-l269-2026` row with both Senate and Deputies identifiers.
- [x] Upgrade vote detail pages with a richer compact bill dossier preview:
  document count/kinds, initiator summary, decision chamber, and latest
  procedure steps before the vote.
- [x] Add an expandable full bill dossier panel to vote detail pages so a
  linked vote can show the complete procedure timeline, official document
  links, and lazy extracted text without opening the bill page first.
- [ ] Continue CDEP dossier imports in small batches, then extract proposal
  text only for selected/high-value bills.
- [x] Refresh CDEP Deputies 2026 discovery and verify the yearly project list
  remains fully imported: official list reported `424` projects and no
  importable pending 2026 Deputies bill rows remained.
- [x] Refresh CDEP Deputies May 2026 vote discovery and import the current
  pending vote batch. Result: `113` May vote discoveries observed, `21`
  vote details imported, `0` partial, `0` failed, `3` skipped by retry guard,
  read models refreshed.
- [x] Refresh older Deputies project lists and import remaining small pending
  bill batches. Results: 2025 list `592` projects with `3` pending bills
  imported; 2024 list `684` projects with `2` pending bills imported.
- [ ] Fix current-legislature reconciliation warnings before larger backfills:
  imported discoveries without high-confidence DB matches, duplicate
  Senate/Deputies lifecycle identifiers, weak amendment vote titles, and
  procedural votes without linked bills.
- [x] Add `ingest:audit:dossier-reconciliation`, an actionable audit report
  that lists missing dossier timelines, duplicate identifier groups,
  unmatched imported discoveries, unlinked votes, and weak amendment vote
  titles with suggested review actions.
- [x] Add guarded `ingest:bill-dossiers:refresh` command for existing CDEP
  bill rows missing procedure steps. It refetches official dossier pages in
  capped batches and skips rows if the parsed canonical bill ID does not match
  the existing DB row.
- [x] Run two guarded 2026 CDEP dossier refresh batches. Result: `20` existing
  bill rows refreshed, `0` skipped, `0` failed; missing Deputies procedure-step
  rows dropped from `1148` to `1129`.
- [x] Run the next capped CDEP dossier batch for 2026. Result: `25`
  additional Deputies bill discoveries imported, `0` partial, `0` failed,
  read models refreshed to `2251` bill summaries and `8361` search rows.
- [x] Improve CDEP document classification from filename conventions so
  generic labels like `PDF` still classify `pl*.pdf` as proposals, `rp*.pdf`
  as reports, `av*.pdf` as opinions, `_cd_` as adopted forms, and `_stema`
  as promulgation forms.
- [x] Reimport high-value dossier pages `PL-x 335/2026`, `PL-x 42/2026`, and
  `PL-x 56/2026` after the classifier fix.
- [x] Extract selected proposal text only where useful. Result:
  `PL-x 56/2026` stored `asset-bill-text-doc-bill-pl-x-56-2026-14` (`5566`
  bytes, `3` chunks); `PL-x 335/2026` was marked `unsupported` because the
  official PDF did not yield useful text.
- [x] Confirm 2026 Deputies bill discoveries are fully imported under the
  current filter: `440` imported, `0` pending/failed.
- [x] Add `ingest:bill-documents:classify` to repair existing document rows
  without refetching CDEP pages. Applied it to 2026 rows: `4555` scanned,
  `1111` updated on first pass, then `8` corrected after tightening `_cd`
  adopted-form handling.
- [x] Attempt selected vote-linked proposal text extraction after repair.
  `PL-x 49/2026`, `PL-x 30/2026`, `PL-x 27/2026`, and `PL-x 22/2026`
  were marked `unsupported` because their official archive PDFs did not yield
  useful text.
- [x] Add `ingest:bill-text:batch` for capped proposal-text extraction runs.
  It can select by year/document kind, retry failed/missing rows, and
  explicitly retry `unsupported` rows after OCR improvements with
  `--include-unsupported`.
- [x] Add a local macOS Vision OCR fallback for scanned CDEP proposal PDFs.
  The renderer was corrected after testing `PL-x 400/2026`; OCR now extracts
  readable Romanian text when `pypdf` cannot read embedded text.
- [x] Run the first OCR-backed 2026 proposal text batches. Result: `26`
  additional proposal documents stored as derived text assets/chunks in Digi
  and Neon, including the previously unsupported `PL-x 400/2026` sample.
- [x] Complete the remaining 2026 proposal-text queue in capped batches.
  Result: `209` more proposal documents stored (`50 + 50 + 50 + 50 + 9`),
  then the final check returned `0` remaining pending/failed/missing/
  unsupported 2026 proposal-text candidates.
- [x] Fix member activity read-model counting before using member/party stats
  as product signals. Vote and proposal counts now only count rows that fall
  inside the mandate legislature/chamber window.
- [x] Wrap read-model refresh in a transaction so rebuild failures roll back
  instead of leaving summary/search tables partially refreshed.
- [x] Add `ingest:audit:bill-text-quality` for 2026 OCR review before moving
  to older years. The audit flags missing chunks, very short text, weak legal
  vocabulary, noisy characters, and repeated-line artifacts.
- [x] Run the bill-text quality audit over the current full 2026 proposal set.
  Result: `237` scanned, `4` suspicious (`3` very short, `1` repeated-line).
- [x] Tighten bill/vote dossier text UI copy so stored proposal text is labeled
  as automatically extracted and users are directed back to the official PDF
  for citation.
- [x] Add a public `/ro/data-health` repair-queue entrypoint backed by
  deterministic health issues and token-gated review state. The first queues
  cover suspicious OCR rows, unlinked votes, duplicate identifiers, missing
  procedure timelines, and weak vote titles; review actions only upsert
  `data_health_reviews`.
- [x] Add source-confidence badges, verified extracted-text search, and
  deterministic section diff scaffolding on bill/vote dossier surfaces.
- [x] Promote bill text parsing into a shared deterministic parser with typed
  sections, parser quality, and warnings for missing headings,
  amendment-only documents, huge sections, duplicate headings, and many short
  sections.
- [x] Add a `Structură text` data-health queue from parser warnings, plus
  shared review mode controls and status filters on `/ro/data-health`.
- [x] Make bill/vote document confidence badges use live OCR/parser health
  state, so suspicious stored text appears as `needs_review` unless the
  document has accepted/reviewed health state.
- [ ] Manually inspect and repair or review the four suspicious 2026
  proposal-text rows now surfaced in `/ro/data-health` before any broad 2025
  extraction.
- [ ] Run the `0015_data_health_reviews` migration in the production Neon
  project before using token-gated review controls outside local/dev.
- [ ] Tune the first data-health query set if the live dataset grows further:
  current local smoke check loads `/ro/data-health` in roughly 4-5 seconds
  after query simplification.
- [x] Add guarded repair CLI entrypoints for the data-health queues:
  `repair:link-vote-bill`, `repair:refresh-missing-procedure`, and
  read-only `repair:duplicate-bill-plan`. Vote linking is dry-run by default,
  blocks weak matches unless explicitly reviewed, and marks the data-health
  issue fixed only when persisted.
- [x] Add read-only Digi Storage visibility to the local workbench: connector
  status, sanitized Digi/FTP config, asset inventory, local previews, per-row
  verification, and generated asset audit reports.
- [x] Add local `DIGI_STORAGE_EMAIL` / `DIGI_STORAGE_PASSWORD` to the
  workbench or root env before using preview/verification on this machine.
- [x] Run a real Digi preview/verification pass for sample member photos,
  party logos, and bill text artifacts once local Digi credentials are set.
- [x] Rebuild the local workbench wiki from Neon after credentials were added:
  current local wiki has `31596` records.
- [x] Add a SQLite FTS index for the generated workbench wiki, keeping JSONL
  files as rebuildable artifacts and fallback search input.
- [x] Add wiki search filters for party, member, bill, vote, document, group,
  government, and data-health records in the API, CLI, and React UI.
- [x] Add clickable local wiki references between bills/documents/votes and
  parties/groups, with a two-pane entity-detail browser in the workbench UI.
- [x] Convert normal workbench startup to standalone mode: FastAPI serves the
  built React UI at `http://127.0.0.1:8787`; Vite is dev-only.
- [x] Add `workbench:build-ui`, `workbench:restart`, and
  `workbench:doctor`.
- [x] Add routed local entity pages for bills, members, parties, votes,
  documents, groups, and governments.
- [x] Add richer workbench entity pages for bills/members/parties: bill
  dossier sections, member mandate/history sections, party group/member/
  government/formation sections, assets, health, suggestions, and references.
- [x] Add local-only proposal/note creation and review controls. Proposals are
  stored under ignored `data/parliament-workbench/proposals/`, not Neon.
- [x] Add guarded command-preview/apply scaffolding. Write mode is disabled by
  default and requires `WORKBENCH_ENABLE_WRITES=1` plus
  `WORKBENCH_WRITE_TOKEN`; no free-form SQL is exposed.
- [x] Expand the local wiki SQLite index into graph tables for entities,
  aliases, relations, sources, assets, health issues, and proposals.
- [x] Make wiki search result cards directly navigable with title links,
  visible `Open page` actions, and URL-addressable filtered searches such as
  `/?tab=wiki&type=party&q=psd`.
- [x] Make deterministic entity mentions clickable across the local workbench:
  section row titles, name-like fields with paired IDs, reference chips, and
  asset entity labels now route to `/entities/...`.
- [x] Add a persistent local SQLite workbench backbone for operational state:
  source claims/conflicts, patches/events, model runs, taxonomy labels,
  Institution Atlas records, and publish batches.
- [x] Expand the workbench SQLite backbone with durable workflow jobs, job
  steps, job logs, local proposal mirrors, and source-ledger conflict storage.
- [x] Add an Institution Atlas module with official-source seeded entities,
  procedure nodes/transitions, citations, and grounded Q&A for Parliament,
  Government/ministries, President, CCR, Monitorul Oficial, and advisory
  actors.
- [x] Add first temporal Institution Atlas records for presidential/cabinet
  holder rows, procedure rule events, and observed bill examples sourced from
  existing procedure steps.
- [x] Add a current Import Cockpit that previews the guarded latest-data
  pipeline and stores preview jobs without executing canonical writes.
- [x] Add Import Cockpit step/log storage and UI rendering, plus explicit
  dry-run current-sync execution from the standalone workbench.
- [x] Add the first local Source Ledger surface for source claims, conflict
  detection, and clickable entity references. Superseded in the current UI by
  the unified Review Center.
- [x] Add a local Publish Gate preview for accepted proposals, strict health
  blockers, and local batch drafts.
- [x] Revamp the standalone workbench shell into grouped navigation:
  Operate, Review, Explore, and Publish.
- [x] Add a global command/search bar with current workspace context, quick
  actions, status chips, and prioritized local entity jump search.
- [x] Add a dedicated Activity screen for jobs, recorded steps, logs, retry
  scaffolding, and local cancel marking.
- [x] Reduce first-pass UI bloat with denser panels, compact tables, sticky
  shell controls, and responsive layout behavior.
- [x] Refactor entity pages into a main workspace plus right-side inspector
  tabs for proposals, health, sources, references, assets, and model output.
- [x] Add entity overview metrics for section count, row count, source count,
  asset count, health issue count, and local proposal count.
- [x] Expand entity references further to include presidents, CCR decisions,
  reexamination/promulgation signals, amendment links, and committee-level
  bill relationships. First pass links deterministic procedure signals to
  Atlas institution pages for President/promulgation, CCR, and Monitorul
  Oficial; committee-level bill relationships still need canonical committee
  entities before they can be fully routable.
- [x] Continue the entity-page revamp with editable inspector forms for
  structured patches, source claims, text annotations, and asset issues.
- [x] Add conflict-aware source-claim review on entity pages: show conflicting
  local claims beside canonical values and let accepted claims become publish
  batch candidates.
- [x] Add entity-page text correction surfaces for documents/OCR excerpts with
  side-by-side raw text, corrected text, evidence quote, and command preview.
- [x] Add inspector filtering/search inside large local proposal, source,
  reference, and asset lists so the right review item stays easy to find.
- [x] Add a real Jobs detail route with shareable URLs and stage-level retry
  controls.
- [ ] Promote Institution Atlas temporal records beyond the first seed:
  reviewed cabinets, ministries by date, CCR decisions, Monitorul Oficial
  publication records, and richer source citations.
- [ ] Finish guarded import execution from the Import Cockpit: running-process
  cancellation, retry-from-failed-step, persisted mode with write token, and
  durable run reports before enabling canonical writes.
- [x] Harden Import Cockpit dry-runs so discovery/import-pending commands use
  corrected flags (`--years`, `--discovery-limit`, `--max-imports`), include
  `--dry-run` where needed, skip read-model refreshes, and are rejected before
  execution if any dry-run stage can write canonical data.
- [ ] Design the reviewed Neon schema for Batch 9 public promotion:
  reviewed bill/document citation snapshots, reviewed text-correction
  metadata, reviewed dossier completeness/source-confidence snapshots,
  reviewed article diffs, and later public evidence-profile snapshots.
- [x] Add better per-section pagination/filtering on very large party/member
  pages instead of only showing the first 40 records.
- [x] Add local Batch 5 document intelligence in the workbench: parser-backed
  document sections, citation candidates, local text correction versions, and
  bill document diffs without storing official PDFs.
- [x] Add local Batch 6 Model Lab: prompt presets, advanced controls,
  model-run storage, gold-set evaluation, agent task packs, and
  suggestion-to-proposal conversion guarded by evidence.
- [x] Add local Batch 7 taxonomy and analytics: CAP/RO taxonomy seed,
  evidence-gated topic/stance labels, local evidence profiles, and explicit
  insufficient-reviewed-data states.
- [x] Add local Batch 8 historical year-batch runner scaffolding with capped
  previews/dry-runs, context checks, and OCR quarantine metadata. No persisted
  historical imports are enabled from this runner.
- [x] Add preview-only Migrate / Export bridge for accepted local proposals,
  text corrections, source claims, citations, taxonomy labels, blockers, and
  JSONL/SQL-preview/report files under ignored workbench data.
- [ ] Create canonical committee entities before making committee names fully
  navigable in workbench entity references.
- [x] Add reviewed local citation/label/correction status transitions beyond
  create-only forms, so accepted export batches can be curated fully inside
  the workbench.
- [x] Add a unified local Review Center for citations, text corrections,
  taxonomy labels, model suggestions, and export blockers with filters,
  evidence/source validation, proposal preview/conversion, and exact Migrate /
  Export blocker reporting.
- [x] Merge source claims into the unified Review Center and remove the old
  Source Ledger review path from the top-level UI/entity inspector acceptance
  flow.
- [x] Tighten factual proposal/source-claim evidence rules so reviewed,
  accepted, and applied factual records require both an evidence quote and a
  source reference.
- [x] Add stronger tracked Model Lab gold-set seeds for OCR quality, citation
  review, taxonomy labeling, procedure gaps, and bill diffs, plus richer local
  evaluation metrics for schema validity, evidence matching, expected/forbidden
  suggestions, and false-positive/false-negative counts.
- [x] Add Model Lab matched-example metrics and `no_matched_examples` status so
  gold-set evaluations do not display misleading zero-quality results when no
  seed matches a run.
- [x] Fold Historical Imports into Import Cockpit, remove the dead Bill Audit
  component, and reorganize the workbench sidebar around Operate, Review,
  Knowledge, and Publish.
- [ ] Add explicit guarded execution for accepted repair proposals by calling
  the existing repair commands and storing command run reports locally.
- [ ] Keep Batch 9 public promotion separate until local review queues are
  reliable: public app should later read reviewed Neon snapshots only, starting
  with bill/document citations, text-correction metadata, source confidence,
  reviewed diffs, and dossier completeness.
- [ ] Use the completed 2026 text set as the guideline for UI/relevance tuning,
  then continue selected 2025/2024 bills linked to visible vote pages.
