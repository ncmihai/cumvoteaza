"""
Builds the two web fonts the site serves from apps/web/app/fonts (D-029): Inter (text) and Bricolage Grotesque (headings), each cut down to the glyphs
the site uses and to the weights it uses, so a first visit costs about 70 KB of fonts instead of about 260 KB from the standard Google subsets.

  python3 -m venv /tmp/fvenv && /tmp/fvenv/bin/pip install fonttools brotli
  curl -L -o "Inter[opsz,wght].ttf" "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
  curl -L -o "BricolageGrotesque[opsz,wdth,wght].ttf" "https://github.com/google/fonts/raw/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf"
  /tmp/fvenv/bin/python tools/fonts/build-subsets.py   # run in the folder with the two .ttf files; writes inter-latin.woff2, bricolage-latin.woff2 and the two static TTFs for the social card (og-*.ttf)

Glyphs: Basic Latin, Latin-1, Latin Extended-A (Romanian ă â î ș ț and Hungarian ő ű, the old cedilla ş ţ), Ș Ț (U+0218-021B), general punctuation, euro, arrows, minus.
Axes: Inter optical size fixed at 14 (text), weight 400-700; Bricolage optical size 36, width 100, weight 400-800.
Both fonts are under the SIL Open Font License 1.1 (texts next to the files). Modified here only by subsetting and axis limits.
"""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
import os

RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x218, 0x21B), (0x2010, 0x2015), (0x2018, 0x201E), (0x2020, 0x2022), (0x2026, 0x2026), (0x2039, 0x203A), (0x20AC, 0x20AC), (0x2190, 0x2193), (0x2212, 0x2212)]
UNICODES = [c for a, b in RANGES for c in range(a, b + 1)]
FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "pnum", "case"]


def build(src, out, limits):
    font = instancer.instantiateVariableFont(TTFont(src), limits)
    font.save("_tmp.ttf")  # reload: subsetting an in-memory instanced variable font fails on lazy tables
    font = TTFont("_tmp.ttf")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = FEATURES
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.notdef_outline = True
    options.hinting = False
    options.desubroutinize = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(out)
    os.remove("_tmp.ttf")
    print(out, round(os.path.getsize(out) / 1024, 1), "KB")


def build_static_ttf(src, out, limits):
    """One fixed instance as plain TTF for the social-card image generator (it cannot read variable or woff2 fonts)."""
    font = instancer.instantiateVariableFont(TTFont(src), limits)
    font.save("_tmp.ttf")
    font = TTFont("_tmp.ttf")
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    font.save(out)
    os.remove("_tmp.ttf")
    print(out, round(os.path.getsize(out) / 1024, 1), "KB")


build("Inter[opsz,wght].ttf", "inter-latin.woff2", {"opsz": 14, "wght": (400, 700)})
build("BricolageGrotesque[opsz,wdth,wght].ttf", "bricolage-latin.woff2", {"opsz": 36, "wdth": 100, "wght": (400, 800)})
build_static_ttf("BricolageGrotesque[opsz,wdth,wght].ttf", "og-bricolage-700.ttf", {"opsz": 48, "wdth": 100, "wght": 700})
build_static_ttf("Inter[opsz,wght].ttf", "og-inter-500.ttf", {"opsz": 14, "wght": 500})
