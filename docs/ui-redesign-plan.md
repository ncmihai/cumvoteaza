# CumVoteaza public website redesign — implementation plan

Status: implemented and locally verified on 11 September 2026. This document preserves the accepted design contract; current gaps and next work live in [current-state.md](current-state.md). The topic-ranking/political-analysis sprint remains deferred. Gemini remains disabled.

## 1. Outcome and visual references

Replace the public site's presentation with the supplied editorial design while keeping real parliamentary data, existing URLs, source traceability and working interactions. This is a redesign of the existing Next.js application, not a separate static prototype.

Saved user references:

1. [Today and vote detail](design/ui-refresh/01-home-vote.png)
2. [Member directory](design/ui-refresh/02-members.png)
3. [Composition](design/ui-refresh/03-composition.png)
4. [Member profile](design/ui-refresh/04-member-profile.png)
5. [Party profile](design/ui-refresh/05-party-profile.png)

Match the hierarchy, proportions, spacing, typography, tables, restrained colors and right-hand panels. The mockups are visual references, not factual sources: example people, roles, parties, counts, dates, percentages and explanatory claims must be replaced with verified application data. For example, the mockups themselves use different Senate denominators.

## 2. Decisions to settle

Confirmed by the operator:

- Brand: **CumVoteaza**, retaining the document logo and adopting the mockup's typography and tagline.
- Vote interaction: desktop list with an interactive detail panel; canonical full detail page on direct navigation and mobile.
- Featured votes: a carousel ranked by the existing **Hot** reaction feature, instead of an editorially chosen single vote.

Proposed carousel defaults to confirm during the first visual review: up to five verified final votes, ranked by existing Hot counts; visible arrows, position indicators and keyboard controls; manual cycling by default. Keep a separate latest-votes list below it. Popularity is recorded site interest, not an opinion poll or a measure of legislative importance. If no eligible votes have reactions, use newest verified final votes and label the fallback honestly. Never invent Hot counts. A recent-date window versus all-history ranking remains one small product choice; recommend a clearly labeled recent window, with its duration settled before implementation. Existing Hot counts are lifetime reactions per record, not a seven-day trending metric.

The active carousel vote and desktop detail panel stay synchronized. Selecting a different recent vote opens that detail without unexpectedly changing the user's list position. New reactions update the displayed count without reshuffling a slide under the reader. No automatic rotation is required; if requested later, include pause/resume, pause on hover/focus and respect reduced-motion preferences.

Planning defaults: public website only; cockpit changes limited to content needed by the public design; Romanian and English supported; responsive desktop/tablet/mobile; existing political scores remain internal. Missing mockups for bills, vote directory and data health will use the same visual system, not unrelated designs.

## 3. Shared design system

- Near-white page and card surfaces, deep navy text/buttons, muted blue body text, fine gray borders, small radii and minimal shadows.
- Large serif page headings and compact serif section headings; readable sans-serif interface text and aligned numeric columns. Confirm a Romanian-diacritic-capable font against the reference before applying globally; self-host licensed font files and retain suitable fallbacks.
- Desktop header: logo/name/tagline, Astăzi, Voturi, Proiecte, Parlamentari, Compoziții, Sănătatea datelor, search and language control. Correct active state on nested routes; party profiles must not highlight Astăzi accidentally.
- Desktop content split approximately 62–65% main / 35–38% aside. At wide widths use a capped canvas so headings and paragraphs do not become excessively long. Test the supplied 1280px reference width first.
- A sticky header and bounded sticky sidebar where useful; avoid trapping scroll inside multiple panels. On narrower screens stack context after primary content. Mobile has a compact menu, readable headings and full-width controls.
- Shared primitives: page header, content/aside shell, tabs, filter panel, search field, metric strip, data row, status badge, source link, information card, empty/loading/error states, image fallback and share control.
- Distinguish semantic vote colors from party identity colors. Retain party logo + number above vote maps; use accessible party names in labels/tooltips. Never use color alone to communicate choice or status.

## 4. Pages and behavior

