from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .digi_storage import verify_digi_path
from .storage import write_jsonl


def asset_summary(config: WorkbenchConfig) -> dict[str, Any]:
    db = ReadOnlyDb(config)
    if not db.configured:
        return empty_summary()
    totals = db.execute(ASSET_TOTALS_QUERY)[0]
    return {
        "total": int(totals.get("total") or 0),
        "stored": int(totals.get("stored") or 0),
        "digiStorage": int(totals.get("digi_storage") or 0),
        "missingDigiPath": int(totals.get("missing_digi_path") or 0),
        "imageAssetsMissingMetadata": int(totals.get("image_assets_missing_metadata") or 0),
        "billTextAssets": int(totals.get("bill_text_assets") or 0),
        "documentTextAssetGaps": int(totals.get("document_text_asset_gaps") or 0),
        "byProvider": count_rows(db.execute("select coalesce(storage_provider::text, 'unknown') as key, count(*)::int as count from stored_assets group by 1 order by 2 desc")),
        "byType": count_rows(db.execute("select asset_type::text as key, count(*)::int as count from stored_assets group by 1 order by 2 desc")),
        "byStatus": count_rows(db.execute("select fetch_status::text as key, count(*)::int as count from stored_assets group by 1 order by 2 desc")),
    }


def list_assets(
    config: WorkbenchConfig,
    *,
    asset_type: str | None = None,
    provider: str | None = None,
    status: str | None = None,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    if not ReadOnlyDb(config).configured:
        return {"assets": [], "total": 0, "limit": limit, "offset": offset}
    where, params = asset_filters(asset_type=asset_type, provider=provider, status=status, query=query)
    db = ReadOnlyDb(config)
    total = db.scalar(f"select count(*)::int from stored_assets sa {where}", tuple(params)) or 0
    rows = db.execute(
        f"{ASSET_LIST_QUERY} {where} order by sa.updated_at desc nulls last, sa.id limit %s offset %s",
        tuple([*params, limit, offset]),
    )
    return {
        "assets": [asset_payload(row) for row in rows],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


def get_asset(config: WorkbenchConfig, asset_id: str) -> dict[str, Any] | None:
    rows = ReadOnlyDb(config).execute(f"{ASSET_LIST_QUERY} where sa.id = %s limit 1", (asset_id,))
    if not rows:
        return None
    return asset_payload(rows[0])


def verify_asset(config: WorkbenchConfig, asset_id: str) -> dict[str, Any]:
    asset = get_asset(config, asset_id)
    if not asset:
        return {"assetId": asset_id, "status": "missing_asset", "exists": False, "lastError": "Asset row not found."}
    if asset.get("storageProvider") != "digi_storage":
        return {
            "assetId": asset_id,
            "storagePath": asset.get("storagePath"),
            "status": "unsupported",
            "exists": False,
            "lastError": "Only digi_storage assets can be verified through Digi Storage.",
        }
    result = verify_digi_path(config, str(asset.get("storagePath") or ""))
    return {"assetId": asset_id, **result}


def audit_assets(config: WorkbenchConfig, *, limit: int = 500, verify_remote: bool = False) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    report_stamp = now.strftime("%Y%m%d-%H%M%S")
    issues = asset_health_issues(config, limit=limit)
    if verify_remote:
        digi_assets = list_assets(config, provider="digi_storage", status="stored", limit=min(limit, 200), offset=0)["assets"]
        for asset in digi_assets:
            verification = verify_asset(config, asset["id"])
            if verification.get("status") != "exists":
                issues.append(
                    {
                        "issueType": "digi_remote_missing",
                        "assetId": asset["id"],
                        "assetType": asset.get("assetType"),
                        "entityType": asset.get("entityType"),
                        "entityId": asset.get("entityId"),
                        "storagePath": asset.get("storagePath"),
                        "severity": "high",
                        "reason": verification.get("lastError") or verification.get("status"),
                        "suggestedAction": "Inspect the original source, re-run the relevant asset import, or mark the row for manual repair.",
                    }
                )
    suggestions_path = config.suggestions_dir / f"assets-{report_stamp}.jsonl"
    report_path = config.reports_dir / f"assets-{report_stamp}.md"
    write_jsonl(suggestions_path, issues)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(render_asset_report(issues, now), encoding="utf-8")
    return {
        "issueCount": len(issues),
        "suggestionsPath": str(suggestions_path),
        "reportPath": str(report_path),
        "verifiedRemote": verify_remote,
    }


def asset_health_issues(config: WorkbenchConfig, *, limit: int = 500) -> list[dict[str, Any]]:
    if not ReadOnlyDb(config).configured:
        return []
    rows = ReadOnlyDb(config).execute(ASSET_HEALTH_QUERY, (limit,))
    return [health_payload(row) for row in rows]


def empty_summary() -> dict[str, Any]:
    return {
        "total": 0,
        "stored": 0,
        "digiStorage": 0,
        "missingDigiPath": 0,
        "imageAssetsMissingMetadata": 0,
        "billTextAssets": 0,
        "documentTextAssetGaps": 0,
        "byProvider": [],
        "byType": [],
        "byStatus": [],
    }


def count_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"key": str(row.get("key") or "unknown"), "count": int(row.get("count") or 0)} for row in rows]


