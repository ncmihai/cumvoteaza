# Homepage design QA

## Comparison target

- Source visual truth: `docs/design/ui-refresh/01-home-vote.png`
- Supporting implementation reference: `/Users/ncmihai/Desktop/SITE CWN/cumvoteaza-homepage/src/App.jsx`
- Supporting style reference: `/Users/ncmihai/Desktop/SITE CWN/cumvoteaza-homepage/src/styles.css`
- Implementation: `http://127.0.0.1:3001/ro`
- Implementation capture: Codex in-app browser tab 1, captured 2026-09-11
- Desktop viewport: 1440 × 1000 CSS pixels, device scale 1
- Responsive viewport: 390 × 844 CSS pixels, device scale 1
- State: Romanian homepage, latest verified vote selected, filters closed

## Full-view comparison evidence

The rebuilt page uses the reference's continuous two-column canvas, approximately 62/38 column split, warm paper background, compact public-service header, large serif editorial hierarchy, combined search/filter row, bordered featured vote, four result totals, recent-vote area, and persistent detail rail. The desktop capture preserves the same above-the-fold regions and reading order as the source.

The implementation uses current local parliamentary records. The selected local record has a longer title than the mockup and wraps to two lines in the detail rail. The local source currently returns one vote, so the recent-vote section correctly remains empty instead of displaying invented records.

## Focused comparison evidence

- Hero: date, title, deck, explanatory copy and search controls match the source hierarchy and spacing.
- Featured vote: yellow rule, kicker, title, evidence status, explanation panel, count strip and actions match the source component anatomy.
- Detail rail: toolbar, title, metadata, blue summary panel, result legend and official-details action match the source layout.
- Responsive view: navigation no longer overflows; hero, controls, featured card and detail content collapse into a readable single column.

## Required fidelity surfaces

- Fonts and typography: serif display and compact sans-serif UI hierarchy match the reference. Georgia remains the local fallback for Source Serif and produces comparable width and weight.
- Spacing and layout rhythm: desktop tracks, padding, section gaps, borders and radii follow the supplied stylesheet values.
- Colors and visual tokens: navy, muted blue, paper, semantic green/red/orange and pale blue explanation panels map directly to the supplied prototype.
- Image quality and assets: the homepage contains no editorial raster imagery. Existing project logo and library icons remain sharp at both tested sizes.
- Copy and content: editorial framing follows the prototype; vote-specific fields and totals come from the application data rather than the static example.

## Comparison history

- Earlier P1: the homepage was a stack of generic dashboard panels and did not preserve the mockup's two-column composition. Fixed by replacing the route body with the prototype's page structure and measured CSS.
- Earlier P1: the right side was a small generic rail rather than the vote-detail canvas. Fixed with a full detail panel containing toolbar, metadata, explanation, totals and official link.
- Earlier P2: mobile navigation overflowed horizontally. Fixed by collapsing the desktop navigation below the medium breakpoint.
- Earlier P2: search, featured-card and result-count proportions diverged from the source. Fixed by porting the supplied grid tracks, padding, type scales and breakpoints.

## Interaction checks

- Filter disclosure opens and closes with correct expanded state.
- Search field filters the supplied vote list client-side.
- Vote rows update the selected detail panel when more than one record is available.
- Detail and official links target the real vote route.
- Share control uses the browser share API where supported.
- Browser console errors checked: none.
- TypeScript check: passed.

## Follow-up polish

- The recent-vote list will populate automatically when the active local database exposes more than one record through the web connection.
- A later font pass can load Source Serif 4 and Libre Franklin locally if exact glyph metrics are required without remote font requests.

final result: passed
