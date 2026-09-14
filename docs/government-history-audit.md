# Government history verification

Government timelines use a three-part workflow: a human-reviewed evidence manifest, a read-only database audit, and an explicitly reviewed persistence step. Discovery and audit never publish changes.

Run the current legislature audit with:

```sh
npm run ingest:audit:government-history
```

The command writes JSON and Markdown reports to `data/government-history/reports`. A non-zero exit status means review is required; it does not mean the command changed data.

## Evidence policy

Evidence is attached to individual claims, not entire pages. Official investiture, appointment, termination and coalition records can support `official_*` database classifications. Wikipedia is retained as visible secondary context and as a discovery aid, but it cannot promote, close or overwrite an official record.

No-confidence and interim periods must remain distinct. When Parliament adopts
a no-confidence motion, the cabinet becomes dismissed and continues only with
the constitutionally limited caretaker mandate until the next cabinet is
invested. This is a status transition on the existing cabinet, not by itself a
new interim government. A separate interim-prime-minister record requires an
official designation decree naming another person and its effective date.

The audit currently rejects or reports:

- duplicate governments, invalid intervals, timeline gaps and overlaps;
- closed intervals without termination evidence;
- governments without official investiture or appointment evidence;
- coalition mappings without official evidence;
- alignments outside their government interval;
- missing or mismatched database governments and coalition alignments;
- database facts that have no captured source snapshot.

## Review and persistence

The reviewed manifest is `packages/ingest/src/government-history-manifest.ts`. Changes require checking the linked source, recording the precise effective date, and keeping secondary and official evidence tiers separate. Persistence will remain a separate command and should refuse to run while audit errors exist. No automatic importer should overwrite an official record or turn a Wikipedia-only claim into an official fact.