def asset_filters(*, asset_type: str | None, provider: str | None, status: str | None, query: str | None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if asset_type:
        clauses.append("sa.asset_type::text = %s")
        params.append(asset_type)
    if provider:
        clauses.append("coalesce(sa.storage_provider::text, 'unknown') = %s")
        params.append(provider)
    if status:
        clauses.append("sa.fetch_status::text = %s")
        params.append(status)
    if query:
        pattern = f"%{query}%"
        clauses.append(
            """(
              sa.id ilike %s
              or sa.entity_id ilike %s
              or sa.official_url ilike %s
              or sa.storage_path ilike %s
              or sa.public_url ilike %s
              or sa.blob_url ilike %s
            )"""
        )
        params.extend([pattern, pattern, pattern, pattern, pattern, pattern])
    return (f"where {' and '.join(clauses)}" if clauses else "", params)


def asset_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": row.get("id"),
        "entityType": row.get("entity_type"),
        "entityId": row.get("entity_id"),
        "assetType": row.get("asset_type"),
        "legislatureId": row.get("legislature_id"),
        "chamber": row.get("chamber"),
        "officialUrl": row.get("official_url"),
        "storageProvider": row.get("storage_provider") or "unknown",
        "storagePath": row.get("storage_path"),
        "publicUrl": row.get("public_url") or row.get("blob_url"),
        "publicGatewayUrl": f"/api/assets/{row.get('id')}",
        "contentHash": row.get("content_hash"),
        "mimeType": row.get("mime_type"),
        "byteSize": row.get("byte_size"),
        "width": row.get("width"),
        "height": row.get("height"),
        "variant": row.get("variant"),
        "fetchStatus": row.get("fetch_status"),
        "lastAttemptAt": text_value(row.get("last_attempt_at")),
        "updatedAt": text_value(row.get("updated_at")),
        "entityLabel": row.get("entity_label") or row.get("entity_id"),
        "documentId": row.get("document_id"),
        "documentLabel": row.get("document_label"),
        "documentTextStatus": row.get("document_text_status"),
        "billId": row.get("bill_id"),
        "billSlug": row.get("bill_slug"),
        "memberSlug": row.get("member_slug"),
        "partySlug": row.get("party_slug"),
    }
    payload["appUrl"] = app_url(payload)
    if payload["documentId"]:
        payload["documentTextUrl"] = f"/api/bill-documents/{payload['documentId']}/text"
    return payload