| Surface | Proposed experience | Functional requirements |
| --- | --- | --- |
| Astăzi / homepage | Hero, search, Hot-vote carousel, compact recent-vote list, contextual vote aside | Hot ranking and fallback are explicit; carousel selection changes the detail panel; arrows, count and all-votes/official-source links work |
| Vote directory | Compact searchable rows/cards in the same shell | Date range, chamber, legislature, vote type and supported outcome filters; visible applied filters; reset; stable pagination |
| Vote detail | Bill identifier and readable motion title, outcome, metadata, optional reviewed summary, vote map and party table | Full page and side panel share one data/component contract; source/evidence links; party filters; member detail; canonical share URL |
| Bill directory | Searchable dossiers with status, introduction date, identifiers and chambers | Counts are unique bill families/dossiers, not documents or votes; chamber aliases remain discoverable |
| Bill detail | Clear dossier header, substantive text/documents, procedure timeline, related votes and sponsors | Existing text search, document comparison and official PDFs remain reachable through progressive disclosure |
| Member directory | Photo rows, name, party/group, chamber, constituency, meaningful activity number | Search by name/party/constituency, legislature/chamber filters, name/activity sorting, load more; attendance sorting only when comparable denominators exist |
| Member profile | Photo and identity header, legislature activity, recent votes; facts/career/source aside | Legislature changes all metrics and tables together; selected-period affiliations; show initiatives and role history without inventing speeches/profession data |
| Party profile | Logo and name, chamber representation, evidenced government relationship, recent party votes; facts/members/history aside | Link to filtered members; separate party and parliamentary-group identity; dated affiliations; transparent voting-distribution/cohesion definitions |
| Composition | Two chamber cards with seat maps, group counts, current/history tabs and contextual aside | Date/legislature selection; source and denominator visible; group links; vacancies/unknown assignments; government panel only where supported |
| Data health | Same typography and shell with readable coverage and problems | Preserve source coverage, freshness and withheld-record explanations; keep operator review controls appropriately protected |
| Search | Shared header/home search into grouped vote, bill, member and party results | Real server queries, Romanian diacritics and identifiers, keyboard operation, links to canonical pages; loading/no-results/error states |

No standalone party directory exists today. Party discovery can start through search, composition and member links; a separate directory is optional scope rather than an implied new navigation item.

### Navigation contract

- Filters and sorting live in the URL; reload and sharing preserve them.
- On desktop, an optional selected vote can be represented by a query parameter on the directory/home route. Opening/closing it participates predictably in browser history, preserving list position and filters.
- “Open full page” and “Share” always lead to the existing `/[locale]/votes/[id]` route. Direct links render complete content without needing previous client state.
- Desktop side panel is nonmodal; mobile details use a full page. Manage focus and restore it to the initiating row where appropriate.
- Changing language retains the same entity and applicable filters. Show RO/EN text labels, not a flag as the sole accessible language cue.
- Share uses native sharing where available, otherwise copy-link with visible success/error feedback.

## 5. Data and editorial rules

| Mockup element | Rule for implementation |
| --- | --- |
| “Adoptat” / “Respins” | Distinguish outcome of this motion, chamber adoption and final legal status. Supporting a rejection report is not adopting the bill. When outcome cannot be established, show the recorded motion/result without inferring it from a simple vote majority. |
| “Prezenți” and gray seats | Separate present-but-not-voting, absent and unknown. Show official present totals alongside the matching categories; unknown cannot become absence automatically. |
| Attendance percentage | Use covered eligible roll calls within the member's mandate, chamber and selected period, with numerator/denominator. Label observed coverage; suppress misleading percentages when eligibility/completeness cannot be established. |
| Party position / agreement | Show observed distribution first. If summarizing the modal choice, show ties/mixed explicitly and define included choices and denominator. Keep party cohesion separate from support for/against a bill. |
| Seats and percentages | Derive from the same date/chamber and sourced capacity; distinguish occupied mandates, vacancies and unknown affiliation. Do not hardcode reference-image numbers. |
| “Current” government | Require date-valid source evidence. An old seed or elapsed calendar date is not proof of the current government. Use “last verified” context or an unavailable state when needed. |
| Speeches, profession, enacted initiatives | Display only fields with valid source coverage and a defined metric. Otherwise omit the tile and redistribute the layout. Do not substitute unrelated counts. |
| “Pe scurt” / “De ce contează?” | Prefer reviewed editorial text tied to the relevant bill/motion/version. Without it, show neutral structured facts or omit the explanation card. Do not fill the space with invented consequences. Gemini stays disabled. |
| Dates | Today's date may orient the homepage, but content freshness must show the actual latest covered/source date. Never imply the whole database was refreshed today. |

Extend the fixed cockpit section registry narrowly for vote short explanation, why-it-matters text, page-specific help/FAQ content. Use existing proposal → review → preview → publish flow. Store entity, locale, source/input version and evidence. Changed evidence should mark text stale; unsupported editorial claims must not remain silently featured.

English interface strings ship with Romanian. Untranslated editorial paragraphs are visibly marked as Romanian original, following the existing fallback policy.

