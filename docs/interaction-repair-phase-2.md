# Phase 2 — interaction repairs

Started 26 September 2026.

Implemented locally:

- Vote-map search normalizes accents and Romanian comma/cedilla variants without altering displayed official names.
- Search includes constituency and full parliamentary-group names, and matches multiple terms across fields.
- Search labels advertise constituency lookup in both locales.
- Escape closes an open filter panel first and restores focus to its trigger; a pinned person is retained until a subsequent Escape. Seat handlers no longer bypass this order.
- Search, group/choice filters and pinned seat are URL-backed (`mapSearch`, `mapGroup`, `mapChoice`, `mapSeat`). Discrete changes push history; typing replaces the current entry. Unrelated query parameters and anchors are preserved. Invalid choice values and unavailable groups do not become active filters.

Verification: 32 web unit tests, web TypeScript checks, and the production build pass. Tests cover spelling variants, constituency/party matching, empty/no-result queries, URL parsing, invalid choices and preservation of unrelated URL state.

Browser verification on the local production build with real database records (PL-x 159/2026): `arges popa` finds Dorin Popa in ARGEŞ; pinning opens his real profile panel; Escape closes filters and focuses their trigger while retaining the panel; subsequent Escape clears selection. Reload restores search, PSD filter and selection. Back removes the PSD filter while retaining the person; Forward restores it. These are focused desktop checks, not certification of the full responsive matrix or every choice-filter combination.

Remaining Phase 2 scope: selection focus behavior across all entry points, mobile readability/group enlargement, cabinet-role and historical-group-label disambiguation, and bounded profile source queries. Phase 1 capacity discrepancy remains disclosed and unresolved rather than inferred.
