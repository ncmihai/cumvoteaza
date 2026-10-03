# Data-trust repair — Phase 1

Implementation started 25 September 2026, following the [24 September review](review-2026-09-24.md).

## Implemented safeguards

- Vote/bill explorer queries and filter-option queries throw on database failure rather than returning demo records. Failures escape the success cache. Directory APIs return a non-cacheable 503; the public route error boundary offers Retry.
- Database-free vote/bill previews require `CUMSEVOTEAZA_DEMO_MODE=1`; the locale layout displays a persistent demo warning. A configured database failure never enables demo fallback.
- Vote seat assembly keeps missing nominal evidence as `unknown`, preserves oversized rosters for inspection, and merges known `personId` aliases without fuzzy name matching. Conflicting nominal choices become unknown, not last-write-wins.
- The map checks independent official choice totals, attendance, optional official absence totals and configured dated capacity. Capacity mismatches are disclosed; they do not create fictional vacant mandates. Explicit vacancy records are not yet available in this read model.
- Cabinet dates say “effective” rather than “verified”. No verification timestamp is invented when no review receipt is available.
- Ministry directory caches use shared ministry/government/composition tags, included in the existing reviewed-release revalidation endpoint.

## Verification

25 web tests pass, including eight new tests covering explicit demo opt-in, database failures, independent totals, missing data, duplicate/conflicting rows, linked identities and oversized rosters. Web TypeScript checks and the production build pass. Against an intentionally unreachable database on an isolated local server, both directory APIs return 503 with `Cache-Control: no-store` and no demo records.

## Remaining acceptance work

- Database-backed reads were rechecked after restoring the configured database: the directory API returns `sourceKind: database` and the PL-x 159/2026 page renders real records. This confirms recovery after restarting the isolated local server, not a same-process outage/recovery drill. The full responsive suite remains a Phase 3 task.
- Completed in the follow-up: member directory/profile, party profile and current/history composition reject database failures rather than substituting demo or empty-history success. Their cache keys were versioned to avoid retaining previous fallback results.
- Add first-class source-backed vacancy and editorial verification records if these are to be displayed as facts. Until then their absence must remain qualified, not inferred.

No database migration or canonical data rewrite is required for the safeguards above. No publication/import was run. Phase 2 interaction work is intentionally untouched.

## Follow-up verification

Commit `ff68d4a` containing the initial safeguards and review docs was pushed to `origin/main`. The subsequent legacy-path repair passes 26 web tests, TypeScript and the production build. In-app-browser checks against an intentionally unavailable local database confirmed the Romanian member error page, Retry under continued outage, and the English composition error page. Successful recovery with real database data and the vote-map visual acceptance check remain outstanding; these checks are not a full responsive certification.

The legacy-path repair was subsequently committed and pushed as `e7ebb11`. A database-backed browser check shows 302 recorded present votes and 28 unknown seat choices, with 330 mapped people versus configured capacity 331. Neither missing nominal rows nor the capacity discrepancy is treated as proof of absence/vacancy. The sidebar label was further qualified as “absențe consemnate” / “recorded absences” so zero explicit absence records cannot be mistaken for complete attendance coverage. No underlying parliamentary records were changed.

The rebuilt production page was then checked in the browser: the qualified absence label is visible, selecting Alexandru-Florin Rogobete with Enter opens a panel showing `Necunoscut`, and closing the panel removes it. The legend keeps 28 unknown choices distinct from the official totals; the capacity warning stays visible. The final wording change passes all 26 web tests, TypeScript and the production build. This closes the representative recovered-data/map check above, but does not certify every viewport or same-process outage recovery. The configured 331-seat capacity versus 330 mapped people still needs source-backed data reconciliation; the UI deliberately does not resolve that discrepancy by inference.
