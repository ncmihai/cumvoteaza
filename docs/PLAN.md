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
| D2 | P1 | No unattended updater (data went stale before; caught up by hand). | F5 |

---

## Fix roadmap

Goal: **everything the site claims is true and checkable, and stays true without hand work.** Order matters: protect the data (F0), measure the gap (F1), make room (F2), fill it (F3), explain it (F4), automate it (F5). F4 runs alongside F3. Sizes: S about one session, M two to three, L several.

### F0 — Safe ground (S)
- [ ] **Backups.** Check whether the Neon plan allows scheduled snapshots; if not, a weekly manual branch `backup-YYYY-MM-DD` (keep the last two). Copy `data/cdep-history` and `data/curated` off the laptop (Digi Storage). Do one real restore test: restore into a scratch branch and run `integrity:check`.
- [ ] **Dev branch (D-018).** A Neon `dev` branch refreshed from production; local `.env` points at it; production credentials only in the runbook and the updater. Delete `rehearsal-d22-bill-merge` (owner OK) to free 360 MB first.
- [ ] Move the Digi Storage credentials into the root `.env`; delete `tools/parliament-workbench/`.
- [ ] Guard the probe `crawl`: never overwrite `parsed/*.jsonl` (write to a new file and swap after validation, or require `--out`).
- [ ] CI: remove the Jest-only `--runInBand` flag; one `npm run verify` that runs typecheck, tests and build.
**Exit:** a restore has been tested and nothing local is unique.

### F1 — Know what we have (M)
- [ ] **Coverage report.** For every sitting day from 21 Dec 2024: the official list of votes (CDEP per sitting day and senat.ro per date) against ours, per month and chamber, with the missing IDs. Offline-first: lists are saved locally, fetching is polite, capped and resumable. Joint sittings included.
- [ ] **Spot-check pack:** about 20 records (votes, MPs, a minister, a bill) with our page and the official page side by side and the exact fields to compare; reviewed by the owner or by me with the browser.
- [ ] **Source-vs-stored script** for imported pages: totals, name lists, names, dates, affiliations; reuses the saved snapshots (D-008, and a gate for F5).
- [ ] Decide the vote scope (Q14) with the numbers from the report.
**Exit:** a table "official / ours / % / missing" per month and chamber for 2024–2028.

### F2 — Storage diet (M)
- [ ] Measure first (done above), then rehearse on the dev branch: `individual_votes` gets `(member_id, vote_id)` as its primary key and loses the 90-character text id and the redundant indexes; if that is not enough, integer keys. Target: at most 150 bytes a row, so 100% of the current legislature fits under 600 MB. Update every use of `individual_votes.id`.
- [ ] Fallback if the target is missed: Neon paid plan (Q15).
**Exit:** projected size with full 2024–2028 votes is under 600 MB, integrity checks pass on the dev branch.

### F3 — Close the gaps, current legislature first (L, mostly waiting for imports)
- [ ] **Votes:** import every missing vote of 2024–2028 in monthly batches (Chamber, Senate, joint), each batch gated by the integrity checks and the totals check, newest months first. Includes the investiture votes (Ciolacu II, Bolojan), motions of censure and other joint sittings.
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

### Feature roadmap — written when F0–F5 are done
Ideas collected so far (not scheduled): cabinets with every reshuffle, presidents (2025 succession) and ambassadors (Q7); CV tab and birth dates (CDEP CVs, Wikidata); change history like SteamDB; one timeline per bill; law diff against the consolidated text; political compass and plain-language summaries (Q12); history backfill before 2024.

---

## Working agreement

- One branch per phase or feature. Before merging: `npm run typecheck && npm test && npm run build`, plus a live check after deploy.
- At the end of each session, update **this file** (checkboxes, verified state, log). Decisions and questions go in `DECISIONS.md`. **No new planning docs.**
- Tests never touch the network or the production DB.
- Production writes (DB or live crawls) only with explicit owner approval in the session.

## Log

| Date | Entry |
| --- | --- |
| 2026-10-04 | D19, D20, D22, D23 and joint sittings (Q13) live; remaining: roster freshness (deputy idm 336), then Phase 3. |
| 2026-10-03 | Phase 2 fixes A1–A8 live, tester issues #3–#8 closed. A1b: law types from official bill pages; every decided vote now shows adopted/rejected with the rule used. |
| 2026-10-03 | **Identity repair live in production**; 122 missing votes imported; owner + CV decisions for 24 of 37 review cases. Next: Phase 1 audit, then the Phase 3 updater. |
| 2026-10-03 | Identity and group-history repair built and rehearsed on a Neon copy of production (all integrity checks pass). Found and fixed D12–D18 on the way. Awaiting owner approval to apply. |
| 2026-10-03 | Senate repair investigation found the problem is systemic (D1, D10, D11), not Senate-only. A quick patch would swap one false claim for another, so it was not applied. Identity and group-history rebuild pulled to the front of Phase 2. |
| 2026-10-03 | Owner decisions: updater on the BC250, auto-publish behind checks, local data stays local for now. Phase 0 merged to `main`. |
| 2026-10-03 | Took over from Codex. Phase 0 started: 3B parked, network-dependent test fixed, docs consolidated, D1 (Senate mandate churn) and D2 (stale data) found in production. |
