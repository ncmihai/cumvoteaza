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

- Re-run the database-backed vote journey and failure/recovery UI checks against the new build. The previous full responsive suite remains a Phase 3 task.
- Extend the same explicit availability policy to older member/party/composition fallback paths before describing the entire public website as fail-closed.
- Add first-class source-backed vacancy and editorial verification records if these are to be displayed as facts. Until then their absence must remain qualified, not inferred.

No database migration or canonical data rewrite is required for the safeguards above. No publication/import was run. Phase 2 interaction work is intentionally untouched.
