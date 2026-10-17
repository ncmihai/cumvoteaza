#!/usr/bin/env node
/**
 * The map of abroad on the election page (the diaspora view): country outlines as the small file the map draws.
 *
 * Input (a build-time dependency, nothing is requested): the `world-atlas` package's `countries-50m.json`, which is Natural Earth's 1:50 million country borders, in the public domain
 * (https://www.naturalearthdata.com/about/terms-of-use/). Each shape has the country's ISO 3166-1 numeric code as its id (Kosovo has none, and is given "XK"; other shapes without a code are kept
 * under their name and drawn without data). Antarctica is left out.
 *
 * Output (committed): apps/web/public/geo/world-countries.json, loaded by the browser only when the diaspora view is asked for.
 *
 * The shapes are projected (Natural Earth), simplified together and written as relative paths with one decimal, like the Romanian map (tools/geo/build-election-map.mjs).
 *
 *   node tools/geo/build-world-map.mjs [--weight=0.25]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoNaturalEarth1, geoPath, geoStream } from "d3-geo";
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import { planarTriangleArea, presimplify, simplify } from "topojson-simplify";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const weight = Number((process.argv.find((arg) => arg.startsWith("--weight=")) ?? "--weight=0.25").split("=")[1]);
const WIDTH = 1000;
const PAD = 6;

const source = JSON.parse(readFileSync(path.join(root, "node_modules/world-atlas/countries-50m.json"), "utf8"));
const all = feature(source, source.objects.countries);
const shapes = { type: "FeatureCollection", features: all.features.filter((item) => item.id !== "010") };
console.log(`${shapes.features.length} shapes (Antarctica left out)`);

const projection = geoNaturalEarth1();
projection.fitExtent([[PAD, PAD], [WIDTH - PAD, WIDTH]], shapes);

/**
 * A shape projected through the projection's own stream, which cuts it along the antimeridian and round the poles (projecting the points one by one stretches Russia's far east across the whole map).
 * A shape cut in two comes out as rings that the file draws with the even-odd rule, which also keeps the holes (Lesotho in South Africa).
 */
function projectGeometry(geometry) {
  const polygons = [];
  let polygon = null;
  let ring = null;
  geoStream(geometry, projection.stream({
    point(x, y) { ring.push([x, y]); },
    lineStart() { ring = []; },
    lineEnd() {
      if (ring.length) {
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (fx !== lx || fy !== ly) ring.push([fx, fy]);
        if (ring.length >= 4) polygon.push(ring);
      }
      ring = null;
    },
    polygonStart() { polygon = []; },
    polygonEnd() { if (polygon.length) polygons.push(polygon); polygon = null; },
    sphere() {}
  }));
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}
const planar = {
  type: "FeatureCollection",
  features: shapes.features.map((item) => ({
    type: "Feature",
    id: item.id ?? (item.properties.name === "Kosovo" ? "XK" : `name:${item.properties.name}`),
    properties: { name: item.properties.name },
    geometry: projectGeometry(item.geometry)
  }))
};
const topo = topology({ shapes: planar }, 1e6);
const simple = simplify(presimplify(topo, planarTriangleArea), weight);
const decoded = feature(simple, simple.objects.shapes);

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

const bounds = geoPath(null).bounds(decoded);
// The window is the box of the shapes, with a margin: the fit leaves room above them (Antarctica is not drawn).
const top = Math.floor(bounds[0][1] - PAD);
const height = Math.ceil(bounds[1][1] + PAD) - top;

// Europe, where most of the diaspora is and where the small countries are: the box of a longitude and latitude window, in the same projected units (sampled along the window, because the projection curves it).
const sample = [];
for (let lon = -25; lon <= 45; lon += 5) for (let lat = 33; lat <= 72; lat += 3) sample.push(projection([lon, lat]));
const europe = [Math.floor(Math.min(...sample.map((p) => p[0]))), Math.floor(Math.min(...sample.map((p) => p[1]))), Math.ceil(Math.max(...sample.map((p) => p[0]))), Math.ceil(Math.max(...sample.map((p) => p[1])))];

// A country too small to survive the simplification (Malta, San Marino, Singapore, Monaco) is drawn as a small marker on its place, so that it can be seen and chosen.
const original = new Map(planar.features.map((item) => [String(item.id), item]));
const MARKER = 2.6;
function shapePath(item) {
  const d = geometryPath(item.geometry);
  const [[x0, y0], [x1, y1]] = geoPath(null).bounds(item);
  if (d && Number.isFinite(x0) && x1 - x0 >= 3 && y1 - y0 >= 3) return d;
  const [cx, cy] = Number.isFinite(x0) ? geoPath(null).centroid(item) : geoPath(null).centroid(original.get(String(item.id)));
  const points = Array.from({ length: 8 }, (_, k) => [Math.round((cx + MARKER * Math.cos((k * Math.PI) / 4)) * 10) / 10, Math.round((cy + MARKER * Math.sin((k * Math.PI) / 4)) * 10) / 10]);
  return `M${points[0][0]} ${points[0][1]}l${points.slice(1).map((p, k) => `${Math.round((p[0] - points[k][0]) * 10) / 10} ${Math.round((p[1] - points[k][1]) * 10) / 10}`).join(" ").replace(/ -/g, "-")}z`;
}

const countries = decoded.features
  .map((item) => ({ i: String(item.id), name: item.properties.name, d: shapePath(item) }))
  .filter((item) => item.d)
  .sort((a, b) => a.i.localeCompare(b.i));
const attribution = "Granițe: Natural Earth (domeniu public), 1:50 000 000, simplificate de cumvoteaza.";
const json = JSON.stringify({ viewBox: [0, top, WIDTH, height], europe, attribution, countries });
mkdirSync(path.join(root, "apps/web/public/geo"), { recursive: true });
writeFileSync(path.join(root, "apps/web/public/geo/world-countries.json"), json);
const small = ["492", "470", "442", "674", "702"].map((id) => `${id}:${countries.some((item) => item.i === id) ? "yes" : "NO"}`).join(" ");
console.log(`weight ${weight}: ${countries.length} countries (${(json.length / 1024).toFixed(0)} KB), viewBox 0 ${top} ${WIDTH} ${height}, Europe ${europe.join(" ")}; Monaco, Malta, Luxembourg, San Marino, Singapore: ${small}`);
