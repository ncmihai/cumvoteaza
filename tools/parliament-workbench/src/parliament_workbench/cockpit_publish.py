"""Explicit publication: prepared assets, optimistic transaction, durable receipt, cache outbox."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import secrets
import subprocess

import httpx
import psycopg
from psycopg.rows import dict_row

from .cockpit_store import digest, encode, stamp
from .cockpit_runtime import backup
from . import cockpit_workspace as ws
from .config import repo_root


def validate_manifest(store, release):
    if release["kind"] != "release" or release["status"] not in {"preview_ready", "published", "cache_pending"}:
        raise ValueError("Release is not ready")
    if digest(release["manifest"]) != release["manifestHash"]:
        raise ValueError("Release manifest changed")
    current = {item["id"]: item for item in store.changes()}
    for item in release["manifest"]:
        live = current.get(item["id"])
        if not live or live["status"] not in {"accepted", "published"} or any(live[key] != item[key] for key in ["before", "after", "evidence"]):
            raise ValueError("A selected change or its review changed; rebuild the preview")
        if live["origin"] == "ai":
            from .cockpit_analysis import context_for
            result = store.get(live["batch_id"])
            if result.get("status") != "accepted" or digest(context_for(store.config,result["billId"])) != result.get("inputHash"):
                raise ValueError("Reviewed AI evidence became stale; rerun and review before publishing")
        if item["table_name"] == "stored_assets" and item["after"] and item["after"].get("storage_provider") == "local":
            root = (store.config.data_dir/"assets").resolve()
            file = (root/item["after"]["storage_path"]).resolve()
            if not file.is_relative_to(root) or not file.is_file():
                raise ValueError("A selected local asset is missing")
            if hashlib.sha256(file.read_bytes()).hexdigest() != item["after"].get("content_hash"):
                raise ValueError("Asset content changed after review")
    return release["manifest"]


def prepare_assets(store, manifest):
    prepared = copy.deepcopy(manifest)
    assets = [item for item in prepared if item["table_name"] == "stored_assets" and item["after"] and item["after"].get("storage_provider") == "local"]
    if not assets:
        return prepared
    request = [{"path": str((store.config.data_dir/"assets"/item["after"]["storage_path"]).resolve()),
                "objectPath": item["after"]["storage_path"], "mimeType": item["after"]["mime_type"]} for item in assets]
    environment = {k: v for k, v in os.environ.items() if not k.startswith("COCKPIT_")}
    environment["ASSET_STORAGE_PROVIDER"] = "digi_storage"
    result = subprocess.run(["node", "--import", "tsx", "tools/parliament-workbench/upload-release-assets.ts"],
        cwd=repo_root(), input=encode(request), text=True, capture_output=True, env=environment, timeout=600)
    if result.returncode:
        raise RuntimeError("Preparing Digi assets failed; no canonical database changes were made")
    uploaded = json.loads(result.stdout)
    for item, asset in zip(assets, uploaded):
        item["after"].update(storage_provider=asset["storageProvider"], storage_path=asset["storagePath"],
                             public_url=asset.get("publicUrl"), blob_url=asset.get("blobUrl"))
    return prepared


def commit_release(db, identifier, manifest_hash, manifest):
    # SERIALIZABLE plus row locks cover updates; primary keys cover insert races.
    db.execute("set transaction isolation level serializable")
    db.execute("select pg_advisory_xact_lock(726092026)")
    receipt = db.execute("select * from cockpit_release_receipts where id=%s", (identifier,)).fetchone()
    if receipt:
        if receipt["manifest_hash"] != manifest_hash:
            raise ValueError("Release ID already exists with another manifest")
        return receipt["manifest"]
    ws.apply_changes(db, manifest)
    db.execute("insert into cockpit_release_receipts(id,manifest_hash,manifest) values (%s,%s,%s::jsonb)",
               (identifier, manifest_hash, encode(manifest)))
    return manifest


def publish(store, canonical_url, release_id, token):
    expected = os.environ.get("WORKBENCH_WRITE_TOKEN", "")
    if os.environ.get("WORKBENCH_ENABLE_PUBLISH") != "1" or not expected or not secrets.compare_digest(expected, token):
        raise PermissionError("Production publication is disabled or the write token is invalid")
    if not canonical_url:
        raise ValueError("Canonical database is unavailable")
    release = store.get(release_id)
    validate_manifest(store, release)
    backup(store.config)
    # Detect conflicts before uploading; check again inside the eventual transaction.
    with psycopg.connect(canonical_url, row_factory=dict_row, connect_timeout=15) as db:
        db.execute("set transaction read only")
        ready = db.execute("select to_regclass('public.cockpit_release_receipts') as name").fetchone()
        if not ready["name"]:
            raise ValueError("Apply the reviewed canonical migration before publishing")
        existing = db.execute("select * from cockpit_release_receipts where id=%s", (release_id,)).fetchone()
        if not existing:
            ws.validate_baseline(db, release["manifest"])
    if existing:
        if existing["manifest_hash"] != release["manifestHash"]:
            raise ValueError("Canonical release receipt does not match")
        manifest = existing["manifest"]
    else:
        manifest = prepare_assets(store, release["manifest"])
        with psycopg.connect(canonical_url, row_factory=dict_row, connect_timeout=15) as db:
            manifest = commit_release(db, release_id, release["manifestHash"], manifest)
    # Repairable after a crash: canonical receipt is the authority for publication.
    release = store.put("release", {**release, "status": "cache_pending", "publishedAt": stamp(), "publishedManifest": manifest, "readModelsPending": True}, release_id)
    with store.connect() as db:
        for item in release["manifest"]:
            db.execute("update cockpit_changes set status='published' where id=?", (item["id"],))
    # Bring the baseline forward without replacing unrelated working drafts.
    with ws.connect("baseline") as db:
        receipt = db.execute("select 1 from cockpit_release_receipts where id=%s", (release_id,)).fetchone()
        if not receipt:
            ws.apply_changes(db, manifest)
            db.execute("insert into cockpit_release_receipts(id,manifest_hash,manifest) values (%s,%s,%s::jsonb)",
                       (release_id, release["manifestHash"], encode(manifest)))
    return refresh_cache(store, release_id, canonical_url)


def refresh_public_read_models(canonical_url):
    if not canonical_url or os.environ.get("WORKBENCH_ENABLE_PUBLISH") != "1":
        raise ValueError("Publication must remain enabled to refresh committed read models")
    environment = {k:v for k,v in os.environ.items() if k in {"PATH","HOME","TMPDIR","LANG","SSL_CERT_FILE","NODE_EXTRA_CA_CERTS"}}
    environment.update(DATABASE_URL=canonical_url, WORKBENCH_RELEASE_REFRESH="1")
    result = subprocess.run(["node","--import","tsx","tools/parliament-workbench/refresh-release-read-models.ts"],
        cwd=repo_root(),env=environment,capture_output=True,text=True,timeout=600)
    if result.returncode:
        raise RuntimeError("Committed release read models could not refresh. Retry without republishing.")


def refresh_cache(store, release_id, canonical_url=None):
    release = store.get(release_id)
    if release.get("status") not in {"published", "cache_pending"}:
        raise ValueError("Only a published release can refresh public caches")
    if release.get("readModelsPending"):
        try:
            refresh_public_read_models(canonical_url)
            release = store.put("release", {**release,"readModelsPending":False}, release_id)
        except Exception as error:
            return store.put("release", {**release,"status":"cache_pending","cacheError":str(error)},release_id)
    url = os.environ.get("WORKBENCH_PUBLIC_URL", "https://cumvoteaza.vercel.app")
    if not url.startswith("https://"):
        raise ValueError("Public cache endpoint must use HTTPS")
    try:
        response = httpx.get(url.rstrip("/")+"/api/cron/daily-import?revalidateOnly=1",
            headers={"Authorization": "Bearer "+os.environ.get("CRON_SECRET", "")}, timeout=30)
        response.raise_for_status()
        if response.json().get("mode") != "revalidate-only":
            raise ValueError("Public server did not confirm cache refresh")
        release.update(status="published", cacheError=None)
    except Exception:
        release.update(status="cache_pending", cacheError="Database release is committed. Retry cache refresh after the public endpoint is ready.")
    return store.put("release", release, release_id)


def reversal(store, release_id):
    release = store.get(release_id)
    if release.get("status") not in {"published", "cache_pending"}:
        raise ValueError("Only published releases can be reversed")
    identifiers = []
    groups = {}
    for item in release["publishedManifest"]:
        groups.setdefault((item["table_name"],item["record_id"]),[]).append(item)
    for (table,record), items in groups.items():
        starts = [item for item in items if not any(ws.semantic(item["before"]) == ws.semantic(other["after"]) for other in items)]
        if not starts:
            # A committed closed chain has no net row change to reverse.
            continue
        original, value = starts[0]["before"], starts[0]["before"]
        remaining = list(items)
        while remaining:
            matching = [item for item in remaining if ws.semantic(item["before"]) == ws.semantic(value)]
            if not matching:
                raise ValueError("Release receipt does not contain a continuous change history")
            value = matching[0]["after"]
            remaining = [item for item in remaining if item not in matching]
        evidence = list({digest(e):e for item in items for e in item["evidence"]}.values())
        identifiers.append(store.change("reversal-"+release_id,table,record,value,original,"reversal",evidence))
    return {"changes": identifiers, "reviewRequired": True}