def app_url(asset: dict[str, Any]) -> str | None:
    if asset.get("billSlug"):
        return f"/ro/bills/{asset['billSlug']}"
    if asset.get("memberSlug"):
        return f"/ro/members/{asset['memberSlug']}"
    if asset.get("partySlug"):
        return f"/ro/parties/{asset['partySlug']}"
    return None


def health_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "issueType": row.get("issue_type"),
        "assetId": row.get("asset_id"),
        "assetType": row.get("asset_type"),
        "entityType": row.get("entity_type"),
        "entityId": row.get("entity_id"),
        "storageProvider": row.get("storage_provider"),
        "storagePath": row.get("storage_path"),
        "fetchStatus": row.get("fetch_status"),
        "severity": row.get("severity"),
        "reason": row.get("reason"),
        "suggestedAction": row.get("suggested_action"),
    }


def render_asset_report(issues: list[dict[str, Any]], created_at: datetime) -> str:
    lines = [
        "# Parliament Workbench Asset Audit",
        "",
        f"Generated: {created_at.isoformat()}",
        f"Issues: {len(issues)}",
        "",
    ]
    if not issues:
        lines.append("No metadata issues found in the selected audit window.")
        lines.append("")
        return "\n".join(lines)
    for issue in issues:
        lines.extend(
            [
                f"## {issue.get('issueType')} - {issue.get('assetId')}",
                "",
                f"- Asset type: {issue.get('assetType') or 'unknown'}",
                f"- Entity: {issue.get('entityType') or 'unknown'} / {issue.get('entityId') or 'unknown'}",
                f"- Provider: {issue.get('storageProvider') or 'unknown'}",
                f"- Path: {issue.get('storagePath') or 'unknown'}",
                f"- Reason: {issue.get('reason') or 'unknown'}",
                f"- Suggested action: {issue.get('suggestedAction') or 'review manually'}",
                "",
            ]
        )
    return "\n".join(lines)


def text_value(value: Any) -> str | None:
    return str(value) if value is not None else None


ASSET_TOTALS_QUERY = """
select
  count(*)::int as total,
  count(*) filter (where fetch_status = 'stored')::int as stored,
  count(*) filter (where storage_provider = 'digi_storage')::int as digi_storage,
  count(*) filter (where storage_provider = 'digi_storage' and coalesce(trim(storage_path), '') = '')::int as missing_digi_path,
  count(*) filter (
    where fetch_status = 'stored'
      and asset_type in ('photo', 'party_logo')
      and (byte_size is null or content_hash is null or width is null or height is null)
  )::int as image_assets_missing_metadata,
  count(*) filter (where asset_type = 'bill_text')::int as bill_text_assets,
  (
    select count(*)::int
    from documents d
    left join stored_assets tsa on tsa.id = d.text_asset_id
    where d.text_status = 'stored'
      and (d.text_asset_id is null or tsa.id is null or tsa.fetch_status <> 'stored')
  ) as document_text_asset_gaps
from stored_assets
"""


ASSET_LIST_QUERY = """
select
  sa.id,
  sa.entity_type::text,
  sa.entity_id,
  sa.asset_type::text,
  sa.legislature_id,
  sa.chamber::text,
  sa.official_url,
  sa.blob_url,
  sa.storage_provider::text,
  sa.storage_path,
  sa.public_url,
  sa.width,
  sa.height,
  sa.variant,
  sa.content_hash,
  sa.mime_type,
  sa.byte_size,
  sa.fetch_status::text,
  sa.last_attempt_at,
  sa.updated_at,
  coalesce(m.display_name, p.name, b.title, d_by_asset.label, d_by_entity.label, sa.entity_id) as entity_label,
  coalesce(d_by_asset.id, d_by_entity.id) as document_id,
  coalesce(d_by_asset.label, d_by_entity.label) as document_label,
  coalesce(d_by_asset.text_status::text, d_by_entity.text_status::text) as document_text_status,
  coalesce(d_by_asset.bill_id, d_by_entity.bill_id) as bill_id,
  b.slug as bill_slug,
  m.slug as member_slug,
  p.slug as party_slug
from stored_assets sa
left join members m on sa.entity_type = 'member' and m.id = sa.entity_id
left join parties p on sa.entity_type = 'party' and p.id = sa.entity_id
left join documents d_by_asset on d_by_asset.text_asset_id = sa.id
left join documents d_by_entity on sa.entity_type = 'bill_document' and d_by_entity.id = sa.entity_id
left join bills b on b.id = coalesce(d_by_asset.bill_id, d_by_entity.bill_id)
"""


