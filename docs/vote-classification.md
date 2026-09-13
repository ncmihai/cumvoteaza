# Vote classification

The vote archive separates the question Parliament voted on from how prominently the product presents it. A nominal roll call is not automatically a consequential decision.

## Stored classification

Each vote records:

- `motion_kind`: the semantic kind of motion;
- `prominence`: `major`, `standard`, `routine`, or `unclassified`;
- `yes_meaning`: what a vote recorded as “for” supports;
- `classification_confidence`: `verified`, `high`, `medium`, or `low`;
- `classification_basis`, version, reason, and timestamp.

`verified` is reserved for structured official evidence or human review. Deterministic wording rules produce `high` or `medium` confidence. A manual review uses `manual_review`; automatic backfills must never overwrite it.

## Rule precedence

Rules are deliberately ordered. Quorum, agenda, timing, and internal procedure are evaluated before final-decision wording. This keeps a title such as “Prelungirea termenului constituțional de dezbatere și vot final” procedural even though it contains “vot final.”

The classifier recognizes full Romanian wording and recurring official abbreviations such as `AMA`, `AMR`, `VF`, and `PH-COM`. A generic or contradictory record stays unclassified and enters data-health review rather than being guessed.

## Safe archive workflow

1. Run `npm run ingest:audit:vote-classification -- --year=2026 --review-only`.
2. Inspect category counts and every review candidate.
3. Apply the database migration.
4. Run `npm run ingest:votes:classify -- --year=2026` for a non-writing backfill preview.
5. Add `--persist` only after review. The operation is resumable and skips manual overrides.

Homepage and analytical queries should use verified or high-confidence consequential votes. Complete directories may expose every category with clear labels.
