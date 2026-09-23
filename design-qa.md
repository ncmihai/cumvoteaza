# Public UI design QA — homepage → vote → member journey

## Desktop 80% density adjustment (12 September 2026)

- Source intent: match the visual density of the supplied member-profile mockup when a desktop browser is set to 80% zoom.
- Implementation evidence: Codex in-app browser captures at `http://localhost:3011/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor` and `/ro/members`, 1280 × 720 CSS viewport, device scale 1.
- Scope: screens at least 1200px wide; tablet and mobile remain unscaled.
- [P1, fixed] The first `zoom` implementation shifted the centered 1440px canvas and clipped its right edge. Replaced it with a top-left 0.8 transform plus 125% compensating dimensions. Post-fix captures show the profile career endpoint, directory guide rail, navigation and page background fully visible without horizontal clipping.
- Typography, spacing, colors, images and copy scale together, preserving their proportions rather than selectively shrinking type.
- Typecheck and production build: passed.

final result: passed

---

# Phase 2 follow-up QA — member directory (14 September 2026)

## Comparison target

- Source visual truth: browser-comment captures 3 and 4 supplied by the user on 14 September 2026.
- Implementation evidence: local production build at `http://localhost:3011/ro/members?sort=votes`, inspected at the same 638px-wide viewport.

## Findings and resolution

- [P1, fixed] The absence ranking relied on explicit `absent` vote rows, which are not consistently published by official nominal sources and could produce an apparently alphabetical result. It is replaced by “Cele mai multe voturi documentate,” counting expressed and present-without-voting records scoped to the selected legislature and chamber.
- [P2, fixed] The filter popover was a large undifferentiated chip cloud. It now uses labelled legislature, chamber and ranking selectors, a scrollable party/group checklist, and clear Reset/Apply actions.
- [P2, fixed] Ranking cards now expose the metric that determines their order: documented votes, group changes or completed years of parliamentary service.
- [P2, fixed] The filter surface has a viewport-relative maximum height and internal scrolling so its actions remain reachable on short screens.

## Verification

- TypeScript typecheck: passed.
- Unit and pipeline tests: 107 passed.
- Focused real-browser member-filter and ranking regression: passed.
- Production build: passed.

final result: passed

---

# Phase 1 follow-up QA — labels and density (14 September 2026)

## Comparison target

- Source visual truth: browser-comment captures 1, 2 and 5 supplied by the user on 14 September 2026.
- Implementation evidence: Codex in-app browser, local production build at `http://localhost:3011/ro`, `/ro/votes` and `/ro/compozitii`, inspected at a 638px-wide viewport.

## Focused comparison evidence

- Homepage: the former “Hot” language is now the neutral “Popular” label in Romanian and English, including the 30-day feature kicker and interest action.
- Vote directory: rows use reduced padding, metadata, title and result spacing; the initial and incremental page-size ceiling is 20.
- Composition overview: the four facts render as a compact two-by-two grid on narrow screens, with smaller typography, icons and internal spacing.
- Responsive integrity: the inspected views remained within the document width and retained readable wrapping for long legislative titles.

## Verification

- TypeScript typecheck: passed.
- Unit and pipeline tests: 107 passed.
- Focused real-browser Phase 1 regression: passed.
- The broader browser run reached 7 passing cases before unrelated remote database DNS instability interrupted five data-backed cases; no Phase 1 assertion failure remained after the focused rerun.

final result: passed

---

## Member profile Phase 4 QA — completion and edge states (12 September 2026)

### Comparison target

- Source visual truth path: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-e5e37ab2-d2d3-4de5-b9a8-5b4da1e0ee06.png`.
- Implementation evidence: Codex in-app browser captures at `http://localhost:3011`, covering Cozma's current profile, Adrian Mocanu's 2016–2020 profile, the multi-affiliation career state, and the originating-vote return route. The browser provider does not expose screenshot filesystem paths.
- Source pixels: 1490 × 1060. Implementation viewport: 1280 × 720 CSS pixels, device scale 1; full-page captures were also inspected for the complete content hierarchy.
- States: current single-party career, ambiguous eight-affiliation career across four legislatures, completed legislature with no imported votes or initiatives, and vote-context navigation.

### Full-view and focused comparison evidence

The current profile retains the mockup's portrait-led identity, wide career rail and balanced lower columns. The completed-legislature state changes party, photo, status, facts, committee evidence and activity without leaking current-term values. Empty recent-vote and initiative panels remain visible and explanatory instead of collapsing the layout.

The multi-affiliation comparison exposed misleading party imagery on independent periods. The post-fix capture shows neutral text assets for independent records, real logos only for named parties, and no false party destination. The vote-context capture exposes a visible `Înapoi la vot` link; activating it returned to the exact originating vote route.

### Required fidelity surfaces

- Typography: editorial serif hierarchy, compact labels and wrapping remain consistent with the reference; long committee and official-title strings wrap without clipping.
- Spacing/layout: identity, career and lower content preserve the reference rhythm; existing responsive tracks collapse below desktop and all dense rows have stacking rules.
- Colors/tokens: paper, navy, pale blue, yellow rail and semantic vote/status colors use the established public-site palette.
- Image quality: source-backed portraits and verified party logos are used; unaffiliated periods now use neutral text rather than an unrelated stored logo.
- Copy/content: current and historical terms are explicit, missing data has honest empty states, and the introductory Romanian sentence is gender-neutral.

