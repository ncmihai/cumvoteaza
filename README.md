# cumvoteaza

Private-first civic data explorer for Romanian Parliament votes, bills, parties,
and parliamentary careers.

Public app: <https://cumvoteaza.vercel.app>

**Current status and roadmap:** [`docs/current-state.md`](docs/current-state.md)

**Documentation index:** [`docs/README.md`](docs/README.md)

## Workspace

```text
apps/web                  Next.js bilingual web app
packages/parliament-model Shared domain types, labels, parser/diff helpers
packages/db               Drizzle schema and database client
packages/ingest           Official-source parsers, importers, audits, repairs
docs                      Planning, progress, and source notes
tools                     Local helper tools, including PDF OCR
```

## First-Time Setup

Requirements:

- Node.js 22
- npm
- Docker, only if using local Postgres
- GitHub access to `ncmihai/cumvoteaza`

Clone with SSH:

```bash
git clone git@github.com:ncmihai/cumvoteaza.git
cd cumvoteaza
npm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

For the original local development database:

```bash
npm run db:up
npm run db:migrate
npm run dev
```

The default app URL is `http://localhost:3000/ro`. The persistent local preview may use port 3001 when port 3000 is occupied.

For shared Neon-backed work, ask the project owner for the private `.env`
values. Never commit `.env`, `.env.local`, exported database URLs, Digi
credentials, Vercel tokens, or review tokens.

## Required Environment Variables

Minimum local development:

```text
DATABASE_URL=postgres://postgres:postgres@localhost:5432/cumsevoteaza
DATABASE_MAX_CONNECTIONS=3
```

Private deployment / review features:

```text
CUMSEVOTEAZA_SITE_PASSWORD=
CRON_SECRET=
DATA_HEALTH_REVIEW_TOKEN=
```

Asset imports require Digi Storage credentials. Do not run broad asset imports
unless you know which storage target is configured.

## Git And Release Workflow

`main` is the production branch and deploys through Vercel. The operator may push a reviewed, verified change directly to `main`, which is the workflow used for the September data and UI releases. Use `dev` when two contributors need a shared preview before production.

Before starting work:

```bash
git checkout main
git pull origin main
npm install
npm run typecheck
```

Before a production push:

```bash
npm run typecheck
npm test
npm run build
git status
git add <reviewed-files>
git commit -m "Describe the change"
git push origin main
```

For concurrent contributor work, follow [`docs/collaboration-workflow.md`](docs/collaboration-workflow.md) and merge the reviewed `dev` preview into `main`.

## Dev Review Checklist

Before merging `dev` into `main`, check:

- no secrets or `.env` files committed
- no official PDFs stored in the repo or Digi
- migrations are intentional and documented
- repair commands are dry-run by default
- CDEP import commands are capped and polite
- `tasks.md` and `docs/progress.md` updated for meaningful workflow changes
- Vercel `dev` preview works
- `npm run typecheck`, `npm test`, and `npm run build`
  pass

## Database And Migrations

Create a migration after schema changes:

```bash
npm run db:generate
```

Apply migrations:

```bash
npm run db:migrate
```

Coordinate before running migrations against the shared Neon database. Migrations
change the environment used by both developers and the deployed app.

Current important migration:

```text
0015_data_health_reviews.sql
```

It creates review state for `/ro/data-health`.

## Data Health Workflow

Public queue page:

```text
/ro/data-health
```

Review actions require the value of:

```text
DATA_HEALTH_REVIEW_TOKEN
```

The review API only marks issue state. It does not repair canonical bills,
votes, documents, or text chunks.

Recommended review order:

1. OCR suspicious rows
2. `Structură text` parser warnings
3. unlinked votes
4. duplicate identifiers
5. missing procedure timelines
6. weak vote titles

Repair commands are explicit and dry-run by default:

```bash
npm run repair:link-vote-bill -- --vote-id=... --bill-id=...
npm run repair:refresh-missing-procedure -- --bill-id=...
npm run repair:duplicate-bill-plan -- --primary-bill-id=... --duplicate-bill-id=...
```

Add `--persist` only after reviewing the dry-run output.

## Import And Audit Commands

Examples:

```bash
npm run ingest:audit:dossier-reconciliation -- --sample-limit=20
npm run ingest:audit:bill-text-quality -- --year=2026 --suspicious-only
npm run ingest:bill-text -- --document=doc-id --persist --insecure
npm run ingest:bill-text:batch -- --year=2026 --limit=25 --include-unsupported --summary-only
```

Treat CDEP as fragile. Keep imports capped, sequential, and polite.

Do not store official PDFs. Store only derived `.txt`, photos, logos, CVs, and
small derived assets.

## Deploy

Vercel deploys from GitHub repo:

```text
git@github.com:ncmihai/cumvoteaza.git
```

Normal deploy flow:

```bash
git checkout dev
git pull origin dev
# review and verify dev
git checkout main
git pull origin main
git merge dev
git push origin main
```

Vercel builds from the monorepo root using `vercel.json`. `main` is
production. `dev` is the shared preview/staging branch.

## Data Principles

- Official public pages are the source of truth.
- Every import stores source URL, fetch time, content hash, parser version, and
  parse status.
- Party and parliamentary group affiliation is temporal, never a single current
  field.
- Official PDFs stay external.
- Digi Storage is for low-size derived assets only.
- Neon is the source of truth for facts, metadata, chunks, search, and UI
  queries.
- V1 stays factual: no ideological scores, endorsements, or editorial labels.
