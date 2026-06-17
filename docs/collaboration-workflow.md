# Collaboration Workflow

This is the working agreement for two contributors building `cumvoteaza`
together.

## Branch Model

Use only two active shared branches:

```text
dev  = shared active work / Vercel preview
main = production
```

Both contributors may push directly to `dev`.

Nobody commits directly to `main`. `main` is updated only by merging reviewed
and verified `dev`.

## One-Time Setup

Create `dev` from current `main`:

```bash
git checkout main
git pull origin main
git checkout -b dev
git push -u origin dev
```

After this, both contributors should fetch and track `dev`:

```bash
git fetch origin
git checkout dev
git pull origin dev
```

## Daily Start

At the beginning of every work session:

```bash
git checkout dev
git pull origin dev
npm install
npm run typecheck
```

If `git pull` shows conflicts or unexpected changes, stop and resolve them
together before coding.

## Working On Dev

Make changes on `dev`.

Before pushing:

```bash
npm run typecheck
git status
git add .
git commit -m "Describe the change"
git push origin dev
```

For larger or risky changes, also run:

```bash
npm run test -- --runInBand
npm run build
```

After every push to `dev`, notify the other contributor:

```text
Pushed dev: <short summary>. Please pull before continuing.
```

Example:

```text
Pushed dev: updated data-health review copy and repair command docs. Please pull before continuing.
```

## Vercel Preview

Vercel should create or update a preview deployment for every `dev` push.

Use that `dev` preview for shared testing. Production remains `main`.

Before merging `dev` to `main`, both contributors should check the relevant
pages in the `dev` deployment.

## Release Dev To Main

When `dev` is ready:

```bash
git checkout dev
git pull origin dev
npm run typecheck
npm run test -- --runInBand
npm run build
```

Then merge:

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

After `main` is pushed, Vercel production deploys.

Both contributors then return to `dev` and sync it:

```bash
git checkout dev
git pull origin dev
git merge main
git push origin dev
```

If `dev` already contains everything from `main`, Git will report that it is up
to date.

## Review Checklist Before Main

Before merging `dev` into `main`, check:

- no secrets or `.env` files
- no official PDFs committed or stored
- migrations are intentional and coordinated
- repair commands remain dry-run by default
- import commands are capped and polite
- UI works on the `dev` Vercel preview if UI changed
- `tasks.md` and `docs/progress.md` updated for meaningful workflow changes
- `npm run typecheck` passes
- `npm run test -- --runInBand` passes
- `npm run build` passes

## Conflict Rules

If both contributors edited the same file and Git reports conflicts:

1. Stop coding.
2. Resolve the conflict together.
3. Run `npm run typecheck`.
4. Commit the conflict resolution.
5. Push `dev`.
6. Notify the other contributor to pull.

Do not use `git reset --hard`, `git push --force`, or force-push `dev` unless
both contributors explicitly agree.

## GitHub Branch Settings

Recommended GitHub settings:

- Protect `main`.
- Block force pushes to `main`.
- Block deletion of `main`.
- Allow direct pushes to `dev`.
- Do not force-push `dev` unless both contributors agree.

CI should run on pushes to both `dev` and `main`.

## Database Rules

For now, `dev` uses the production Neon database.

That keeps setup simple, but it means `dev` testing can affect shared data.
Use these rules:

- data-health review actions are allowed
- repair commands must be dry-run first
- `--persist` repair commands require both contributors to agree
- migrations require coordination before running
- broad imports require coordination before running
- no destructive manual SQL from `dev`
- no web UI mutations that directly repair canonical bills, votes, documents,
  or chunks

Before a shared migration:

```bash
git checkout dev
git pull origin dev
npm run typecheck
npm run db:migrate
```

Tell the other contributor before and after the migration.

## Data Health Workflow

Use:

```text
/ro/data-health
```

Enter the value of `DATA_HEALTH_REVIEW_TOKEN` in the review token field.

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
5. Add `--persist` only after evidence is solid and both contributors agree
   when the repair changes canonical data.

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

## Tomorrow Work Session

Recommended agenda:

1. Both pull `dev`.
2. Confirm `npm run typecheck` passes locally.
3. Agree who owns which queue or UI area for the session.
4. Work in short blocks.
5. Push small commits to `dev`.
6. Notify after every push.
7. Test the `dev` Vercel preview together.
8. If stable, run full checks and merge `dev` to `main`.

## Future Upgrade

Later, create a staging Neon database for `dev`:

```text
main DATABASE_URL = production Neon
dev DATABASE_URL  = staging Neon
```

Then point the Vercel `dev` preview to the staging `DATABASE_URL`.

That will let both contributors test imports, repairs, and migrations without
touching production data.
