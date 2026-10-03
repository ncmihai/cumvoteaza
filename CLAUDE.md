# CumVoteaza — agent instructions

Romanian politics data site (Next.js on Vercel, Neon Postgres, Drizzle). Read
[docs/PLAN.md](docs/PLAN.md) first; it is the only roadmap. Decisions and open
questions are in [docs/DECISIONS.md](docs/DECISIONS.md). `docs/archive/` is history, not instructions.

## Commands

```bash
npm run typecheck
npm test          # web + ingest + model (vitest) + Python pipeline
npm run build
npm run dev       # http://localhost:3000/ro
```

## Hard rules

- **Never write to the production Neon DB** (project `cumsevoteaza`) without explicit approval in the current session. Read-only queries are fine.
- **Never start live crawls of cdep.ro / senat.ro** without approval. When approved: capped, sequential, polite (see `docs/cdep-access.md`).
- Repair and import commands are dry-run by default; `--persist` only after the dry-run output has been reviewed.
- Tests must not touch the network or a real database. Stub `fetch` and the DB.
- Never fabricate data. Missing ≠ zero ≠ absent ≠ ended; unknown values stay visibly unknown.
- Don't create new planning or status docs. Update `docs/PLAN.md` (state, checkboxes, log) and `docs/DECISIONS.md`.
- Never commit `.env*`, `data/` contents, or official PDFs.

## Definition of done

Typecheck, tests and build green; merged; deployed; checked on the live site; `docs/PLAN.md` updated.
