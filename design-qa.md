# Public UI design QA — homepage → vote → member journey

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
