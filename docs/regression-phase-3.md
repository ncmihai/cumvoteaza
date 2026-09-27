# Phase 3 — regression and release verification

Started 26 September 2026 after Phase 2 implementation.

## Completed this sprint

- Replaced obsolete map/list-tab expectations with the primary map plus collapsed nominal disclosure and 30-row pagination contract.
- Added real-page identity assertions before responsive measurements so an error heading cannot masquerade as success.
- Expanded the four representative detail-page matrix to RO and EN at 320, 375, 768, 854, 1024, 1280 and 1920px (56 route/width combinations).
- Added desktop selection focus return, URL reload/history, mobile enlarged-group labels/touch-target size, sheet dismissal/focus return and no-result coverage.
- Corrected an overbroad absence-label assertion: documented-absence sorting is intentional; the unqualified old label is not.

## Results

- 34 web unit tests pass, including data-availability, conflicting/duplicate nominal rows, independent reconciliation, search/URL parsing and bounded profile provenance queries.
- TypeScript and production build pass.
- `npm run test:responsive --workspace=@cumsevoteaza/web`: **15 passed**, including the complete bilingual detail-width matrix and application console/network checks.
- Sandboxed Chromium initially failed before app assertions. A permission-approved run resolved the launch restriction. An overlapping runner briefly lost its shared server; both were stopped and the final clean run above was performed independently.

## Release boundaries

- Physical iOS/Android device review is still a manual release check, not covered by Chromium touch emulation. See the reliability runbook.
- Do not treat the known 330-person/331-capacity discrepancy as solved by passing interaction tests.

No deployment, commit or push was performed for this sprint's new changes.

## Phase 3A — first verification batch

- Added and passed two bilingual ministry-directory → ministerial history → government → member-profile journeys. They check source links, investiture disclosure, person identity and government-role history.
- Added and passed keyboard seat-arrow navigation, Enter selection, filter-first Escape and return to the selected seat.
- Added three cache endpoint unit tests: unauthorized calls cannot invalidate caches; authorized refreshes include all public tags, including ministries and governments; retired direct production imports remain disabled.
- Results: **37 unit tests pass**, TypeScript and production build pass; **3 new browser tests pass** in an independent targeted run. The preceding 15-test full suite was not rerun in this batch.
- Cache tests mock Next's invalidation function. They verify the endpoint contract, not actual stale-while-revalidate propagation after a published database change. That integration check remains open, along with same-process database outage/recovery and physical-device review.

## Phase 3A — final engineering verification, 27 September 2026

The later integration tests below close the cache and recovery gaps from the first batch; the historical results above are retained for context.

- **38 unit tests pass**, including ministry-directory failure/recovery and authorized cache invalidation; TypeScript passes.
- **21 browser tests pass in one clean full run**, covering RO/EN page identities and widths, cabinet/ministry journeys, enlarged-group touch events, keyboard navigation, layered Escape, focus fallback when a search result disappears, group label/seat/arc hover and reduced-motion CSS.
- Added a disposable local PostgreSQL suite using the real application and real Next cache, separate build/cache directory, fixed local credentials and container-purpose validation. It tests stale data before invalidation, fresh data after invalidation, and PostgreSQL stop/start followed by UI Retry without restarting Next.
- Fixed two real defects discovered by these checks: ministry-directory database errors were converted to cacheable empty results; Retry reset the error boundary without refreshing the server component payload.
- Corrected arc targeting in the test to sample a point on the SVG curve instead of its empty bounding-box center. Reduced-motion assertions check `transition-property: none`, not an irrelevant retained duration value.
- Multi-navigation tests have explicit total time allowances; no assertions were removed to obtain passing results.

Final isolated suite: **2 passed (15.8 seconds)** on the final code, with a successful production build. Automated engineering verification is complete. Physical-phone testing remains explicitly unverified and must be signed off by a device owner before public release; it does not require changes to the historical-import design in 3B. No production data was modified.

Reproduction: [Phase 3A reliability runbook](phase-3a-reliability-runbook.md).
