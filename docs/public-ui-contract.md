# Public UI completion contract

Status: active implementation contract, started 11 September 2026.

This document defines what “finished” means for the public website. It complements `current-state.md`: the roadmap describes direction, while this contract records observable behavior, data ownership and release gates.

## Product principles

1. The first screen answers a civic question; raw official wording remains available as evidence.
2. Every visible control works, explains why it is unavailable, or is removed.
3. The interface distinguishes verified facts, reviewed editorial text, calculated summaries and unavailable data.
4. Dates, legislatures and chambers are part of the fact. Related facts must use the same effective date and scope.
5. Missing data never becomes zero, absence, inactivity, opposition or an inferred legal outcome.
6. Filters, sorting and selection survive reload and browser history when they define the user's context.
7. Romanian and English routes share structure and data; untranslated editorial text is labeled rather than silently presented as translated.

## Shared state contract

Every data-backed surface must support these states where applicable:

| State | Required presentation |
| --- | --- |
| Loading | Stable skeleton or progress label; controls that would conflict are disabled. |
| Ready | Verified facts and their scope are visible. |
| Empty | Explain what is empty and offer a relevant reset or next destination. |
| Partial | Show the available result plus a visible coverage/source qualification. |
| Error | Plain-language failure, retry where safe, and no demo data disguised as production. |
| Stale | Show the last verified date and avoid “current” claims. |

## Route and control matrix

Priority: P0 blocks trustworthy use; P1 blocks the main journey; P2 is required for a polished release.

| Surface | User goal | Primary controls | Data owner | Required states | Current health | Priority / acceptance gate |
| --- | --- | --- | --- | --- | --- | --- |
| `/{locale}` | Understand the latest meaningful decisions | Global search, filters, featured vote selection, Hot, share, vote/detail/source links | Vote presentation, reviewed explanation, engagement | Empty, partial explanation, source stale, share success/error | Phase 2 complete; controls are real and selection has URL/history semantics; outcome remains explicitly unknown until authoritative data exists | P0: no inferred outcome; P1: every visible control works and selection has URL/history semantics |
| `/{locale}/votes` | Find and inspect a vote | Search, filter disclosure, applied filters, result selection, load more, share, full detail | Vote directory query + vote presentation | Loading, empty, error, end of results | Repaired; full-width two-column layout, readable list, explicit load-more, applied-filter summary and URL-backed selection | P0: readable two-column layout; P1: explicit pagination/load-more and URL state |
| `/{locale}/votes/{id}` | Understand one motion and its evidence | Back, share, bill/member/group links, official source, explanation disclosure | Vote presentation + vote detail query | Missing bill, partial totals, no explanation, missing source | Phase 2 complete; direct route has a decision-first main column, result/evidence rail and deeper dossier disclosure | P0: motion outcome separated from bill status; direct route complete without previous state |
| `/{locale}/bills` | Find a legislative dossier | Search, filters, applied filters, load more, bill link | Bill directory query + bill presentation | Loading, empty, error, partial source | Shared directory foundation; deep interaction audit pending | P1: unique dossiers, readable title/status, stable URL filters |
| `/{locale}/bills/{id}` | Follow substance, documents and procedure | Document open, text toggle/search, comparison, timeline, related votes/sponsors | Bill presentation + dossier/document queries | Missing text, unsupported document, OCR partial, no related vote | Feature-rich legacy surface; visual/behavior audit pending | P1: progressive disclosure preserves every evidence tool |
| `/{locale}/members` | Find a representative | Search, legislature/chamber/group filters, sort, load more, profile link | Member directory query | Empty, no image, zero/partial vote coverage, end of results | Functional but cluttered; only first 60 shown without load-more | P1: compact sort, explicit paging, coverage-safe activity labels |
| `/{locale}/members/{slug}` | Understand a member's scoped activity and career | Legislature switch, vote/bill/party/source links | Member activity presentation + career data | Missing image, no eligible denominator, partial votes, no party | Golden journey complete; vote context is preserved, return navigation is verified and coverage is labeled truthfully | P0: no attendance percentage without eligible denominator; P1: repaired timeline and scope synchronization |
| `/{locale}/parties/{slug}` | Understand current representation and behavior | Members, votes, composition, history, official source | Party current-state presentation + dated memberships | Historical-only government relation, no history/logo/votes | Phase 3 complete; current role, chamber totals, recent votes, member directory, history and official source are responsive and linked | P0: current relationship must be valid on the displayed date; P1: current/historical member counts separated; unknown government role stays unclassified |
| `/{locale}/compozitii` | See who holds seats at a date | Current/history, date/legislature, group links, methodology | Composition snapshot presentation | Vacancies, unknown affiliation, incomplete snapshot, no government evidence | Phase 3 complete; current party/group maps, exact totals, methodology rail and URL-backed history are responsive | P1: party/group composition first with capacity and snapshot date; government alignment remains unknown until verified |
| `/{locale}/data-health` | Understand coverage and known limitations | Queue filters, methodology/source links; protected review controls | Data-health queries/review API | Loading, empty, auth-required, error, stale | Not included in this first interaction audit | P1: editorial shell plus clear public/operator boundary |
| Header / global navigation | Move between product areas and language equivalents | Logo, nav, global search, locale, mobile menu | Route map + entity locale mapping | Active nested route, menu open/closed, missing translated entity | Mostly functional; global search icon is only a vote-directory link | P1: global search or honest label; locale retains entity and applicable filters |

## Control-level rules

- Search submits with button and Enter, preserves the query in the URL and has loading, no-results and error feedback.
- Filters expose their current values outside the disclosure and have a one-action reset.
- Sorting uses one selected value; metrics with incomplete comparability are omitted or qualified.
- Load more is initiated by the user. Automatic background prefetch may occur, but must not append unexpected results.
- Share targets the canonical entity URL and falls back to copy-link with visible success/error feedback.
- “Official details” opens an official source; an internal route is labeled “full details.”
- Tabs and accordions expose selected/expanded state to assistive technology and work by keyboard.
- Entity rows have one clear navigation target; nested actions must not create nested interactive elements.
- Language controls use text or an accessible language name, not a flag as the only meaning.

## Presentation contracts

The initial executable contracts live in `apps/web/lib/public-presentation.ts`.

- `presentVote`: readable identifier/heading, official title, subject, totals, source and an outcome supplied only by an authoritative field or reviewed mapping.
- `presentBill`: readable title/status alongside unchanged canonical source text.
- `presentMemberActivity`: eligible participation only with a verified denominator; otherwise coverage counts or unavailable state.
- `selectCurrentPartyState`: relationship and government intervals must both contain the displayed date.
- `presentCompositionSnapshot`: capacity, occupied mandates, vacancies and unknown affiliation remain separate.
- `presentSource`: parser status and freshness are separate signals.

## Release gates

1. No public component derives a legal outcome by regexing the title.
2. No public component labels imported-record coverage as attendance.
3. No “current” party/government/composition fact is selected without effective-date validation.
4. Homepage → vote → member → party → composition works with direct URLs, Back/Forward and keyboard navigation.
5. All controls in the route matrix have a tested behavior or are removed.
6. RO/EN, empty/partial/error states and 360/390/768/1024/1280/1440 widths are checked.
7. Typecheck, unit tests, production build and browser console checks pass.

## Deferred from phases 0–1

- Broad visual restyling and exact mockup matching.
- New global-search backend implementation.
- Cockpit editorial schema changes.
- Political scoring or automated impact claims.
- Repairing canonical source data or withheld Senate drafts.
