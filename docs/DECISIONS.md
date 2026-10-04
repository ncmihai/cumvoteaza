# Decisions and open questions

Questions start under **Open**. When answered, they move to **Decided** with the
date and the reason, and are never deleted, so we don't re-argue them later.
Each Open question has a recommendation; the owner decides.

---

## Open

### Q8 — Repo visibility
- Public today so it can be reviewed. If it goes private: GitHub Actions minutes become limited, and the tester needs access. Vercel Hobby works either way.

### Q9 — Name and domain
- Site is `cumvoteaza`, repo is `cumvoteaza`, package/folder/DB is `cumsevoteaza`, docs mention `cumsevoteaza.ro`. Pick one name. A domain is optional.

### Q10 — Vercel Hobby is non-commercial
- Fine for now. Any donations or ads would require a paid plan or another host.

### Q12 — Plain-language vote/bill summaries: which model?
- Owner wants summaries in the future. Options: generate on first page view and cache; a local model on the BC250 (batch, free); a very cheap hosted model.
- Constraints: summaries are model output, so they need the evidence link and review rules (D-008: model output never auto-publishes, or is clearly labeled as unreviewed); cost must stay near zero.
- The existing (disabled) explanation code and its 3 tables are kept until this is decided.

---

### Q15 — Storage: shrink the data or pay for more space?
- Neon branch limit is 1 GB; we use 321 MB, and `individual_votes` costs about 700 bytes a row. The diet (F2) targets 150 bytes a row, enough for the whole current legislature.
- If the diet falls short, or when older legislatures and change history arrive: a paid Neon plan, or compact storage of old nominal lists outside the database.
- **Leaning:** diet first, pay only when the numbers say so (Principle: near-zero cost).

### Q16 — Older legislatures: show partial data or hide it?
- 2020–2024 has 133 votes and earlier legislatures 1, but full member and career histories. Showing votes there without a label implies completeness.
- **Leaning:** show the histories, label vote coverage per legislature ("partial") on the page, and say so on the methodology page (F4) until a backfill exists.

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

### D-022 — Vote scope for 2024–2028 (2026-10-04, closes Q14)

Decided by the owner on the F1 coverage numbers: import **every Chamber and every Senate vote**, and every **joint** vote except per-article and amendment votes. For the joint sittings of 5 Feb 2025 (budget) and 19–20 Mar 2026 (about 614 amendment votes, about 400 voters each, roughly 245,000 individual-vote rows) the site keeps **one summary row per sitting with a link to the official list**, not the individual votes. Every vote carries its kind so lists can default to final and major votes. The storage target (Q15) is therefore sized for Chamber, Senate and the other joint votes only.

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