ASSET_HEALTH_QUERY = """
select *
from (
  select
    'digi_storage_path_missing' as issue_type,
    sa.id as asset_id,
    sa.asset_type::text,
    sa.entity_type::text,
    sa.entity_id,
    sa.storage_provider::text,
    sa.storage_path,
    sa.fetch_status::text,
    'high' as severity,
    'Asset is marked as digi_storage but has no storage path.' as reason,
    'Re-run the relevant asset import or inspect the stored_assets row before repair.' as suggested_action
  from stored_assets sa
  where sa.storage_provider = 'digi_storage'
    and coalesce(trim(sa.storage_path), '') = ''

  union all

  select
    'document_text_asset_missing' as issue_type,
    coalesce(d.text_asset_id, d.id) as asset_id,
    'bill_text' as asset_type,
    'bill_document' as entity_type,
    d.id as entity_id,
    coalesce(sa.storage_provider::text, 'unknown') as storage_provider,
    sa.storage_path,
    coalesce(sa.fetch_status::text, 'unknown') as fetch_status,
    'high' as severity,
    'Document text_status is stored, but the referenced text asset is missing or not stored.' as reason,
    'Inspect the document text artifact and re-run ingest:bill-text for this document if needed.' as suggested_action
  from documents d
  left join stored_assets sa on sa.id = d.text_asset_id
  where d.text_status = 'stored'
    and (d.text_asset_id is null or sa.id is null or sa.fetch_status <> 'stored')

  union all

  select
    'image_metadata_missing' as issue_type,
    sa.id as asset_id,
    sa.asset_type::text,
    sa.entity_type::text,
    sa.entity_id,
    coalesce(sa.storage_provider::text, 'unknown') as storage_provider,
    sa.storage_path,
    sa.fetch_status::text,
    'medium' as severity,
    'Stored image asset is missing byte size, content hash, width, or height metadata.' as reason,
    'Re-run the image import/optimization path or backfill metadata from Digi Storage.' as suggested_action
  from stored_assets sa
  where sa.fetch_status = 'stored'
    and sa.asset_type in ('photo', 'party_logo')
    and (sa.byte_size is null or sa.content_hash is null or sa.width is null or sa.height is null)

  union all

  select
    'asset_entity_unlinked' as issue_type,
    sa.id as asset_id,
    sa.asset_type::text,
    sa.entity_type::text,
    sa.entity_id,
    coalesce(sa.storage_provider::text, 'unknown') as storage_provider,
    sa.storage_path,
    sa.fetch_status::text,
    'low' as severity,
    'Asset row does not resolve to a known member, party, or bill document entity.' as reason,
    'Inspect whether this is a legacy artifact or whether the entity relationship should be repaired.' as suggested_action
  from stored_assets sa
  left join members m on sa.entity_type = 'member' and m.id = sa.entity_id
  left join parties p on sa.entity_type = 'party' and p.id = sa.entity_id
  left join documents d on (sa.entity_type = 'bill_document' and d.id = sa.entity_id) or d.text_asset_id = sa.id
  where sa.entity_type in ('member', 'party', 'bill_document')
    and m.id is null
    and p.id is null
    and d.id is null
) issues
order by
  case severity when 'high' then 1 when 'medium' then 2 else 3 end,
  issue_type,
  asset_id
limit %s
"""
