# Data Directory

This directory has two different kinds of files.

## Curated Data

`data/curated/` is reviewed source material and belongs in git. These files are
part of the project memory and should be edited deliberately.

Examples:

- `political-formation-events.json`
- `tribunal-political-entity-sources.json`
- `wikipedia-party-history-sources.json`

## Generated Local Artifacts

The rest of the `data/` tree is local, rebuildable, and ignored by git:

- `data/imports/` stores CLI run reports.
- `data/snapshots/` stores raw HTML/debug snapshots.
- `data/cdep-history/raw/` stores raw CDEP crawl files.
- `data/cdep-history/parsed/` stores generated JSON/JSONL parser output.
- `data/cdep-history/reports/` stores generated audit/review reports.
- `data/parliament-pipeline/` holds old downloads from the retired Python pipeline (2026-10); the curated result is in `data/curated/`.
- `data/parliament-workbench/` stores the generated local wiki, model
  suggestions, local proposals/notes, workbench jobs, and review reports.

These files are useful for debugging and audit work, but the public app should
not depend on them at request time. Neon stores queryable facts. Digi Storage
stores binary/media/document assets. Generated local artifacts can be rebuilt
from official sources and curated files.

## Cleanup

Use the dry-run cleanup command before deleting generated files:

```bash
npm run data:clean
```

By default this only selects obvious system junk such as `.DS_Store`,
`__pycache__`, and `.pyc` files. Generated imports/snapshots/raw crawls are
reported but not selected unless explicitly requested.

Examples:

```bash
npm run data:clean -- --imports --snapshots --keep-days=7 --keep-latest=20
npm run data:clean -- --all-generated --keep-days=14 --keep-latest=50
```

Add `--confirm` only after reviewing the dry-run report:

```bash
npm run data:clean -- --imports --snapshots --keep-days=7 --keep-latest=20 --confirm
```

Avoid deleting `data/curated/`.