### Findings and comparison history

- [P1, fixed] Independent career periods displayed and linked through an unrelated party logo. Party imagery and party links are now restricted to named-party records; post-fix browser evidence shows neutral independent cards.
- [P2, fixed] Profiles without a resolved party rendered a `#` navigation link. They now render a non-interactive labeled fact.
- [P2, fixed] The introductory Romanian sentence assumed a masculine member. Replaced it with gender-neutral institutional copy.
- [P2, fixed] Historical empty states could be mistaken for loading failures. Completed-legislature browser evidence confirms explicit zero-vote and zero-initiative explanations alongside sourced committee records.

### Implementation checklist

1. Current, historical and ambiguous-career visual states: passed.
2. Vote → member → originating vote interaction: passed.
3. Party-logo and link truthfulness: passed.
4. Romanian and English content structures: passed.
5. Typecheck, 16 unit tests and production build: passed.

final result: passed

---

## Member profile Phase 3 QA — evidence and activity (12 September 2026)

### Comparison target

- Source visual truth path: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-e5e37ab2-d2d3-4de5-b9a8-5b4da1e0ee06.png`.
- Implementation evidence: Codex in-app browser full-page capture at `http://localhost:3011/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor`. The browser provider does not expose a screenshot filesystem path.
- Source pixels: 1490 × 1060. Implementation viewport: 1280 × 720 CSS pixels, device scale 1.
- State: active Romanian deputy, three documented committees, 427 covered voting records, six recent nominal votes, and no linked initiatives in the selected legislature.

### Full-view comparison evidence

Below the parliamentary-path rail, the profile now follows the supplied mockup's two-column evidence hierarchy. The left column explains the member and verified institutional relevance, then summarizes activity and documented roles. The wider right column promotes the newest vote and compresses the remainder into an easily scanned list, followed by legislative initiatives.

The implementation deliberately diverges where the mockup assumed richer data: committee evidence is used instead of an invented impact narrative; zero initiatives receive an explicit empty state; vote participation remains a coverage count instead of an unsupported attendance percentage.

### Focused comparison evidence

- Content hierarchy: `Pe scurt` and `De ce contează?` are paired in one editorial card; activity, committees, recent votes and initiatives each have a single purpose.
- Recent votes: the newest record has date, chamber, readable identifier, official subject, semantic member-choice badge and a direct detail link; five subsequent records use compact rows.
- Evidence gating: relevance resolves in tested order—active sourced role, committee membership, linked initiatives, then an explicit unavailable explanation.
- Historical state: legislature controls remain above Phase 3 content and preserve the selected legislature in the profile URL.
- Responsive structure: the desktop columns collapse to one; featured vote metadata wraps; compact vote rows become stacked; activity metrics remain a two-column grid on narrow screens.
- Accessibility: headings preserve document order, badges include text in addition to color, links retain visible focus behavior, and official sources open as labeled links.

### Findings and comparison history

- [P1, fixed] The old right rail duplicated identity facts and offered generic explanatory copy. Replaced it with a structured summary and an evidence-gated relevance contract.
- [P1, fixed] Recent votes were six visually equal rows. Added a featured newest-vote card and a compact history beneath it.
- [P2, fixed] Committee memberships were reduced to a metric and initiatives disappeared when empty. Added sourced role/committee records and an honest initiatives empty state.
- [P2, fixed] Legislature switching was visually detached from the activity content. Moved it into a full-width utility bar immediately above Phase 3.

### Implementation checklist

1. Tested profile-context presentation contract: complete.
2. Factual summary and relevance fallback: complete.
3. Featured vote and compact vote history: complete.
4. Activity, committees and initiatives states: complete.
5. Historical-legislature navigation preserved: complete.
6. Typecheck, 16 unit tests and production build: complete.

final result: passed

---

## Member profile Phase 1–2 QA — identity and parliamentary path (12 September 2026)

### Comparison target

- Source visual truth path: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-e5e37ab2-d2d3-4de5-b9a8-5b4da1e0ee06.png`.
- Implementation evidence: Codex in-app browser captures at `http://localhost:3011/ro/members/adrian-felician-cozma-vicepresedinte-al-camerei-deputatilor`, plus Adrian Solomon and Adrian Mocanu career-state checks. The browser provider does not expose a screenshot filesystem path.
- Source pixels: 1490 × 1060. Implementation capture: 1280 × 720 CSS pixels, device scale 1.
- Density normalization: both source and implementation were inspected at device scale 1; comparison was limited to the shared identity/career region because viewport sizes and Phase 3 content differ.
- State: active Romanian deputy with one affiliation; five-legislature same-party career; four-legislature record with overlapping multi-affiliation dates.

### Full-view comparison evidence

The rebuilt upper profile follows the mockup's reading order and proportions: breadcrumb, larger portrait, clean member name, separate parliamentary office, labeled party/chamber/constituency/status facts, explanatory line, and a full-width pale-blue parliamentary-path module. Existing activity and supporting content remain below this reconstructed region for Phase 3.

