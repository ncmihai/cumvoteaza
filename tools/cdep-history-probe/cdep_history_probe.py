#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import os
import re
import ssl
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable


BASE_URL = "https://cdep.ro"
DEFAULT_OUT_DIR = Path("data/cdep-history")
LEGISLATURES = ["1990", "1992", "1996", "2000", "2004", "2008", "2012", "2016", "2020", "2024"]
USER_AGENT = "cumsevoteaza-cdep-history-probe/0.1 (+local research; polite crawler)"


@dataclass(frozen=True)
class Link:
    href: str
    text: str


@dataclass(frozen=True)
class Image:
    src: str
    alt: str


@dataclass
class ParsedHtml:
    links: list[Link]
    images: list[Image]
    headings: list[str]
    text: str
    title: str


class SimpleExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[dict[str, Any]] = []
        self.images: list[Image] = []
        self.headings: list[str] = []
        self.text_chunks: list[str] = []
        self.title_chunks: list[str] = []
        self._current_link: dict[str, Any] | None = None
        self._heading_tag: str | None = None
        self._heading_chunks: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key.lower(): value or "" for key, value in attrs}
        if tag == "a" and attr.get("href"):
            self._current_link = {"href": attr["href"], "chunks": []}
        elif tag == "img" and attr.get("src"):
            self.images.append(Image(src=attr["src"], alt=clean_text(attr.get("alt", ""))))
        elif tag in {"h1", "h2", "h3"}:
            self._heading_tag = tag
            self._heading_chunks = []
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._current_link:
            href = self._current_link["href"]
            text = clean_text(" ".join(self._current_link["chunks"]))
            self.links.append({"href": href, "text": text})
            self._current_link = None
        elif tag == self._heading_tag:
            heading = clean_text(" ".join(self._heading_chunks))
            if heading:
                self.headings.append(heading)
            self._heading_tag = None
            self._heading_chunks = []
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        value = clean_text(data)
        if not value:
            return
        self.text_chunks.append(value)
        if self._current_link is not None:
            self._current_link["chunks"].append(value)
        if self._heading_tag is not None:
            self._heading_chunks.append(value)
        if self._in_title:
            self.title_chunks.append(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe CDEP post-1989 member history pages.")
    sub = parser.add_subparsers(dest="command", required=True)

    urls = sub.add_parser("roster-urls", help="Print official CDEP roster URLs.")
    urls.add_argument("--legislature", default="all", help="One start year or all.")
    urls.add_argument("--chamber", default="both", choices=["both", "deputies", "senate"])
    urls.add_argument("--include-reelected", action="store_true")

    crawl = sub.add_parser("crawl", help="Fetch rosters/profiles and write parsed JSONL.")
    crawl.add_argument("--seed-url", action="append", default=[], help="Seed structura.mp profile URL. Can be repeated.")
    crawl.add_argument("--legislature", default=None, help="Roster start year or all.")
    crawl.add_argument("--chamber", default="both", choices=["both", "deputies", "senate"])
    crawl.add_argument("--include-reelected", action="store_true")
    crawl.add_argument("--follow-careers", action=argparse.BooleanOptionalAction, default=True)
    crawl.add_argument("--limit-profiles", type=int, default=0, help="Stop after N unique profiles. 0 means no limit.")
    crawl.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)
    crawl.add_argument("--delay", type=float, default=0.5, help="Delay between live fetches.")
    crawl.add_argument("--concurrency", type=int, default=1, help="Concurrent profile fetches. Keep low for official sites.")
    crawl.add_argument("--refresh", action="store_true", help="Refetch even when a raw snapshot exists.")
    crawl.add_argument("--insecure", action="store_true", help="Disable TLS verification for CDEP probe fetches.")

    audit = sub.add_parser("audit", help="Summarize parsed JSONL and optionally compare counts with Postgres.")
    audit.add_argument("--profiles", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "profiles.jsonl")
    audit.add_argument("--rosters", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "rosters.jsonl")
    audit.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR / "reports" / "audit.json")
    audit.add_argument("--legislature", default="2004", help="Legislature start year for DB comparison.")
    audit.add_argument("--database-url", default=None, help="Postgres URL. Defaults to DATABASE_URL or .env.")

    preview = sub.add_parser("preview-import", help="Build a file-only normalized import preview from parsed profiles.")
    preview.add_argument("--profiles", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "profiles.jsonl")
    preview.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "import-preview.json")

    reparse = sub.add_parser("reparse", help="Re-parse cached raw profile pages into profiles.jsonl. Never touches the network.")
    reparse.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR)

    assets = sub.add_parser("asset-inventory", help="Build a file-only inventory of official profile assets.")
    assets.add_argument("--profiles", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "profiles.jsonl")
    assets.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR / "parsed" / "assets.jsonl")
    assets.add_argument("--report", type=Path, default=DEFAULT_OUT_DIR / "reports" / "assets.json")

    args = parser.parse_args()
    if args.command == "roster-urls":
        for item in roster_urls(args.legislature, args.chamber, args.include_reelected):
            print(item["url"])
        return
    if args.command == "crawl":
        run_crawl(args)
        return
    if args.command == "audit":
        run_audit(args)
        return
    if args.command == "preview-import":
        run_preview_import(args)
        return
    if args.command == "asset-inventory":
        run_asset_inventory(args)
        return
    if args.command == "reparse":
        run_reparse(args)
        return


