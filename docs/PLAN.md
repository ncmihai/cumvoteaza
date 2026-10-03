# CumVoteaza — Plan

**This is the single source of truth for what we are doing and why.**
Decisions and open questions live in [DECISIONS.md](DECISIONS.md). Everything in
[archive/](archive/) is history: useful evidence, never instructions.

Last updated: 2026-10-03 · Branch `phase-0-stabilize` (from `main` @ `486cb03`)

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
| **Now** | Stabilize, audit, fix data trust, build an unattended updater. |
| **Next** | Complete the **2024–2028 legislature**: fresh votes in both chambers, MP profiles and affiliations, cabinets of this legislature with full reshuffle history, presidents (including the 2025 interim), ambassadors. |
| **Later** | History backfill (1990–2024), party and legislature wiki, political compass (local model on the BC250 suggests, human labels), rebuilding the cockpit if it is still needed. |
| **Not doing** | Fine-tuning models, paid AI APIs (Gemini explanations), legal text diffs, the parked Codex "3B/3C" evidence and political-state pipelines (unless the audit says otherwise), multi-database release-preview machinery. |

---

## Verified state — 2026-10-03

Checked today against the code and the production Neon DB (read-only).

| Area | State |
| --- | --- |
| Site | Public at <https://cumvoteaza.vercel.app> (Vercel Hobby). Friends are testing it. |
| Tests | `npm run typecheck` ✅. `npm test` ✅ on this branch: 38 web, 86 ingest, 6 model, 8 Python. Browser end-to-end tests are stale and not run. |
| CI | GitHub Actions: typecheck, test and build on push/PR to `main`/`dev`. Last 8 runs on `main` green. |
| DB | Neon project `cumsevoteaza`, 279 MB of the 1 GB branch limit. 5,861 people · 1,051 votes · 226k individual votes. |
| Votes, 2024–2028 | Deputies 586 (2025-02-05 → **2026-09-09**), Senate 332 (2025-02-19 → **2026-09-08**). **Nothing newer: the data is ~3.5 weeks stale and no updater is running.** |
| Cabinets, 2024–2028 | Ciolacu II (18 roles), Predoiu interim (1), Bolojan (33). Cabinets before this legislature have only one PM row each. |
| Presidents, ambassadors | **No tables exist.** |
| Code size | ~53k lines. Cockpit (Python and React) ~21k > TypeScript ingest ~14k > website ~12.7k. Two overlapping ingestion stacks (TypeScript and Python). |
| Local-only data | ~2.5 GB under `data/` (cockpit SQLite, jobs, backups, CDEP history captures). **Not backed up.** |

### Known defects

Severity: **P1** breaks trust in the data, **P2** is wrong or broken, **P3** is polish.

