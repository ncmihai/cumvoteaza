from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import FileResponse
from psycopg import sql

from .cockpit_store import CockpitStore, digest, encode, stamp
from .cockpit_runtime import Worker, backup, recipe, seed_routine_recipes
from . import cockpit_workspace as ws
from . import cockpit_analysis as analysis

PAGES = ["home", "bills", "bill", "votes", "vote", "members", "member", "party", "composition"]
SECTIONS = ["introduction", "methodology", "reviewed_topics", "editorial_note"]
EDITABLE = {"bills", "votes", "members", "parties", "parliamentary_groups", "documents",
            "member_party_affiliations", "member_group_memberships", "member_mandates",
            "bill_events", "bill_procedure_steps", "bill_document_text_chunks", "stored_assets"}


def bill_rows(store, profile_id=None):
    with ws.connect() as db:
        rows = db.execute("""select b.id,b.slug,b.title,b.status,b.identifiers,b.chamber_of_origin,
          coalesce(s.submitted_on,(select min(e.occurred_on) from bill_events e where e.bill_id=b.id)) as introduced,
          (select count(*) from documents d where d.bill_id=b.id) as documents,
          (select count(*) from documents d where d.bill_id=b.id and exists
             (select 1 from bill_document_text_chunks c where c.document_id=d.id and length(c.text)>80)) as text_documents,
          (select min(v.held_on) from votes v where v.bill_id=b.id) as first_vote,
          (select max(v.held_on) from votes v where v.bill_id=b.id) as last_vote
          from bills b left join bill_vote_summaries s on s.bill_id=b.id order by introduced desc nulls last,b.id""").fetchall()
        terms = db.execute("select id,label,starts_on,ends_on from legislatures order by starts_on desc").fetchall()
    # Union explicit shared chamber identifiers; titles are not identity evidence.
    parent = {r["id"]: r["id"] for r in rows}
    def root(identifier):
        while parent[identifier] != identifier:
            parent[identifier] = parent[parent[identifier]]; identifier = parent[identifier]
        return identifier
    aliases = {}
    for row in rows:
        for chamber, value in (row["identifiers"] or {}).items():
            if not value:
                continue
            import re
            if not re.search(r"\d+\s*/\s*(?:19|20)\d{2}", str(value)):
                continue
            key = (chamber, str(value).lower().replace(" ", ""))
            if key in aliases:
                parent[root(row["id"])] = root(aliases[key])
            else:
                aliases[key] = row["id"]
    family_dates = {}
    for row in rows:
        family = root(row["id"])
        if row["introduced"] and (family not in family_dates or row["introduced"] < family_dates[family]):
            family_dates[family] = row["introduced"]
    for row in rows:
        row["introduced"] = family_dates.get(root(row["id"]))
    results = [r for r in analysis.current_results(store, profile_id) if not r["stale"]]
    analyzed = {r.get("billId") for r in results if r.get("output") and r.get("status") != "incomplete"}
    reviewed = {r.get("billId") for r in results if r.get("status") == "accepted"}
    for row in rows:
        row["familyId"] = root(row["id"])
        row["legislature"] = next((term["label"] for term in terms if row["introduced"] and row["introduced"] >= term["starts_on"] and (not term["ends_on"] or row["introduced"] < term["ends_on"])), "Unknown")
        row["analyzed"] = row["id"] in analyzed
        row["reviewed"] = row["id"] in reviewed
    return rows, terms