The single-affiliation Cozma state reproduces the mockup's simple start-to-present rail with the real stored PNL logo. Longer careers remain horizontally inspectable on desktop and become a chronological stacked list below the medium breakpoint. A separate affiliation summary prevents the rail from hiding older parties.

### Focused comparison evidence

- Fonts/typography: the established editorial serif and compact sans-serif labels match the target hierarchy; the office is a separate secondary heading rather than part of the oversized name.
- Spacing/layout: portrait, identity metadata and career panel align as one full-width upper composition; the old 360px sidebar timeline was removed.
- Colors/tokens: existing navy, paper, pale blue, yellow timeline and semantic active green map to the supplied mockup.
- Image quality: the source-backed member portrait and stored party logo are used; existing fallback behavior remains intact.
- Copy/content: role, party, chamber, constituency, status and dates come from structured/imported records. Overlapping historical affiliations receive an explicit date-quality caveat rather than invented switch dates.
- Interaction: the PNL career card was activated in-browser and correctly opened `/ro/parties/pnl`; breadcrumb, party and official-source paths remain semantic links.
- Responsive structure: the header reduces from a 210px to 180px portrait track, identity facts wrap, the main content stacks, and the desktop career rail switches to a vertical card sequence under `md`.
- Accessibility: the member image has the clean name as alt text, identity labels remain visible, career history is an ordered list, and affiliation cards are keyboard-accessible links.

### Findings and comparison history

- [P1, fixed] The imported parliamentary office was embedded in the member name, producing a dominating multi-line heading. Added a tested presentation contract that separates titles and normalizes both modern Romanian comma-below and legacy cedilla characters. The post-fix capture shows `Adrian-Felician Cozma` and `Vicepreședinte al Camerei Deputaților` separately.
- [P1, fixed] The career journey was compressed into the right sidebar and could not communicate long careers. Replaced it with the full-width path directly under identity.
- [P1, fixed] Multiple whole-legislature affiliation rows could imply exact party-switch chronology that the source does not contain. Added overlap detection, a visible uncertainty note, removed transition markers in ambiguous records, and relabeled the list as documented affiliations.
- [P2, fixed] Same-party periods across five legislatures were described as multiple affiliations. The post-fix copy distinguishes one party across several legislatures from actual multi-affiliation history.
- [P2, fixed] Members without party-affiliation rows could lose their career entirely. The data builder now fills uncovered intervals from parliamentary-group membership records.

### Implementation checklist

1. Tested member identity presentation contract: complete.
2. Tested career ordering, merging and ambiguity contract: complete.
3. Group-membership fallback and source URL propagation: complete.
4. Mockup-aligned identity header: complete.
5. Full-width simple/multi-period career views: complete.
6. Career-to-party navigation: complete.
7. Typecheck, 14 unit tests and production build: complete.

### Follow-up polish

- Phase 3 will rebuild the profile explanation, activity metrics and recent-vote hierarchy below the career module.

final result: passed

---

## Phase 3 repair QA — current composition and Parliament history (12 September 2026)

### Comparison target

