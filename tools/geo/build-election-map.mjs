#!/usr/bin/env node
/**
 * Sprint 17 (D-041): turns the boundaries of Romania's communes into the two small files the election map draws.
 *
 * Input (not committed, `data/` never is): geo-spatial.org's "UAT, România (poligon, geometrie simplificată)" as TopoJSON, built by Vasile Crăciunescu from the public data of ANCPI
 * (Creative Commons Attribution 4.0 in the catalogue record), version 2025-03-26, one shape per commune, city or Bucharest sector, with the SIRUTA code in `natCode`:
 *   https://services.geo-spatial.org/data/administrative_boundaries/lau/ro_admin_lau_simplified_polygon.topojson
 * and the 2024 polling-station file, only to learn which circumscription (1 to 41, Bucharest 42) each SIRUTA code belongs to.
 *
 * Output (committed):
 *   apps/web/public/geo/ro-counties.json   the counties as SVG paths, with the Bucharest sectors as an inset
 *   apps/web/public/geo/ro-communes.json   the communes as SVG paths
 * Both are loaded by the browser only on the map page.
 *
 * The shapes are projected (Lambert conformal conic), simplified together (shared borders stay shared) and written as relative paths with one decimal.
 *
 *   node tools/geo/build-election-map.mjs [--weight=0.12]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoConicConformal, geoPath } from "d3-geo";
import { feature, merge } from "topojson-client";
import { topology } from "topojson-server";
import { planarTriangleArea, presimplify, simplify } from "topojson-simplify";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const weight = Number((process.argv.find((arg) => arg.startsWith("--weight=")) ?? "--weight=0.12").split("=")[1]);
const WIDTH = 1000;
const PAD = 8;

const source = JSON.parse(readFileSync(path.join(root, "data/geo/geospatial-lau-2025/ro_admin_lau_simplified_polygon.topojson"), "utf8"));
const objectName = Object.keys(source.objects)[0];
const shapes = feature(source, source.objects[objectName]);
console.log(`${shapes.features.length} shapes in ${objectName}`);

// SIRUTA -> circumscription, from the 2024 file (county codes 1 to 41; the Bucharest sectors 44 to 49 are 42).
/** One line of a comma-separated file; a field in double quotes may hold commas, and "" is a quote. */
function cellsOf(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) { if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char; }
    else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}
const csv = readFileSync(path.join(root, "data/manual/elections/parl-2024/deputies.csv"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
const header = cellsOf(csv[0]);
const nceAt = header.indexOf("precinct_county_nce");
const sirutaAt = header.indexOf("uat_siruta");
const circOf = new Map();
for (const line of csv.slice(1)) {
  if (!line) continue;
  const cells = cellsOf(line);
  const nce = Number(cells[nceAt]);
  if (nce === 43) continue;
  circOf.set(cells[sirutaAt], nce >= 44 && nce <= 49 ? 42 : nce);
}
const missing = shapes.features.filter((f) => !circOf.has(String(f.properties.natCode)));
if (missing.length) throw new Error(`${missing.length} shapes have no circumscription in the 2024 file: ${missing.slice(0, 5).map((f) => f.properties.natCode).join(", ")}`);

function projectAll(fc, projection) {
  const project = (coords, depth) => (depth === 0 ? projection(coords) : coords.map((c) => project(c, depth - 1)));
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({ type: "Feature", id: f.properties.natCode, properties: { s: String(f.properties.natCode), c: circOf.get(String(f.properties.natCode)), county: f.properties.county }, geometry: { type: f.geometry.type, coordinates: project(f.geometry.coordinates, f.geometry.type === "Polygon" ? 2 : 3) } }))
  };
}