## 6. Reuse and engineering changes

Keep Next.js, React, current database, Vercel, existing `/ro` and `/en` routes, public assets and source URLs. No framework migration, ingestion rewrite or separate design app.

Reuse/refactor existing `VoteExplorer`, `CompositionSeatMap`, `CompositionTimeline`, `MemberCareerTimeline`, document/text/diff components and editorial sections. The global layout currently owns navigation and typography; the data modules already expose most vote/member/party/history entities. The redesign should unify rendering around those contracts.

Add small presentation adapters for readable titles, status semantics, metric availability and source freshness. Avoid embedding business rules separately in cards, sidebars and full pages. Global search and constituency filtering need explicit query/API work; do not implement them as filtering only the currently loaded rows.

Cache shared server queries, fetch vote details on selection, and paginate heavy directories. Never ship the entire vote/member corpus to the browser for a sidebar. Use stable image dimensions, lazy loading and fallbacks to avoid layout shifts. Preserve canonical metadata and sensible social-share titles.

## 7. Implementation milestones

### A — Design foundation and a working vertical slice

Record the confirmed choices and settle the Hot eligibility window; define typography, color, spacing and responsive tokens. Build the header/shell, homepage featured card and one complete vote-detail experience using a verified production record. Include loading, missing explanation and incomplete evidence examples.

Review gate: desktop at the supplied dimensions plus a narrow mobile layout. Judge screenshot fidelity and real click-through behavior before spreading the design across every page.

### B — Discovery and document flows

Apply the system to vote/bill directories and bill details. Implement search/filter URL state, pagination, source links, readable titles and the reusable vote panel/full-page components. Preserve document tools in an expanded details area.

Review gate: search for a real bill → filter votes → inspect the motion → open the official document → Back restores results.

### C — Members, parties and composition

Build the member directory/profile, party profile and chamber composition/history pages. Implement supported statistics and their explanations; expose gaps rather than fictional numbers. Keep matching party logos, photos and seat-map behavior.

Review gate: find a representative → inspect a vote → open their party → explore composition for the same period, with consistent counts and dates.

### D — Editorial control and completeness

Wire the limited cockpit content additions, translations/fallbacks, Hot carousel fallback and labels, FAQs and source/help panels. Restyle data-health pages. Finish mobile, keyboard navigation, broken-image, no-results and failure cases.

Review gate: edit a supported paragraph in the cockpit, preview the actual page, and verify that unselected drafts do not appear.

### E — Validation and release

Compare screenshots to all five references at matched desktop viewport sizes. Test mobile at 390px, small screens at 360px, tablet around 768px and a wide desktop. Verify no clipped headings, inaccessible controls or unintended page-level horizontal scrolling.

Run targeted data-semantic tests (rejection motions, unknown votes, affiliation dates and denominator guards), core navigation integration tests, type checks and production builds. Check RO/EN, direct links, reload, Back/Forward, sorting, pagination and source links. Preserve a before/after performance baseline and avoid a material regression in page payload or database work.

Present the local redesign for review, then commit/push/deploy when requested. No production visual changes during this planning phase. Keep the prior production deployment available for rollback; any editorial migration must be additive and compatible with it.

## 8. Acceptance criteria and boundaries

- All public routes use one coherent design, including pages not pictured in the mockups.
- Each visible control has defined behavior and works with real published data.
- Screens remain useful without AI text, photos, complete coverage or a verified current-government record.
- Shared facts agree across homepage, side panel, full page, profile and composition views.
- The five desktop references are recognizably matched; responsive layouts are intentionally designed rather than scaled-down screenshots.
- Keyboard focus is visible, status uses text/icons as well as color, tables retain accessible headings, and important context is reachable without hover.
- Existing data, canonical URLs, document access and publication boundaries are preserved.
- No invented dates, members, affiliations, legislative outcomes, impact claims or popularity/attendance statistics enter production to fill a design.

Out of scope: political scoring/topic-analysis sprint, Gemini enablement or credits, new government scraping, fixing all withheld Senate records, a freeform page builder, cockpit-wide visual redesign and autonomous summaries/translations. Existing unresolved data issues remain visible and can be addressed separately.

## 9. Delivery approach

Use five milestone review points rather than a single large unreviewed rewrite. Plan effort after the vertical slice reveals actual font/layout and data-contract work; avoid promising a fixed duration before that. Reuse scripts and shared components, keep image-generation costs at zero because the visual targets already exist, and limit screenshot iterations to concrete fidelity or usability findings.
