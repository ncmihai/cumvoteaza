# CumVoteaza — Plan

**This is the single source of truth for what we are doing and why.**
Decisions and open questions live in [DECISIONS.md](DECISIONS.md). Everything in
[archive/](archive/) is history: useful evidence, never instructions.

Last updated: 2026-10-04 · `main` @ `0e29812` + docs

---

## Vision

A factual, source-linked record of Romania's legislative and executive power:
presidents, prime ministers, cabinets, ministers, MPs, ambassadors, votes and
bills. Anyone can look up a politician and see what they actually did, with a
link to the official source for every fact. The data is kept fresh by an
unattended updater, not by hand. Analysis (for example a vote-based political
compass) comes later and is built only on data that has already earned trust.

## Principles

1. **Official sources are the source of truth.** Every public fact links to where it came from.
2. **Unknown stays unknown.** Missing ≠ zero ≠ absent ≠ ended. When we don't know, the UI says so.
3. **Everything political is temporal.** Affiliations, roles, mandates and offices have start and end dates.
4. **No AI-generated facts on the public site.** Models may *suggest*; a human approves. Facts come from official sources.
5. **Simple beats clever.** A hand-curated file with source URLs beats a pipeline until the volume genuinely needs one.
6. **Fix trust before features.** No new feature work while a P1 data-trust defect is open.
7. **Done means done.** Tests green, merged, deployed and checked on the live site. "Implemented internally, validation pending" means *not done*.

## Scope

| Horizon | What |
| --- | --- |
| **Now** | **Fix roadmap** (below): make every claim the site makes true, then keep it true with an unattended updater. |
| **Next** | **Feature roadmap** (written when the fix roadmap is done): complete the **2024–2028 legislature**: fresh votes in both chambers, MP profiles and affiliations, cabinets of this legislature with full reshuffle history, presidents (including the 2025 interim), ambassadors. |
| **Later** | History backfill (1990–2024), party and legislature wiki, political compass (local model on the BC250 suggests, human labels), rebuilding the cockpit if it is still needed. |
| **Not doing** | Fine-tuning models, paid AI APIs (Gemini explanations), the parked Codex "3B/3C" evidence and political-state pipelines (unless the audit says otherwise), multi-database release-preview machinery. |

---

## Verified state — 2026-10-04

Read-only checks against production and the live site, after the identity, bill, committee and joint-sitting repairs.

| Area | State |
| --- | --- |
| Site | <https://cumvoteaza.vercel.app> (Vercel Hobby), friends testing. Pages are fast when cached (under 1 s); the first hit after a cache purge takes 3–5 s. |
| Code | Typecheck, tests (41 web, 121 ingest, 21 model, Python probe) and build green; CI green. 33 migrations. |
| People and identity | 3,374 people, 5,289 members = 5,289 mandates. 33 of 37 name-collision rows decided; 4 open (rows 1, 2, 8, 11). **0 people have a birth date.** |
| Integrity | All blocking checks pass; 2 warnings: `vote_nominal_totals_mismatch` (12: 9 senat.ro list gaps, 3 joint votes missing deputy idm 336), `final_vote_without_bill` (1). |
| Votes, 2024–2028 | 1,069 votes (Senate 419, Chamber 644, joint 6) to 23/30 Sept. **Incomplete: we hold about 23% of the official Chamber vote IDs (34636–37401 → 650 held; first estimate); Senate months range from 0 to 93 votes; no joint sitting before May 2026 (the December 2024 investiture is missing).** |
| Votes, earlier | 2020–2024: 133 votes. Earlier legislatures: 1. The site must not imply otherwise. |
| Seats | 330 of 331 deputies and 134 of 134 senators active. Rosters were last crawled in May: deputy idm 336 (Badea) is missing, replacements and exits since May are unknown. |
| Import backlog | 1,690 pending vote discoveries from the May crawl (1,599 undated), 3 failed, 14 skipped. Nothing imports them automatically. |
| Database | Neon `cumsevoteaza`, 321 MB of the 1 GB branch limit. **`individual_votes` is 175 MB for 250,000 rows (about 700 bytes a row: a 90-character text key, a 56 MB primary key and a 42 MB second unique index).** Filling the vote gap as it is would break the limit. |
| Backups | **None scheduled.** Neon history is 6 hours, no snapshots. One manual branch (`backup-before-identity-repair-2026-10-03`) and a rehearsal branch (`rehearsal-d22-bill-merge`, 360 MB, no longer needed). Local `data/cdep-history` (157 MB) is the only copy of the identity evidence. |
| Cabinets, presidents, ambassadors | Cabinets of 2024–2028 only; no president or ambassador tables (feature roadmap). |
| Local data | `data/` 252 MB after the cockpit cleanup. Digi Storage credentials live only in `tools/parliament-workbench/.env`. |