- Source visual truth: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-7e6d5a39-f893-4de2-a56a-94ab5dee6da6.png`, plus user browser-comment captures 10–11.
- Implementation evidence: Codex in-app browser capture of the rebuilt production app at `/ro/compozitii` and `/ro/compozitii?view=history`, tab 16. The browser provider does not expose a filesystem path.
- Source pixels: 1280 × 911. Implementation capture: 1280 × 720 CSS pixels, device scale 1.
- State: Romanian current-composition overview; historical 2020–2024 and 2016–2020 selections; collapsed and expanded chronology.

### Full-view comparison evidence

The current composition retains the supplied mockup's strong chamber maps and exact group lists, while adding a compact mandate overview above them. Prime minister, government, occupied seats and term dates are now immediately visible, with direct paths to current members and all completed legislatures.

History is now a separate information architecture rather than a second rendering of the current legislature. A stable legislature selector controls one focused detail view containing government periods, chamber mini-maps, largest groups, named members and an optional chronology. This preserves the desired reference/wiki depth while removing the former three-column scroll-linked clutter.

### Focused comparison evidence

- Current/history separation: the active 2024–2028 legislature is present only in the current view; History begins with the completed 2020–2024 term.
- Content: current view exposes Ilie Bolojan, the active government label, 464 occupied seats and the 2024–2028 term from the existing data model.
- Historical selection: activating 2016–2020 updates the headline, three prime ministers, seven governments, both chamber compositions, group rankings and member links.
- Progressive disclosure: the complete 2016–2020 chronology expands to 14 dated events and collapses without changing legislature selection.
- Typography/layout: long names wrap in fact cells; square bordered surfaces, serif hierarchy, navy/cream palette and blue/yellow navigation cues match the established redesign.
- Responsive structure: selector and detail stack below the desktop breakpoint; fact grids reduce to two columns and then one without fixed-width overflow.
- Accessibility: legislature choices expose pressed state, the active choice has a non-color rail/background treatment, and chronology exposes expanded/collapsed state.

### Findings and comparison history

- [P1, fixed] History repeated the current legislature and mixed its full timeline with chamber maps in a dense scroll-linked three-column layout. Replaced it with completed-legislature master–detail navigation.
- [P2, fixed] The current view lacked the useful prime-minister, government and mandate facts buried in History. Added a concise, source-backed overview above the existing maps.
- [P2, fixed] Long prime-minister and government labels were visually truncated in the first production capture. Changed historical facts to a two-column grid and allowed values to wrap.
- Browser interaction evidence confirms successful legislature switching, member destinations and chronology expansion with no runtime errors.

### Implementation checklist

1. Current mandate overview: complete.
2. Current legislature excluded from History: complete.
3. Historical master–detail selector: complete.
4. Government, chamber, member and chronology summaries: complete.
5. Romanian and English copy: complete.
6. Typecheck, unit tests and production build: complete.

final result: passed

---

## Comparison target

- Source visual truth: `docs/design/ui-refresh/01-home-vote.png` through `05-party-profile.png`.
- Implementation: local public app at port 3001.
- Implementation evidence: Codex in-app browser captures made 11 September 2026 for the Romanian homepage, vote directory, member profile and party profile.
- Source pixels: 1280 × 905 for each supplied mockup.
- Implementation viewport: 1264 × 712 CSS pixels, device scale 1.
- Density normalization: both source and implementation were inspected at device scale 1; vertical crop differs, so comparisons were limited to shared above-the-fold regions.
- State: Phase 0 inventory, Phase 1 truth contracts, repaired homepage → vote → member journey, and Phase 3 party/composition surfaces are applied.

## Full-view comparison evidence

The homepage now reproduces the mockup's editorial split: a decision-led search and feature card on the left, with a compact evidence/detail rail on the right. Typography, paper/navy palette, bordered modules and information hierarchy are materially aligned with the source. The implementation intentionally shows an unestablished outcome instead of inventing adoption or rejection from procedural wording.

The direct vote page now continues the same visual language and is complete without relying on homepage state: back/share controls, identity and scope, plain-language context, totals, group breakdown, official evidence and deeper dossier tools are present. The lower dossier sections remain progressive disclosure instead of competing with the first-screen civic answer.

The vote directory now uses the full available desktop canvas. Vote identity, subject and actions remain readable in the list; totals have a dedicated row; the selected vote receives a stable detail rail. Loading additional results is explicit rather than triggered by scrolling.

## Focused comparison evidence

- Homepage vote identity: the identifier and procedural heading are separated from the full bill subject. The source's positive/negative outcome badge cannot be reproduced truthfully until the backend supplies an authoritative motion outcome, so a neutral label is used.
- Homepage controls: search submits to the vote directory with URL state; filter choices are real links; featured selection writes browser history; context/detail/source controls have distinct destinations; share has native-share and copy-link feedback.
- Direct vote route: first-screen reading order and right-rail result facts were visually verified against the homepage detail rail supplied in the source mockup.
- Vote-to-member path: a named, six-person nominal preview appears immediately after the vote summary. Every entry links to a profile with the originating vote preserved, and the profile provides a verified back-to-vote control.
- Member directory: desktop and 390px mobile captures confirm readable rows, working URL pagination and responsive search/filter controls.
- Member profile: desktop and 390px mobile captures confirm the identity, activity and context-return layout. The mobile pass found and fixed an implicit grid-track overflow; measured document width now equals the 390px viewport.
- Member metrics: the inspected profile changed from a misleading percentage to `1 înregistrări de vot acoperite`; no eligible-vote denominator was available.
- Party current state: the inspected fallback dataset showed `Reprezentare parlamentară` and an unavailable current status rather than selecting a historical government row.
- Party profile: desktop and 390px mobile captures confirm the mockup-aligned split layout, working share/member/vote links, single-line desktop identity, and no horizontal overflow.
- Composition: desktop and 390px mobile captures confirm the current Parliament maps, evidence rail and exact seat totals. The current/history tabs update URL state and `aria-current`; no government/opposition alignment is invented while that evidence is unavailable.
- Phase 4 bill detail: a 390px capture confirms long official titles wrap without overflow, scraper metadata is removed through the shared presentation contract, empty sections have explicit states, and back/share controls work.
- Phase 4 data health: 680px and 390px captures confirm the editorial heading/stat treatment, single-column mobile flow and collapsed review controls; opening review mode reveals its three functional inputs.
- Phase 4 vote detail: 1280px and 390px captures confirm the reference-aligned content/rail hierarchy, labeled group totals, working back/share controls and no horizontal overflow.
- Phase 4 fallbacks and links: member and party raster assets now replace failed image requests with initials or party text; the inspected vote had zero broken images. Five representative external destinations, including the Chamber nominal-vote source, returned HTTP 200.
- Phase 4 bilingual routes: representative vote detail, bill detail and data-health routes returned HTTP 200 in Romanian and English; English navigation and functional labels were inspected in-browser while official Romanian record text remained unmodified.

## Required fidelity surfaces

- Fonts and typography: unchanged in this phase; existing serif/sans hierarchy remains close but exact font matching is deferred.
- Spacing and layout rhythm: homepage and direct vote layouts now use the mockup's strong two-column split and compact card rhythm at desktop width.
- Colors and visual tokens: unchanged. Unknown outcomes intentionally do not receive success/error color.
- Image quality and assets: unchanged; this phase introduced no assets or placeholders.
- Copy and content: materially safer. Official text remains available, readable headings are separate, coverage is not attendance, and stale government participation is not labeled current.

## Findings

- [P1] Authoritative vote outcome is absent from the shared domain model.
  - Location: `Vote` and homepage/detail presentation.
  - Evidence: the mockup shows a definitive outcome; the implementation can only show `Rezultat neclarificat` without inferring from source wording.
  - Impact: the primary civic answer cannot yet be stated reliably.
  - Fix: add an evidence-backed motion outcome/status field during the golden-journey phase and pass it into `presentVote`.

## Comparison history

- Earlier implementation inferred adopted/rejected from title regexes. Fixed by requiring an authoritative outcome input and defaulting to unknown.
- Earlier member profiles calculated attendance from imported rows. Fixed by separating coverage-only, eligible and unavailable participation states.
- Earlier party profiles selected `governmentParticipations[0]`. Fixed by requiring both the alignment interval and government interval to contain the displayed date.
- Post-fix browser evidence confirmed all three presentation changes. The remaining findings belong to later phases and were not hidden to force a pass.
- Phase 3 browser evidence confirmed party and composition layouts at 1280px and 390px, including functional history, share and cross-directory links.
- Phase 4 removed scraper metadata from bill-detail presentation, added explicit empty states, decluttered review-only data-health controls and labeled compact vote-group columns.

## Implementation checklist

1. Add authoritative motion outcome and semantics to the ingest/data/query contract.
2. Add verified government-alignment evidence before presenting coalition/opposition totals.
3. Continue the same reconstruction standard through the remaining bill and data-health surfaces.

## Follow-up polish

- Load the final editorial fonts locally after the primary layouts stabilize.
- Tighten unknown/partial-state badges once all state labels are known.

final result: passed

---

# Phase 2 repair QA — popovers and member directory (12 September 2026)

## Comparison target

- Source visual truth path: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-09ef0f70-4171-4fe6-8855-dde76ab00693.png`, plus user browser-comment captures 7–9.
- Implementation screenshot path: Codex in-app browser capture, `http://localhost:3004/ro/members` and `/ro/votes`, tab 16 (the browser provider does not expose a filesystem path).
- Source pixels: 1280 × 911. Implementation capture: 1280 × 720 CSS pixels, device scale 1.
- State: Romanian desktop member directory page 1 and page 2; vote-directory filter open, click-away and Escape states; member filter open and click-away states; homepage filter click-away state.

