"""Turns the AEP's old presidential spreadsheets (data.gov.ro: 2009 and 2014, one row per polling station, `.xls`) into the minutes layout of the portal's files, so the same readers take them.

Needs xlrd (it reads the old `.xls` format; the importers' own spreadsheet reader, openpyxl, does not):

    python3 -m venv /tmp/xlrd-venv && /tmp/xlrd-venv/bin/pip install xlrd==2.0.1
    /tmp/xlrd-venv/bin/python tools/xlsx/legacy-presidential.py 2009 "sectii-p 2009.xls" "structura-baza-date 2009.xls" data/manual/elections/pres-2009-r1/pv.csv
    /tmp/xlrd-venv/bin/python tools/xlsx/legacy-presidential.py 2014 siap2014-....xls - data/manual/elections/pres-2014-r1/pv.csv

The county names are taken from the 2025 minutes (with their diacritics; the 2009 file has none), and the county numbers are checked against them; the Bucharest sectors (42 to 47 in these
files) become 44 to 49 and abroad (48) becomes 43, as in the portal's files. Candidates are written as the files print them, in capitals. Rows without a county (the 2014 "Total" row) are left out.
"""
import csv
import sys
import unicodedata

import xlrd

kind, source, structure, target = sys.argv[1:5]
NAMES_FROM = "data/manual/elections/pres-2025-r1/pv.csv"


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", str(text).lower()) if not unicodedata.combining(c)).replace("-", " ").strip()


# The canonical county names, by circumscription number, from the portal's own file.
names = {}
with open(NAMES_FROM, encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        number = int(row["precinct_county_nce"])
        if number <= 41 or number == 43:
            names.setdefault(number, row["precinct_county_name"])

sheet = xlrd.open_workbook(source).sheet_by_index(0)
header = sheet.row_values(0)
rows = [sheet.row_values(i) for i in range(1, sheet.nrows)]
whole = lambda value: str(int(value)) if value not in ("", None) else ""

if kind == "2009":
    at = {name: i for i, name in enumerate(header)}
    candidate_columns = [name for name in header if name.startswith("P") and name[1:].isdigit()]
    labels = {}
    for row in xlrd.open_workbook(structure).sheet_by_index(0).get_rows():
        key = str(row[0].value).strip()
        if key in candidate_columns:
            labels[key] = str(row[1].value).strip().upper()
    stations = [{
        "nce": int(r[at["NCE"]]), "county": r[at["JUDET"]], "name": r[at["ADRESA"]], "nr": whole(r[at["SV"]]), "uat": r[at["DENLOC"]],
        "siruta": whole(r[at["SIRUTA"]]), "a": r[at["A"]], "b": r[at["B"]], "c": r[at["C"]], "d": r[at["D"]],
        "votes": [(labels[c], r[at[c]]) for c in candidate_columns]
    } for r in rows]
else:
    candidate_columns = list(range(17, len(header)))
    stations = [{
        "nce": int(r[0]), "county": r[1], "name": r[3], "nr": whole(r[2]), "uat": r[6], "siruta": whole(r[7]), "a": r[8], "b": r[9], "c": r[13], "d": r[14],
        "votes": [(str(header[i]).strip().upper(), r[i]) for i in candidate_columns]
    } for r in rows if r[0] not in ("", None) and r[1] not in ("", None) and str(r[0]).strip().lower() != "total"]

candidates = [name for name, _ in stations[0]["votes"]]
out_header = ["precinct_county_nce", "precinct_county_name", "precinct_name", "precinct_nr", "uat_name", "uat_siruta", "report_version", "report_stage_code", "report_type_scope_code", "report_type_category_code",
              "report_type_code", "created_at", "a", "b", "c", "d"] + [f"{name}-voturi" for name in candidates]
with open(target, "w", encoding="utf-8", newline="") as handle:
    writer = csv.writer(handle)
    writer.writerow(out_header)
    for s in stations:
        number = 43 if s["nce"] == 48 else 44 + (s["nce"] - 42) if 42 <= s["nce"] <= 47 else s["nce"]
        if s["nce"] <= 41 and fold(names[s["nce"]]) != fold(s["county"]):
            raise SystemExit(f"County {s['nce']} is {s['county']!r} in the file and {names[s['nce']]!r} in the 2025 minutes")
        county = names[43] if number == 43 else names.get(number, s["county"]) if s["nce"] <= 41 else s["county"]
        siruta = "9999" if number == 43 else s["siruta"]
        writer.writerow([number, county, s["name"], s["nr"], s["uat"], siruta, 1, "LEGACY", "PRCNCT", "PRSD", "PRSD_SV", "", whole(s["a"]), whole(s["b"]), whole(s["c"]), whole(s["d"])] + [whole(v) for _, v in s["votes"]])
print(f"{target}: {len(stations)} stations, {len(candidates)} candidates, valid votes {int(sum(s['c'] for s in stations))}")
