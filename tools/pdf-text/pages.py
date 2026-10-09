"""Prints the text of every page of a PDF as a JSON list (one string per page): python pages.py file.pdf. Needs pypdf (the same reader the bill-text importer uses)."""
import json
import sys

from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps([(page.extract_text() or "") for page in reader.pages], ensure_ascii=False))