## Full-view comparison evidence

The member directory now uses the mockup's editorial segmented-control language instead of detached rounded chips. Count, sorting, cards and pagination have clear vertical separation. At the narrower desktop split created by the guide rail, the count and sorter deliberately occupy separate rows; at wider viewports they share a row. The bottom pager is fully visible, has a stable 44px target, and preserves both directions on page 2.

## Focused comparison evidence

- Typography: existing serif member names and sans-serif control hierarchy are preserved; sorter labels use the compact mockup weight and capitalization.
- Spacing/layout: the earlier count/sort collision was removed; the segmented control horizontally scrolls instead of wrapping or clipping at narrow widths.
- Colors/tokens: navy active state and blue hover/focus treatment reuse the existing public-site palette.
- Image quality: profile photos continue through the existing source-backed image/fallback component; no replacement assets were introduced.
- Copy/content: Romanian and English sorting, range and pagination labels remain complete.
- Interaction/accessibility: homepage, vote-directory and member-directory filter popovers close on outside click and Escape; Escape returns focus to the trigger. Page 1 → page 2 navigation was verified with correct URL and `21–40 din 472` range.

## Findings and comparison history

- [P1, fixed] Filter popovers remained open after interacting elsewhere. Replaced native unmanaged filter details with a shared dismissible component and added equivalent homepage click-away/Escape handling.
- [P2, fixed] The first revised sorter collided with the result count at the 1280px split layout. Moved the shared-row breakpoint to 1536px and verified the revised capture has no overlap.
- [P2, fixed] The next-page button inherited an unreadable link color and sat too close to the viewport edge. Added explicit white text, minimum target height and bottom spacing; browser evidence shows the full button and page-two two-direction state.

## Implementation checklist

1. Shared outside-click and Escape dismissal: complete.
2. Homepage filter dismissal: complete.
3. Member segmented sorter and overflow behavior: complete.
4. Pagination layout and navigation: complete.
5. Typecheck, unit tests and production build: complete.

## Follow-up polish

- None required for Phase 2.

final result: passed

---

# Phase 1 repair QA — unified vote journey (12 September 2026)

## Comparison target

- Source visual truth path: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-14ec6aba-b3f7-4f63-a9d4-c256e6784867.png` plus browser-comment captures 1–6 supplied by the user.
- Implementation screenshot path: Codex in-app browser capture, local production URL `http://localhost:3004/ro` and `/ro/votes`, tab 16 (captured in the Phase 1 task; the browser provider does not expose a filesystem path).
- Source pixels: 1280 × 911. Implementation capture: 1280 × 720 CSS pixels, device scale 1.
- Density normalization: both inspected at scale 1; only shared above-the-fold regions were compared because the viewport heights differ.
- State: Romanian desktop homepage, hot slide 1 and slide 2, recent-vote selection, vote-directory default selection and second-row selection.

## Full-view comparison evidence