def run_reparse(args: argparse.Namespace) -> None:
    """Rebuild parsed/profiles.jsonl from raw snapshots only. Missing raw files are reported, never fetched."""
    raw_dir = args.out / "raw"
    profiles_path = args.out / "parsed" / "profiles.jsonl"
    previous = [json.loads(line) for line in profiles_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    records: list[dict[str, Any]] = []
    missing: list[str] = []
    for old in previous:
        canonical = canonical_url(old["url"])
        stem = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        html_path, meta_path = raw_dir / f"{stem}.html", raw_dir / f"{stem}.json"
        if not html_path.exists() or not meta_path.exists():
            missing.append(old["url"])
            records.append(old)
            continue
        snapshot = json.loads(meta_path.read_text(encoding="utf-8"))
        records.append(parse_profile_page(html_path.read_text(encoding="utf-8"), canonical, snapshot))
    backup = profiles_path.with_suffix(".jsonl.bak")
    if not backup.exists():
        backup.write_text(profiles_path.read_text(encoding="utf-8"), encoding="utf-8")
    write_jsonl(profiles_path, records)
    print(json.dumps({"reparsed": len(records) - len(missing), "missingRaw": len(missing), "backup": str(backup)}, indent=2))


def run_crawl(args: argparse.Namespace) -> None:
    out_dir: Path = args.out
    raw_dir = out_dir / "raw"
    parsed_dir = out_dir / "parsed"
    reports_dir = out_dir / "reports"
    for directory in (raw_dir, parsed_dir, reports_dir):
        directory.mkdir(parents=True, exist_ok=True)

    roster_records: list[dict[str, Any]] = []
    profile_records: list[dict[str, Any]] = []
    profile_failures: list[dict[str, Any]] = []
    profile_queue: list[str] = list(args.seed_url)
    seen_profile_keys: set[str] = set()
    seen_profile_urls: set[str] = set()

    if args.legislature:
        for roster in roster_urls(args.legislature, args.chamber, args.include_reelected):
            html_text, snapshot = fetch_or_read(roster["url"], raw_dir, args.delay, args.refresh, args.insecure)
            parsed_roster = parse_roster_page(html_text, roster["url"], roster, snapshot)
            roster_records.append(parsed_roster)
            profile_queue.extend(item["url"] for item in parsed_roster["profiles"])

    concurrency = max(1, min(8, int(args.concurrency or 1)))
    while profile_queue:
        batch = next_profile_batch(profile_queue, seen_profile_urls, seen_profile_keys, args.limit_profiles, len(profile_records), concurrency)
        if not batch:
            break
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = {
                executor.submit(fetch_and_parse_profile, url, raw_dir, args.delay, args.refresh, args.insecure): url
                for url in batch
            }
            for future in concurrent.futures.as_completed(futures):
                try:
                    parsed_profile = future.result()
                except Exception as error:
                    profile_failures.append(profile_failure_record(futures[future], error))
                    continue
                profile_records.append(parsed_profile)
                if parsed_profile["profileKey"]:
                    seen_profile_keys.add(parsed_profile["profileKey"])

                if args.follow_careers:
                    for career in parsed_profile["careerLinks"]:
                        career_url = career["url"]
                        career_key = career["profileKey"]
                        if career_key not in seen_profile_keys and career_url not in seen_profile_urls:
                            profile_queue.append(career_url)

    write_jsonl(parsed_dir / "rosters.jsonl", roster_records)
    write_jsonl(parsed_dir / "profiles.jsonl", profile_records)
    write_jsonl(parsed_dir / "profile-failures.jsonl", profile_failures)
    summary = build_summary(roster_records, profile_records, profile_failures)
    (reports_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def next_profile_batch(
    profile_queue: list[str],
    seen_profile_urls: set[str],
    seen_profile_keys: set[str],
    limit_profiles: int,
    fetched_count: int,
    concurrency: int,
) -> list[str]:
    batch: list[str] = []
    while profile_queue and len(batch) < concurrency:
        if limit_profiles and fetched_count + len(batch) >= limit_profiles:
            break
        url = canonical_url(profile_queue.pop(0))
        if url in seen_profile_urls:
            continue
        key = profile_key_from_url(url)
        if key and key in seen_profile_keys:
            continue
        seen_profile_urls.add(url)
        batch.append(url)
    return batch


def fetch_and_parse_profile(url: str, raw_dir: Path, delay: float, refresh: bool, insecure: bool) -> dict[str, Any]:
    html_text, snapshot = fetch_or_read(url, raw_dir, delay, refresh, insecure)
    return parse_profile_page(html_text, url, snapshot)


def profile_failure_record(url: str, error: Exception) -> dict[str, Any]:
    return {
        "url": canonical_url(url),
        "profileKey": profile_key_from_url(url),
        "failedAt": now_iso(),
        "error": str(error),
        "errorType": type(error).__name__,
    }


def roster_urls(legislature_flag: str, chamber_flag: str, include_reelected: bool) -> list[dict[str, str]]:
    legislatures = LEGISLATURES if legislature_flag == "all" else [legislature_flag]
    chambers = ["deputies", "senate"] if chamber_flag == "both" else [chamber_flag]
    rows: list[dict[str, str]] = []
    for legislature in legislatures:
        if legislature not in LEGISLATURES:
            raise SystemExit(f"Unsupported legislature: {legislature}")
        for chamber in chambers:
            cam = "1" if chamber == "senate" else "2"
            base = f"{BASE_URL}/ords/pls/parlam/structura.de?leg={legislature}"
            if chamber == "senate":
                base += "&cam=1"
            rows.append({"legislature": legislature, "chamber": chamber, "kind": "active", "url": base})
            if include_reelected:
                separator = "&" if "?" in base else "?"
                rows.append({"legislature": legislature, "chamber": chamber, "kind": "reelected", "url": f"{base}{separator}par=X"})
    return rows


def fetch_or_read(url: str, raw_dir: Path, delay: float, refresh: bool, insecure: bool) -> tuple[str, dict[str, Any]]:
    canonical = canonical_url(url)
    file_stem = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    html_path = raw_dir / f"{file_stem}.html"
    meta_path = raw_dir / f"{file_stem}.json"
    if html_path.exists() and meta_path.exists() and not refresh:
        return html_path.read_text(encoding="utf-8"), json.loads(meta_path.read_text(encoding="utf-8"))

    time.sleep(max(0, delay))
    request = urllib.request.Request(canonical, headers={"User-Agent": USER_AGENT})
    context = ssl._create_unverified_context() if insecure else None
    started = now_iso()
    try:
        with urllib.request.urlopen(request, timeout=30, context=context) as response:
            body = response.read()
            headers = dict(response.headers.items())
            charset = detect_charset(body, headers.get("Content-Type", ""))
            text = body.decode(charset, errors="replace")
            status = getattr(response, "status", 200)
    except urllib.error.URLError as error:
        snapshot = {
            "url": canonical,
            "fetchedAt": started,
            "status": "failed",
            "error": str(error),
        }
        meta_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise

    snapshot = {
        "url": canonical,
        "fetchedAt": started,
        "status": status,
        "charset": charset,
        "contentHash": hashlib.sha256(body).hexdigest(),
        "tlsVerification": "disabled" if insecure else "default",
    }
    html_path.write_text(text, encoding="utf-8")
    meta_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return text, snapshot


def parse_roster_page(html_text: str, source_url: str, roster: dict[str, str], snapshot: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_html(html_text)
    profiles: dict[str, dict[str, str]] = {}
    for link in parsed.links:
        absolute = absolute_url(link.href, source_url)
        if "structura.mp" not in absolute or "idm=" not in absolute:
            continue
        key = profile_key_from_url(absolute)
        if not key:
            continue
        profiles[key] = {
            "profileKey": key,
            "url": canonical_url(absolute),
            "nameHint": link.text,
            "legislature": query_param(absolute, "leg") or roster["legislature"],
            "chamber": chamber_from_url(absolute),
            "officialId": query_param(absolute, "idm") or "",
        }
    return {
        "source": roster,
        "snapshot": snapshot,
        "profiles": sorted(profiles.values(), key=lambda item: item["profileKey"]),
        "profileCount": len(profiles),
    }


def parse_profile_page(html_text: str, source_url: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_html(html_text)
    body = parsed.text
    profile_key = profile_key_from_url(source_url)
    profile_identity = profile_identity_from_url(source_url)
    name = strip_office_suffix(extract_profile_name(html_text, parsed))
    links = parsed.links
    career_links = parse_career_links(links, source_url)
    replacement = parse_replacement(html_text, source_url)
    parties = parse_links_by_path(links, source_url, "structura.fp")
    groups = parse_links_by_path(links, source_url, "structura.gp")
    committees = parse_links_by_path(links, source_url, "structura.co")
    constituencies = parse_links_by_path(links, source_url, "structura.ce")
    action_links = parse_action_links(links, source_url)

    return {
        "profileKey": profile_key,
        "url": canonical_url(source_url),
        "snapshot": snapshot,
        "identity": profile_identity,
        "name": name,
        "validationDateRaw": regex_first(body, r"data validarii:\s*([^-.]+)"),
        "mandateEndRaw": regex_first(body, r"data incetarii(?: mandatului)?:\s*([^-.]+)"),
        "electedListRaw": regex_first(body, r"pe listele\s+(.+?)(?:data validarii|data incetarii|Formatiunea politica|Grupul parlamentar|$)"),
        "photoUrls": unique([absolute_url(img.src, source_url) for img in parsed.images if "/parlamentari/" in img.src]),
        "logoUrls": unique([absolute_url(img.src, source_url) for img in parsed.images if "/aleg/" in img.src]),
        "careerLinks": career_links,
        "replacement": replacement,
        "partyLinks": parties,
        "groupLinks": groups,
        "partyMemberships": parse_dated_memberships(html_text, source_url, "Formatiunea politica:", "structura.fp"),
        "groupMemberships": parse_dated_memberships(html_text, source_url, "Grupul parlamentar:", "structura.gp"),
        "committeeLinks": committees,
        "constituencyLinks": constituencies,
        "activityLinks": action_links,
    }


def parse_html(html_text: str) -> ParsedHtml:
    parser = SimpleExtractor()
    parser.feed(html_text)
    links = [Link(href=item["href"], text=item["text"]) for item in parser.links]
    return ParsedHtml(
        links=links,
        images=parser.images,
        headings=parser.headings,
        text=normalize_for_regex(" ".join(parser.text_chunks)),
        title=clean_text(" ".join(parser.title_chunks)),
    )


def parse_career_links(links: Iterable[Link], source_url: str) -> list[dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    for link in links:
        if not re.search(r"\d{4}\s*-\s*\d{4}\s*\((?:dep|sen)\.\)", link.text, re.I):
            continue
        absolute = canonical_url(absolute_url(link.href, source_url))
        key = profile_key_from_url(absolute)
        if not key:
            continue
        rows[key] = {
            "profileKey": key,
            "url": absolute,
            "label": link.text,
            "officialId": query_param(absolute, "idm") or "",
            "legislature": query_param(absolute, "leg") or "",
            "chamber": chamber_from_url(absolute),
        }
    return sorted(rows.values(), key=lambda item: (item["legislature"], item["chamber"], item["officialId"]))


def parse_replacement(html_text: str, source_url: str) -> dict[str, str] | None:
    normalized = normalize_for_regex(strip_tags(html_text))
    if "inlocuieste pe" not in normalized:
        return None
    relation_window = normalized[normalized.find("inlocuieste pe") : normalized.find("inlocuieste pe") + 300]
    name = regex_first(relation_window, r"inlocuieste pe\s*:?\s*([A-ZAa-z0-9 .,'\-]+?)(?:data|Formatiunea|Grupul|$)")
    parsed = parse_html(html_text)
    related_links = []
    for link in parsed.links:
        absolute = absolute_url(link.href, source_url)
        if "structura.mp" in absolute and "idm=" in absolute and link.text and link.text in relation_window:
            related_links.append((link, canonical_url(absolute)))
    if related_links:
        link, absolute = related_links[0]
        return {
            "relation": "replaces",
            "relatedName": link.text,
            "relatedUrl": absolute,
            "relatedProfileKey": profile_key_from_url(absolute) or "",
        }
    if name:
        return {"relation": "replaces", "relatedName": clean_text(name)}
    return {"relation": "replaces"}


ROMANIAN_MONTHS = {
    "ian": 1, "feb": 2, "mar": 3, "apr": 4, "mai": 5, "iun": 6,
    "iul": 7, "aug": 8, "sep": 9, "oct": 10, "noi": 11, "dec": 12,
}
_MONTH = r"(ian|feb|mar|apr|mai|iun|iul|aug|sep|oct|noi|dec)\.?\s+(\d{4})"
_PERIOD_RE = re.compile(
    rf"^\s*(?:în\s+\w+-\d{{4}}\s*)?(?:-\s*din\s+{_MONTH})?\s*;?\s*(?:-\s*până\s+în\s+{_MONTH})?\s*(.*)$",
    re.I | re.S,
)


def month_value(name: str | None, year: str | None) -> str | None:
    if not name or not year:
        return None
    return f"{int(year):04d}-{ROMANIAN_MONTHS[name.lower()]:02d}"


def parse_period(text: str) -> tuple[str | None, str | None, str]:
    """Split '- din iun. 2025 ; - până în sep. 2025 <rest>' into (start month, end month, rest)."""
    match = _PERIOD_RE.match(text)
    if not match:
        return None, None, text
    return month_value(match.group(1), match.group(2)), month_value(match.group(3), match.group(4)), clean_text(match.group(5))


def profile_section(html_text: str, header: str) -> str:
    start = html_text.find(f"<b>{header}</b>")
    if start < 0:
        return ""
    following = re.search(r"<td colspan=2><b>", html_text[start + 1:], re.I)
    return html_text[start: start + 1 + following.start()] if following else html_text[start:]


def parse_dated_memberships(html_text: str, source_url: str, header: str, path_part: str) -> list[dict[str, Any]]:
    """Memberships listed under a CDEP profile section, keeping CDEP's month-precision dates.

    CDEP writes each membership as one table row: the link, then '- din <month>' and/or
    '- până în <month>'. A role inside the group (Lider, Vicelider, Secretar, ...) may follow
    with its own dates; those belong to the role, not to the membership.
    """
    section = profile_section(html_text, header)
    rows: list[dict[str, Any]] = []
    for piece in re.split(r"<tr\b", section, flags=re.I)[1:]:
        row = piece.split("</tr>", 1)[0]
        anchor = re.search(r"<a[^>]+href=\"([^\"]*)\"[^>]*>(.*?)</a>(.*)", row, re.I | re.S)
        if not anchor or path_part not in anchor.group(1):
            continue
        after = clean_text(strip_tags(re.sub(r"<br\s*/?>", " ; ", anchor.group(3), flags=re.I)))
        after = re.sub(r"^-\s*(?!din\b|până\b)[^;]*?(?=\s*-\s*(?:din|până)\b|$)", "", after).strip() if path_part == "structura.fp" else after
        start, end, rest = parse_period(after)
        roles: list[dict[str, Any]] = []
        for role_match in re.finditer(r"([A-ZĂÂÎȘŞȚŢ][\wăâîșşțţ]+)\s*((?:-\s*(?:din|până)[^A-ZĂÂÎȘŞȚŢ]*)?)", rest):
            role_start, role_end, _ = parse_period(role_match.group(2))
            roles.append({"role": role_match.group(1), "startMonth": role_start, "endMonth": role_end})
        rows.append({
            "url": canonical_url(absolute_url(anchor.group(1), source_url)),
            "label": clean_text(strip_tags(anchor.group(2))),
            "startMonth": start,
            "endMonth": end,
            "roles": roles,
            "raw": after,
        })
    return rows


def parse_links_by_path(links: Iterable[Link], source_url: str, path_part: str) -> list[dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    for link in links:
        absolute = absolute_url(link.href, source_url)
        if path_part not in absolute:
            continue
        key = canonical_url(absolute)
        rows[key] = {"url": key, "label": link.text}
    return list(rows.values())


def parse_action_links(links: Iterable[Link], source_url: str) -> list[dict[str, str]]:
    needles = [
        "biografie",
        "curriculum",
        "cv",
        "initiative",
        "initiativa",
        "motiuni",
        "motii",
        "luari de cuvant",
        "votul electronic",
        "evot.mp",
        "steno",
    ]
    rows: dict[str, dict[str, str]] = {}
    for link in links:
        absolute = absolute_url(link.href, source_url)
        normalized = normalize_for_regex(f"{link.text} {absolute}")
        if not any(needle in normalized for needle in needles):
            continue
        key = canonical_url(absolute)
        rows[key] = {"url": key, "label": link.text}
    return list(rows.values())


def run_asset_inventory(args: argparse.Namespace) -> None:
    profiles = read_jsonl(args.profiles)
    profile_by_key = {profile.get("profileKey"): profile for profile in profiles if profile.get("profileKey")}
    person_groups = build_person_groups(profiles)
    person_key_by_profile = {
        profile_key: group_key
        for group_key, profile_keys in person_groups.items()
        for profile_key in profile_keys
    }
    rows = build_asset_inventory(profiles, profile_by_key, person_key_by_profile)
    report = build_asset_inventory_report(profiles, rows, args.profiles)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.out, rows)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


def build_asset_inventory(
    profiles: list[dict[str, Any]],
    profile_by_key: dict[str, dict[str, Any]],
    person_key_by_profile: dict[str, str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for profile in profiles:
        for asset_type, urls in [
            ("photo", profile.get("photoUrls", [])),
            ("party_logo", profile.get("logoUrls", [])),
        ]:
            for official_url in urls:
                row = build_asset_inventory_row(asset_type, official_url, profile, person_key_by_profile)
                if row["id"] in seen:
                    continue
                seen.add(row["id"])
                rows.append(row)

        for link in profile.get("activityLinks", []):
            if not is_cv_link(link):
                continue
            row = build_asset_inventory_row("cv", link.get("url", ""), profile, person_key_by_profile, label=link.get("label", ""))
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            rows.append(row)

    return sorted(rows, key=lambda item: (item["assetType"], item["legislature"], item["chamber"], item["entityId"], item["officialUrl"]))


def build_asset_inventory_row(
    asset_type: str,
    official_url: str,
    profile: dict[str, Any],
    person_key_by_profile: dict[str, str],
    label: str = "",
) -> dict[str, Any]:
    identity = profile.get("identity") or {}
    profile_key = profile.get("profileKey") or profile_key_from_url(profile.get("url", "")) or ""
    legislature = identity.get("legislature", "")
    chamber = identity.get("chamber", "")
    official_id = identity.get("officialId", "")
    member_id = cdep_member_id(chamber, official_id, legislature)
    canonical = canonical_url(official_url)
    snapshot = profile.get("snapshot") or {}
    return {
        "id": f"asset-cdep-{asset_type}-{profile_key}-{short_hash(canonical)}",
        "assetType": asset_type,
        "entityType": "member",
        "entityId": member_id,
        "personKey": person_key_by_profile.get(profile_key, profile_key),
        "profileKey": profile_key,
        "memberId": member_id,
        "name": profile.get("name", ""),
        "legislature": legislature,
        "legislatureId": legislature_id_from_year(legislature) if legislature in LEGISLATURES else "",
        "chamber": chamber,
        "officialId": official_id,
        "officialUrl": canonical,
        "sourceProfileUrl": profile.get("url", ""),
        "sourceSnapshotContentHash": snapshot.get("contentHash", ""),
        "sourceSnapshotFetchedAt": snapshot.get("fetchedAt", ""),
        "label": label,
    }


def build_asset_inventory_report(
    profiles: list[dict[str, Any]],
    assets: list[dict[str, Any]],
    profiles_path: Path,
) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    by_legislature: dict[str, int] = {}
    for asset in assets:
        by_type[asset["assetType"]] = by_type.get(asset["assetType"], 0) + 1
        legislature = asset.get("legislatureId") or "unknown"
        by_legislature[legislature] = by_legislature.get(legislature, 0) + 1

    cv_profiles = [profile for profile in profiles if any(is_cv_link(link) for link in profile.get("activityLinks", []))]
    unique_urls = {asset["officialUrl"] for asset in assets if asset.get("officialUrl")}
    return {
        "generatedAt": now_iso(),
        "source": str(profiles_path),
        "summary": {
            "profiles": len(profiles),
            "assets": len(assets),
            "uniqueOfficialUrls": len(unique_urls),
            "profilesWithPhotos": sum(1 for profile in profiles if profile.get("photoUrls")),
            "profilesWithLogoUrls": sum(1 for profile in profiles if profile.get("logoUrls")),
            "profilesWithCvLinks": len(cv_profiles),
            "byAssetType": dict(sorted(by_type.items())),
            "byLegislature": dict(sorted(by_legislature.items())),
        },
    }


def is_cv_link(link: dict[str, str]) -> bool:
    normalized = normalize_for_regex(f"{link.get('label', '')} {link.get('url', '')}")
    return any(token in normalized for token in ["curriculum", "curriculum vitae", " cv", "cv.", "biografie"])


def cdep_member_id(chamber: str, official_id: str, legislature: str) -> str:
    if not chamber or not official_id:
        return ""
    if legislature == "2024":
        return f"member-{chamber}-{official_id}"
    return f"member-{chamber}-{legislature}-{official_id}"


def short_hash(value: str, length: int = 12) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def extract_profile_name(html_text: str, parsed: ParsedHtml) -> str:
    headline = regex_first(html_text, r"<[^>]+class=[\"'][^\"']*headline[^\"']*[\"'][^>]*>(.*?)<br", flags=re.I | re.S)
    if headline:
        name = clean_text(strip_tags(headline))
        if is_plausible_name(name):
            return normalize_name_case(name)
    for heading in parsed.headings:
        if is_plausible_name(heading):
            return normalize_name_case(heading)
    for image in parsed.images:
        if "/parlamentari/" in image.src and is_plausible_name(image.alt):
            return normalize_name_case(image.alt)
    if is_plausible_name(parsed.title):
        return normalize_name_case(parsed.title)
    return ""


_OFFICE_SUFFIX_RE = re.compile(
    r",\s*(?:Pre[sş]edinte(?:le)?|Vicepre[sş]edinte|Chestor|Secretar)\b.*$",
    re.I,
)


def strip_office_suffix(name: str) -> str:
    """'Gianina Şerban, Vicepreşedinte Al Camerei Deputaţilor' -> 'Gianina Şerban'. An office is not part of a name."""
    return _OFFICE_SUFFIX_RE.sub("", name).strip()


def is_plausible_name(value: str) -> bool:
    text = clean_text(value)
    if not text:
        return False
    normalized = normalize_for_regex(text)
    blocked = ["structura parlamentului", "camera deputatilor", "senatul", "activitate parlamentara"]
    return not any(item in normalized for item in blocked) and len(text.split()) <= 6


def normalize_name_case(value: str) -> str:
    words = clean_text(value).split()
    if not any(word.isupper() and len(word) > 1 for word in words):
        return clean_text(value)
    return " ".join("-".join(part.capitalize() for part in word.lower().split("-")) for word in words)


def build_summary(rosters: list[dict[str, Any]], profiles: list[dict[str, Any]], profile_failures: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    profile_failures = profile_failures or []
    career_edges = sum(len(profile["careerLinks"]) for profile in profiles)
    replacements = sum(1 for profile in profiles if profile.get("replacement"))
    by_leg_chamber: dict[str, int] = {}
    for profile in profiles:
        identity = profile.get("identity") or {}
        key = f"{identity.get('legislature', 'unknown')}:{identity.get('chamber', 'unknown')}"
        by_leg_chamber[key] = by_leg_chamber.get(key, 0) + 1
    return {
        "generatedAt": now_iso(),
        "rosterPages": len(rosters),
        "rosterProfilesDiscovered": sum(roster["profileCount"] for roster in rosters),
        "profilesFetched": len(profiles),
        "profilesFailed": len(profile_failures),
        "careerEdges": career_edges,
        "profilesWithReplacement": replacements,
        "profilesWithLogos": sum(1 for profile in profiles if profile["logoUrls"]),
        "profilesWithPhotos": sum(1 for profile in profiles if profile["photoUrls"]),
        "profilesByLegislatureChamber": dict(sorted(by_leg_chamber.items())),
    }


def run_audit(args: argparse.Namespace) -> None:
    profiles = read_jsonl(args.profiles)
    rosters = read_jsonl(args.rosters) if args.rosters.exists() else []
    report = build_audit_report(profiles, rosters)
    database_url = args.database_url or os.environ.get("DATABASE_URL") or read_env_value(Path(".env"), "DATABASE_URL")
    if database_url:
        report["postgresComparison"] = compare_with_postgres(database_url, args.legislature, report)
    else:
        report["postgresComparison"] = {
            "status": "skipped",
            "reason": "DATABASE_URL not provided"
        }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def build_audit_report(profiles: list[dict[str, Any]], rosters: list[dict[str, Any]]) -> dict[str, Any]:
    by_leg_chamber: dict[str, int] = {}
    names: dict[str, int] = {}
    missing_constituencies: list[dict[str, str]] = []
    missing = {
        "name": 0,
        "photo": 0,
        "logo": 0,
        "partyLinks": 0,
        "groupLinks": 0,
        "constituencyLinks": 0,
    }
    for profile in profiles:
        identity = profile.get("identity") or {}
        key = f"{identity.get('legislature', 'unknown')}:{identity.get('chamber', 'unknown')}"
        by_leg_chamber[key] = by_leg_chamber.get(key, 0) + 1
        name = clean_text(profile.get("name", ""))
        if name:
            names[name] = names.get(name, 0) + 1
        else:
            missing["name"] += 1
        if not profile.get("photoUrls"):
            missing["photo"] += 1
        if not profile.get("logoUrls"):
            missing["logo"] += 1
        if not profile.get("partyLinks"):
            missing["partyLinks"] += 1
        if not profile.get("groupLinks"):
            missing["groupLinks"] += 1
        if not profile.get("constituencyLinks"):
            missing["constituencyLinks"] += 1
            if len(missing_constituencies) < 100:
                identity = profile.get("identity") or {}
                missing_constituencies.append(
                    {
                        "profileKey": profile.get("profileKey", ""),
                        "name": clean_text(profile.get("name", "")),
                        "chamber": identity.get("chamber", ""),
                        "legislature": identity.get("legislature", ""),
                        "url": profile.get("url", ""),
                        "party": ", ".join(link.get("label", "") for link in profile.get("partyLinks", [])),
                        "group": ", ".join(link.get("label", "") for link in profile.get("groupLinks", [])),
                    }
                )

    duplicate_names = [
        {"name": name, "count": count}
        for name, count in sorted(names.items(), key=lambda item: (-item[1], item[0]))
        if count > 1
    ][:50]
    return {
        "generatedAt": now_iso(),
        "profileCount": len(profiles),
        "rosterPageCount": len(rosters),
        "rosterProfilesDiscovered": sum(int(roster.get("profileCount", 0)) for roster in rosters),
        "profilesByLegislatureChamber": dict(sorted(by_leg_chamber.items())),
        "profilesWithReplacement": sum(1 for profile in profiles if profile.get("replacement")),
        "profilesWithCareerLinks": sum(1 for profile in profiles if profile.get("careerLinks")),
        "careerEdges": sum(len(profile.get("careerLinks", [])) for profile in profiles),
        "missing": missing,
        "missingConstituencyProfiles": missing_constituencies,
        "duplicateNamesTop": duplicate_names,
    }


def compare_with_postgres(database_url: str, legislature: str, report: dict[str, Any]) -> dict[str, Any]:
    leg_id = legislature_id_from_year(legislature)
    sql = (
        "select chamber::text, count(*) "
        "from member_mandates "
        f"where legislature_id = '{leg_id}' "
        "group by chamber "
        "order by chamber;"
    )
    db_counts_result = postgres_counts_with_psql(database_url, sql)
    if db_counts_result.get("status") == "psql_missing":
        db_counts_result = postgres_counts_with_node(database_url, leg_id)
    if db_counts_result.get("status") != "completed":
        return db_counts_result
    db_counts = db_counts_result["counts"]

    probe_counts = {
        chamber: count
        for key, count in report.get("profilesByLegislatureChamber", {}).items()
        for leg, chamber in [key.split(":", 1)]
        if leg == legislature
    }
    all_chambers = sorted(set(probe_counts) | set(db_counts))
    differences = {
        chamber: {
            "probe": probe_counts.get(chamber, 0),
            "postgres": db_counts.get(chamber, 0),
            "delta": probe_counts.get(chamber, 0) - db_counts.get(chamber, 0),
        }
        for chamber in all_chambers
    }
    return {
        "status": "completed",
        "method": db_counts_result.get("method"),
        "legislatureId": leg_id,
        "differences": differences,
        "nameComparison": compare_profile_names(report, db_counts_result.get("rows", []), legislature),
    }


def postgres_counts_with_psql(database_url: str, sql: str) -> dict[str, Any]:
    try:
        completed = subprocess.run(
            ["psql", database_url, "-X", "-A", "-F", "\t", "-q", "-c", sql],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return {"status": "psql_missing"}
    except subprocess.TimeoutExpired:
        return {"status": "failed", "reason": "psql timed out"}
    if completed.returncode != 0:
        return {"status": "failed", "reason": completed.stderr.strip() or "psql failed"}

    counts: dict[str, int] = {}
    for line in completed.stdout.splitlines():
        if not line or line.startswith("("):
            continue
        parts = line.split("\t")
        if len(parts) == 2 and parts[1].isdigit():
            counts[parts[0]] = int(parts[1])
    return {"status": "completed", "method": "psql", "counts": counts}


def postgres_counts_with_node(database_url: str, leg_id: str) -> dict[str, Any]:
    code = """
import postgres from 'postgres';
const databaseUrl = process.argv[1];
const legislatureId = process.argv[2];
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
try {
  const counts = await sql`
    select chamber::text as chamber, count(*)::int as count
    from member_mandates
    where legislature_id = ${legislatureId}
    group by chamber
    order by chamber
  `;
  const members = await sql`
    select mm.chamber::text as chamber, m.id, m.display_name as "displayName"
    from member_mandates mm
    join members m on m.id = mm.member_id
    where mm.legislature_id = ${legislatureId}
    order by mm.chamber::text, m.display_name
  `;
  console.log(JSON.stringify({
    counts: Object.fromEntries(counts.map((row) => [row.chamber, row.count])),
    rows: members
  }));
} finally {
  await sql.end();
}
"""
    try:
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", code, database_url, leg_id],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return {"status": "skipped", "reason": "neither psql nor node are available"}
    except subprocess.TimeoutExpired:
        return {"status": "failed", "reason": "node postgres comparison timed out"}
    if completed.returncode != 0:
        return {"status": "failed", "reason": completed.stderr.strip() or "node postgres comparison failed"}
    try:
        parsed = json.loads(completed.stdout.strip() or "{}")
    except json.JSONDecodeError:
        return {"status": "failed", "reason": "node postgres comparison returned invalid JSON"}
    counts = parsed.get("counts", parsed if isinstance(parsed, dict) else {})
    rows = parsed.get("rows", []) if isinstance(parsed, dict) else []
    return {"status": "completed", "method": "node-postgres", "counts": counts, "rows": rows}


def compare_profile_names(report: dict[str, Any], db_rows: list[dict[str, Any]], legislature: str) -> dict[str, Any]:
    if not db_rows:
        return {"status": "skipped", "reason": "DB row details unavailable"}
    profile_path = DEFAULT_OUT_DIR / "parsed" / "profiles.jsonl"
    if not profile_path.exists():
        return {"status": "skipped", "reason": "profiles JSONL unavailable"}
    profiles = read_jsonl(profile_path)
    by_chamber: dict[str, dict[str, Any]] = {}
    for chamber in ["deputies", "senate"]:
        probe_profiles = [
            profile
            for profile in profiles
            if (profile.get("identity") or {}).get("legislature") == legislature
            and (profile.get("identity") or {}).get("chamber") == chamber
        ]
        db_chamber_rows = [row for row in db_rows if row.get("chamber") == chamber]
        probe_names = {loose_name_key(profile.get("name", "")): profile for profile in probe_profiles if profile.get("name")}
        db_names = {loose_name_key(row.get("displayName", "")): row for row in db_chamber_rows if row.get("displayName")}
        db_only = [
            {"id": row.get("id", ""), "name": row.get("displayName", "")}
            for key, row in sorted(db_names.items())
            if key not in probe_names
        ][:50]
        probe_only = [
            {"profileKey": profile.get("profileKey", ""), "name": profile.get("name", ""), "url": profile.get("url", "")}
            for key, profile in sorted(probe_names.items())
            if key not in db_names
        ][:50]
        by_chamber[chamber] = {
            "probeOnlyCount": max(0, len(set(probe_names) - set(db_names))),
            "dbOnlyCount": max(0, len(set(db_names) - set(probe_names))),
            "dbOnlyTop": db_only,
            "probeOnlyTop": probe_only,
            "note": "Name comparison is approximate; DB may use Wikipedia names while probe uses official CDEP names."
        }
    return {"status": "completed", "byChamber": by_chamber}


def loose_name_key(value: str) -> str:
    words = normalize_for_regex(value)
    words = re.sub(r"\b(senator|deputat|politician)\b", " ", words)
    parts = sorted(part for part in re.split(r"[^a-z0-9]+", words) if part)
    return " ".join(parts)


def legislature_id_from_year(year: str) -> str:
    if year not in LEGISLATURES:
        raise SystemExit(f"Unsupported legislature: {year}")
    index = LEGISLATURES.index(year)
    end_year = LEGISLATURES[index + 1] if index + 1 < len(LEGISLATURES) else "2028"
    return f"leg-{year}-{end_year}"


def read_env_value(path: Path, key: str) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() == key:
            return value.strip().strip("'").strip('"')
    return None


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"Missing JSONL file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def run_preview_import(args: argparse.Namespace) -> None:
    profiles = read_jsonl(args.profiles)
    profile_by_key = {profile.get("profileKey"): profile for profile in profiles if profile.get("profileKey")}
    person_groups = build_person_groups(profiles)
    preview = {
        "generatedAt": now_iso(),
        "source": str(args.profiles),
        "summary": {
            "profiles": len(profiles),
            "personCandidates": len(person_groups),
            "mandates": len(profiles),
            "replacementRelations": sum(1 for profile in profiles if profile.get("replacement")),
            "profilesWithCareerLinks": sum(1 for profile in profiles if profile.get("careerLinks")),
        },
        "personCandidates": [
            build_person_candidate(group_key, sorted(profile_keys), profile_by_key)
            for group_key, profile_keys in sorted(person_groups.items())
        ],
        "officialProfiles": [build_official_profile_preview(profile) for profile in profiles],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(preview["summary"], ensure_ascii=False, indent=2))


def build_person_groups(profiles: list[dict[str, Any]]) -> dict[str, set[str]]:
    parent: dict[str, str] = {}

    def find(key: str) -> str:
        parent.setdefault(key, key)
        if parent[key] != key:
            parent[key] = find(parent[key])
        return parent[key]

    def union(left: str, right: str) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    for profile in profiles:
        key = profile.get("profileKey")
        if not key:
            continue
        find(key)
        for link in profile.get("careerLinks", []):
            linked_key = link.get("profileKey")
            if linked_key:
                union(key, linked_key)

    groups: dict[str, set[str]] = {}
    for key in parent:
        groups.setdefault(find(key), set()).add(key)
    return groups


def build_person_candidate(group_key: str, profile_keys: list[str], profile_by_key: dict[str, dict[str, Any]]) -> dict[str, Any]:
    imported_profile_keys = [key for key in profile_keys if key in profile_by_key]
    available_profiles = [profile_by_key[key] for key in imported_profile_keys]
    names = sorted({profile.get("name", "") for profile in available_profiles if profile.get("name")})
    display_name = names[0] if names else profile_keys[0]
    career_links = sorted(
        {
            link.get("profileKey")
            for profile in available_profiles
            for link in profile.get("careerLinks", [])
            if link.get("profileKey")
        }
    )
    return {
        "personCandidateId": f"person-candidate-{hashlib.sha1(group_key.encode('utf-8')).hexdigest()[:12]}",
        "displayName": display_name,
        "names": names,
        "importedProfileKeys": imported_profile_keys,
        "officialCareerProfileKeys": career_links,
        "missingCareerProfileKeys": [key for key in career_links if key not in profile_by_key],
    }


def build_official_profile_preview(profile: dict[str, Any]) -> dict[str, Any]:
    identity = profile.get("identity") or {}
    party_links = profile.get("partyLinks", [])
    group_links = profile.get("groupLinks", [])
    constituency_links = profile.get("constituencyLinks", [])
    return {
        "profileKey": profile.get("profileKey"),
        "officialId": identity.get("officialId"),
        "legislature": identity.get("legislature"),
        "chamber": identity.get("chamber"),
        "name": profile.get("name"),
        "officialUrl": profile.get("url"),
        "photoUrl": first(profile.get("photoUrls", [])),
        "logoUrl": first(profile.get("logoUrls", [])),
        "partyLabels": [link.get("label", "") for link in party_links],
        "groupLabels": [link.get("label", "") for link in group_links],
        "constituencyLabels": [link.get("label", "") for link in constituency_links],
        "validationDateRaw": profile.get("validationDateRaw"),
        "mandateEndRaw": profile.get("mandateEndRaw"),
        "electedListRaw": profile.get("electedListRaw"),
        "replacement": profile.get("replacement"),
        "careerProfileKeys": [link.get("profileKey") for link in profile.get("careerLinks", []) if link.get("profileKey")],
    }


def first(values: list[Any]) -> Any:
    return values[0] if values else None


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def detect_charset(body: bytes, content_type: str) -> str:
    header_match = re.search(r"charset=([A-Za-z0-9_\-]+)", content_type or "", re.I)
    if header_match:
        return normalize_charset(header_match.group(1))
    head = body[:5000].decode("ascii", errors="ignore")
    meta_match = re.search(r"charset=[\"']?([A-Za-z0-9_\-]+)", head, re.I)
    if meta_match:
        return normalize_charset(meta_match.group(1))
    return "iso-8859-2"


def normalize_charset(value: str) -> str:
    if value.lower() in {"iso-8859-2", "latin2"}:
        return "iso-8859-2"
    return value


def canonical_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    normalized_query = urllib.parse.urlencode(sorted(query), doseq=True)
    return urllib.parse.urlunparse((parsed.scheme or "https", parsed.netloc or "cdep.ro", parsed.path, "", normalized_query, ""))


def absolute_url(href: str, source_url: str) -> str:
    return urllib.parse.urljoin(source_url, html.unescape(href))


def profile_identity_from_url(url: str) -> dict[str, str]:
    return {
        "officialId": query_param(url, "idm") or "",
        "legislature": query_param(url, "leg") or "",
        "chamber": chamber_from_url(url),
        "cam": query_param(url, "cam") or "2",
    }


def profile_key_from_url(url: str) -> str | None:
    official_id = query_param(url, "idm")
    legislature = query_param(url, "leg")
    cam = query_param(url, "cam") or "2"
    if not official_id or not legislature:
        return None
    return f"leg{legislature}:cam{cam}:idm{official_id}"


def chamber_from_url(url: str) -> str:
    return "senate" if (query_param(url, "cam") or "2") == "1" else "deputies"


def query_param(url: str, key: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    params = urllib.parse.parse_qs(parsed.query)
    values = params.get(key)
    if values:
        return values[0]
    lowered = {name.lower(): value for name, value in params.items()}
    values = lowered.get(key.lower())
    return values[0] if values else None


def regex_first(value: str, pattern: str, flags: int = re.I) -> str:
    match = re.search(pattern, value, flags)
    return clean_text(match.group(1)) if match else ""


def strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", " ", value)


def normalize_for_regex(value: str) -> str:
    text = unicodedata.normalize("NFKD", html.unescape(value))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return clean_text(text).lower()


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "").replace("\xa0", " ")).strip()


def unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    rows: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            rows.append(value)
    return rows


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
