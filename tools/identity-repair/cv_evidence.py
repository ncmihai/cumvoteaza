#!/usr/bin/env python3
"""CV evidence for the identity review list.

For each row of data/curated/identity-review.md (two or more careers under one name), compares the official
CDEP CVs of the careers:
  - birth dates: equal -> same person; different -> different people;
  - career text: a CV that names the other career's mandate ("1990-1992, deputat") -> same person.
Reads cached CVs from data/cdep-history/parsed/cvs.jsonl (fetch them with the probe's `cvs` command).
Prints a JSON verdict per row; never writes decisions itself.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGISLATURE_END = {"1990": "1992", "1992": "1996", "1996": "2000", "2000": "2004", "2004": "2008",
                   "2008": "2012", "2012": "2016", "2016": "2020", "2020": "2024", "2024": "2028"}
ROLE = {"deputies": r"deputat", "senate": r"senator"}


def profile_key(member_id: str) -> str | None:
    match = re.fullmatch(r"member-(deputies|senate)-(?:(\d{4})-)?(\d+)", member_id)
    if not match:
        return None
    chamber, year, idm = match.groups()
    return f"leg{year or '2024'}:cam{'2' if chamber == 'deputies' else '1'}:idm{idm}"


def mandate_of(key: str) -> tuple[str, str]:
    year, cam = re.match(r"leg(\d{4}):cam(\d)", key).groups()
    return year, "deputies" if cam == "2" else "senate"


def mentions(text: str, key: str) -> bool:
    """Does a CV text name this mandate: its year range next to the matching role word?"""
    start, chamber = mandate_of(key)
    end = LEGISLATURE_END[start]
    years = rf"{start}\s*[-–]\s*(?:{end}|prezent)"
    window = rf"(?:{years}.{{0,60}}{ROLE[chamber]}|{ROLE[chamber]}.{{0,60}}{years})"
    return re.search(window, text, re.I | re.S) is not None


def main() -> None:
    review = (ROOT / "data/curated/identity-review.md").read_text(encoding="utf-8")
    cvs = {}
    for line in (ROOT / "data/cdep-history/parsed/cvs.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            cvs[row["profileKey"]] = row
    names = dict(re.findall(r"^\| (\d+) \| ([^|]+) \|", review, re.M))
    results = []
    for number, groups_text in re.findall(r"^- (\d+): (.+)$", review.split("<details>")[1], re.M):
        groups = [[profile_key(m.strip()) for m in group.split(",")] for group in groups_text.split(" / ")]
        groups = [[key for key in group if key] for group in groups]
        births = [{cvs[k]["birthDate"] for k in group if cvs.get(k, {}).get("birthDate")} for group in groups]
        evidence = []
        verdict = "no evidence"
        known = [b for b in births if b]
        if len(known) >= 2:
            if all(b == known[0] for b in known):
                verdict = "same"
                evidence.append(f"same birth date {next(iter(known[0]))}")
            elif not set.intersection(*known):
                verdict = "different"
                evidence.append("different birth dates " + " vs ".join("/".join(sorted(b)) for b in known))
        for i, group in enumerate(groups):
            for j, other in enumerate(groups):
                if i == j:
                    continue
                for key in group:
                    text = cvs.get(key, {}).get("text") or ""
                    hit = [o for o in other if mentions(text, o)]
                    if hit:
                        evidence.append(f"CV {key} names mandate {', '.join(hit)}")
                        if verdict == "no evidence":
                            verdict = "same"
                        elif verdict == "different":
                            verdict = "conflict"
        results.append({"row": int(number), "name": names.get(number, "").strip(), "verdict": verdict, "evidence": evidence,
                         "cvs": sum(1 for g in groups for k in g if k in cvs)})
    json.dump(results, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