The editorial navy/cream visual language, serif hierarchy, square bordered surfaces and two-column desktop proportions remain aligned with the supplied mockup. The formerly static “Hot” feature now has clearly attached controls and progress dots without weakening the primary story. The right rail no longer repeats the feature/list card: it prioritizes vote balance, grouped-party behavior, attendance only when a valid denominator exists, and one unambiguous route to the complete vote.

The vote directory preserves the scan-friendly list while the selected card uses the same preview contract as the homepage. Selection is visible through the yellow rail/background and updates the URL. At widths below the desktop split breakpoint, list activation navigates directly and exposes a busy/loading state during the transition.

## Focused comparison evidence

- Typography: Georgia/editorial headings and compact sans-serif metadata match the established system; long bill titles wrap rather than collide.
- Spacing/layout: the carousel control strip is structurally attached to the feature card; preview sections use consistent 16–24px rhythm and remain within the 400px rail.
- Colors/tokens: existing navy, blue, yellow and semantic green/red/amber tokens are reused; no new decorative palette was introduced.
- Image quality: no target raster assets are involved in this flow; all icons use the existing Lucide library and party identity uses database colors.
- Copy/content: Romanian and English labels were added for carousel navigation, group voting, attendance, empty group data and loading feedback.
- Interaction/accessibility: previous/next, dots, arrow keys and horizontal swipe change the hot slide; URL-backed desktop selection and browser history work; selected/busy states are announced; CTAs remain semantic links.

## Findings and comparison history

- [P1, fixed] The first implementation only showed party data when `group_vote_totals` existed. Browser evidence showed a truthful empty state for a nominal vote despite individual records being present. Fixed by aggregating individual votes and resolving group membership at the vote date; the revised browser capture shows PSD, AUR, PNL, USR, UDMR and UPR distributions.
- [P2, fixed] Attendance initially displayed 100% when the absent denominator was unavailable. Fixed by hiding the percentage unless `absent` is supplied.
- [P2, fixed] Cached pre-change directory payloads could omit `groupBreakdown` and crash the preview. Fixed with a cache-safe empty fallback; `/ro/votes` then rendered successfully.
- Post-fix evidence: production build, homepage carousel activation, homepage recent-vote selection, directory render and directory second-row selection all completed in the in-app browser. No runtime error appeared after the cache-safe fix.

## Implementation checklist

1. Hot carousel: complete.
2. Shared non-duplicative vote preview: complete.
3. Party breakdown with nominal-vote fallback: complete.
4. Desktop URL selection and narrow-screen direct navigation/loading feedback: complete.
5. Typecheck, unit tests and production build: complete.

## Follow-up polish

- A future source-backed “notable split” label can be added once party cohesion semantics are agreed; the current preview intentionally exposes the raw group distribution without editorial inference.

final result: passed

---

# Vote-detail mockup QA

- Source visual truth: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-8c92e6a2-0260-49ea-a9bd-802ef315866e.png` (1487 × 1058 px).
- Rendered implementation: `http://localhost:3015/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356`.
- Implementation screenshot path: in-app browser capture shown inline in the Codex QA comparison; the browser did not expose a persistent filesystem path. Captured at 1487 × 1059 CSS px and 375 × 812 CSS px; the desktop capture was 1487 × 1059 px (1× density). Source and desktop implementation were viewed together at their native, nearly identical pixel sizes, with no density normalization required.
- Compared states: full desktop page, selected-member panel, 375 px mobile group selection and selected-member sheet. Source represents a selected desktop seat; its adoption claim is deliberately not copied.

## Findings

No actionable P0–P2 visual or interaction issue remains in the implemented scope. The source's 260-vote adoption claim conflicts with the live legal-outcome field and is intentionally replaced by “Rezultat neclarificat,” a link to the bill dossier, and vote totals displayed separately.

### P3 follow-up polish

- The mockup labels each party beside its arc. The implementation uses a separate party-border legend below the arc. If users struggle to relate sectors to parties, add data-derived labels around the arc, avoiding overlap at tablet widths.
- The source shows a member portrait in the selected panel. The implementation uses a real stored portrait only when one is linked to that member; it does not substitute a fabricated or unrelated image. Adding more verified member portraits would improve fidelity.
- The source uses Parliament branding and a larger typographic scale. The implementation preserves CumVoteaza branding and the project's previously requested smaller desktop scale. This is an intentional product-system difference, not a missing asset.

## Fidelity review

- Typography: display serif/body sans hierarchy matches the app system; long legislative titles wrap without overflow. The smaller scale is intentional.
- Layout and spacing: two-column identity/map hierarchy matches the mockup on desktop; the selected panel is persistent and the mobile panel becomes a bottom sheet. The map keeps all seats in place during filtering. No document overflow was found at 320, 375, 768, 1024, or 1487 px.
- Colors/tokens: group border color and inner vote symbol remain independent. Legends explain both; dimming does not remove seats.
- Imagery: no artificial member portraits or official crest were introduced. Existing brand imagery is preserved.
- Copy/content: the actual vote totals reconcile (260 + 1 + 40 + 1 = 302 present; 28 absent; 330 seats). Legal status is not inferred. Romanian and English labels were checked.
- Icons and accessibility: vote symbols, labelled seats, visible focus, arrow navigation, Enter selection, Escape close, selected-person live region, and profile links were checked. The dense mobile map is supplemented by larger party-first member controls.

## Comparison history

