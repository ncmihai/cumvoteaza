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
npm run verify    # typecheck + test + build, the pre-commit gate
```

## Databases

- `.env` and `apps/web/.env.local` point at the Neon **dev** branch (a copy of production). Every command runs there by default.
- Production credentials live only in `.env.production`. The CLI tools refuse to open the production host unless the user runs them through `npm run prod -- <script>`, which prints a banner and asks for confirmation. Agents never run that wrapper and never set `ALLOW_PRODUCTION`; hand the user the command instead.
- Local evidence (`data/cdep-history`, `data/curated`) is backed up off-laptop with `npm run ingest:backup:local-data` (Digi Storage, SHA-256 verified).

## Hard rules

- **Never write to the production Neon DB** (project `cumsevoteaza`) without explicit approval in the current session. Read-only queries are fine. Bulk production writes are run by the user (see the production guard above).
- **Never start live crawls of cdep.ro / senat.ro** without approval. When approved: capped, sequential, polite (see `docs/cdep-access.md`).
- Repair and import commands are dry-run by default; `--persist` only after the dry-run output has been reviewed.
- Tests must not touch the network or a real database. Stub `fetch` and the DB.
- Never fabricate data. Missing ≠ zero ≠ absent ≠ ended; unknown values stay visibly unknown.
- Don't create new planning or status docs. Update `docs/PLAN.md` (state, checkboxes, log) and `docs/DECISIONS.md`.
- Never commit `.env*`, `data/` contents, or official PDFs.

## Definition of done

Typecheck, tests and build green; merged; deployed; checked on the live site; `docs/PLAN.md` updated.