function build(fc, label) {
  const projection = geoConicConformal().parallels([44, 48]).rotate([-25, 0]).center([0, 46]);
  projection.fitExtent([[PAD, PAD], [WIDTH - PAD, 4 * WIDTH]], fc);
  // The fit centres the shapes in the tall box; move them up to the top margin.
  const [tx, ty] = projection.translate();
  projection.translate([tx, ty - (geoPath(projection).bounds(fc)[0][1] - PAD)]);
  const planar = projectAll(fc, projection);
  const topo = topology({ shapes: planar }, 1e6);
  const pre = presimplify(topo, planarTriangleArea);
  const simple = simplify(pre, weight);
  const geometries = simple.objects.shapes.geometries;
  const decoded = feature(simple, simple.objects.shapes);
  const bounds = geoPath(null).bounds(decoded);
  const height = Math.ceil(bounds[1][1] + PAD);
  console.log(`${label}: viewBox 0 0 ${WIDTH} ${height}`);
  return { simple, geometries, decoded, height };
}

/** A ring as a relative path with one decimal; the deltas are taken between rounded points so that rounding never drifts. */
function ringPath(ring) {
  const points = ring.slice(0, -1).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  const clean = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (clean.length < 3) return "";
  let out = `M${clean[0][0]} ${clean[0][1]}l`;
  const deltas = [];
  for (let i = 1; i < clean.length; i += 1) deltas.push(`${Math.round((clean[i][0] - clean[i - 1][0]) * 10) / 10} ${Math.round((clean[i][1] - clean[i - 1][1]) * 10) / 10}`);
  out += deltas.join(" ").replace(/ -/g, "-");
  return `${out}z`;
}
const geometryPath = (geometry) => (geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat(1)).map(ringPath).join("");

const all = build(shapes, "country");
const boundsOf = (geometry) => { const [[x0, y0], [x1, y1]] = geoPath(null).bounds({ type: "Feature", geometry }); return [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)]; };
const communes = all.decoded.features.map((f) => ({ s: f.properties.s, c: f.properties.c, d: geometryPath(f.geometry) })).sort((a, b) => Number(a.s) - Number(b.s));

// The counties: the communes of one circumscription merged along the shared borders.
const names = new Map();
for (const f of shapes.features) if (!names.has(circOf.get(String(f.properties.natCode)))) names.set(circOf.get(String(f.properties.natCode)), f.properties.county);
const byCirc = new Map();
all.geometries.forEach((g, i) => { const c = g.properties.c; if (!byCirc.has(c)) byCirc.set(c, []); byCirc.get(c).push(g); });
const counties = [...byCirc.entries()].sort((a, b) => a[0] - b[0]).map(([n, geoms]) => {
  const merged = merge(all.simple, geoms);
  const centroid = geoPath(null).centroid({ type: "Feature", geometry: merged });
  return { n, name: names.get(n), d: geometryPath(merged), x: Math.round(centroid[0]), y: Math.round(centroid[1]), b: boundsOf(merged) };
});

// Bucharest's six sectors, drawn large as an inset.
const sectorShapes = { type: "FeatureCollection", features: shapes.features.filter((f) => circOf.get(String(f.properties.natCode)) === 42) };
const inset = build(sectorShapes, "Bucharest");
const sectors = inset.decoded.features.map((f) => ({ s: f.properties.s, d: geometryPath(f.geometry) })).sort((a, b) => Number(a.s) - Number(b.s));

const attribution = "Limite administrative: ANCPI (date publice), prelucrate de geo-spatial.org, CC BY 4.0; simplificate de cumvoteaza.";
const countiesFile = { viewBox: [0, 0, WIDTH, all.height], attribution, counties, inset: { viewBox: [0, 0, WIDTH, inset.height], sectors } };
const communesFile = { viewBox: [0, 0, WIDTH, all.height], attribution, communes };
mkdirSync(path.join(root, "apps/web/public/geo"), { recursive: true });
const countiesJson = JSON.stringify(countiesFile);
const communesJson = JSON.stringify(communesFile);
writeFileSync(path.join(root, "apps/web/public/geo/ro-counties.json"), countiesJson);
writeFileSync(path.join(root, "apps/web/public/geo/ro-communes.json"), communesJson);
console.log(`weight ${weight}: counties ${counties.length} (${(countiesJson.length / 1024).toFixed(0)} KB), communes ${communes.length} (${(communesJson.length / 1024).toFixed(0)} KB), sectors ${sectors.length}`);
