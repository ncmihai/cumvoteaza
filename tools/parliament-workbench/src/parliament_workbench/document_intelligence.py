from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re
import secrets
from typing import Any

from .config import WorkbenchConfig
from .db import DatabaseUnavailable, ReadOnlyDb, normalize_json_values
from .proposals import create_proposal
from .state import WorkbenchState, create_schema


PARSER_VERSION = "workbench-legal-text-v1"
DIFF_VERSION = "workbench-section-diff-v1"
CANONICAL_DOCUMENT_ORDER = [
    "proposal",
    "senate_adopted_form",
    "committee_report",
    "adopted_form",
    "promulgation_form",
]

SECTION_PATTERNS = [
    re.compile(r"^\s*(Articol\s+unic)\b", re.IGNORECASE),
    re.compile(r"^\s*(Art\.?\s*[0-9]+(?:\^[0-9]+)?\.?)\b", re.IGNORECASE),
    re.compile(r"^\s*(Articolul\s+[0-9]+(?:\^[0-9]+)?)\b", re.IGNORECASE),
    re.compile(r"^\s*(La\s+articolul\s+[0-9]+[^,\n]*)", re.IGNORECASE),
    re.compile(r"^\s*(Punctul\s+[0-9]+[^,\n]*)", re.IGNORECASE),
    re.compile(r"^\s*(Alineatul\s+\([0-9]+\)[^,\n]*)", re.IGNORECASE),
    re.compile(r"^\s*(Anexa(?:\s+nr\.?\s*[0-9]+)?[^,\n]*)", re.IGNORECASE),
]

CITATION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("law", re.compile(r"\bLegea\s+nr\.?\s*[0-9]+/[0-9]{4}\b", re.IGNORECASE)),
    ("oug", re.compile(r"\bO\.?\s*U\.?\s*G\.?\s*nr\.?\s*[0-9]+/[0-9]{4}\b|\bOrdonan[țt]a\s+de\s+urgen[țt][aă]\s+a\s+Guvernului\s+nr\.?\s*[0-9]+/[0-9]{4}\b", re.IGNORECASE)),
    ("og", re.compile(r"\bO\.?\s*G\.?\s*nr\.?\s*[0-9]+/[0-9]{4}\b|\bOrdonan[țt]a\s+Guvernului\s+nr\.?\s*[0-9]+/[0-9]{4}\b", re.IGNORECASE)),
    ("article", re.compile(r"\bart\.?\s*[0-9]+(?:\^[0-9]+)?(?:\s+alin\.?\s*\([0-9]+\))?(?:\s+lit\.?\s*[a-z]\))?", re.IGNORECASE)),
    ("alineat", re.compile(r"\balin\.?\s*\([0-9]+\)", re.IGNORECASE)),
    ("point", re.compile(r"\bpct\.?\s*[0-9]+", re.IGNORECASE)),
    ("ccr_decision", re.compile(r"\bDecizia\s+Cur[țt]ii\s+Constitu[țt]ionale\s+nr\.?\s*[0-9]+/[0-9]{4}\b|\bDecizia\s+CCR\s+nr\.?\s*[0-9]+/[0-9]{4}\b", re.IGNORECASE)),
    ("monitorul_oficial", re.compile(r"\bMonitorul\s+Oficial(?:\s+al\s+Rom[âa]niei)?(?:,\s*Partea\s+[IVXLC]+)?(?:,\s*nr\.?\s*[0-9]+/[0-9]{4})?", re.IGNORECASE)),
    ("amended_act", re.compile(r"\b(se\s+modific[ăa]|se\s+completeaz[ăa]|se\s+abrog[ăa])\s+[^.\n]{0,180}", re.IGNORECASE)),
]


@dataclass(frozen=True)
class ParsedSection:
    id: str
    heading: str
    normalizedHeading: str
    kind: str
    startOffset: int
    endOffset: int
    text: str
    wordCount: int


