# Decisions and open questions

Questions start under **Open**. When answered, they move to **Decided** with the
date and the reason, and are never deleted, so we don't re-argue them later.
Each Open question has a recommendation; the owner decides.

---

## Open



### Q21 — Sorting the members list by activity or absences
- The members list can be sorted by "most documented votes" and "most documented absences". D-029 says no rankings, leaderboards or "best / worst" lists of individuals; sorting everyone by absences is exactly such a ranking, and a count of absences also mixes real absences with gaps in a source.
- **Recommendation:** remove both sorts; keep name, party and county. Attendance and agreement stay on each person's own page, with their formulas.
- 2026-10-06: at the owner's request the absence sort now counts real absences (votes with a name list held in the member's chamber and in joint sittings during the mandate, minus the votes where the member has a recorded vote), only for the current legislature, with the meaning written above the list and a marker on members who held a government post (they top the list: Buzoianu 974 of 1,317, Țoiu 941, Miruță 934). It is still a ranking of individuals, so the question stays open: keep, or remove as recommended.

### Q10 — Vercel Hobby is non-commercial
- Fine for now. Any donations or ads would require a paid plan or another host.

### Q12 — Plain-language vote/bill summaries: which model?
- Owner wants summaries in the future. Options: generate on first page view and cache; a local model on the BC250 (batch, free); a very cheap hosted model.
- Constraints: summaries are model output, so they need the evidence link and review rules (D-008: model output never auto-publishes, or is clearly labeled as unreviewed); cost must stay near zero.
- The existing (disabled) explanation code and its 3 tables are kept until this is decided.

---


## Decided

| ID | Date | Decision | Why |
| --- | --- | --- | --- |
| D-001 | 2026-10-03 | One plan (`PLAN.md`) plus this decisions log; all older docs moved to `docs/archive/`. | Five files claimed to be "current"; none were. |
| D-002 | 2026-10-03 | Priority is the **current legislature (2024–2028)**, complete and fresh: votes, MPs, cabinets, presidents, ambassadors. History, wiki and compass come after. | Owner priority; a reliable present matters more than a broad past. |
| D-003 | 2026-10-03 | Codex Phase 3B (cabinet evidence pipeline) and the political-state candidates are parked on local branch `wip/codex-3b-cabinet-evidence`, not merged. Re-evaluated in the audit. | Heavy machinery (hashes, receipts, reconciliation) for 3 cabinets; a curated, source-linked file is likely simpler and just as trustworthy. |
| D-004 | 2026-10-03 | Willing to cut or rewrite anything that the audit shows is worse than starting over. | Owner: "I'd rather have a proper working base." |
| D-005 | 2026-10-03 | Local model hardware: BC250, models up to ~12B (Qwen 9B and Gemma confirmed working). No fine-tuning planned; a codebook, examples and human review come first. | The bottleneck is labelled data, not model weights. |
| D-006 | 2026-10-03 | The site is public; friends are testing it. | Owner. |
| D-007 | 2026-10-03 | The unattended updater runs on the **BC250** (CachyOS, almost always on, can reach cdep.ro and senat.ro). Because it is *almost* always on, every run catches up from the last successful run rather than assuming a fixed window. | Residential IP avoids source blocking; same box as the local model. |
| D-008 | 2026-10-03 | **Auto-publish** official data when every check passes; hold and notify otherwise. Checks include comparing what the source page says against what we stored (totals, nominal rows, names, dates). Model output never auto-publishes. | Approval-per-batch is how the data went stale (D2). |
| D-009 | 2026-10-03 | Local `data/` (~2.5 GB) stays local for now, with no backup. The Phase 1 audit lists what is worth keeping and what can be deleted. | Owner: not a problem yet. |
| D-010 | 2026-10-03 | Bug intake: GitHub Issues on the repo plus the owner's GitHub Project board (the tester already uses them, #3–#8). | Already in use. |
| D-011 | 2026-10-03 | The updater reports held batches and failures by opening a GitHub issue automatically. | Free, has history, visible to owner and tester. |
| D-012 | 2026-10-03 | **Identity and group history across all legislatures come first**, before the rest of the audit and before anything new. | Owner: nothing can be built on top until every person is right and nothing overlaps. |
| D-013 | 2026-10-03 | Dates known only to the month are stored with a precision field (`day` / `month`) and shown as "iun. 2025". No invented days. | Principle 2. |
| D-014 | 2026-10-03 | Person merges are automatic only when the normalized name matches **and** an official signal agrees (CDEP career link, same official ID, or same chamber and constituency with non-overlapping mandates). Everything else goes to a review list. Every merge is logged and reversible. | Name-only matching would merge real namesakes. |
| D-015 | 2026-10-03 | Popular-votes ranking uses cookieless view counts; the visitor-ID cookie goes. | EU consent rules; popularity is still useful. |
| D-016 | 2026-10-03 | Keep working against production during the current build-out; create a Neon `dev` branch once the core is stable. | Owner: "we are in a dev-like working phase". |
| D-017 | 2026-10-03 | **One admin inside the website (`/admin`, GitHub login), and the BC250 as a worker, not a server.** They communicate through the database: the admin writes job requests, the worker polls, runs, and reports progress and a heartbeat (the admin shows whether the worker is connected). The worker does not need to be always on; requests wait. | No home network exposure, one stack, analysis pages can graduate to public. |
| D-018 | 2026-10-03 | Retire the cockpit (archived on a branch first) and do the audit cut list, **except Gemini/vote explanations**, which stay for a future summaries feature (Q12). Digi Storage stays; only the unused Vercel Blob and generic FTP upload routes go. | Owner, after the audit. |

