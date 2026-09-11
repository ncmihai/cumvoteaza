# Public UI design QA — homepage → vote → member journey

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
