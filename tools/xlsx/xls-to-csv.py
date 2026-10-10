"""Writes the first sheet of an old `.xls` file as a semicolon-separated UTF-8 CSV, whole numbers without ".0", for the importers that read a CSV (the AEP's 2012 parliamentary results).

Needs xlrd (it reads the old `.xls` format):

    python3 -m venv /tmp/xlrd-venv && /tmp/xlrd-venv/bin/pip install xlrd==2.0.1
    /tmp/xlrd-venv/bin/python tools/xlsx/xls-to-csv.py in.xls out.csv
"""
import csv
import sys

import xlrd

source, target = sys.argv[1:3]
sheet = xlrd.open_workbook(source).sheet_by_index(0)


def cell(value):
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    return "" if value is None else str(value)


with open(target, "w", encoding="utf-8", newline="") as handle:
    writer = csv.writer(handle, delimiter=";")
    for index in range(sheet.nrows):
        writer.writerow([cell(value) for value in sheet.row_values(index)])
print(f"{target}: {sheet.nrows} rows, {sheet.ncols} columns")