### Defects

Severity: **P1** breaks trust in the data, **P2** is wrong or broken, **P3** is polish.

**Resolved** (details in git history and [audit-2026-10.md](audit-2026-10.md)): D1, D10–D18 (identity, group history, ghost voters, importer conflicts), D19–D23 (committee dates, Senate list gap, joint sittings, duplicate bills, page language), A1–A8 (vote outcomes with law type, titles, wide screens, profile header, wording), D3–D8 (re-verified fixed in code), D9 (password gate, unused), data-health page removed.

| ID | Sev | Defect | Fixed by |
| --- | --- | --- | --- |
| D24 | P1 | **Votes are incomplete and the site does not say so**: about 23% of official Chamber vote IDs for 2024–2028, uneven Senate coverage, no early joint sittings (investiture of 23 Dec 2024), 133 votes for 2020–2024. | F1, F3, F4 |
| D25 | P1 | **No backups.** 6-hour history, no snapshots; the identity evidence exists only on one laptop. | F0 |
| D26 | P1 | **Vote storage is about 12 times larger than needed**; completeness does not fit in the database as it is. | F2 |
| D27 | P2 | **Rosters are stale** (last crawl in May): new members (idm 336), replacements and mandate ends since then are missing or wrong. | F3 |
| D28 | P2 | 1,690 pending discoveries, 3 failed and 14 skipped have never been triaged. | F3 |
| D29 | P2 | The methodology and sources page disappeared with the data-health page; nothing explains coverage, sources or how outcomes are computed. | F4 |
| D30 | P2 | Local `.env` and the importers write straight to production; one mistake (like the `crawl` that overwrote `profiles.jsonl`) has no safety net. | F0 |
| D31 | P2 | Browser end-to-end tests are stale (old D6); no check covers the language switch, redirects, 404s or the joint chart. | F4 |
| D32 | P3 | 127 votes have no linked bill (1 is a final vote); 2,042 of 2,115 bills have no law type yet; `/parties` and `/governments` return 404. | F3, F4 |
| D33 | P3 | Cache purge makes the next visit slow (3–5 s) because every tag is purged at once. | F4 |
| D34 | P2 | **Cabinets are right up to the caretaker phase but miss the formation phase and every vote result.** The government page already shows the dismissal (5 May 2026), the caretaker status and the April interim ministers. Missing: the three designations since the dismissal (Tomac, Veștea, Mureșan) with decree numbers, the two failed investiture votes (22 June: 189 for; 30 Sept: 182 for; 233 needed) and the investiture and censure results of this legislature. | F3 |
| D38 | P2 | **Ministers and prime ministers who are MPs exist as two people**: 10 identified (Ciolacu, Ponta, Predoiu, Stolojan, Ciucă, Fifor, Tăriceanu, Grindeanu, Cîțu, Cîmpeanu), so their parliamentary pages lack the government career and their cabinet rows lack the parliamentary one. | F3 |
| D35 | P2 | **Motions, investitures and caretaker periods are not recorded**: 8 censure motions this legislature (one adopted), simple motions, investiture votes. | F3 |
| D36 | P2 | **Bill dossiers are mostly unparsed**: 0 of 1,908 sponsors linked to a member, procedure steps for 57 of 2,115 bills, no law number / promulgation / Monitorul Oficial / Constitutional Court referral, about 60% of the legislature's bills held. | F3 |
| D37 | P2 | **No leadership with dates** (Permanent Bureau, group leaders, chamber presidents); `member_roles` is empty. | F3 |
| D2 | P1 | No unattended updater (data went stale before; caught up by hand). Must run from a Romanian address (cdep.ro blocks others): the BC250. | F5 |