| ID | Sev | Defect | Source |
| --- | --- | --- | --- |
| D1 | P1 | **Senators exist twice as member records**: CDEP numeric ID (photo, groups, party history) and senat.ro GUID (all 35,504 nominal votes, roles, committees). On 13 Sept, `closeStaleCurrentMandates` (`packages/ingest/src/persist.ts`) matched the senat.ro roster by member ID, so it **ended all 134 CDEP-ID mandates on 2026-09-12**. Live: [the PM's profile](https://cumvoteaza.vercel.app/ro/members/ilie-gavril-bolojan) says his mandate ended. It will recur on the next Senate roster import. | DB + code, 2026-10-03 |
| D10 | P1 | **Group history dates thrown away for every MP since 1990.** The CDEP pages state "din / până în <month>", but `tools/cdep-history-probe` keeps only the group name and link, and the import gives every group the mandate start with no end. **About 1,030 member-legislature records** show impossible overlapping groups (e.g. Peia: SOS, unaffiliated and PACE all at once). The raw pages are saved locally (`data/cdep-history/raw`), so no new crawl is needed. | DB + local snapshots |
| D11 | P1 | **Duplicate people from name order and diacritics.** "Predoiu Marian-Catalin" / "Marian-Cătălin Predoiu", "Ilie-Gavril Bolojan" / "Ilie Bolojan" (the PM). Upper bound: **2,410 name groups covering 4,824 of 5,861 people**; some are real namesakes. Careers are split across two profile pages. Resolved: most were orphan copies; 7 real splits; 3 namesake pairs wrongly merged (the ex-president Ion Iliescu carried a Hunedoara namesake's mandates). | DB |
| D12 | P1 | **~32,400 Chamber votes of the 2020–2024 legislature credited to the wrong people.** The vote importer used the current-legislature ID scheme; CDEP numbers deputies per legislature, so e.g. Ringo Dămureanu's 2022–2024 votes show on Cristina Dascălu's profile. Verified: 100% of rows match the 2020 deputy's group, 20% the current one. | DB, 2026-10-03 |
| D13 | P1 | **Vote imports create members, open-ended mandates and open-ended group memberships** from vote rows (204 "ghost voters", more overlapping groups). | code |
| D14 | P1 | **The senat.ro and CDEP importers delete each other's group/party/committee rows** on every run. | code |
| D15 | P2 | CDEP gives all 136 senators of 2004–2008 the validation date "17 februarie 2004", before the election (a source typo), creating false overlaps. | local snapshots |
| D16 | P2 | 12 current Chamber leaders have their office stored in their name (Sorin Grindeanu's last name was "Deputaţilor"). | DB |
| D17 | P2 | The member page fell back to the first profile whose URL *starts with* the requested name, which could show a namesake. | code |
| D18 | P3 | Dates are formatted in the viewer's time zone, so a calendar date can shift to the previous day west of UTC. | code |
| D19 | P2 | Committee memberships also get whole-mandate dates although CDEP gives "(din … / până în …)". Follow-up. | code |
| D20 | P2 | 9 Senate votes of 2025 have one fewer nominal "for" row than the official total (pre-existing; probably one voter not parsed on those senat.ro pages). | DB, 2026-10-03 |
| D21 | P3 | Joint Chamber–Senate sitting votes are skipped (parser unsupported); 2 Chamber votes (idv 37367, 37387) have no nominal rows. | rehearsal import |
| D2 | P1 | Data stale since 2026-09-09; no unattended updater. | DB query |
| D3 | P1 | Vote seat map turns *missing* nominal records into "absent" and silently trims roster conflicts. | archive/review-2026-09-24 R2 |
| D4 | P1 | Seat-map reconciliation compares the map to its own counts, so it can never fail. | review R3 |
| D5 | P1 | Cabinet page labels the viewing date as "verified". | review R4 |
| D6 | P2 | Browser end-to-end tests assert a vote layout that no longer exists. | review R5 |
| D7 | P2 | Map search: diacritics and constituency; filter panel ignores Escape. | review R6–R7 |
| D8 | P2 | Ministry directory cache not invalidated with the rest; profile query scans all snapshots. | review R8 |
| D9 | P3 | Optional site password gate: password accepted in the URL and stored as the cookie value. Currently unused. | `apps/web/proxy.ts` |

D3–D8 have not been re-verified since 24 Sept. Commits after that review touch some of them; the audit confirms which are still open.

---

## Phases

### Phase 0 — Stabilize ← *in progress*

Goal: a clean `main`, green tests, one plan.

- [x] Park the uncommitted Codex 3B work on branch `wip/codex-3b-cabinet-evidence` (local, not pushed). Captures remain in `data/cabinet-evidence/`.
- [x] Fix `discovery-empty-source.test.ts`, which silently hit the live senat.ro. Suite green.
- [x] Write `PLAN.md`, `DECISIONS.md` and `CLAUDE.md`; archive old docs.
- [x] Back up local data: deferred; stays local for now (D-009).
- [x] Bug intake: GitHub Issues and the Project board, already used by the tester (D-010).
- [x] Merge `phase-0-stabilize` into `main` (approved 2026-10-03).

**Exit:** `main` clean and green, this plan merged.

### Phase 1 — Audit and cut list

Goal: know what exists, what works, what is used, and what to delete or rewrite.

- [ ] **Module review.** For every package, tool, route and table: purpose, used?, works?, then **keep / rewrite / delete**. Includes:
  - the two ingestion stacks (pick one → Q5);
  - the cockpit (→ Q6);
  - `apps/web/lib/data.ts` (3,171 lines);
  - 50 DB tables (which are read by the site, which are orphaned);
  - three asset-storage backends.
- [ ] **Data integrity checks.** Write repeatable SQL checks against production: duplicate people and members, impossible or fabricated dates (D1), votes without nominal rows, nominal totals ≠ official totals, mandates over seat capacity, orphans. These become the updater's health gate in Phase 3.
- [ ] **Source vs stored.** A script that re-fetches a sample of official pages (votes, MP profiles, rosters) and diffs them against what we stored: totals, nominal rows, names, dates, affiliations. It runs offline against saved snapshots, and becomes an updater check in Phase 3 (D-008).
- [ ] **Live spot-check.** About 20 records (votes, MPs, ministers) compared on the live site against the official source, by hand.
- [ ] **UI walkthrough.** Include tester issues #3–#8. Every public route on desktop and mobile: what it shows, where the data comes from, what is broken or confusing, and what is missing.
- [ ] **Missing-info brainstorm.** For each entity (MP, vote, bill, party, cabinet, minister, president, ambassador), what a citizen would want to know and we don't have yet, ranked by value and effort.
- [ ] **Re-verify D3–D8.**
- [ ] Inventory local `data/` (~2.5 GB): keep or delete (D-009).
- [ ] Noted during the identity repair: profile header shows an interim minister role instead of Prime Minister (Bolojan); header labels a parliamentary group as "Partid"; local `.env` and the cockpit write straight to the production DB (use a Neon dev branch for local work); CI passes a Jest-only `--runInBand` flag.
- [ ] Output: `docs/audit-2026-10.md` with findings and the agreed cut list. Decisions go into `DECISIONS.md`.

**Exit:** audit written, cut list agreed, cuts made.

### Phase 2 — Data trust fixes

**First (pulled forward because it is the core of "what did X do"): identity and group history.** Branch `fix/member-identity-and-group-history`.
- [x] Probe parser keeps the "din / până în" dates for groups and parties; offline `reparse` of the 5,289 saved pages; month precision stored and shown as "iun. 2025" (D-013, D18).
- [x] Identity resolver from official evidence only (D-014): CDEP career links, same seat seen by two sources, owner decisions in `data/curated/identity-decisions.json`; simultaneous seats split namesakes. Replaces the name-slug `people:backfill`.
- [x] One member record per mandate: senat.ro records folded into CDEP records, ghost voters re-attached, D12 votes re-attributed; `id_aliases` so no importer can recreate a retired ID; retired profile URLs redirect (D17).
- [x] Importers: votes never create members/mandates/memberships (D13); only CDEP owns group/party history and each importer deletes only its own rows (D14); mass mandate closure refused (D1); `official-careers` and `wikipedia:roster:import` can no longer persist.
- [x] `integrity:check`: 10 blocking + 3 warning checks. Production today: 8 blocking checks fail. Rehearsal copy after repair: all 13 pass, 226,093 votes preserved.
- [x] Career timeline uses dated group memberships when they document more changes than the party field (Peia: SOS → unaffiliated → PACE); a hand-over month is not "ambiguous".
- [x] URL continuity: retired profile URLs redirect; the runbook snapshots every public profile URL first and fails if any stops resolving (rehearsal: 5,569 checked, 0 broken).
- [x] Runbook `tools/identity-repair/run.sh` (refuses to run without confirming the target host). Final rehearsal on a fresh copy of production: exit 0, all 13 checks pass.
- [ ] Owner: answer the 37-row review in `data/curated/identity-review.md` (not blocking; undecided rows stay as today).
- [ ] Owner approval, then: (1) Neon backup branch of production, (2) runbook on production (~15 min; the old site keeps working, data changes underneath), (3) merge and deploy the code, (4) revalidate the data cache, (5) verify the live profiles, (6) delete the rehearsal branches.
- [x] Identity review: 24 of 37 decided (owner + CDEP CVs: birth dates, careers named in CVs; `cvs` probe command, `tools/identity-repair/cv_evidence.py`); 13 left unchanged for lack of evidence.
- [x] Missing-votes import rehearsed on the copy with the new voter resolution: 122 new votes (Chamber 35, Senate 87, 14–30 Sept), Chamber totals match exactly, all integrity checks still pass.
- [ ] Follow-up: committee dates (D19); Senate off-by-one (D20); joint sittings (D21); store CV birth dates in `people.birth_date` and use them as resolver evidence.

Then:
- [ ] Fix every P1 (D1, D3–D5, plus any the audit finds). Write a failing test or integrity check first, then fix.
- [ ] Repair production data through scripts that are dry-run by default and reviewed before `--persist`.
- [ ] Rewrite the stale browser tests (D6) so they assert data, not just layout.

**Exit:** all integrity checks pass on production; spot-checks match the sources.

### Phase 3 — Unattended updater

Goal: new votes for this legislature appear on the site without manual work.

- Runs on the **BC250** (CachyOS) from a systemd timer (D-007). Every run catches up from the last successful run, because the box is only *almost* always on.
- Job flow: discover new sittings → import → integrity checks plus source-vs-stored comparison → **auto-publish if all pass**, otherwise hold and notify (D-008, Q11).
- The site shows a visible "data updated on …" date per chamber.

**Exit:** two consecutive weeks of sitting days imported with zero manual intervention.

### Phase 4 — Complete the 2024–2028 legislature

Each item gets its own exit criteria when started.

- [ ] **MPs:** current group and party affiliation changes, replacements and mandate ends, all source-linked.
- [ ] **Cabinets:** Ciolacu II, Predoiu (interim), Bolojan, with every appointment, resignation, interim and reshuffle. Approach: a curated data file with a decree or Monitorul Oficial link per row (see Principle 5).
  - Acceptance case, Defence under Bolojan: Moșteanu → Miruță interim (Decree 1111/2025) → Miruță full appointment (Decree 1166/2025).
- [ ] **Presidents:** new model. Covers the 2025 succession, including the interim period; dates verified against official sources.
- [ ] **Ambassadors:** new model. Source: presidential appointment and recall decrees. Scope → Q7.
- [ ] Candidates, decided when we get there: no-confidence motions and their votes, standing committees, Senate/Chamber leadership.

---

## Working agreement

- One branch per phase or feature. Before merging: `npm run typecheck && npm test && npm run build`, plus a live check after deploy.
- At the end of each session, update **this file** (checkboxes, verified state, log). Decisions and questions go in `DECISIONS.md`. **No new planning docs.**
- Tests never touch the network or the production DB.
- Production writes (DB or live crawls) only with explicit owner approval in the session.

## Log

| Date | Entry |
| --- | --- |
| 2026-10-03 | Identity and group-history repair built and rehearsed on a Neon copy of production (all integrity checks pass). Found and fixed D12–D18 on the way. Awaiting owner approval to apply. |
| 2026-10-03 | Senate repair investigation found the problem is systemic (D1, D10, D11), not Senate-only. A quick patch would swap one false claim for another, so it was not applied. Identity and group-history rebuild pulled to the front of Phase 2. |
| 2026-10-03 | Owner decisions: updater on the BC250, auto-publish behind checks, local data stays local for now. Phase 0 merged to `main`. |
| 2026-10-03 | Took over from Codex. Phase 0 started: 3B parked, network-dependent test fixed, docs consolidated, D1 (Senate mandate churn) and D2 (stale data) found in production. |
