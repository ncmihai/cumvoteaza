#!/usr/bin/env node
/**
 * Copies the flags the site shows into apps/web/public/flags: one SVG for each place in apps/web/lib/places.ts that has a flag (every ISO country in the list, plus the Holy See, the United Nations and the
 * European Union). The flags are the `flag-icons` package's 4x3 set (MIT licence; the flags themselves are public symbols), a build-time dependency; nothing is requested. A place whose flag is missing is listed.
 *
 *   node tools/geo/copy-flags.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "node_modules/flag-icons/flags/4x3");
const target = path.join(root, "apps/web/public/flags");
const places = readFileSync(path.join(root, "apps/web/lib/places.ts"), "utf8");

// Countries are rows of the table ["IT", "380", ...]; the others name their flag.
const wanted = new Set([...places.matchAll(/^\s*\["([A-Z]{2})", "/gm)].map((match) => match[1].toLowerCase()));
for (const match of places.matchAll(/flag: "([a-z-]+)"/g)) wanted.add(match[1]);

mkdirSync(target, { recursive: true });
for (const file of readdirSync(target)) if (file.endsWith(".svg")) rmSync(path.join(target, file));
const missing = [];
let bytes = 0;
for (const code of [...wanted].sort()) {
  const from = path.join(source, `${code}.svg`);
  if (!existsSync(from)) { missing.push(code); continue; }
  copyFileSync(from, path.join(target, `${code}.svg`));
  bytes += readFileSync(from).length;
}
console.log(`${wanted.size - missing.length} flags copied (${(bytes / 1024).toFixed(0)} KB)${missing.length ? `; no flag for: ${missing.join(", ")}` : ""}`);