1. Initial full-view comparison: the desktop composition preserved the main hierarchy, but dense overlapping hit areas let a mobile tap on Ștefan-Ovidiu Popa open Virgil Alin Chirilă. This was a P1 interaction defect.
2. Fix: select the nearest seat from the pointer coordinate rather than the overlapping painted button, and place a party-first member picker directly above the mobile map. Revised 375 px browser check selected Ștefan-Ovidiu Popa correctly; selecting PNL revealed its member list adjacent to the picker. No horizontal overflow or browser console errors remained.
3. Post-fix desktop selected-state comparison: source and rendered implementation were viewed in the same comparison input at 1487 px. The persistent panel, chamber, separate legends and vote totals were visible. Remaining visual differences are the intentional branding/scale decisions and P3 refinements above.

## Implementation checklist

- [x] Real data-driven 330-seat chamber and reconciling totals.
- [x] Search, filters, preview, persistent selection, mobile party-first controls and bottom sheet.
- [x] Keyboard navigation, accessible names and live selection announcement.
- [x] Separate nominal vote from legal outcome; secondary official/context disclosure.
- [x] Responsive and desktop/mobile interaction checks; no console errors.

final result: passed

---

# Vote chamber party-label refinement QA

- Source: the supplied PL-x 159/2026 mockup, especially party names/counts placed around the chamber arc.
- Local preview: `http://localhost:3015/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356`.
- Checked widths: 320, 375, 768, 854, 1024, 1280 and 1920 CSS px. No horizontal document overflow at any checked width.

## Comparison and fixes

- [P2, fixed] The initial data-driven callouts overlapped the smaller groups' rightmost seats. A desktop-only 16% label gutter now separates those callouts from the chamber; vertical spacing keeps UDMR through SOS RO readable even at 1024 px. The labels show real group short names and counts and act as group filters.
- [P1, fixed] A sticky selected-person panel obscured the lower rows of seats on desktop. It is now in normal document flow beneath the chamber/legends; the mobile panel remains a bottom sheet.
- [P3, intentional] The mockup uses parliamentary branding and a larger type scale. This page retains CumVoteaza branding and the site's previously requested smaller scale. Tablet retains the compact group legend, while mobile retains party-first chips instead of attempting dense arc callouts.

## Verification

- Typography, spacing, color and icons: serif group callouts and colored guide strokes follow the existing navy/editorial system; no new raster or imitation crest assets were introduced. The vote-symbol legend remains distinct from parliamentary-group colors.
- Interactions: clicking an AUR callout dimmed all other seats without moving them; seat selection displayed the real member, group, constituency, vote and profile link below the map. At 375 px, the PSD chip opened its member list and selecting Adrian Câciu opened the bottom sheet.
- Accessibility: callouts have names and pressed state; arrow-key focus moved between seats, Enter selected a member, and Escape closed the panel. Named and no-result search states rendered. Browser error log was empty.
- Data integrity: the page still says “Rezultat neclarificat”; 260/1/40/1, 302 present and 28 absent remain separate from the bill's legal outcome.
- Checks: workspace typecheck and production build passed.

final result: passed

---

# Chamber dais illustrations QA

- Source visual: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-8c92e6a2-0260-49ea-a9bd-802ef315866e.png`, with a pale architectural dais beneath the seat arc.
- Local previews: `http://localhost:3015/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356` and `http://localhost:3015/ro/votes/vote-senate-l316-2025-10-27-final`.
- Compared the source mockup and live Deputies preview at 1487 × 1058 CSS px in one visual check; also inspected the Senate page at that viewport. Browser captures were viewed inline rather than saved as files.

## Comparison and fixes

- [P2, fixed] The first placement was mostly obscured by inner seats. Moved the illustration into the open center, increased its size, softened opacity, and shifted the mandate count slightly down on tablet/desktop. It now reads as the quiet architectural element in the mockup without competing with votes.
- [P3, intentional] These are two distinct editorial illustrations of chamber furniture, not official emblems or photographs. The CumVoteaza header logo remains unchanged. Mobile omits the illustration to preserve space and seat tap targets.

## Verification

- Typography and spacing: the existing serif mandate count and visual hierarchy are preserved; no seat or callout was moved.
- Colors and imagery: transparent, pale-slate Deputies and Senate assets are visibly distinct and subdued. Neither introduces a flag, crest, person, or text.
- Copy/content: the vote's legal status and the data-driven seat total are unchanged.
- Interactions: images are decorative (`alt=""`, hidden from assistive technology) and ignore pointer events; seat selection remains available.
- Checks: production build passed; no horizontal overflow or illustration overlap was seen in the checked desktop and tablet views.

final result: passed

---

# Vote hemicycle redesign QA

- Source visual truth: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-8c92e6a2-0260-49ea-a9bd-802ef315866e.png` (1487 × 1058 px).
- Implementation: `http://localhost:3016/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356`, selected Ştefan-Ovidiu Popa. In-app browser screenshot was compared inline with the source at a 1487 × 1058 CSS-px viewport; capture not persisted to disk. Both were 1487 × 1058 visible pixels at browser density 1.
- Additional checks: Deputies at 320, 375, 768, 854, 1024, 1280, and 1487 CSS px; Senate sample at 1487 CSS px.

## Findings and comparison history