def document_text_intelligence(config: WorkbenchConfig, document_id: str) -> dict[str, Any]:
    document = load_document(config, document_id)
    raw_text = load_document_text(config, document_id)
    corrections = list_text_corrections(config, document_id)
    latest_parse = latest_document_parse(config, document_id)
    if latest_parse is None and raw_text.strip():
        parse = parse_text_payload(document_id, raw_text)
    else:
        parse = latest_parse or empty_parse_payload(document_id, raw_text)
    return {
        "document": document,
        "rawText": raw_text,
        "rawTextHash": text_hash(raw_text),
        "rawTextLength": len(raw_text),
        "parse": parse,
        "corrections": corrections,
        "health": document_text_health(document, raw_text, parse, corrections),
    }


def parse_document_text(config: WorkbenchConfig, document_id: str, correction_id: str | None = None) -> dict[str, Any]:
    raw_text = load_document_text(config, document_id)
    selected_text = raw_text
    correction = None
    if correction_id:
        correction = get_text_correction(config, correction_id)
        if correction["documentId"] != document_id:
            raise ValueError("Correction does not belong to this document.")
        selected_text = correction.get("correctedText") or raw_text
    payload = parse_text_payload(document_id, selected_text, correction_id=correction_id, source_text_hash=text_hash(raw_text))
    now = utc_now()
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into document_parses (
              id, document_id, source_text_hash, correction_id, parser_version, quality,
              warnings_json, sections_json, citations_json, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              quality=excluded.quality,
              warnings_json=excluded.warnings_json,
              sections_json=excluded.sections_json,
              citations_json=excluded.citations_json,
              updated_at=excluded.updated_at
            """,
            (
                payload["id"],
                document_id,
                payload["sourceTextHash"],
                correction_id,
                payload["parserVersion"],
                payload["quality"],
                json.dumps(payload["warnings"], ensure_ascii=False, sort_keys=True),
                json.dumps(payload["sections"], ensure_ascii=False, sort_keys=True),
                json.dumps(payload["citations"], ensure_ascii=False, sort_keys=True),
                now,
                now,
            ),
        )
        conn.execute("delete from extracted_citations where parse_id = ?", (payload["id"],))
        for citation in payload["citations"]:
            conn.execute(
                """
                insert into extracted_citations (
                  id, document_id, parse_id, citation_type, raw_text, normalized_target,
                  snippet, start_offset, end_offset, confidence, status, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', ?, ?)
                """,
                (
                    citation["id"],
                    document_id,
                    payload["id"],
                    citation["citationType"],
                    citation["rawText"],
                    citation["normalizedTarget"],
                    citation["snippet"],
                    citation["startOffset"],
                    citation["endOffset"],
                    citation["confidence"],
                    now,
                    now,
                ),
            )
        conn.commit()
    return payload


def create_text_correction(config: WorkbenchConfig, document_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw_text = load_document_text(config, document_id)
    evidence_quote = clean_text(payload.get("evidenceQuote"))
    corrected_text = clean_text(payload.get("correctedText"))
    correction_note = clean_text(payload.get("correctionNote"))
    if not evidence_quote:
        raise ValueError("evidenceQuote is required for text corrections.")
    if not corrected_text and not correction_note:
        raise ValueError("correctedText or correctionNote is required.")
    now = utc_now()
    correction_id = f"text-correction-{secrets.token_hex(6)}"
    source_document_id = clean_text(payload.get("sourceDocumentId")) or document_id
    official_url = clean_text(payload.get("officialUrl"))
    proposal = create_proposal(
        config,
        {
            "status": "draft",
            "proposalType": "text_annotation",
            "entityType": "document",
            "entityId": document_id,
            "field": f"documents.{document_id}.text",
            "currentValue": {"baseTextHash": text_hash(raw_text), "rawTextLength": len(raw_text)},
            "proposedValue": {"correctedText": corrected_text, "correctionNote": correction_note},
            "evidenceQuote": evidence_quote,
            "sourceDocumentId": source_document_id,
            "officialUrl": official_url,
            "explanation": "Local document/OCR text correction from the workbench.",
        },
    )
    row = {
        "id": correction_id,
        "documentId": document_id,
        "status": "draft",
        "baseTextHash": text_hash(raw_text),
        "correctedText": corrected_text,
        "correctionNote": correction_note,
        "evidenceQuote": evidence_quote,
        "sourceDocumentId": source_document_id,
        "officialUrl": official_url,
        "proposalId": proposal["id"],
        "createdBy": clean_text(payload.get("createdBy")) or "local",
        "createdAt": now,
        "updatedAt": now,
    }
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into text_corrections (
              id, document_id, status, base_text_hash, corrected_text, correction_note,
              evidence_quote, source_document_id, official_url, proposal_id,
              created_by, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                document_id,
                row["status"],
                row["baseTextHash"],
                row["correctedText"],
                row["correctionNote"],
                row["evidenceQuote"],
                row["sourceDocumentId"],
                row["officialUrl"],
                row["proposalId"],
                row["createdBy"],
                now,
                now,
            ),
        )
        conn.commit()
    return row


def list_text_corrections(config: WorkbenchConfig, document_id: str) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from text_corrections where document_id = ? order by updated_at desc", (document_id,)).fetchall()
    return [correction_payload(row) for row in rows]


def bill_document_diff(config: WorkbenchConfig, bill_id_or_slug: str) -> dict[str, Any]:
    context = safe_bill_context(config, bill_id_or_slug)
    if not context:
        return {
            "billId": bill_id_or_slug,
            "diffVersion": DIFF_VERSION,
            "documents": [],
            "comparisons": [],
            "warnings": ["bill_not_found_or_database_unconfigured"],
        }
    documents = []
    by_kind: dict[str, dict[str, Any]] = {}
    for document in context["documents"]:
        kind = str(document.get("document_kind") or document.get("documentKind") or "")
        if kind not in CANONICAL_DOCUMENT_ORDER or kind in by_kind:
            continue
        text = load_document_text(config, document["id"])
        parse = parse_text_payload(document["id"], text)
        document_payload = {
            "documentId": document["id"],
            "label": document.get("label") or document.get("title") or document["id"],
            "documentKind": kind,
            "sourceUrl": document.get("url") or document.get("source_url"),
            "textLength": len(text),
            "sectionCount": len(parse["sections"]),
            "warnings": parse["warnings"],
            "quality": parse["quality"],
            "sections": parse["sections"],
        }
        by_kind[kind] = document_payload
    for kind in CANONICAL_DOCUMENT_ORDER:
        if kind in by_kind:
            documents.append(by_kind[kind])
    comparisons = []
    warnings = []
    for left, right in zip(documents, documents[1:]):
        comparison = compare_parsed_documents(left, right)
        comparisons.append(comparison)
        if left["warnings"] or right["warnings"]:
            warnings.append(f"weak_parse:{left['documentId']}:{right['documentId']}")
    return {
        "billId": context["bill"]["id"],
        "diffVersion": DIFF_VERSION,
        "documentOrder": CANONICAL_DOCUMENT_ORDER,
        "documents": [{key: value for key, value in document.items() if key != "sections"} for document in documents],
        "comparisons": comparisons,
        "warnings": warnings,
    }


def parse_text_payload(
    document_id: str,
    text: str,
    *,
    correction_id: str | None = None,
    source_text_hash: str | None = None,
) -> dict[str, Any]:
    sections = [section.__dict__ for section in parse_sections(text)]
    citations = extract_citations(text, document_id)
    warnings = parse_warnings(text, sections)
    quality = "strong" if not warnings else "partial"
    parse_id = f"parse-{document_id}-{text_hash((source_text_hash or text_hash(text)) + ':' + (correction_id or 'raw'))[:12]}"
    return {
        "id": parse_id,
        "documentId": document_id,
        "parserVersion": PARSER_VERSION,
        "sourceTextHash": source_text_hash or text_hash(text),
        "correctionId": correction_id,
        "quality": quality,
        "warnings": warnings,
        "sections": sections,
        "citations": citations,
    }


def parse_sections(text: str) -> list[ParsedSection]:
    cleaned = normalize_newlines(text)
    if not cleaned.strip():
        return []
    matches: list[tuple[int, int, str]] = []
    offset = 0
    for line in cleaned.splitlines(keepends=True):
        heading = heading_from_line(line)
        if heading:
            matches.append((offset, offset + len(line), heading))
        offset += len(line)
    if not matches:
        return [
            ParsedSection(
                id="section-preamble",
                heading="Preambul",
                normalizedHeading="preambul",
                kind="preamble",
                startOffset=0,
                endOffset=len(cleaned),
                text=cleaned.strip(),
                wordCount=count_words(cleaned),
            )
        ]
    sections: list[ParsedSection] = []
    if matches[0][0] > 0 and cleaned[: matches[0][0]].strip():
        preamble = cleaned[: matches[0][0]].strip()
        sections.append(
            ParsedSection("section-preamble", "Preambul", "preambul", "preamble", 0, matches[0][0], preamble, count_words(preamble))
        )
    for index, (start, _line_end, heading) in enumerate(matches):
        end = matches[index + 1][0] if index + 1 < len(matches) else len(cleaned)
        section_text = cleaned[start:end].strip()
        normalized = normalize_heading(heading)
        sections.append(
            ParsedSection(
                id=f"section-{index + 1}-{slugify(normalized)[:40]}",
                heading=heading.strip().rstrip("."),
                normalizedHeading=normalized,
                kind=section_kind(heading),
                startOffset=start,
                endOffset=end,
                text=section_text,
                wordCount=count_words(section_text),
            )
        )
    return sections


def extract_citations(text: str, document_id: str) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()
    for citation_type, pattern in CITATION_PATTERNS:
        for match in pattern.finditer(text):
            key = (citation_type, match.start(), match.end())
            if key in seen:
                continue
            seen.add(key)
            raw = match.group(0).strip()
            citations.append(
                {
                    "id": f"citation-{document_id}-{citation_type}-{match.start()}-{text_hash(raw)[:8]}",
                    "documentId": document_id,
                    "citationType": citation_type,
                    "rawText": raw,
                    "normalizedTarget": normalize_citation(raw),
                    "snippet": snippet_around(text, match.start(), match.end()),
                    "startOffset": match.start(),
                    "endOffset": match.end(),
                    "confidence": citation_confidence(citation_type, raw),
                    "status": "candidate",
                }
            )
    return sorted(citations, key=lambda row: (int(row["startOffset"]), str(row["citationType"])))


def compare_parsed_documents(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    left_sections = {section["normalizedHeading"]: section for section in left["sections"]}
    right_sections = {section["normalizedHeading"]: section for section in right["sections"]}
    added = []
    removed = []
    changed = []
    unchanged_count = 0
    for key, right_section in right_sections.items():
        left_section = left_sections.get(key)
        if not left_section:
            added.append(section_summary(right_section))
            continue
        if normalize_body(left_section["text"]) == normalize_body(right_section["text"]):
            unchanged_count += 1
            continue
        changed.append(changed_section_summary(left_section, right_section))
    for key, left_section in left_sections.items():
        if key not in right_sections:
            removed.append(section_summary(left_section))
    return {
        "fromDocumentId": left["documentId"],
        "toDocumentId": right["documentId"],
        "fromKind": left["documentKind"],
        "toKind": right["documentKind"],
        "added": added,
        "removed": removed,
        "changed": changed,
        "unchangedCount": unchanged_count,
        "weakParse": bool(left.get("warnings") or right.get("warnings")),
        "warnings": [*(left.get("warnings") or []), *(right.get("warnings") or [])],
    }


def changed_section_summary(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    before = str(left.get("text") or "")
    after = str(right.get("text") or "")
    summary = {
        "heading": right.get("heading") or left.get("heading"),
        "normalizedHeading": right.get("normalizedHeading") or left.get("normalizedHeading"),
        "beforeExcerpt": clip(before, 700),
        "afterExcerpt": clip(after, 700),
        "beforeWordCount": left.get("wordCount"),
        "afterWordCount": right.get("wordCount"),
        "diff": [],
    }
    if count_words(before) <= 180 and count_words(after) <= 180:
        summary["diff"] = word_diff(before, after)
    return summary


def word_diff(before: str, after: str) -> list[dict[str, str]]:
    before_words = before.split()
    after_words = after.split()
    output = []
    for opcode, i1, i2, j1, j2 in difflib.SequenceMatcher(a=before_words, b=after_words).get_opcodes():
        if opcode == "equal":
            output.append({"type": "same", "text": " ".join(before_words[i1:i2])})
        if opcode in {"delete", "replace"}:
            output.append({"type": "removed", "text": " ".join(before_words[i1:i2])})
        if opcode in {"insert", "replace"}:
            output.append({"type": "added", "text": " ".join(after_words[j1:j2])})
    return [part for part in output if part["text"]][:80]


def latest_document_parse(config: WorkbenchConfig, document_id: str) -> dict[str, Any] | None:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        row = conn.execute(
            "select * from document_parses where document_id = ? order by updated_at desc limit 1",
            (document_id,),
        ).fetchone()
    if not row:
        return None
    return parse_payload(row)


def load_document(config: WorkbenchConfig, document_id: str) -> dict[str, Any] | None:
    if not ReadOnlyDb(config).configured:
        return None
    try:
        rows = ReadOnlyDb(config).execute(DOCUMENT_QUERY, (document_id, document_id))
    except DatabaseUnavailable:
        return None
    except Exception:
        return None
    return camelize_row(normalize_json_values(rows[0])) if rows else None


def load_document_text(config: WorkbenchConfig, document_id: str) -> str:
    if not ReadOnlyDb(config).configured:
        return ""
    try:
        rows = ReadOnlyDb(config).execute(
            """
            select coalesce(string_agg(text, E'\n' order by chunk_index), '') as text
            from bill_document_text_chunks
            where document_id = %s
            """,
            (document_id,),
        )
    except Exception:
        return ""
    return str(rows[0].get("text") or "") if rows else ""


def safe_bill_context(config: WorkbenchConfig, bill_id_or_slug: str) -> dict[str, Any] | None:
    if not ReadOnlyDb(config).configured:
        return None
    try:
        return ReadOnlyDb(config).bill_audit_context(bill_id_or_slug)
    except Exception:
        return None


def get_text_correction(config: WorkbenchConfig, correction_id: str) -> dict[str, Any]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        row = conn.execute("select * from text_corrections where id = ?", (correction_id,)).fetchone()
    if not row:
        raise KeyError(correction_id)
    return correction_payload(row)


def parse_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "documentId": row["document_id"],
        "parserVersion": row["parser_version"],
        "sourceTextHash": row["source_text_hash"],
        "correctionId": row["correction_id"],
        "quality": row["quality"],
        "warnings": json.loads(row["warnings_json"] or "[]"),
        "sections": json.loads(row["sections_json"] or "[]"),
        "citations": json.loads(row["citations_json"] or "[]"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def correction_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "documentId": row["document_id"],
        "status": row["status"],
        "baseTextHash": row["base_text_hash"],
        "correctedText": row["corrected_text"],
        "correctionNote": row["correction_note"],
        "evidenceQuote": row["evidence_quote"],
        "sourceDocumentId": row["source_document_id"],
        "officialUrl": row["official_url"],
        "proposalId": row["proposal_id"],
        "reviewer": row["reviewer"],
        "reviewerNote": row["reviewer_note"],
        "reviewedAt": row["reviewed_at"],
        "decisionReason": row["decision_reason"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def empty_parse_payload(document_id: str, text: str) -> dict[str, Any]:
    return {
        "id": None,
        "documentId": document_id,
        "parserVersion": PARSER_VERSION,
        "sourceTextHash": text_hash(text),
        "correctionId": None,
        "quality": "missing_text",
        "warnings": ["missing_text"],
        "sections": [],
        "citations": [],
    }


def document_text_health(document: dict[str, Any] | None, text: str, parse: dict[str, Any], corrections: list[dict[str, Any]]) -> dict[str, Any]:
    warnings = list(parse.get("warnings") or [])
    if document and document.get("textStatus") not in {None, "stored"}:
        warnings.append(f"text_status:{document.get('textStatus')}")
    if not text.strip():
        warnings.append("missing_text")
    return {
        "quality": parse.get("quality") or "unknown",
        "warnings": sorted(set(warnings)),
        "correctionCount": len(corrections),
        "hasReviewedCorrection": any(row.get("status") in {"reviewed", "accepted", "applied"} for row in corrections),
    }


def parse_warnings(text: str, sections: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    stripped = text.strip()
    if not stripped:
        return ["missing_text"]
    if len(stripped) < 400:
        warnings.append("very_short_text")
    if not sections or all(section.get("kind") == "preamble" for section in sections):
        warnings.append("no_structural_headings")
    if sections and sum(1 for section in sections if section.get("kind") == "amendment") > max(2, len(sections) // 2):
        warnings.append("amendment_heavy_document")
    if any(int(section.get("wordCount") or 0) > 1800 for section in sections):
        warnings.append("huge_section")
    headings = [section.get("normalizedHeading") for section in sections]
    if len(headings) != len(set(headings)):
        warnings.append("duplicate_section_heading")
    weird_ratio = sum(1 for char in stripped if char == "\ufffd" or ord(char) < 32 and char not in "\n\t\r") / max(1, len(stripped))
    if weird_ratio > 0.002:
        warnings.append("weird_character_ratio")
    return warnings


def heading_from_line(line: str) -> str | None:
    text = line.strip()
    if not text or len(text) > 220:
        return None
    for pattern in SECTION_PATTERNS:
        match = pattern.match(text)
        if match:
            return match.group(1)
    return None


def section_kind(heading: str) -> str:
    lower = heading.lower()
    if lower.startswith("la articolul") or lower.startswith("punctul") or lower.startswith("alineatul"):
        return "amendment"
    if lower.startswith("anexa"):
        return "annex"
    if lower.startswith("art"):
        return "article"
    return "section"


def section_summary(section: dict[str, Any]) -> dict[str, Any]:
    return {
        "heading": section.get("heading"),
        "normalizedHeading": section.get("normalizedHeading"),
        "kind": section.get("kind"),
        "excerpt": clip(str(section.get("text") or ""), 700),
        "wordCount": section.get("wordCount"),
    }


def citation_confidence(citation_type: str, raw: str) -> float:
    if citation_type in {"law", "oug", "og", "ccr_decision"} and re.search(r"[0-9]+/[0-9]{4}", raw):
        return 0.92
    if citation_type in {"monitorul_oficial", "amended_act"}:
        return 0.78
    return 0.7


def normalize_citation(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower().replace("ţ", "ț").replace("ş", "ș")


def snippet_around(text: str, start: int, end: int, radius: int = 160) -> str:
    return re.sub(r"\s+", " ", text[max(0, start - radius) : min(len(text), end + radius)]).strip()


def normalize_heading(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower().rstrip(".")


def normalize_body(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def count_words(value: str) -> int:
    return len(re.findall(r"\w+", value, flags=re.UNICODE))


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "section"


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clip(value: str, max_length: int) -> str:
    text = re.sub(r"\s+", " ", value).strip()
    return text if len(text) <= max_length else text[:max_length].strip() + "..."


def text_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def camelize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {camel_key(key): value for key, value in row.items()}


def camel_key(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])


DOCUMENT_QUERY = """
select
  d.id,
  d.bill_id,
  b.slug as bill_slug,
  b.title as bill_title,
  d.label,
  d.document_kind::text,
  d.source_chamber::text,
  d.url,
  d.text_status::text,
  d.text_preview,
  d.text_asset_id,
  count(c.id)::int as chunk_count
from documents d
join bills b on b.id = d.bill_id
left join bill_document_text_chunks c on c.document_id = d.id
where d.id = %s or d.id = %s
group by d.id, b.slug, b.title
limit 1
"""