---

## Fix roadmap

Goal: **everything the site claims is true and checkable, and stays true without hand work.** Order matters: protect the data (F0), measure the gap (F1), make room (F2), fill it (F3), explain it (F4), automate it (F5). F4 runs alongside F3. Sizes: S about one session, M two to three, L several.

### F0 — Safe ground (S)
- [x] **Backups.** `data/cdep-history` and `data/curated` are copied to Digi Storage and verified by re-download (`npm run ingest:backup:local-data`); Neon branch `backup-2026-10-04` (no compute); restore test passed (a `dev` branch made from it has identical row counts and clean integrity checks). The Neon plan has no snapshots or schedule (6 h point-in-time window only); the owner chose manual backups: a `backup-YYYY-MM-DD` branch before every production migration or bulk run, and weekly otherwise, keeping the last two. `backup-2026-10-04` must stay while `dev` is its child.
- [x] **Dev branch (D-018).** Neon `dev` branch; `.env` and `apps/web/.env.local` point at it; production credentials only in `.env.production`; the CLI refuses the production host unless run through `npm run prod -- <script>` (banner plus typed confirmation; `packages/db/src/production-guard.ts`, `tools/prod.mjs`). `rehearsal-d22-bill-merge` and `backup-before-identity-repair-2026-10-03` deleted (owner OK, about 680 MB freed). The identity-repair runbook scripts default to `.env` (dev), so the agent can rehearse them freely; production runs need `.env.production` and the owner's own `ALLOW_PRODUCTION=1`.
- [x] Digi Storage credentials are in the root `.env`; `tools/parliament-workbench/` deleted (nothing in the code used it).
- [x] Probe `crawl` no longer overwrites `parsed/*.jsonl`: it merges by key and writes a dated backup first (`tools/cdep-history-probe/tests/test_crawl_safety.py`).
- [x] CI runs `npm test`; `npm run verify` is typecheck, tests and build.
**Exit:** a restore has been tested and nothing local is unique. **Met 2026-10-04 (Sprint 1 done).**

