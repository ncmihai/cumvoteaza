# Local Parliament Workbench

Browser-first local workbench for building a searchable parliament wiki and
running local model audits over existing `cumvoteaza` data.

V1 writes only local generated artifacts under `data/parliament-workbench/`.
Canonical database repairs remain outside this tool.

## Setup

```bash
npm run workbench:install
cp tools/parliament-workbench/.env.example tools/parliament-workbench/.env
```

Set `DATABASE_URL` in `tools/parliament-workbench/.env` or reuse the root env.
Ollama defaults to `http://127.0.0.1:11434` and `qwen3:8b`.
The install command creates `tools/parliament-workbench/.venv`; `workbench.py`
automatically uses that interpreter when it exists.

For local Digi Storage inspection, set the same server-side variables used by
the public asset gateway/importers:

```bash
DIGI_STORAGE_EMAIL=
DIGI_STORAGE_PASSWORD=
DIGI_STORAGE_BASE_PATH=cumvoteaza-assets
```

The workbench only exposes sanitized connector status to the React UI. Digi
tokens, passwords, and temporary download links stay inside the local FastAPI
process.

## Run

```bash
npm run workbench:start
```

The standalone workbench binds to `127.0.0.1:8787` and serves the built React
UI from FastAPI. Use one local URL:

```text
http://127.0.0.1:8787
```

Vite is only needed for UI development:

```bash
npm run workbench:dev
```

To build, check, restart, or stop it:

```bash
npm run workbench:build-ui
npm run workbench:doctor
npm run workbench:app-status
npm run workbench:restart
npm run workbench:stop
```

Useful commands:

```bash
npm run workbench:api
npm run workbench:ui
npm run workbench:wiki
npm run workbench:test
```

## Safety

- The workbench DB layer sets `default_transaction_read_only = on`.
- Digi Storage actions are read-only in V1: status, path verification, local
  preview, and generated reports.
- Model output is stored as suggestions, never canonical facts.
- Entity page edits are stored as local proposals under
  `data/parliament-workbench/proposals/`.
- Guarded write mode is disabled by default and requires
  `WORKBENCH_ENABLE_WRITES=1` plus `WORKBENCH_WRITE_TOKEN`.
- Historical import controls are command previews only in V1.
