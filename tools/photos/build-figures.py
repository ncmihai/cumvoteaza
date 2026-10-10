#!/usr/bin/env python3
"""Sprint 18 (D-042): the photographs of the Presidents (and of any public figure added to `figures.config.json`), copied from Wikimedia Commons with their licence and author.

Each entry names a Commons file (the one Wikidata gives as the person's image, or one chosen by hand from the person's Commons category) and, where the picture needs it, a crop as fractions of the
picture (x0, y0, x1, y1). The script asks the Commons API for the file's licence and author, refuses any licence that is not public domain, CC0, CC BY or CC BY-SA, downloads a 1200 px version,
crops it and writes a 360 px JPEG to apps/web/public/figures/<slug>.jpg, and the credits to apps/web/lib/figures.json. Uses only the standard library and macOS's `sips`.

    python3 tools/photos/build-figures.py            # every entry
    python3 tools/photos/build-figures.py ion-iliescu
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UA = "cumvoteaza-photos/0.1 (https://cumvoteaza.vercel.app; contact via the site) python-urllib"
strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def free(licence):
    value = (licence or "").strip().lower()
    return value.startswith("public domain") or value.startswith("cc0") or bool(re.match(r"^cc[- ]by(-sa)?[- ]\d", value))


def main():
    config = json.load(open(os.path.join(ROOT, "tools/photos/figures.config.json"), encoding="utf-8"))
    wanted = set(sys.argv[1:])
    target = os.path.join(ROOT, "apps/web/lib/figures.json")
    figures = json.load(open(target, encoding="utf-8")) if os.path.exists(target) else {}
    for entry in config:
        if wanted and entry["slug"] not in wanted:
            continue
        title = "File:" + entry["title"]
        info = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&titles=" + urllib.parse.quote(title))
        page = list(info["query"]["pages"].values())[0]
        details = page["imageinfo"][0]
        meta = details["extmetadata"]
        licence = meta.get("LicenseShortName", {}).get("value")
        if not free(licence):
            print(f"{entry['slug']}: licence {licence!r} is not one we use; skipped")
            continue
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(entry["title"]) + "?width=1200"
        with tempfile.TemporaryDirectory() as folder:
            raw = os.path.join(folder, "raw.jpg")
            cropped = os.path.join(folder, "crop.jpg")
            request = urllib.request.Request(url, headers={"User-Agent": UA})
            open(raw, "wb").write(urllib.request.urlopen(request, timeout=90).read())
            width = int(re.search(r"pixelWidth: (\d+)", subprocess.check_output(["sips", "-g", "pixelWidth", raw]).decode()).group(1))
            height = int(re.search(r"pixelHeight: (\d+)", subprocess.check_output(["sips", "-g", "pixelHeight", raw]).decode()).group(1))
            source = raw
            if entry.get("crop"):
                x0, y0, x1, y1 = entry["crop"]
                box_w, box_h = round((x1 - x0) * width), round((y1 - y0) * height)
                subprocess.check_call(["sips", "-c", str(box_h), str(box_w), "--cropOffset", str(round(y0 * height)), str(round(x0 * width)), raw, "--out", cropped], stdout=subprocess.DEVNULL)
                source = cropped
            out = os.path.join(ROOT, "apps/web/public/figures", entry["slug"] + ".jpg")
            subprocess.check_call(["sips", "--resampleWidth", "360", "-s", "format", "jpeg", "-s", "formatOptions", "82", source, "--out", out], stdout=subprocess.DEVNULL)
            size = os.path.getsize(out)
        figures[entry["slug"]] = {
            "name": entry["name"],
            "wikidata": entry.get("wikidata"),
            "file": "/figures/" + entry["slug"] + ".jpg",
            "author": strip(meta.get("Artist", {}).get("value")),
            "licence": licence,
            "licenceUrl": meta.get("LicenseUrl", {}).get("value") or None,
            "source": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"), safe=":"),
            "cropped": bool(entry.get("crop"))
        }
        print(f"{entry['slug']}: {licence}, {size // 1024} KB")
        time.sleep(2)
    json.dump(dict(sorted(figures.items())), open(target, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(target, "a").write("\n")


main()
