# Decisions and open questions

Questions start under **Open**. When answered, they move to **Decided** with the
date and the reason, and are never deleted, so we don't re-argue them later.
Each Open question has a recommendation; the owner decides.

---

## Open

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

### Q11 — How does the updater notify you?
- When a batch is held (a check failed) or the updater itself fails, how should you hear about it: email, Telegram, Discord, or a GitHub issue opened automatically?
- **Recommended:** an automatic GitHub issue. It's free, has a history, and you and the tester both see it.

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

