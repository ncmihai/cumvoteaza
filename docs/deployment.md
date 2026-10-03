# cumsevoteaza — Deployment

## Target

Deployment-facing GitHub repo: `https://github.com/ncmihai/cumvoteaza`

The product remains named `cumsevoteaza` in the UI and codebase. The deploy repo
can be named differently without changing package names or routes.

## Vercel Project Settings

Use the monorepo root as the Vercel project root.

- Framework Preset: `Next.js`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `apps/web/.next`
- Node.js: pinned by root `package.json` to `22.x`

The root `vercel.json` records the build settings so the dashboard should need
minimal manual configuration.

## Required Environment Variables

For private preview/deploy access:

```text
CUMSEVOTEAZA_SITE_PASSWORD=<choose-a-private-password>
```

For DB-backed pages later:

```text
DATABASE_URL=<pooled-postgres-connection-string>
DATABASE_MAX_CONNECTIONS=3
```

If `DATABASE_URL` is missing, the app deploys with bundled demo data. When Neon
is added, use the pooled connection string for serverless deployments.
`DATABASE_MAX_CONNECTIONS` is optional; keep it low on Vercel/Neon unless
traffic or Neon compute size justifies increasing it.

For the daily Vercel Cron importer:

```text
CRON_SECRET=<private-random-token>
```

The cron route is `/api/cron/daily-import`. Vercel Cron calls it once per day
from `vercel.json`; the route rejects requests unless the `Authorization`
header is `Bearer ${CRON_SECRET}`.

Use a generated secret, not the site password. A 32+ character random value is
enough; for example, generate one locally with `openssl rand -base64 32` and
store that value only in Vercel/local env.

For anonymous first-party engagement counts:

```text
# ANALYTICS_SALT is no longer used (cookieless counts since 2026-10, D-015); it can be removed from Vercel.
```

Use a separate random value from the site password and cron secret. The app uses
it to hash anonymous visitor cookies before writing page views, searches, and
`hot` reactions. If it is missing, pages still render and analytics endpoints
disable tracking.

Optional local performance logging:

```text
CUMSEVOTEAZA_PERF_LOG=1
```

Use this only while profiling. It logs server data-function timings and is not
needed in production.

For local asset imports, choose one storage provider:

```text
ASSET_STORAGE_PROVIDER=vercel_blob
BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
```

or, for FTP/FTPES-backed uploads:

```text
ASSET_STORAGE_PROVIDER=ftp
ASSET_FTP_HOST=storage.rcs-rds.ro
ASSET_FTP_PORT=21
ASSET_FTP_SECURE=true
ASSET_FTP_USERNAME=<ftp-user-or-email>
ASSET_FTP_PASSWORD=<ftp-password>
ASSET_FTP_BASE_PATH=cumvoteaza-assets
ASSET_FTP_PUBLIC_BASE_URL=<https-public-base-url-for-that-folder>
ASSET_FTP_TIMEOUT_MS=60000
```

The FTP provider is intended for local importer runs only. It uploads optimized
photos, party logos, and CVs with `curl --ftp-create-dirs`; Postgres still keeps
only metadata and the public URL. `ASSET_FTP_PUBLIC_BASE_URL` must be an HTTP(S)
base URL that browsers can load directly. If the storage account only exposes
private FTP paths, use the provider for backups only and add a public-link/API
provider before wiring those URLs into the web app.

Preferred Digi Storage API-backed imports:

```text
ASSET_STORAGE_PROVIDER=digi_storage
DIGI_STORAGE_EMAIL=<account-email>
DIGI_STORAGE_PASSWORD=<account-password>
DIGI_STORAGE_MOUNT_ID=<optional-specific-mount-id>
DIGI_STORAGE_BASE_PATH=cumvoteaza-assets
DIGI_STORAGE_BASE_URL=https://storage.rcs-rds.ro
DIGI_STORAGE_API_URL=https://storage.rcs-rds.ro/api/v2.1
```

The API provider logs in locally, resolves the first `device` mount unless
`DIGI_STORAGE_MOUNT_ID` is set, creates folders, uploads each file through the
Digi upload endpoint, and stores `storage_provider=digi_storage` plus the Digi
`storage_path` in `stored_assets`. The public UI must use
`/api/assets/<stored_asset_id>` instead of Digi shared-link pages. The gateway
uses server-side Digi credentials to obtain a temporary raw download link,
streams the bytes, and adds long-lived public cache headers for photos/logos.
For convenience, the provider also accepts the Digi example names
`DIGI_EMAIL`/`DIGI_PASSWORD`, or the FTP names
`ASSET_FTP_USERNAME`/`ASSET_FTP_PASSWORD`, as credential aliases.

Member-photo imports are resized to `150x200` WebP by default. Party logos keep
their source dimensions for now, and CV PDFs are uploaded as originals.
Photo object paths are grouped by legislature:
`cumvoteaza-assets/parliament-assets/photos/legislature-YYYY-YYYY/<chamber>/...`.
Use `--force` on `ingest:assets:import` only when deliberately migrating
already stored legacy rows to the currently configured provider.

## Current Deploy Mode

- Web app deploys with Neon through `DATABASE_URL`.
- Bill and vote directory pages read Postgres first and fall back to demo data
  only when the database is unavailable.
- Vote and project directory pages use SQL pagination and cookieless, non-identifying
  engagement counts (D-015).
- Vercel Cron only revalidates caches; imports run through the worker (Phase 3).
- Historical 2024-present backfill remains a manual CLI workflow because it can
  run longer than a serverless request should.

## Import Commands

```bash
npm run ingest:discover:senate -- --years=2024,2025,2026
npm run ingest:discover:deputies -- --years=2024,2025,2026
npm run ingest:backfill:2024 -- --max-imports=100
npm run ingest:sync:daily -- --max-imports=30
```

Use the backfill command locally or from a longer-running worker first. Use the
daily sync command for the same bounded workflow that Vercel Cron calls.

For Senate backfill, the official search form can be seeded with a bounded
number range:

```bash
npm run ingest:discover:senate -- --years=2025 --senate-from=1 --senate-to=700
```

Start with a narrow range, verify imports, then widen it.

To include early Senate registration and cross-chamber search forms, pass
explicit prefixes:

```bash
npm run ingest:discover:senate -- --years=2025 --senate-from=1 --senate-to=700 --senate-prefixes=B,BP,L,PLX
```

## Git Flow

Use `origin` for the canonical development repo and a separate deployment remote
for Vercel:

```bash
git remote add vercel https://github.com/ncmihai/cumvoteaza.git
git push vercel main
```

If Vercel is connected to `ncmihai/cumvoteaza`, every push to that repo can
trigger a deployment.
