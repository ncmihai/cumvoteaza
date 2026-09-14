# cumsevoteaza — Planning

## Product

`cumsevoteaza` is a private-first civic data explorer for Romanian Parliament
activity. It answers factual questions about bills, votes, parties,
parliamentary groups, and individual parliamentary careers.

The product has two core surfaces:

1. Official-data explorer for bills and votes.
2. Transfermarkt-style parliamentary history for each individual.
3. Composition history for Parliament and Government: legislatures,
   governments, ministers, parliamentary groups, coalition/support alignment,
   and dated composition events.

## Principles

- Official public pages are source of truth.
- Raw source snapshots are preserved for auditability.
- Party and group membership is temporal.
- Government, coalition/support, and opposition labels are temporal and
  source-backed. The app stores the basis separately from the label so official
  investiture data and computed voting support can be viewed as different
  modes.
- A person identity is separate from chamber-specific member records. This lets
  the same individual connect across multiple legislatures, chambers, and
  government roles without overwriting source-specific parliamentary records.
- Official CDEP historical profile pages are the canonical backbone for
  post-1989 parliamentary career history when available. Wikipedia remains a
  fallback/cross-check source, not a replacement for official profile snapshots.
- Alliances, parliamentary formations, non-affiliation states, and minority
  groupings must not be forced into legal party rows. They can be stored as
  historical formations/groups with source and period context.
- Party logos and electoral signs are temporal visual evidence. They must be
  attached to a legislature/period/source context, not treated as one permanent
  party property.
- Official profile photos, temporal party logos, CV files, and large reports
  should be stored outside Postgres. Digi Storage is the preferred binary
  store; Postgres keeps only metadata, ownership, source URL, provider/path,
  dimensions, variant, content hash, and status. The web UI reads Digi assets
  only through `/api/assets/[id]`.
- Bill dossiers use a hybrid model: Postgres stores official facts, procedure
  steps, committees, document metadata, source links, extracted-text previews,
  and searchable chunks; Digi Storage stores only small derived text artifacts
  when useful. Official PDFs remain on CDEP/Senate and are linked, not copied.
- Full legal diffs are future work. They need separate reviewed modeling for
  target law/article, current legal text source, amendment extraction, and
  before/after display; raw extracted bill text alone is not enough.
- V1 avoids political scoring, ideological labels, or editorial conclusions.
- Romanian is default; English exists from the beginning.

## Initial Scope

- Legislature: `2024-2028`.
- Chambers: Senate and Chamber of Deputies.
- Imports: manual command-line importers.
- Access: private local development, private deploy later.
- Database: local Postgres with Drizzle schema.

## First Milestone

- Import one Senate bill page.
- Import one Senate vote detail page.
- Attempt one Chamber nominal vote import from official linked source.
- Render one vote explorer.
- Render one member profile with a dense parliamentary-history table.

## Persistence Milestone

- Local development uses Docker Postgres.
- Drizzle migrations define the canonical database schema.
- Importers keep writing raw JSON/HTML snapshots for inspection and can also persist normalized records with `--persist`.
- Bill and vote pages read from Postgres first; demo data remains as a development fallback until the roster import is complete.
- Parser rules must avoid fabricating official dates. When a source event is visible but no reliable date is parsed, the importer should skip or mark the event as partial instead of inserting the runtime date.
- The first verified local persisted dataset is Senate bill `L316/2025` and its final vote on `2025-10-27`.

## Future Expansion

- Full current legislature ingestion.
- Scheduled imports.
- Search index.
- Backfill previous legislatures.
- Public-readiness pass for `cumsevoteaza.ro`.
- Post-1989 composition backfill:
  - people identity resolution across legislatures and chambers
  - government/cabinet timeline
  - Prime Minister, deputy Prime Minister, minister, interim minister, and
    other official government roles
  - official coalition/investiture alignment
  - computed governing-support view derived from imported nominal votes
  - month-level composition pages under a future `Compoziții` navigation item
  - model a successful no-confidence motion as a dated transition into a
    dismissed/caretaker interval for the same cabinet; create a separate
    interim-prime-minister interval only when an official presidential decree
    designates another person
  - verify and expose the complete minister roster for every cabinet, including
    appointments, departures, reshuffles, interim portfolios, and source-backed
    effective dates
  - reconcile every minister with the canonical `people` identity and any
    parliamentary mandates held before, during, or after that cabinet
  - add cabinet detail/history pages with filters for portfolio, party,
    parliamentary status, and date, plus links between minister and MP profiles

### Cabinet-history acceptance case: Defence, Bolojan cabinet

The portfolio view must be able to reproduce this official sequence without
overwriting the investiture roster:

1. Liviu-Ionuț Moșteanu — vice-prime minister and Minister of National Defence
   from the cabinet's investiture until his resignation took effect on
   2025-11-28.
2. Radu-Dinel Miruță — interim vice-prime minister and Minister of National
   Defence from 2025-11-28 through 2025-12-22, under Decree 1111/2025.
3. Radu-Dinel Miruță — fully appointed vice-prime minister and Minister of
   National Defence from 2025-12-23, under Decree 1166/2025.

The current composition must resolve the role active on the selected date. The
cabinet detail must also expose the complete succession, the appointment type,
the evidence for each transition, and links to parliamentary profiles when the
officeholder has a reconciled member identity.

### Cabinet page default

The primary public cabinet surface answers “Who governs right now?” It resolves
the cabinet status and one active holder for every portfolio at the page's
explicit `as of` date. Interim appointments receive a visible `Interimar`
badge, and one person may appear under several portfolios at the same time.

The investiture roster remains available as a secondary historical snapshot.
It must never replace the current resolved roster merely because its source is
easier to ingest. When current evidence is incomplete, the UI shows the last
verified date and identifies the unresolved portfolio instead of silently
falling back to the investiture holder.
