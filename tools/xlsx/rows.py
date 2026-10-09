"""Prints the rows of the first sheet of an .xlsx file as JSON (a list of lists), for the importers that cannot read a spreadsheet themselves.

    python tools/xlsx/rows.py file.xlsx
"""
import json
import sys

import openpyxl

workbook = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
sheet = workbook.worksheets[0]
rows = [["" if cell is None else cell for cell in row] for row in sheet.iter_rows(values_only=True)]
print(json.dumps(rows, ensure_ascii=False))
