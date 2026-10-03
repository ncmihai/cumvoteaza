# Decisions and open questions

Questions start under **Open**. When answered, they move to **Decided** with the
date and the reason, and are never deleted, so we don't re-argue them later.
Each Open question has a recommendation; the owner decides.

---

## Open

### Q1 — Where does the unattended updater run?
- **BC250 at home (recommended).** Romanian residential IP (CDEP drops some networks, see `cdep-access.md`), always on, and the same box as the local model. Runs from a systemd timer. Downside: it's your hardware, so power, OS updates and reachability are on you.
- **GitHub Actions cron.** Free for public repos and has logs, but runs from datacenter IPs that CDEP/Senate may block. Needs a test.
- **Vercel cron.** No. Hobby limits on duration and frequency, and production imports were deliberately retired from Vercel.
- Need from owner: will the BC250 be always on? Which OS? Can it reach `cdep.ro` and `senat.ro`?

### Q2 — Auto-publish or approve?
- **Recommended:** auto-publish official facts (votes, rosters) **only when every integrity check passes**; hold anything that fails and notify. Anything model-generated always needs human approval.
- Alternative: approve every batch. Safer, but the data goes stale whenever you're busy, which is today's problem (D2).
- Also: how should notifications reach you (email, Telegram, Discord, GitHub issue)?

### Q3 — Backups of local data
- About 2.5 GB in `data/`: `parliament-workbench/` 2.1 GB (jobs 849 MB, backups 377 MB, wiki 388 MB, SQLite 314 MB), `cdep-history/` 139 MB, and others. Neon is backed up by Neon; this data is not.
- **Recommended:** decide what is worth keeping first (much of it is regenerable job output), then sync the rest to one place (external disk or a cloud drive).
- Need from owner: where to back up.

### Q4 — Bug intake from the tester
- **Recommended:** GitHub Issues with a short bug template (URL, what you expected, what you saw, screenshot).
- If the repo goes private again, the tester must be added as a collaborator.

### Q5 — One ingestion stack: TypeScript or Python?
- Today: TypeScript `packages/ingest` (~14k lines, writes the DB) plus Python `tools/parliament-pipeline`, `cdep-history-probe` and the workbench (~24k lines).
- **Leaning TypeScript.** It shares the schema, types and DB client with the site. Decide after the Phase 1 audit.

### Q6 — Cockpit: rebuild, shrink or drop?
- Owner uses it only to add votes and finds it hard to navigate.
- **Leaning:** replace it with the headless updater (Phase 3) plus a small review page for held batches and model suggestions. Decide after the audit.

### Q7 — Ambassadors scope
- Current ambassadors only, or every appointment and recall during the legislature? Which official source (presidency decrees in Monitorul Oficial, MAE lists)?

### Q8 — Repo visibility
- Public today so it can be reviewed. If it goes private: GitHub Actions minutes become limited, and the tester needs access. Vercel Hobby works either way.

### Q9 — Name and domain
- Site is `cumvoteaza`, repo is `cumvoteaza`, package/folder/DB is `cumsevoteaza`, docs mention `cumsevoteaza.ro`. Pick one name. A domain is optional.

### Q10 — Vercel Hobby is non-commercial
- Fine for now. Any donations or ads would require a paid plan or another host.

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