### F1 — Know what we have (M)
Built 2026-10-04 (Sprint 2); the crawl and the numbers are the owner's next step. All commands are offline except the two `:fetch` ones, which save raw official pages under `data/coverage/raw` (included in `ingest:backup:local-data`).
- [~] **Coverage report.** `ingest:votes:coverage:fetch` (plan by default, `--live` to request; CDEP day XML for every sitting day and the Senate "Voturi Plen" days, 2 s apart, resumable, capped) and `ingest:votes:coverage` (official lists against our votes: official / held / missing / % per month and chamber, missing IDs in the JSON). Tested on September 2026: Chamber 65 of 65, joint 3 of 3, **Senate 93 of 107: 14 missing, all on 8 September** (we hold 1 of its 15 votes). **Full-range result (4 Oct 2026, 2024-12-21 to today):** Chamber 642 of 1,180 (54.4%), Senate 419 of 1,244 (33.7%), joint 6 of 729 (0.8%); bills 2024 and 2025: Chamber 99.5%+, Senate 82–84%; 2026: Chamber 70.5%, Senate 65.5%. Coverage is at least 80% only from May 2026; before that mostly 0–45%. 614 of the ~730 joint votes are article and amendment votes of three sittings (5 Feb 2025: 273; 19–20 Mar 2026: 341). All 24 total mismatches are one field, "present, did not vote" on Senate votes imported in May 2026 with an older parser (the live page and today's parser read it correctly): fix by re-importing those 24 (Sprint 5). `ingest:bills:coverage:fetch` and `ingest:bills:coverage` do the same for the yearly bill lists (2026: Chamber 455 of 645 = 70.5%, Senate 426 of 650 = 65.5%); `ingest:members:coverage` compares seats with sitting members (2024–2028: Senate 134 of 134, Chamber 330 of 331).
- [x] **Spot-check pack.** `ingest:spotcheck:pack` writes about 20 records (votes, members, ministers, bills) with our page, the official page and the fields to compare; same seed, same pack. A record without a stored source page is itself reported.
- [x] **Source-vs-stored for votes.** Part of `votes:coverage`: totals (present, for, against, abstentions, did not vote) and dates of every vote we hold against the official list. The Senate list also carries the Senate's own verdict ("Adoptat"/"Respins"), which a later check can compare with the outcome we compute (art. 76).
- [ ] Source-vs-stored for pages other than votes (members, bills): extends the same pattern once the rosters (Sprint 6) and bill dossiers (Sprint 7) are re-parsed.
- [x] Vote scope decided: D-022 (every Chamber and Senate vote; joint votes except per-article amendment votes, which become one summary row per sitting).
**Exit:** a table "official / ours / %" per month and chamber for 2024–2028.

### F2 — Storage diet (M)
- [ ] Measure first (done above), then rehearse on the dev branch: `individual_votes` gets `(member_id, vote_id)` as its primary key and loses the 90-character text id and the redundant indexes; if that is not enough, integer keys. Target: at most 150 bytes a row, so 100% of the current legislature fits under 600 MB. Update every use of `individual_votes.id`.
- [ ] Fallback if the target is missed: Neon paid plan (Q15).
**Exit:** projected size with full 2024–2028 votes is under 600 MB, integrity checks pass on the dev branch.

### F3 — Close the gaps, current legislature first (L, mostly waiting for imports)
- [ ] **Votes:** import every missing vote of 2024–2028 in monthly batches (Chamber, Senate, joint), each batch gated by the integrity checks and the totals check, newest months first. Includes the investiture votes (Ciolacu II, Bolojan), motions of censure and other joint sittings.
- [~] **Cabinets (D34, D35, D38)** — built 2026-10-04, rehearsed on a production copy, awaiting production run: tables `government_formation_attempts`, `parliamentary_motions`, `motion_signatories` (migration `0033`); five sourced formation attempts (Ciolacu II, Bolojan, Tomac revoked, Veștea failed 189/23, Mureșan failed 182/15) with decree links on legislatie.just.ro; 14 motions of this legislature from CDEP with 1,554 named signatories, all resolved to members; government page shows how it was formed, the censure motions and the replacement attempts; `/motions` pages; 10 government people linked to their MP person. Still open: verify the investiture totals against the stenograms, the 5 October designation, the Senate's simple motions, earlier legislatures. Original scope: bring the executive up to date from presidency.ro decrees and Monitorul Oficial (cross-check gov.ro and Wikidata): Bolojan's dismissal on 5 May 2026 and caretaker period, the April 2026 interim ministers, the Mureșan designation and failed investiture; every row with its decree link. Record the censure motions and investiture results (D35) from CDEP's motions pages and the stenograms.
- [ ] **Bill dossiers (D36):** parse the full dossier from the pages we already fetch: initiators linked to members, every procedure step with committee verdicts and deadlines, urgency, registration numbers and dates, the bill's fate (law number, promulgation decree, Monitorul Oficial, Constitutional Court referral, rejected). Re-parse cached pages first; fetch only what is missing.
- [ ] **Leadership with dates (D37):** Permanent Bureau per period, group leaders, chamber presidents, committee chairs from the CDEP bureau and leaders pages, and from the dated role sections of the Senate member card and CDEP profiles (cached already; no new crawl needed for the roles).
- [ ] **Rosters:** re-crawl the 2024 deputy and senator rosters (idm 336 and any other replacement), mandate ends, constituencies; explain the 330/331 seat gap.
- [ ] **Backlog:** triage the 1,690 pending, 3 failed and 14 skipped discoveries: import, retire as out of scope, or fix the parser.
- [ ] **Bills:** link the 127 unlinked votes, read the law type for new bills, `final_vote_without_bill` to zero.
- [ ] Identity rows 1, 2, 8, 11: decide only if evidence appears (CVs, Wikipedia); otherwise they stay as they are.
**Exit:** at least 99% of official votes for 2024–2028 imported, every remaining gap listed with its reason; integrity clean.

### F4 — Trust surface (M, alongside F3)
- [ ] **Methodology and coverage page** replacing data-health: sources, how outcomes and absences are computed, coverage per legislature (an honest "partial" label on 2020–2024 and earlier), last update per chamber.
- [ ] **UI walkthrough** of every public route, desktop and mobile, with the tester's issues; fix list.
- [ ] **Rewrite the browser tests (D31):** smoke tests for language and redirects, 404s, a vote page, the joint chart, a member page.
- [ ] `/parties` and `/governments`: add index pages or remove the dead routes; selective cache purge so only changed data is refreshed.
**Exit:** a visitor can see what is covered and what is not; tests cover the routes that broke this month.

### F5 — Keep it true: worker, updater and admin v1 (L)
Design (D-017): the BC250 is a worker, the admin lives at `/admin`, they talk only through the database.
- [ ] Job queue and heartbeat (the admin shows whether the BC250 is connected; requests wait when it is off; every run catches up from the last successful one, D-007).
- [ ] Updater job: discover new sittings (votes, rosters) → import → integrity checks plus source-vs-stored → publish if all pass, otherwise hold and open a GitHub issue (D-008, D-011). The site shows "data updated on …" per chamber.
- [ ] Admin v1: jobs and held batches only; a screen is added when the previous one is used.
- [ ] Revision capture: the updater records what changed (field, old value, new value, source) from day one, as the base of the later history feature.
- [ ] Linux OCR path for scanned bill PDFs.
**Exit:** two consecutive weeks of sitting days imported with no manual step, visible in the admin.

### Feature roadmap — draft from the brainstorm of 2026-10-04 (starts when F0–F5 are done)

Decisions behind it: [D-021](DECISIONS.md). Source research: [audit-2026-10.md §8](audit-2026-10.md). Each item gets its own design and exit criteria when started. All collectors run from a Romanian address, save raw pages before parsing, run as a dry run first, and feed the integrity checks.

**Shared plumbing (first):** a raw-page archive (Digi Storage), revision capture (what changed, when), a source registry (last success, status per source), and open downloads (CSV and JSON with stable IDs and a stated licence).

1. **Bill dossiers.** Fate (law number, promulgation decree, Monitorul Oficial, rejected, Constitutional Court referral); the full two-chamber timeline with committee verdicts and deadlines; initiators linked to members; urgency and tacit-adoption deadlines; registration numbers; opinions (Legislative Council, Economic and Social Council, others); amendments; placement in the Government's priority list; for emergency-ordinance approval bills, the ordinance. Re-parse cached pages first; discovery of every bill of the legislature.
2. **MP profile enrichment.** Leadership roles with dates (Permanent Bureau, group leaders, committee chairs); official counts (initiatives, speeches, questions, interpellations, motions signed) and e-vote attendance as a cross-check of ours; the questions and interpellations themselves with minister and answer; CV (birth date and place, education, career); declaration filing record; sanctions; friendship groups and delegations.
3. **Party money and elections.** AEP financing reports: totals by party, year and donor type; election results (BEC) by constituency; group leaders and history.
4. **The President's record.** A classified catalog of presidential decrees from the legislative portal (36,677 listed; start at 2014): promulgations, returned laws, Constitutional Court referrals, designations, appointments (ministers, ambassadors, judges, prosecutors, Constitutional Court judges, military and services leadership), each linked to the law, person or government it concerns; agenda and consultations; statements and Supreme Defence Council decisions; advisers; the history of presidents (all since 1990 later).
5. **Law texts and diffs.** The legislative portal API for texts and consolidated versions; diff of an amending bill against the current law.
6. **Later:** change history per page, stenograms and speeches, committee documents, older legislatures, the analysis studio and summaries (Q12).

---

## Sprint plan

A sprint is one coherent block of work with an exit check, sized by scope, not by calendar. **Your time per sprint** is the decisions and the production runs only (everything else is built, tested and rehearsed on a copy first). At about one sprint a week the fix track takes **10 to 12 weeks**, mostly because imports are polite (one request every 2 s) and the two-week hands-off trial is calendar time; it goes faster whenever you can run a step the same day. Rules for every sprint: dry run first, rehearsal on the dev branch, integrity checks must pass, PLAN.md updated, deployed and checked live.

**Sprint 0 — done (3–4 Oct 2026).** Identity repair, bill merge, committee dates, joint sittings, language fix, law types, data-health removal, cabinets (formation attempts, motions with signatories, government people linked, investiture totals verified against the stenograms), source research, roadmap.

| # | Sprint | Work | Needs from you | Exit check | Size |
| --- | --- | --- | --- | --- | --- |
| 1 | **Safe ground** (F0), done 4 Oct | Snapshot schedule or weekly backup branch; copy `data/cdep-history` and `data/curated` off the laptop; dev branch and local `.env` on it; delete the rehearsal branch; Digi credentials into the root `.env`, delete the old cockpit folder; crawl guard; CI cleanup and one `npm run verify` | OK to delete the rehearsal branch and to schedule snapshots; move the Digi lines into `.env` (about 30 min) | A restore into a scratch branch passes `integrity:check`; nothing local is unique | S |
| 2 | **Coverage truth** (F1), done 4 Oct | `votes:coverage`: CDEP day XML for every sitting day since 21 Dec 2024 and the Senate calendar against our votes; coverage of bills (CDEP list) and MPs (rosters); source-vs-stored script for votes; spot-check pack of 20 records | About 12 min of crawling run by you (two commands, below); Q14 closed as D-022 | A table official / ours / % per month and chamber, for votes, bills and seats | M |
| 3 | **Storage diet** (F2) | `individual_votes` to `(member_id, vote_id)` primary key, text id and redundant indexes dropped; rehearsal on dev; migration; every use of the old id updated | Run the migration in production (about 15 min); then **Q15** (shrink or pay) | At most 150 bytes a row; full legislature projected under 600 MB; sample pages unchanged | M |
| 4 | **Votes gap I: Chamber and joint** (F3) | `votes:backfill` driven by the XML list, newest month first, stops at the first failed gate; procedural joint votes; coverage refreshed | Run it (one overnight command, about 1.5 h of requests) | Chamber coverage at least 99% for 2024–2028; gaps listed with reasons | L |
| 5 | **Votes gap II: Senate and backlog** (F3) | Senate calendar import; triage of the 1,690 pending, 3 failed and 14 skipped discoveries (import or retire with a reason); link the 127 votes without a bill; explain the 12 totals warnings | Run the Senate batch | Senate coverage at least 99%; backlog at 0 | L |
| 6 | **People: rosters and leadership** (F3, D27, D37) | Roster refresh (idm 336 and every change since May); leadership with dates from cached CDEP profiles, the Senate card and the bureau and leaders pages (`member_roles`); official activity counts and attendance stored beside ours; identity rows 1, 2, 8, 11 if evidence appears | Run the roster crawl; review the leadership page | 331 and 134 seats explained; every current leader and chair shown with dates | M |
| 7 | **Bill dossiers, core** (F3, D36) | Re-parse cached pages: initiators linked to members, every step typed with committee verdicts and deadlines, urgency, registration numbers, **the bill's fate**; fetch the roughly 1,300 missing bills of the legislature; law types; bill page timeline | Run the fetch (1–2 h unattended); review the page | Steps for at least 95% of bills; sponsors linked; every promulgated law has its number and gazette | L |
| 8 | **Trust surface** (F4) | Methodology and coverage page (partial labels per legislature, last update per chamber); UI walkthrough on desktop and mobile with the tester; rewrite browser tests; `/parties` and `/governments` indexes; selective cache purge | **Q16**, name and domain (Q9), repository (Q8), hosting (Q10) and the licence for open downloads | A visitor sees what is covered and what is not; browser tests green in CI | M |
| 9 | **Updater v1 on your Mac** (F5a) | Job queue, heartbeat and a worker loop: discover (day XML, new bills, roster changes) → import → gates (integrity, totals, source-vs-stored) → publish or hold and open a GitHub issue; revision capture hook; decree watcher for cabinet changes | Let it run for three days and review the held batches | Three consecutive days of automatic catch-up with no manual step | L |
| 10 | **BC250 and admin v1** (F5b) | Worker as a service on the BC250 (Romanian address); `/admin` with GitHub login: jobs and held batches; Linux OCR path | BC250 access, GitHub OAuth app, then two weeks of watching | Two consecutive weeks of sitting days imported with zero manual intervention | L |

**Feature sprints (start after Sprint 10; the order is yours, D-021):**
F-1 shared plumbing (raw-page archive, revisions, open downloads with licence) → F-2 bill extensions (opinions, amendments, priority list, ordinances) → F-3 MP enrichment (CVs and birth dates, questions and interpellations, official counts) → F-4 decrees and the presidency record from 2014 (appointments register) → F-5 party money and elections → F-6 law texts and diffs. The decree catalog can be pulled forward into Sprints 8–9 if the cabinet watcher needs it.

**Decision gates:** Q14 vote scope (end of Sprint 2) · Q15 storage (end of Sprint 3) · Q16 older legislatures, Q8–Q10 and the licence (Sprint 8). The next government designation is added when you tell me; until then it is not recorded.

---

## Working agreement

- One branch per phase or feature. Before merging: `npm run verify` (typecheck, tests, build), plus a live check after deploy. Local commands run on the Neon `dev` branch; production runs go through `npm run prod -- <script>` and are run by the owner.
- At the end of each session, update **this file** (checkboxes, verified state, log). Decisions and questions go in `DECISIONS.md`. **No new planning docs.**
- Tests never touch the network or the production DB.
- Production writes (DB or live crawls) only with explicit owner approval in the session.

## Log

| Date | Entry |
| --- | --- |
| 2026-10-04 | D19, D20, D22, D23 and joint sittings (Q13) live; remaining: roster freshness (deputy idm 336), then Phase 3. |
| 2026-10-04 | **Sprint 2 (coverage truth) built:** polite fetcher with raw-page cache, parsers for CDEP's day XML and the Senate's day pages, vote/bill/seat coverage reports, spot-check pack; 45 new tests. A first test on September 2026 found a real gap (Senate, 8 September: 14 of 15 votes missing). Crawl done the same day (132 CDEP days, 124 Senate days, no failures); numbers in F1. |
| 2026-10-04 | **Sprint 1 (safe ground) done:** off-laptop backup of local evidence, Neon backup branch with a passing restore test, `dev` branch as the default database, production guard and `npm run prod` wrapper, crawl merge-and-backup, `npm run verify`; rehearsal and old backup branches deleted, old workbench folder removed, manual backups chosen over a snapshot schedule. The stenogram corrections are live in production (checked: Veștea 287 present, 0 void; Bolojan 0 void). |
| 2026-10-04 | Cabinet module live (formation attempts, motions, linking); investiture totals checked against the Senate's stenograms (two corrections); source research; feature priorities (D-021); sprint plan written. |
| 2026-10-03 | Phase 2 fixes A1–A8 live, tester issues #3–#8 closed. A1b: law types from official bill pages; every decided vote now shows adopted/rejected with the rule used. |
| 2026-10-03 | **Identity repair live in production**; 122 missing votes imported; owner + CV decisions for 24 of 37 review cases. Next: Phase 1 audit, then the Phase 3 updater. |
| 2026-10-03 | Identity and group-history repair built and rehearsed on a Neon copy of production (all integrity checks pass). Found and fixed D12–D18 on the way. Awaiting owner approval to apply. |
| 2026-10-03 | Senate repair investigation found the problem is systemic (D1, D10, D11), not Senate-only. A quick patch would swap one false claim for another, so it was not applied. Identity and group-history rebuild pulled to the front of Phase 2. |
| 2026-10-03 | Owner decisions: updater on the BC250, auto-publish behind checks, local data stays local for now. Phase 0 merged to `main`. |
| 2026-10-03 | Took over from Codex. Phase 0 started: 3B parked, network-dependent test fixed, docs consolidated, D1 (Senate mandate churn) and D2 (stale data) found in production. |
