# Collaboration Workflow

This is the working agreement for two contributors building `cumvoteaza`
together.

## Goal

Both contributors can work independently, deploy their own preview branch, test
it, review each other, and merge safely into `main`.

`main` is production. Do not code directly on `main`.

## Daily Start

At the beginning of a work session:

```bash
git checkout main
git pull origin main
npm install
npm run typecheck
```

Create a branch for your task:

```bash
git checkout -b feature/short-description
```

Good branch names:

```text
feature/bill-parser-v2
feature/data-health-review-mode
feature/vote-repair-commands
fix/ocr-short-text-quality
ui/data-health-density
docs/contributor-workflow
```

Avoid vague branch names like `new-stuff`, `changes`, or `mihai-work`.

## Working Locally

Run the app:

```bash
npm run dev
```

Run checks before pushing:

```bash
npm run typecheck
npm run test -- --runInBand
npm run build
```

If the change touches only docs, `npm run typecheck` is enough.

## Push And Preview

Push your branch:

```bash
git push -u origin feature/short-description
```

Open a pull request into `main`.

Vercel should create a preview deployment for the branch or PR. Add the preview
URL to the PR description.

Each contributor tests their own preview before asking for review.

## Pull Request Template

Every PR description should include:

```md
## What changed

- ...

## How I tested

- [ ] npm run typecheck
- [ ] npm run test -- --runInBand
- [ ] npm run build
- [ ] checked Vercel preview

## Data / DB impact

- Migration: yes/no
- Uses production DB: yes/no
- Repair command needed: yes/no
- Import command needed: yes/no

## Screenshots or preview links

- Preview:
- Important pages:

## Risks / rollback

- ...
```

## Review Rules

The reviewer checks:

- no secrets or `.env` files
- no official PDFs committed or stored
- migrations are intentional
- repair commands remain dry-run by default
- import commands are capped and polite
- UI works on mobile and desktop if UI changed
- `tasks.md` / `docs/progress.md` updated for meaningful workflow changes
- preview URL works

Do not merge your own PR unless it is an urgent fix and the other contributor
is unavailable.

## Merge Order

If two PRs are open:

1. Merge the smaller or lower-risk PR first.
2. The second contributor updates their branch:

```bash
git checkout feature/other-work
git fetch origin
git rebase origin/main
git push --force-with-lease
```

3. Re-test the second preview.
4. Merge the second PR.

Use `--force-with-lease`, never plain `--force`.

## Database Rules

The database is the main risk.

Production Vercel uses the production Neon database.

Preview branches should ideally use a staging Neon database or Neon branch. If
previews are still pointed at production, be conservative:

- review actions are okay because they only update `data_health_reviews`
- repair commands must be dry-run first
- do not run broad imports from a preview branch
- do not run migrations against shared Neon without telling the other person
- do not mutate canonical bills, votes, documents, or chunks from the web UI

Before running a migration:

```bash
git checkout main
git pull origin main
npm run db:migrate
```

Coordinate in chat before running migrations on shared Neon.

## Data Health Workflow

Use:

```text
/ro/data-health
```

Enter the value of `DATA_HEALTH_REVIEW_TOKEN` in the page's review token field.

Recommended queue order:

1. OCR
2. Structură text
3. Voturi nelegate
4. Identificatori duplicați
5. Proceduri lipsă
6. Titluri slabe

For each row:

1. Open app link.
2. Open official source.
3. Decide whether it is valid, ignored, accepted, or needs repair.
4. Use the suggested command as dry-run first.
5. Add `--persist` only after evidence is solid.

## Repair Commands

Dry-run examples:

```bash
npm run repair:link-vote-bill -- --vote-id=... --bill-id=...
npm run repair:refresh-missing-procedure -- --bill-id=...
npm run repair:duplicate-bill-plan -- --primary-bill-id=... --duplicate-bill-id=...
```

Persist only after dry-run review:

```bash
npm run repair:link-vote-bill -- --vote-id=... --bill-id=... --persist --reviewer=your-name
```

If a command says `blocked_weak_match`, do not force it unless both
contributors agree after checking the official source.

## Import Rules

CDEP is fragile. Keep imports:

- capped
- sequential
- polite
- reviewed after each batch

Good examples:

```bash
npm run ingest:audit:bill-text-quality -- --year=2026 --suspicious-only
npm run ingest:bill-text:batch -- --year=2026 --limit=25 --summary-only
```

Do not start broad 2025 extraction until the 2026 OCR/parser review queues are
under control.

## Recommended Tomorrow Plan

1. Both pull latest `main`.
2. Confirm `npm run typecheck` passes locally for both.
3. Choose two separate tasks:
   - Contributor A: review/fix OCR and text-structure rows.
   - Contributor B: inspect unlinked votes and duplicate plans.
4. Create two branches.
5. Push both branches and get Vercel previews.
6. Work for a fixed block of time.
7. Meet and compare:
   - preview URLs
   - PR diffs
   - data-health counts
   - any migration/import/repair commands used
8. Merge one PR.
9. Rebase the other PR.
10. Re-test and merge the second PR.

## Future Improvement

The best future setup is one Neon branch per feature branch:

```text
Git branch: feature/parser-v2
Neon branch: feature-parser-v2
Vercel preview DATABASE_URL: Neon feature branch URL
```

That would let both contributors test database changes without touching the
production database. Until that exists, treat preview deployments as potentially
connected to shared data.