1. [P1, fixed] The old 120° seat sweep and white-filled rings did not resemble the mockup. Rebuilt the seat coordinates as a broad 180° hemicycle, filled seats by vote while retaining a group-coloured border, and reduced the central mandate count. Final desktop and mobile captures show the intended chamber silhouette.
2. [P1, fixed] No group arcs appeared in the earlier graph, and party names were desktop-only. Data-derived coloured arcs now follow group boundaries at every width. Desktop labels show group names/counts; tablet and phone have colour-coded group controls next to the still-visible arcs.
3. [P2, fixed] The first redesigned desktop pass left the smaller groups' labels on top of their seats. The final pass reserves an 8% right gutter for the chart and retains the labels in the full-width wrapper. The revised 1487-px capture shows clear right-side labels.
4. [P3, intentional] The production page keeps CumVoteaza branding, the previously requested smaller site-wide scale, and “Rezultat neclarificat” rather than copying the mockup's unsupported adoption claim. Those differences are not graph regressions.

## Fidelity and interaction checks

- Typography: serif group labels and smaller central count preserve the site's editorial type; the mockup's larger overall type is intentionally not copied.
- Layout and spacing: arcs, seats, and labels form one chamber hierarchy; no horizontal document overflow at the seven checked widths. The mobile arc remains visible even though individual seats are necessarily small, with a larger group-member list for selection.
- Colour and icons: arcs/borders encode groups, filled seats and inner symbols encode votes; the separate vote legend remains. Group hover/focus gently dims other groups and respects reduced-motion preferences.
- Image quality: existing chamber dais images remain subdued in the centre and are hidden on cramped mobile widths. No official crest or fake portrait was added.
- Copy/content: removed the redundant “Culoarea conturului” explanation. The 330 Deputies seats and vote totals remain data-driven, and the legal result remains separate from the vote count. The Senate search prompt now says “senator”.
- Interactions: selected-seat panel showed the correct real member after clicking a seat; mobile group selection opened the enlarged member list and selected-person panel. The Senate sample rendered seven arcs and 134 data records without overflow. Browser console had no observed errors during the visual checks.
- Checks: web typecheck, 17 web tests, production build, and `git diff --check` passed.

## Follow-up data note

- The sampled 2025 Senate vote still contains duplicate person records with conflicting “Pentru” and “Absent” statuses (for example, Cătălin Silegeanu). This predates the visual change and needs separate ingest reconciliation; the graph preserves the supplied records rather than silently choosing one.

final result: passed

---

# Vote-map labels and vote-color legibility QA

- Source visual truth: `/var/folders/c5/y22nbjqx41q8k63zczmsz10r0000gn/T/codex-clipboard-8c92e6a2-0260-49ea-a9bd-802ef315866e.png` (1487 × 1058 px), plus the user's request for vote-color fills on small seats.
- Implementation: `http://localhost:3016/ro/votes/vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-37356`. Browser captures were inspected inline at 320, 375, and 678 CSS px; the in-app browser does not provide a persisted screenshot path. The reference and implementation differ in viewport and existing CumVoteaza chrome, so the comparison focused on the graph and legends rather than claiming pixel identity.
- State: all groups and vote choices visible; PSD arc label selected once at 375 px. Browser density was 2 on the local mobile capture.

## Comparison history

1. [P1, fixed] Labels were hidden below 1024 px despite the coloured arcs remaining visible. A first pass placed all nine names at their arc midpoints, but the small groups covered right-side seats at 678 px.
2. [P1, fixed] The graph and arcs now reserve a responsive right label rail. The smaller groups' names sit beside their arc segments rather than on seats. PSD is raised above the left arc. The 375 and 678 px captures show all nine names without document overflow; measured label bounds also fit at 854 px. Desktop retains names and counts.
3. [P1, fixed] Small seats had a 10 px white symbol inside a circle as small as 7 px, with a 2 px party border. Vote status now reads primarily from saturated fill: green, red, amber, purple, or grey. The party colour remains a thin outer ring. Tiny screens use solid dots; larger desktop seats retain symbols. The 320 and 375 px captures show distinct vote colours without overflowing glyphs.
4. [P2, fixed] At 375 px the first label treatment used an unexpectedly large computed font and caused 7 px of horizontal overflow. A responsive inline font size corrected this; `documentElement.scrollWidth` now equals the 375 px viewport.

## Fidelity and verification

- Typography and spacing: serif party labels remain tied to arcs; compact mobile labels and a separate right rail avoid covering seats. The site-wide smaller type scale is retained intentionally.
- Colour and icons: party arches/rings and vote fills remain independent signals. The textual vote legend, seat accessible names, focus state, and selected-person panel continue to identify votes without relying on colour alone.
- Imagery: existing chamber illustration is unchanged and remains hidden on narrow screens; no new placeholder assets were introduced.
- Copy/data: 330 seats and the 260/1/40/1/28 totals are unchanged. “Rezultat neclarificat” remains separate from the bill's legal status.
- Interaction: selecting the PSD arc at 375 px activated the corresponding party filter. At 1280 px all nine desktop labels were visible and no document overflow was measured.
- Checks: production build, web typecheck, 17 web tests, and `git diff --check` passed. No new browser-console error was observed during the graph checks.

final result: passed