def attach_cockpit(app, config, canonical_url):
    store = CockpitStore(config)
    analysis.seed_profiles(store)
    seed_routine_recipes(store)
    worker = Worker(config, canonical_url)
    app.state.cockpit_worker = worker
    from contextlib import asynccontextmanager
    previous_lifespan = app.router.lifespan_context
    @asynccontextmanager
    async def lifespan(application):
        async with previous_lifespan(application):
            worker.start()
            try:
                yield
            finally:
                worker.stop()
    app.router.lifespan_context = lifespan
    router = APIRouter(prefix="/api/cockpit")

    @router.get("/vote-explanations")
    def vote_explanations_list():
        from .vote_explanations import list_explanations
        return list_explanations(canonical_url)

    @router.post("/vote-explanations/{identifier}/review")
    def vote_explanations_review(identifier: str, body: dict = Body(...)):
        from .vote_explanations import review_explanation
        try:
            return review_explanation(canonical_url, identifier, body.get("decision"), body.get("reason", ""))
        except ValueError as error:
            raise HTTPException(400, str(error))

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            host = request.url.hostname
            if host not in {"127.0.0.1", "localhost", "::1", "testserver"}:
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "Local cockpit host required"}, status_code=403)
            origin = request.headers.get("origin")
            if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
                parsed = urlparse(origin)
                if parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.scheme != "http":
                    from fastapi.responses import JSONResponse
                    return JSONResponse({"detail": "Cross-origin writes are not allowed"}, status_code=403)
        return await call_next(request)

    @router.get("/status")
    def status():
        try:
            with ws.connect() as db:
                count = db.execute("select count(*) as count from bills").fetchone()["count"]
            database = {"ready": True, "bills": count}
        except Exception:
            database = {"ready": False, "reason": "Start and initialize the isolated PostgreSQL workspace"}
        try:
            response = httpx.get(config.ollama_base_url + "/api/tags", timeout=3)
            response.raise_for_status()
            models = [m["name"] for m in response.json().get("models", [])]
            ollama = {"ready": True, "models": models}
        except Exception:
            ollama = {"ready": False, "models": []}
        return {"database": database, "ollama": ollama, "jobs": store.jobs(),
                "worker": bool(worker.thread and worker.thread.is_alive()), "publication": "manual_review",
                "publicationEnabled": os.environ.get("WORKBENCH_ENABLE_PUBLISH") == "1" and bool(os.environ.get("WORKBENCH_WRITE_TOKEN")),
                "baseline": store.get("baseline-status") if any(x["id"] == "baseline-status" for x in store.objects("setting")) else None}

    @router.get("/overview")
    def overview(profileId: str | None = None):
        try:
            rows, terms = bill_rows(store, profileId)
        except Exception as error:
            raise HTTPException(503, "Local bill data is unavailable. Initialize the workspace and copy its canonical baseline.") from error
        def counts(items):
            return {"bills": len({r["familyId"] for r in items}),
                    "text": len({r["familyId"] for r in items if r["text_documents"]}),
                    "analyzed": len({r["familyId"] for r in items if r["analyzed"]}),
                    "reviewed": len({r["familyId"] for r in items if r["reviewed"]})}
        terms_out = [{"label": label, **counts([r for r in rows if r["legislature"] == label]), "officialTotal": None}
                     for label in [t["label"] for t in terms] + ["Unknown"]]
        changes = store.changes()
        return {"totals": counts(rows), "legislatures": terms_out,
                "pending": sum(c["status"] in {"pending", "accepted"} for c in changes),
                "conflicts": sum(c["status"] == "conflict" for c in changes),
                "batches": store.objects("import_batch")[:10], "jobs": store.jobs()[:8]}

    @router.get("/legislatures")
    def legislatures():
        with ws.connect() as db:
            return {"items": db.execute("select id,label,starts_on,ends_on from legislatures order by starts_on desc").fetchall()}

    @router.get("/data")
    def data(table: str = "bills", query: str = "", legislature: str = "", stage: str = "", profileId: str | None = None,
             offset: int = 0, limit: int = 100):
        limit, offset = max(1, min(limit, 250)), max(0, offset)
        if table == "bills":
            rows, _ = bill_rows(store, profileId)
            rows = [r for r in rows if (not legislature or r["legislature"] == legislature)
                    and (not query or query.lower() in encode(r).lower())
                    and (stage != "text" or r["text_documents"] > 0)
                    and (stage != "analyzed" or r["analyzed"])
                    and (stage != "reviewed" or r["reviewed"])]
            return {"rows": rows[offset:offset+limit], "total": len(rows)}
        if table not in EDITABLE:
            raise HTTPException(400, "Unsupported data table")
        with ws.connect() as db:
            condition = sql.SQL(" where to_jsonb(t)::text ilike %s")
            rows = db.execute(sql.SQL("select to_jsonb(t) as row from {} t").format(sql.Identifier(table)) + condition + sql.SQL(" order by to_jsonb(t)::text limit %s offset %s"), ("%"+query+"%", limit, offset)).fetchall()
            total = db.execute(sql.SQL("select count(*) as count from {} t").format(sql.Identifier(table)) + condition, ("%"+query+"%",)).fetchone()["count"]
        return {"rows": [r["row"] for r in rows], "total": total}

    @router.get("/record/{table}/{identifier}")
    def record(table: str, identifier: str):
        if table not in EDITABLE:
            raise HTTPException(400, "Unsupported data table")
        with ws.connect() as db:
            row = db.execute(sql.SQL("select to_jsonb(t) as row from {} t where id=%s").format(sql.Identifier(table)), (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, "Record not found")
        return row["row"]

    @router.post("/record/{table}/{identifier}")
    def correction(table: str, identifier: str, payload: dict = Body(...)):
        before = record(table, identifier)
        fields = payload.get("fields", {})
        if not fields or not set(fields) <= (set(before)-{"id"}):
            raise HTTPException(400, "Edit existing fields without changing identity")
        evidence = payload.get("evidence", [])
        if not evidence:
            raise HTTPException(400, "Provide source evidence for the correction")
        after = {**before, **fields}
        change = store.change("manual-"+digest([after, stamp()])[:16], table, encode([identifier]), before, after, "manual", evidence)
        return {"changeId": change, "publication": "review_required"}

    @router.get("/objects/{kind}")
    def objects(kind: str):
        if kind not in {"profile", "result", "example", "reference", "recipe", "schedule", "release", "import_batch"}:
            raise HTTPException(404, "Unknown collection")
        return {"items": analysis.current_results(store) if kind == "result" else store.objects(kind)}

    @router.post("/profiles")
    def profile(payload: dict = Body(...)):
        return analysis.save_profile(store, payload)

    @router.post("/examples")
    def example(payload: dict = Body(...)):
        if payload.get("split") not in {"development", "holdout"} or payload.get("status") not in {"pending", "accepted", "rejected"}:
            raise HTTPException(400, "Choose an evaluation split and review status")
        family = payload.get("familyId") or payload.get("billId")
        siblings = [e for e in store.objects("example") if e.get("familyId") == family]
        if any(e["split"] != payload["split"] for e in siblings):
            raise HTTPException(409, "A bill family cannot appear in both teaching and held-out evaluation")
        if payload["status"] == "accepted" and not payload.get("evidence"):
            raise HTTPException(400, "Accepted reference examples require evidence")
        return store.put("example", {**payload, "familyId": family}, payload.get("id"))

    @router.post("/pilot")
    def pilot():
        rows, _ = bill_rows(store)
        unique = {r["familyId"]: r for r in rows}
        older = sorted([r for r in unique.values() if r["legislature"] == "2020-2024"], key=lambda r: digest(r["id"]))[:25]
        current = sorted([r for r in unique.values() if r["legislature"] == "2024-2028"], key=lambda r: digest(r["id"]))[:25]
        for index, row in enumerate(older+current):
            identifier = "pilot-"+digest(row["familyId"])[:20]
            try:
                store.get(identifier)
                continue
            except KeyError:
                pass
            store.put("example", {"billId": row["id"], "familyId": row["familyId"], "title": row["title"],
                "split": "holdout" if index % 3 == 0 else "development", "status": "pending",
                "labels": [], "evidence": [], "legislature": row["legislature"]}, identifier)
        return {"older": len(older), "current": len(current), "reviewRequired": True}

    @router.post("/references")
    def reference(payload: dict = Body(...)):
        text = str(payload.get("text", ""))
        if payload.get("base64"):
            raw = base64.b64decode(payload["base64"], validate=True)
            if len(raw) > 12*1024*1024:
                raise HTTPException(413, "Reference limit is 12 MB")
            extension = ".pdf" if raw.startswith(b"%PDF") else ".txt"
            directory = config.data_dir / "references"
            directory.mkdir(parents=True, exist_ok=True)
            file = directory / (digest(raw.hex())+extension)
            file.write_bytes(raw)
            if extension == ".pdf":
                from pypdf import PdfReader
                text = "\n".join(page.extract_text() or "" for page in PdfReader(file).pages)
            else:
                text = raw.decode("utf-8")
        if not text.strip() or not payload.get("origin"):
            raise HTTPException(400, "Reference text and its origin are required")
        return store.put("reference", {"name": payload.get("name", "Reference"), "origin": payload["origin"],
                                       "text": text[:100000], "contentHash": digest(text), "publicEvidence": False})

    @router.post("/results/{identifier}/review")
    def result_review(identifier: str, payload: dict = Body(...)):
        return analysis.review_result(store, identifier, payload["decision"], payload.get("corrected"))

    @router.get("/evaluation/{profile_id}")
    def evaluate(profile_id: str):
        return analysis.evaluation(store, profile_id)

    @router.get("/methods/compare")
    def compare_methods(profileIds: str):
        ids = [value.strip() for value in profileIds.split(",") if value.strip()]
        return analysis.compare_methods(store, ids)

    @router.get("/political/{profile_id}")
    def political(profile_id: str, legislature: str = "2024-2028"):
        return analysis.political_profiles(store, profile_id, legislature)

    @router.post("/recipes")
    def save_recipe(payload: dict = Body(...)):
        recipe(payload)
        return store.put("recipe", payload, payload.get("id"))

    @router.post("/schedules")
    def schedule(payload: dict = Body(...)):
        recipe(payload["recipe"])
        hours = int(payload.get("intervalHours", 24))
        if not 1 <= hours <= 8760:
            raise HTTPException(400, "Schedule interval must be between 1 and 8760 hours")
        return store.put("schedule", {**payload, "intervalHours": hours, "enabled": bool(payload.get("enabled", False)),
            "nextRun": (datetime.now(timezone.utc)+timedelta(hours=hours)).isoformat()}, payload.get("id"))

    @router.post("/imports/preview")
    def import_preview(payload: dict = Body(...)):
        return recipe(payload)

    @router.post("/jobs/{kind}")
    def enqueue(kind: str, payload: dict = Body(default={})):
        if kind not in {"setup", "seed", "backup", "restore", "import", "analysis", "preview"}:
            raise HTTPException(400, "Unknown job kind")
        if kind == "import":
            recipe(payload)
        if kind == "analysis" and store.get(payload["profileId"])["kind"] != "profile":
            raise HTTPException(400, "Select a saved profile")
        return store.enqueue(kind, payload)

    @router.get("/jobs")
    def jobs():
        return {"jobs": store.jobs()}

    @router.get("/jobs/{identifier}/events")
    def events(identifier: str, after: int = 0, tail: bool = False):
        return {"job": store.job(identifier), "events": store.events(identifier, after, tail=tail)}

    @router.post("/jobs/{identifier}/cancel")
    def cancel(identifier: str):
        return store.cancel(identifier)

    @router.post("/jobs/{identifier}/resume")
    def resume(identifier: str):
        return store.retry(identifier)

    @router.get("/changes")
    def changes():
        return {"changes": store.changes()}

    @router.post("/changes/review")
    def review(payload: dict = Body(...)):
        if payload.get("decision") == "accepted" and any(row["origin"] == "manual" and row["id"] in payload["ids"] for row in store.changes()):
            return store.enqueue("review",{"ids":payload["ids"],"decision":payload["decision"]})
        return store.review(payload["ids"], payload["decision"])

    @router.post("/changes/{identifier}/resolve")
    def resolve(identifier: str, payload: dict = Body(...)):
        return store.resolve_conflict(identifier,payload.get("choice",""),payload.get("reason",""))

    @router.get("/editor/registry")
    def registry():
        return {"pages": PAGES, "sections": SECTIONS}

    @router.get("/editor")
    def read_editor(page: str, entityId: str = ""):
        if page not in PAGES:
            raise HTTPException(400, "Unsupported website page")
        identifier = f"{page}:{entityId or '*'}"
        pending = next((change for change in store.changes() if change["table_name"] == "cockpit_editorial"
            and change["record_id"] == encode([identifier]) and change["status"] in {"pending","accepted"}),None)
        if pending:
            return {"sections":pending["after"]["content"]["sections"],"source":pending["status"],"changeId":pending["id"]}
        with ws.connect("baseline") as db:
            row = db.execute("select content from cockpit_editorial where id=%s", (identifier,)).fetchone()
        return {"sections":row["content"].get("sections",[]) if row else [],"source":"baseline"}

    @router.post("/editor")
    def editor(payload: dict = Body(...)):
        page = payload.get("page")
        if page not in PAGES:
            raise HTTPException(400, "Unsupported website page")
        sections = payload.get("sections", [])
        if len({s["type"] for s in sections}) != len(sections) or any(s["type"] not in SECTIONS for s in sections):
            raise HTTPException(400, "Choose unique supported sections")
        if any(not s.get("ro", "").strip() for s in sections if s.get("enabled", True) and s["type"] != "reviewed_topics"):
            raise HTTPException(400, "Enabled text sections require Romanian text")
        entity_id = payload.get("entityId") or None
        identifier = f"{page}:{entity_id or '*'}"
        with ws.connect("baseline") as db:
            row = db.execute("select to_jsonb(t) as row from cockpit_editorial t where id=%s", (identifier,)).fetchone()
        after = {"id": identifier, "page": page, "entity_id": entity_id, "content": {"sections": sections}, "updated_at": stamp()}
        change_id = store.change("editor-"+digest(after)[:20], "cockpit_editorial", encode([identifier]),
                                row["row"] if row else None, after, "editorial", [{"type": "operator_editorial", "note": payload.get("note", "Website text and sections")}])
        return {"changeId": change_id, "reviewRequired": True}

    @router.get("/backups")
    def backups():
        return {"files": [{"name": p.name, "bytes": p.stat().st_size} for p in sorted((config.data_dir/"backups").glob("cockpit-*.tar.gz"), reverse=True)]}

    @router.get("/backups/{name}")
    def download_backup(name: str):
        if Path(name).name != name or not name.startswith("cockpit-") or not name.endswith(".tar.gz"):
            raise HTTPException(400, "Invalid archive name")
        file = config.data_dir/"backups"/name
        if not file.exists():
            raise HTTPException(404, "Backup not found")
        return FileResponse(file, filename=name)

    @router.get("/assets/{asset_path:path}")
    def local_asset(asset_path: str):
        root = (config.data_dir/"assets").resolve()
        file = (root/asset_path).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise HTTPException(404, "Local asset not found")
        return FileResponse(file)

    @router.post("/releases/{identifier}/publish")
    def publish(identifier: str, request: Request):
        from .cockpit_publish import publish
        try:
            return publish(store, canonical_url, identifier, request.headers.get("x-workbench-token", ""))
        except PermissionError as error:
            raise HTTPException(403, str(error)) from error

    @router.post("/releases/{identifier}/refresh-cache")
    def refresh_cache(identifier: str):
        from .cockpit_publish import refresh_cache
        return refresh_cache(store, identifier, canonical_url)

    @router.post("/releases/{identifier}/reverse")
    def reverse(identifier: str):
        from .cockpit_publish import reversal
        return reversal(store, identifier)

    @app.exception_handler(ValueError)
    async def value_error(request: Request, error: ValueError):
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": str(error)}, status_code=409)

    @app.exception_handler(KeyError)
    async def missing_object(request: Request, error: KeyError):
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Object not found"}, status_code=404)

    app.include_router(router)
    return worker
