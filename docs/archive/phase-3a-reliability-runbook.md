# Phase 3A reliability checks

## Isolated database tests

The reliability suite uses a fixed, disposable local PostgreSQL database. It never reads `DATABASE_URL` from the shell for its test client; the Next server receives the same explicit local URL. A container purpose label is checked before any stop/start operation. Do not run this concurrently with another Next build in this workspace.

Create the test container once:

```sh
docker run --detach --name cumvoteaza-phase3a-test \
  --label cumvoteaza.purpose=phase3a-test \
  --publish 127.0.0.1:55439:5432 \
  --env POSTGRES_PASSWORD=phase3a-local \
  --env POSTGRES_DB=phase3a_test postgres:16-alpine
```

For subsequent runs, start the existing container:

```sh
docker start cumvoteaza-phase3a-test
npm run test:reliability --workspace=@cumsevoteaza/web
docker stop cumvoteaza-phase3a-test
```

The suite migrates the local database and upserts one synthetic ministry. It verifies:

1. A source change remains cached until an authorized invalidation, then becomes visible through actual Next stale-while-revalidate behavior.
2. Stopping PostgreSQL produces an unavailable page, not demo data; restarting PostgreSQL and pressing Retry restores the real fixture in the same Next process.

The web server uses port 3119 and `.next-reliability`, separate from normal preview caches. Fixture data remains in the stopped container for reproducibility; no production records are modified. Local credentials are test-only. Initial stale-cache refresh is polled because `revalidateTag(..., "max")` is asynchronous by design.

## Browser and unit checks

```sh
npm run test --workspace=@cumsevoteaza/web
npm run typecheck --workspace=@cumsevoteaza/web
npm run test:responsive --workspace=@cumsevoteaza/web
```

Browser launch needs permission to run Chromium outside the macOS sandbox. The normal browser suite reads the configured application database but does not publish editorial changes. Generated traces/reports are ignored by Git.

## Physical-device boundary

Viewport tests and Chromium touch-event emulation are automated checks, not a claim of testing physical iOS/Android hardware. Before a public release, a device owner should check tapping dense seats, enlarged-group scrolling, sheet close/profile controls and rotation on their phone. This manual release check must not be reported as passed without device evidence.