### D-029 — The UI revamp: owner's answers (2026-10-06, closes Q17, Q18 and Q20)
- **Order (Q17):** the new look comes first (Sprints 11a and 11b), because four of the five data sprints add pages. 11a is the foundation, Home and the Vote page; 11b is Member, Party and the parties directory, Bill and Compositions. The rest waits for Sprint 16.
- **Feeling:** it should have personality without being "wow": about 70% sharper data product (strong contrast, data first) and 30% friendly (rounded, warm wording). The current site is "a lot of things and nothing": flat, generic, and not uniform because parts of the first-ever UI were never updated (measured in the UI plan). Citizens and journalists equally; density: both work, so desktop stays dense with nothing under 12 px.
- **Name and logo:** "CumVoteaza" stays in the header; a new logomark is chosen from six drawn options (A–F, F = the current icon). Never the Parliament's emblem or name. Dark mode later, designed in from the start (tokens).
- **Colours and logos (Q18):** party colour on seats and chips, vote shown by icon shape and fill; party logos are the Chamber's own, already stored (77 distinct images from its profile pages), with a coloured monogram where there is none. Photos: larger official portraits (1200 × 1600 px) exist for 71% of sitting deputies and are fetched later by the owner's crawl.
- **Parties directory:** one row per organisation (221 rows are 80 distinct names), national-minority organisations grouped in one dropdown section, a legislature selector, independents and unaffiliated collapsed.
- **Text on the site:** only our fixed help text (written once, reviewed by the owner) and official texts; model-written summaries only later, labelled and human-approved (Q12). Derived numbers: attendance and agreement with the group's line for 2024–2028 with the formula on the methodology page, no rankings or best/worst lists.
- **Navigation:** top bar Voturi · Proiecte de lege · Parlamentari · Partide · Guvern (Președinte when it exists); "Date și metodă" in the footer. **Home (Q12):** a combination: search and county picker, latest decisions, "what changed", Parliament now, trust strip.
- **Motion:** subtle and once (seat wave, counts, bars, timelines), always off under reduced motion. **Pages in the first wave:** home, vote, bill, member, party and compositions.
- **Process (Q20):** code-first with screenshots at desktop and phone, Figma later (the Figma connection works; the plan's call limit is unchecked, so nothing depends on it).
- **Type and palette (picked 6 Oct):** T1 = Bricolage Grotesque (headings, big numbers) + Inter (text), P3 = "indigo pop" (ink #14122B, indigo #4338CA, highlight lime #A3E635 drawn as a ring or mark, never as a vote colour); vote colours are fixed and do not change with the palette; contrast is tested before the values are final.
- **Confirmed later the same day:** home as the combination (Q12); logo **B**, the question mark of seats (with a simplified favicon, since the dots blur at tab-icon size); Sprint 11 is two sprints (11a, 11b); **Q19 closed: decorations and individual pardons are counted by type and year in the President's record and never name a private person.**

### D-031 — Feedback form, no link to the repository (2026-10-06)
- A round "Feedback" button on every page (and the footer's "Raportează o greșeală sau trimite o sugestie", and the methodology page) opens one form: kind (mistake in the data, suggestion, technical problem), message (10 to 2,000 characters), optional contact. The path of the page is attached (never the query string). Stored in `feedback_reports` (migration 0043); read with `npm run ingest:feedback:list` (`--status=new`, `--json`) and closed with `ingest:feedback:mark --ids=… --status=read|done`. Nothing is published.
- **Privacy (D-015):** no IP, no cookie, no browser details are stored. Because nobody is identified, the flood guard counts everyone together (20 reports per 10 minutes, 200 per day, then "busy"); a hidden field catches robots (they get the same "thanks" a person gets); the form refuses posts from other sites; a browser cooldown of 20 seconds. If spam ever gets through, add a captcha.
- **The admin dashboard** (Backlog, Sprint 10) is not needed to read reports; when it exists it reads this table.
- **The repository is no longer linked from the site** (footer and methodology page): the owner does not want it shown. The code stays public on GitHub; making the repository private is a GitHub setting (Vercel deploys from a private repository on the Hobby plan) and is the owner's call. The methodology page keeps the data licence.

### D-030 — A seat with no vote on the name list (2026-10-06)
- The vote map used to call such seats "Necunoscut" with a question mark, which read like a secret ballot or a data error. It is neither: a secret ballot has no name list and no map at all. These are members who held a seat in the chamber that day but have no vote on the official list. For the Chamber the list simply omits them; for the Senate 563 votes list some senators with no vote ticked (3,274 rows). Checked on every vote with a name list: the source's own "present" total equals the people with a recorded vote in all 1,305 Chamber votes, all 141 joint votes and 672 of 681 Senate votes (the other 9 are the known announced-versus-listed shortfalls), so these members are not counted as present.
- **Wording:** "Fără vot înregistrat" / "No vote recorded", a pale seat with a slash, counted in the result card, with a note under the map. Never "absent" on the map and never a reason: the sources do not say why. The same label is used in the table, bars and member vote history. The members list calls the same thing "absențe la vot", with its definition shown (see Q21).
- The amber "does not reconcile" note is gone (it fired for every vote because absentees have no row). Notes remain only where the list holds more votes than announced or fewer (the Senate L181/2025 case), and a muted line when the map has fewer seats than the chamber's legal count.

### D-028 — Backlog and the Feature track (2026-10-06)
- **Backlog:** the rest of Sprint 9 (the morning runs, the daily job, three automatic days) and all of Sprint 10 (BC250 worker, `/admin` v1, Linux OCR) move to the Backlog in PLAN.md, with open downloads (F-1), law texts and diffs (F-6) and the "later" items.
- **Principle 6 bent knowingly:** D2 (no unattended updater) goes from P1 to P2 because the updater exists and the owner runs it by hand. Compensating rule: the daily catch-up must not lapse for more than a week; if it does, feature work pauses until it runs again. The footer already shows when the official sources were last checked.
- **Feature track and its order (owner's):** UI foundation (Sprint 11), bill extensions (12), MP enrichment (13), the President's record from 2014 (14), party money and elections (15), UI sweep (16). This puts the presidency before party money; D-021 had them the other way round, the later choice wins.
- **UI revamp scope (owner's words):** icons, the party's logo wherever a party name appears, animated charts, reworked elements; the open points are Q17 (order), Q18 (logo sources) and Q20 (Figma).
- Each data sprint starts with a source check of a few pages (with the owner's OK) before anything is designed or stored.

### D-026 — Sprint 8 decisions (2026-10-06, closes Q8, Q9, Q16 and the data licence)
- **Older legislatures (Q16):** member and career histories stay public; vote coverage is labelled "partial" per legislature, on the legislature's page and on the methodology page, until a backfill exists. **A full import of the older legislatures (votes, bills, rosters back to 1990) stays on the roadmap as its own later sprint; the labels come off one legislature at a time as each is imported and verified.**
- **Repository (Q8):** stays public (review by the tester, unlimited Actions minutes, "source-linked" works for the code too).
- **Name (Q9):** unchanged for now: the site is `cumsevoteaza` (page title, repo folder, packages) and shows "CumVoteaza" in the header; a change is possible later and the new pages take the name from one constant (`apps/web/lib/site.ts`), so it is one edit.
- **Data licence:** CC BY 4.0 for the open downloads that come later (credit the site and keep each row's source link). The facts themselves are official public records. Not legal advice; the methodology page states that downloads are not offered yet.
- **Hosting (Q10):** unchanged: Vercel Hobby is non-commercial, which is fine without ads or donations.

### D-027 — How the updater works (2026-10-06, Sprint 9)
- **Where and when:** on the owner's Mac first, by hand (`ingest:updater:catch-up`), then once a day from a launchd job after a week of manual runs; the same code moves to the BC250 in Sprint 10. Each run catches up from the last successful one (D-007), so a missed day costs nothing.
- **One catch-up is an ordered list of steps**, each safe to repeat: (1) official vote lists for the days since the last run, (2) votes we lack, imported through the existing gates, (3) new bills and the dossiers that may have changed, (4) dossier import for only those pages, duplicate merge, gazette numbers, (5) read models, integrity, coverage numbers, cache purge, (6) a look at the presidential decrees for cabinet changes (report only).
- **Hold and publish (D-008) without a staging copy:** every item passes its own gate before it is written (a vote must agree with the official list, a dossier page must be a real page); a failed item is held, listed and not written. After the writes the integrity checks must not be worse than before the run; if they are, the run is held and the read models and caches are not refreshed. A held run opens a GitHub issue (or comments on the open one), never silently.
- **What is recorded** (migration 0041): `updater_runs` (steps, counts, held items, status), `worker_heartbeats` (is a worker alive), `updater_jobs` (a request waits until a worker takes it; the admin of Sprint 10 will write them), `data_revisions` (field, old value, new value, source for bill fates, stages, law and gazette numbers, and new votes and bills: the base of the later history feature).
- **Limits:** at most 150 requests per source per run at 3 s apart (the Chamber's bot protection answers a captcha after about 230); a run that finds the previous one still "running" for under 3 hours stops; over 3 hours it marks it failed and goes on.
- **Roster changes (added 6 Oct):** each run compares the official roster pages of the legislature (2 requests) with the profiles we hold; a member we hold no profile for is reported as a held item with the Sprint 6 steps to add them (crawl the profile, import, identity resolution) and is never imported automatically (a person is a sensitive record, D-014). Votes held for an unknown name are asked for again on every run until they are in, however long that takes (up to the 60-day cap).
- **Not in v1:** OCR, the admin screen (Sprint 10).

### D-022 — Vote scope for 2024–2028 (2026-10-04, closes Q14)

Decided by the owner on the F1 coverage numbers: import **every Chamber and every Senate vote**, and every **joint** vote except per-article and amendment votes. For the joint sittings of 5 Feb 2025 (budget) and 19–20 Mar 2026 (about 614 amendment votes, about 400 voters each, roughly 245,000 individual-vote rows) the site keeps **one summary row per sitting with a link to the official list**, not the individual votes. Every vote carries its kind so lists can default to final and major votes. The storage target (Q15) is therefore sized for Chamber, Senate and the other joint votes only.

### D-023 — Individual votes use compact integer keys (2026-10-04, Sprint 3)

`individual_votes` was 175 MB for 253,130 rows (about 700 bytes a row: a 90-character text id, a 67-character vote id and three more text keys per row, five indexes, two of them never used). It is now `individual_vote_rows(vote_num, member_num, group_num, choice, vote_method)` with primary key `(vote_num, member_num)` and one index on `(member_num, vote_num)`: **22 MB, 92 bytes a row**, identical data (same row count and checksum through the view). `votes`, `members` and `parliamentary_groups` gained an integer `num`; the text ids remain the public identity and URLs. `individual_votes` is now a **view** with the old columns (left joins on unique keys, so unused joins are dropped), so every read keeps working; importers and the member merge write to `individual_vote_rows` through `packages/ingest/src/individual-vote-rows.ts`. At this size a full legislature (about 1 million rows) is about 90 MB, so Q15 is answered: no paid plan needed for 2024–2028 or for older legislatures later.

### D-025 — How a bill's dossier is read and stored (2026-10-05, Sprint 7)

**Sources.** Each bill has up to two official pages: the Chamber's (`upl_pck2015.proiect?idp=`, found through the yearly list) and the Senate's (`Lista.aspx?an_cls=&nr_cls=`). Both are fetched once, saved raw under `data/coverage/raw/cdep-bill` and `senate-bill`, and read offline; a page that cannot be read is never saved (`bills:dossiers:fetch`, `bills:dossiers:import`). The pages of the bills we held before Sprint 7 had never been saved, so the whole legislature (about 4,000 pages) is fetched, not only the missing bills.

**One dossier from two pages.** Pages that share any identifier (PL-x, L, B number) are one bill. Each chamber's own page is authoritative for its own steps (the other page prints them in short), the Presidency's steps (promulgation, publication) come from both once, and the stage line is the one of the page that has seen the latest step. A bill with one page shows what that page says.

**What is stored, all as published.** `bill_dossiers` (one row per bill): the pages read and when, registration numbers (B.P.I., Chamber, Senate, the Government's letter), initiative type, urgency, the stage line, the Chamber's own summary of the object of regulation, the tacit-adoption deadline, and the fate. `bill_procedure_steps`: one row per step **and per committee** (a Chamber row that sends a bill to four committees becomes four steps), typed with the dossiers' own vocabulary (16 new values, old ones kept), with the committee or outside body, what a report, opinion or view concluded (`verdict`, its registration number, amendments admitted or rejected), the report and amendment deadlines, the vote counts printed beside an adoption, the vote page (linked to our vote when we hold it) and the stenogram. `bill_sponsors` gain the printed group and chamber. `bill_events` are rewritten from the steps because lists, member activity and the read models date a bill from them. Documents we already hold are never replaced (their extracted text hangs on them); new ones are added.

**Initiators are linked to members only when it is certain.** The Chamber page links each initiator's profile (legislature, chamber, number), which resolves to exactly one member (`members.source_ids.cdepProfileKey`). The Senate page prints names: a name resolves only when exactly one member of that chamber who sat on the bill's date has the same words in any order (a maiden-name suffix is tolerated); two members with the same words (Stoica Alin-Bogdan and Stoica Bogdan-Alin) stay unlinked, shown by name.

**Fate is read, not guessed.** `promulgated` needs a promulgation step or a law number on the page (decree number and date, law number, Official Gazette number and date when printed; the gazette number is on the Senate page). `rejected` only when the chamber that decides rejects (a first-chamber rejection passes the bill on). `withdrawn` when the initiator withdraws. `ended` only when the procedure ends without a hand-over to the other chamber. Anything else is `in_progress`, shown with the stage line as printed. Steps whose wording no rule recognises are typed `other`, kept in full, and listed by the import report so the rules can be extended; nothing is dropped or guessed.

**Not in this sprint:** amendments as texts, the content of opinions, Constitutional Court decisions behind a referral, and law diffs (F-feature work). `bills.status` now holds the stage line as printed.

### D-024 — How leadership roles are stored (2026-10-05, Sprint 6)

`member_roles` holds three kinds: `group` (leader, deputy leader, secretary of a parliamentary group), `bureau` (a chamber's Permanent Bureau, including its president) and `other` (retired: the undated "leader since the legislature began" rows of the old roster pipeline, deleted when a member is re-imported). Dates are the source's own and keep month precision. A role with no end in a **finished** legislature is closed at that legislature's end; in the current one it stays open. Official activity counts a chamber publishes about a member (initiatives, speeches, questions, e-vote attendance) go to `member_official_activity` **as published**, with the date they were read and the source page; we show them beside our own counts and never recompute or blend them. Deputies' counts need several requests per deputy and wait for the MP-enrichment feature work (F-3).

### D-019 — Joint sittings are a third vote chamber (2026-10-04)

Decided by the owner (Q13, option A): a vote can be held in `joint` session, shown with its own tag and chart; majorities count deputies and senators together (465). Only votes have it (`vote_chamber`); mandates, committees and groups stay per chamber.

### D-020 — Cleanup and product direction (2026-10-04)

Owner decisions: the data-health page is removed (code worth keeping was kept); local cockpit data can be deleted; the site is to become a database of record with change history, one timeline per bill, law diffs and a CV tab (see PLAN.md, "Product vision"). Q5 (one ingestion stack: TypeScript) and Q6 (cockpit: replaced by the updater) are closed.

### D-021 — Feature priorities and data policy, from the brainstorm of 2026-10-04

Owner decisions, to be scheduled after the fix roadmap (F0–F5):
- **Order of the data families:** bill dossiers, MP profile enrichment, party money and elections. The presidency record is wanted in full (below) and is sequenced right after them; its decree catalog is also needed earlier by the cabinet and updater work.
- **Presidency tab = the President's record, the full office:** decrees by type (laws promulgated or returned, Constitutional Court referrals, appointments, designations), the agenda and consultations, statements, Supreme Defence Council decisions, advisers, and the history of presidents. Depth: Iohannis, Bolojan (acting) and Dan from 2014 first, every president since 1990 later.
- **Appointments register (closes Q7):** ministers and prime-minister designations, ambassadors and diplomatic posts (appointments and recalls, full history in the depth above), judges, prosecutors and Constitutional Court judges, military and services leadership; all from presidential decrees, each linked to its decree on the legislative portal.
- **Asset and interest declarations:** record only that a declaration was filed and when, and link to the official list; never download or read the content (Constitutional Court Decision 297/2025).
- **CVs:** show birth date and place, education, and the professional, political and parliamentary career; marital status and children are not stored.
- **Party money:** totals by party, year and donor type (subsidies, fees, donations, loans, campaign reimbursements); donors are summarised as companies and individuals, with no private names.
- **Access:** web pages plus open downloads (CSV and JSON dumps with stable IDs and a stated licence), so journalists and researchers can reuse the data. A public API is not planned.

