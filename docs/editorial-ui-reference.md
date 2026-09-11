# Editorial UI reference

The public website follows the five approved mockups in `docs/design/ui-refresh/` and the working homepage prototype in `/Users/ncmihai/Desktop/SITE CWN/cumvoteaza-homepage`.

## Shared structure

- `SiteHeader.tsx`: CumVoteaza identity, desktop navigation, search, locale and responsive hamburger navigation.
- `EditorialPage.tsx`: reusable 1440 px page canvas, primary content column, explanatory rail, page heading and guidance panels.
- `HomepageExperience.tsx`: interactive homepage reference implementation for search, filters, Hot ranking, vote selection, result presentation and detail rail.
- `HomepageExperience.module.css`: measured homepage tokens and breakpoints adapted from the approved prototype.

## Layout rules

- Desktop canvas: maximum 1440 px.
- Editorial homepage split: `1.6fr / minmax(430px, .95fr)`.
- Directory/profile split: flexible content plus 360 px context rail.
- Navigation collapses below 1024 px; content rails collapse below 1100 px.
- Mobile horizontal padding: 16 px. Desktop primary-column padding: 40–42 px.

## Visual tokens

- Navy: `#061a47`.
- Link blue: `#075fc6`.
- Muted text: `#4b608a`.
- Paper: `#fbfaf6`.
- Line: `#cfd7e4`.
- Positive: `#087f57`.
- Negative: `#d9272f`.
- Abstention: `#cc6810`.
- Display typography: Source Serif style using the current Georgia fallback.
- Interface typography: compact system sans-serif.

## Route adoption

- Homepage: full interactive split-page implementation.
- Projects: shared editorial frame, heading and guide rail.
- Members: shared editorial frame, heading and guide rail.
- Composition: shared editorial frame and guide rail around the existing timeline.
- Vote, member and party details should use the same frame and rail components in the next page-specific pass.

Public data remains authoritative. Reference mockup records and party totals must never be copied into production views as placeholders.
