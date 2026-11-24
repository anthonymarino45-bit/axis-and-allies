/**
 * Build script: generates real-world territory outlines for the game map.
 *
 *   bun scripts/build-map.ts
 *
 * Downloads Natural Earth 50m admin-0 country boundaries, groups them into the
 * game's territories (optionally clipped to a lon/lat box for territories that
 * are a slice of a larger country), simplifies the outline, projects it into
 * the map's coordinate space and writes src/game/mapShapes.ts.
 *
 * Territory IDs, names, adjacency, income and units are NOT touched — only the
 * polygon points and centroid.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import polygonClipping from "polygon-clipping";
import { MAP_SUBDIVISIONS } from "../src/game/mapSubdivisions";

type Ring = Array<[number, number]>;
type Poly = Ring[];
type MultiPoly = Poly[];

const DATA_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const CACHE = "/tmp/ne50.json";

// ---------------------------------------------------------------- projection
// Equirectangular, fitted to MAP_VIEWBOX (-40 -360 4400 2400).
const S = 4400 / 360;
const project = (lon: number, lat: number): [number, number] => [
  -40 + (lon + 180) * S,
  -15 + (84 - lat) * S,
];

// ------------------------------------------------------------------ territory
interface Spec {
  /** Natural Earth ADM0_A3 codes to union together. */
  iso: string[];
  /** Optional [minLon, minLat, maxLon, maxLat] clip window. */
  bbox?: [number, number, number, number];
  /** Optional lon/lat clipping polygon for a natural-looking territory split. */
  clip?: Poly;
  /** Simplification tolerance in projected px (default 5). */
  tol?: number;
}

// Shared northern edge of Patagonia. Both clipping polygons use these exact
// vertices in reverse order, preventing gaps while avoiding a box-like cut.
const PATAGONIA_EDGE: Ring = [
  [-77, -40.5], [-73, -39.5], [-70, -38], [-67, -39], [-62, -39], [-52, -39],
];
const SOUTH_AMERICA_NORTH: Poly = [[
  [-180, 90], [180, 90], [180, -39], ...PATAGONIA_EDGE.slice().reverse(), [-180, -40.5], [-180, 90],
]];
const SOUTH_AMERICA_SOUTH: Poly = [[
  [-180, -90], [-180, -40.5], ...PATAGONIA_EDGE, [180, -39], [180, -90], [-180, -90],
]];

const SPECS: Record<string, Spec> = {
  // ===== North America =====
  ak1: { iso: ["USA"], bbox: [-172, 51, -140, 72] },
  // Canada: two latitude bands, edges shared exactly so slices stay seamless.
  ca1: { iso: ["CAN"], bbox: [-141, 41, -110, 60] },
  ca2: { iso: ["CAN"], bbox: [-110, 41, -95, 60] },
  ca3: { iso: ["CAN"], bbox: [-95, 41, -79, 60] },
  ca4: { iso: ["CAN"], bbox: [-79, 41, -64, 60] },
  ca5: { iso: ["CAN"], bbox: [-64, 41, -52, 60] },
  ca6: { iso: ["CAN"], bbox: [-141, 60, -95, 84] },
  ca7: { iso: ["CAN"], bbox: [-95, 60, -52, 84] },

  // United States: 4 latitude bands x shared longitude edges.
  t1: { iso: ["USA"], bbox: [-125, 41, -111, 50] },
  t2: { iso: ["USA"], bbox: [-111, 41, -98, 50] },
  t3: { iso: ["USA"], bbox: [-98, 41, -87, 50] },
  t4: { iso: ["USA"], bbox: [-87, 41, -78, 50] },
  t5: { iso: ["USA"], bbox: [-78, 41, -66, 50] },
  t6: { iso: ["USA"], bbox: [-125, 36.5, -111, 41] },
  t7: { iso: ["USA"], bbox: [-111, 36.5, -98, 41] },
  t8: { iso: ["USA"], bbox: [-98, 36.5, -87, 41] },
  t9: { iso: ["USA"], bbox: [-87, 36.5, -78, 41] },
  t10: { iso: ["USA"], bbox: [-78, 36.5, -66, 41] },
  t11: { iso: ["USA"], bbox: [-125, 31, -111, 36.5] },
  t12: { iso: ["USA"], bbox: [-111, 31, -98, 36.5] },
  t13: { iso: ["USA"], bbox: [-98, 31, -87, 36.5] },
  t14: { iso: ["USA"], bbox: [-87, 31, -78, 36.5] },
  t15: { iso: ["USA"], bbox: [-78, 31, -66, 36.5] },
  // Keep Territory 16 as the full Texas/southwest section. The old -99°
  // split left most of Texas visually absorbed into Mexico Norte.
  t16: { iso: ["USA"], bbox: [-111, 24, -94, 31] },
  t17: { iso: ["USA"], bbox: [-94, 24, -90, 31] },
  t18: { iso: ["USA"], bbox: [-90, 24, -83.5, 31] },
  t19: { iso: ["USA"], bbox: [-83.5, 24, -66, 31] },

  mx1: { iso: ["MEX"], bbox: [-118, 17.5, -94, 33] },
  mx2: { iso: ["MEX", "BLZ"], bbox: [-94, 14, -85, 22] },
  am1: { iso: ["GTM", "HND", "SLV", "NIC", "CRI", "PAN"] },

  // ===== South America =====
  sa_col: { iso: ["COL"] },
  sa_ven: { iso: ["VEN"] },
  sa_gui: { iso: ["GUY", "SUR"] },
  // Brazil in three slices with shared edges (no uncovered band).
  sa_amz: { iso: ["BRA"], bbox: [-74, -18, -48, 6] },
  sa_brn: { iso: ["BRA"], bbox: [-48, -18, -32, 6] },
  sa_bra: { iso: ["BRA"], bbox: [-58, -34, -32, -18] },
  // Keep the real Andes border between Chile and Argentina. Their southern
  // edge follows a shared regional line rather than a rectangular latitude cut.
  sa_arg: { iso: ["ARG", "URY", "PRY"], clip: SOUTH_AMERICA_NORTH, tol: 2.5 },
  sa_per: { iso: ["PER", "ECU", "BOL"] },
  sa_chl: { iso: ["CHL"], clip: SOUTH_AMERICA_NORTH, tol: 2.5 },
  sa_pat: { iso: ["ARG", "CHL"], clip: SOUTH_AMERICA_SOUTH, tol: 2.5 },

  // ===== Europe =====
  eu_ibe: { iso: ["ESP", "PRT"], bbox: [-10, 35, 4, 44] },
  eu_fra: { iso: ["FRA", "BEL", "NLD", "LUX"], bbox: [-6, 41, 8.5, 54] },
  eu_bri: { iso: ["GBR", "IRL"], tol: 3 },
  eu_ger: { iso: ["DEU", "AUT", "CHE", "CZE"] },
  eu_sca: { iso: ["NOR", "SWE", "FIN", "DNK"], bbox: [3, 54, 32, 75], tol: 4 },
  eu_ita: { iso: ["ITA"], bbox: [6, 36, 19, 47.2], tol: 3 },
  eu_bal: {
    iso: ["GRC", "BGR", "ROU", "SRB", "HRV", "BIH", "ALB", "MKD", "SVN", "MNE", "HUN", "SVK", "KOS"],
    tol: 4,
  },
  eu_pol: { iso: ["POL", "LTU", "LVA", "EST", "BLR"] },
  // Russia: shared longitude edges 28 / 50 / 70 / 92 / 120 / 150 / 180.
  eu_rus_s: { iso: ["RUS"], bbox: [28, 41, 50, 50] },
  eu_mos: { iso: ["RUS"], bbox: [28, 50, 50, 62] },
  eu_rus_n: { iso: ["RUS"], bbox: [28, 62, 50, 82] },
  eu_ukr: { iso: ["UKR", "MDA"] },

  // ===== Asia =====
  as_cau: { iso: ["TUR", "GEO", "ARM", "AZE"] },
  as_lev: { iso: ["IRQ", "SYR", "JOR", "ISR", "LBN", "PSX"] },
  as_ara: { iso: ["SAU", "YEM", "OMN", "ARE", "QAT", "KWT", "BHR"] },
  as_per: { iso: ["IRN", "AFG", "PAK"] },
  as_kaz: { iso: ["KAZ", "UZB", "TKM", "KGZ", "TJK"] },
  as_ura: { iso: ["RUS"], bbox: [50, 41, 70, 82] },
  as_wsib: { iso: ["RUS"], bbox: [70, 41, 92, 82] },
  as_csib: { iso: ["RUS"], bbox: [92, 41, 120, 82] },
  as_fee: { iso: ["RUS"], bbox: [120, 41, 150, 82] },
  as_kam: { iso: ["RUS"], bbox: [150, 41, 180, 82] },
  as_mon: { iso: ["MNG"] },
  as_chi: { iso: ["CHN"], tol: 4 },
  as_kor: { iso: ["KOR", "PRK"], tol: 2.5 },
  as_jap: { iso: ["JPN"], tol: 2.5 },
  as_ind: { iso: ["IND", "NPL", "BTN", "BGD"], tol: 4 },
  as_sea: { iso: ["THA", "VNM", "LAO", "KHM", "MMR", "MYS"], bbox: [92, -2, 112, 29], tol: 3 },

  // ===== Africa =====
  af_mag: { iso: ["MAR", "DZA", "TUN"] },
  af_lib: { iso: ["LBY"] },
  af_sah_w: { iso: ["MRT", "MLI", "SAH"] },
  af_sah_e: { iso: ["NER", "TCD"] },
  af_egy: { iso: ["EGY", "SDN"] },
  af_gui: { iso: ["SEN", "GMB", "GNB", "GIN", "SLE", "LBR", "CIV", "GHA", "TGO", "BEN", "BFA"] },
  af_nga: { iso: ["NGA", "CMR"] },
  af_con: { iso: ["COD", "COG", "GAB", "GNQ", "CAF"] },
  af_hor: { iso: ["ETH", "ERI", "DJI", "SOM", "SDS", "SOL"] },
  af_eaf_w: { iso: ["UGA", "RWA", "BDI", "ZMB", "ZWE", "MWI"] },
  af_eaf_e: { iso: ["KEN", "TZA"] },
  af_ang: { iso: ["AGO", "NAM", "BWA"] },
  af_saf_w: { iso: ["ZAF", "LSO", "SWZ"] },
  af_saf_e: { iso: ["MOZ"] },

  // ===== Oceania / SE Asian islands =====
  au_sum: { iso: ["IDN"], bbox: [94, -12, 118, 7], tol: 3 },
  au_bor: { iso: ["IDN", "MYS", "BRN"], bbox: [118, -12, 141, 8], tol: 3 },
  au_png: { iso: ["PNG"], bbox: [140, -12, 156, 0], tol: 3 },
  // Australia: shared edges 112 / 129 / 138 / 141 / 154 and -26 / -37.5.
  au_waus: { iso: ["AUS"], bbox: [112, -44, 129, -10] },
  au_nt: { iso: ["AUS"], bbox: [129, -26, 138, -10] },
  au_sa: { iso: ["AUS"], bbox: [129, -44, 141, -26] },
  au_qld: { iso: ["AUS"], bbox: [138, -26, 154, -10] },
  au_nsw: { iso: ["AUS"], bbox: [141, -37.5, 154, -26] },
  au_vic: { iso: ["AUS"], bbox: [141, -44, 154, -37.5] },
  au_nz: { iso: ["NZL"], bbox: [166, -48, 179, -34], tol: 2.5 },

  // ===== Iceland =====
  eu_isl_nw: { iso: ["ISL"], bbox: [-25, 65, -21, 67], tol: 1.5 },
  eu_isl_s: { iso: ["ISL"], bbox: [-25, 63, -21, 65], tol: 1.5 },
  eu_isl_e: { iso: ["ISL"], bbox: [-21, 63, -13, 67], tol: 1.5 },

  // ===== Greenland: shared edges -73 / -45 / -10 and 59 / 70 / 76 / 81 / 84 =====
  gr_s: { iso: ["GRL"], bbox: [-73, 59, -10, 70], tol: 3 },
  gr_sw: { iso: ["GRL"], bbox: [-73, 70, -45, 76], tol: 3 },
  gr_e: { iso: ["GRL"], bbox: [-45, 70, -10, 76], tol: 3 },
  gr_nw: { iso: ["GRL"], bbox: [-73, 76, -45, 81], tol: 3 },
  gr_ne: { iso: ["GRL"], bbox: [-45, 76, -10, 81], tol: 3 },
  gr_n: { iso: ["GRL"], bbox: [-73, 81, -10, 84], tol: 3 },

  // ===== Islands =====
  is_cuba: { iso: ["CUB"], tol: 2 },
  is_his: { iso: ["HTI", "DOM"], tol: 2 },
  is_sar: { iso: ["ITA", "FRA"], bbox: [8, 38.5, 10.5, 43.2], tol: 1.5 },
  is_cyp: { iso: ["CYP", "CYN"], tol: 1.5 },
  is_tai: { iso: ["TWN"], tol: 1.5 },
  is_phi: { iso: ["PHL"], tol: 2.5 },
  is_srl: { iso: ["LKA"], tol: 1.5 },
  is_mad: { iso: ["MDG"], tol: 2.5 },
  is_fal: { iso: ["FLK"], tol: 1.5 },
};

// -------------------------------------------------------------------- helpers
function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function centroidOf(ring: Ring): { x: number; y: number } {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const n = ring.length;
    return {
      x: Math.round(ring.reduce((s, p) => s + p[0], 0) / n),
      y: Math.round(ring.reduce((s, p) => s + p[1], 0) / n),
    };
  }
  return { x: Math.round(cx / (6 * a)), y: Math.round(cy / (6 * a)) };
}

/** Douglas-Peucker on an open chain. */
function dpChain(ring: Ring, tol: number, keep: boolean[], from: number, to: number) {
  const stack: Array<[number, number]> = [[from, to]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    if (e - s < 2) continue;
    let maxD = -1, idx = -1;
    const [x1, y1] = ring[s], [x2, y2] = ring[e];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    for (let i = s + 1; i < e; i++) {
      const [px, py] = ring[i];
      const d = len < 1e-9
        ? Math.hypot(px - x1, py - y1)
        : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
}

/**
 * Snap a projected ring to a grid, drop duplicate and exactly-collinear
 * vertices. Deterministic per-vertex, so two territories that share a border
 * produce byte-identical border vertices — the seam stays closed.
 */
function quantize(input: Ring, grid: number): Ring {
  const snapped: Ring = input.map(([x, y]) => [
    Math.round(x / grid) * grid,
    Math.round(y / grid) * grid,
  ]);
  const dedup: Ring = [];
  for (const p of snapped) {
    const prev = dedup[dedup.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) dedup.push(p);
  }
  if (dedup.length > 1) {
    const f = dedup[0], l = dedup[dedup.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) dedup.pop();
  }
  if (dedup.length < 4) return dedup;
  const keep: Ring = [];
  for (let i = 0; i < dedup.length; i++) {
    const a = dedup[(i - 1 + dedup.length) % dedup.length];
    const b = dedup[i];
    const c = dedup[(i + 1) % dedup.length];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross !== 0) keep.push(b);
  }
  return keep.length >= 3 ? keep : dedup;
}

/** Douglas-Peucker on a closed ring (projected coordinates). */
function simplify(input: Ring, tol: number): Ring {
  // Drop the duplicated closing vertex while simplifying.
  const ring = input.slice();
  const first = ring[0], last = ring[ring.length - 1];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  if (ring.length < 6) return ring;

  // Anchor on two far-apart vertices so the ring splits into two open chains.
  let far = 1, farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = keep[far] = true;
  dpChain(ring, tol, keep, 0, far);
  // Second chain: far → end → 0, handled by rotating indices.
  const rotated = ring.slice(far).concat(ring.slice(0, 1));
  const keep2 = new Array<boolean>(rotated.length).fill(false);
  keep2[0] = keep2[rotated.length - 1] = true;
  dpChain(rotated, tol, keep2, 0, rotated.length - 1);
  for (let i = 1; i < rotated.length - 1; i++) if (keep2[i]) keep[far + i] = true;

  return ring.filter((_, i) => keep[i]);
}

function bboxPoly(b: [number, number, number, number]): Poly {
  const [a, c, d, e] = b;
  return [[[a, c], [d, c], [d, e], [a, e], [a, c]]];
}

function openRing(ring: Ring): Ring {
  const result = ring.slice();
  const first = result[0];
  const last = result[result.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) result.pop();
  return result;
}

function splitShape(
  points: string,
  axis: "x" | "y",
): { low: Ring; high: Ring; areaError: number } | null {
  const original = points.split(/\s+/).map((point) => point.split(",").map(Number) as [number, number]);
  const xs = original.map(([x]) => x);
  const ys = original.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = axis === "x" ? maxX - minX : maxY - minY;
  if (span < 12) return null;
  let best: { low: Ring; high: Ring; areaError: number; balance: number } | null = null;

  const clipHalf = (ring: Ring, cut: number, keepLow: boolean): Ring => {
    const value = ([x, y]: [number, number]) => axis === "x" ? x : y;
    const inside = (point: [number, number]) => keepLow ? value(point) <= cut : value(point) >= cut;
    const result: Ring = [];
    for (let i = 0; i < ring.length; i++) {
      const current = ring[i];
      const previous = ring[(i + ring.length - 1) % ring.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside !== previousInside) {
        const delta = value(current) - value(previous);
        const t = Math.abs(delta) < 1e-9 ? 0 : (cut - value(previous)) / delta;
        result.push([
          previous[0] + (current[0] - previous[0]) * t,
          previous[1] + (current[1] - previous[1]) * t,
        ]);
      }
      if (currentInside) result.push(current);
    }
    return openRing(result);
  };

  // Search around the centre for a cut that leaves one valid polygon on each
  // side. This avoids severing concave coasts into disconnected fragments.
  for (const fraction of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7]) {
    const cut = axis === "x" ? minX + span * fraction : minY + span * fraction;
    const low = clipHalf(original, cut, true);
    const high = clipHalf(original, cut, false);
    if (low.length < 3 || high.length < 3) continue;
    const originalArea = ringArea(original);
    const lowArea = ringArea(low);
    const highArea = ringArea(high);
    const areaError = Math.abs(lowArea + highArea - originalArea) / Math.max(originalArea, 1);
    const balance = Math.abs(lowArea - highArea) / Math.max(originalArea, 1);
    if (areaError > 0.00001) continue;
    if (!best || balance < best.balance) best = { low, high, areaError, balance };
  }
  return best;
}

// ---------------------------------------------------------------------- main
async function main() {
  if (!fs.existsSync(CACHE)) {
    const res = await fetch(DATA_URL);
    fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  }
  const geo = JSON.parse(fs.readFileSync(CACHE, "utf8"));

  const byIso = new Map<string, MultiPoly>();
  for (const f of geo.features) {
    const code = f.properties.ADM0_A3 ?? f.properties.ISO_A3;
    const g = f.geometry;
    const polys: MultiPoly =
      g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const prev = byIso.get(code) ?? [];
    byIso.set(code, prev.concat(polys as MultiPoly));
  }

  const out: Record<string, { points: string; centroid: { x: number; y: number } }> = {};
  const warnings: string[] = [];

  for (const [id, spec] of Object.entries(SPECS)) {
    const parts: MultiPoly = [];
    for (const iso of spec.iso) {
      const m = byIso.get(iso);
      if (!m) { warnings.push(`${id}: no data for ${iso}`); continue; }
      parts.push(...m);
    }
    if (!parts.length) { warnings.push(`${id}: EMPTY`); continue; }

    let merged: MultiPoly;
    try {
      merged = polygonClipping.union(parts as any) as MultiPoly;
    } catch {
      merged = parts;
    }
    if (spec.bbox) {
      try {
        merged = polygonClipping.intersection(merged as any, bboxPoly(spec.bbox) as any) as MultiPoly;
      } catch {
        warnings.push(`${id}: clip failed`);
      }
    }
    if (spec.clip) {
      try {
        merged = polygonClipping.intersection(merged as any, spec.clip as any) as MultiPoly;
      } catch {
        warnings.push(`${id}: polygon clip failed`);
      }
    }
    if (!merged.length) { warnings.push(`${id}: EMPTY after clip`); continue; }

    // Largest outer ring wins (territories render as a single polygon).
    let best: Ring | null = null;
    let bestArea = -1;
    for (const poly of merged) {
      const ring = poly[0] as Ring;
      const a = ringArea(ring);
      if (a > bestArea) { bestArea = a; best = ring; }
    }
    if (!best) continue;

    // Quantize instead of per-territory Douglas-Peucker: neighbouring
    // territories share identical source vertices, so rounding them to the same
    // grid keeps shared borders exactly aligned (no slivers or gaps).
    const projected: Ring = quantize(best.map(([lon, lat]) => project(lon, lat)), spec.tol ?? 4);
    if (projected.length < 3) { warnings.push(`${id}: degenerate`); continue; }

    out[id] = {
      points: projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "),
      centroid: centroidOf(projected),
    };
  }

  // Partition existing shapes only after their coastlines are finalized. The
  // two complementary clips always union back to the exact original polygon.
  for (const subdivision of MAP_SUBDIVISIONS) {
    const parent = out[subdivision.parentId];
    if (!parent) {
      warnings.push(`${subdivision.childId}: missing parent ${subdivision.parentId}`);
      continue;
    }
    const split = splitShape(parent.points, subdivision.axis ?? "x");
    if (!split) {
      warnings.push(`${subdivision.childId}: could not safely split ${subdivision.parentId}`);
      continue;
    }
    const childRing = subdivision.childSide === "low" ? split.low : split.high;
    const parentRing = subdivision.childSide === "low" ? split.high : split.low;
    const encode = (ring: Ring) => ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    out[subdivision.parentId] = {
      points: encode(parentRing),
      centroid: centroidOf(parentRing),
    };
    out[subdivision.childId] = {
      points: encode(childRing),
      centroid: centroidOf(childRing),
    };
  }

  const header = `// AUTO-GENERATED by scripts/build-map.ts — do not edit by hand.
// Real-world territory outlines (Natural Earth 50m), projected into MAP_VIEWBOX.

export interface MapShape {
  points: string;
  centroid: { x: number; y: number };
}

export const MAP_SHAPES: Record<string, MapShape> = {
`;
  const body = Object.entries(out)
    .map(([id, s]) => `  ${id}: {\n    points: "${s.points}",\n    centroid: { x: ${s.centroid.x}, y: ${s.centroid.y} },\n  },`)
    .join("\n");
  fs.writeFileSync(
    path.join(process.cwd(), "src/game/mapShapes.ts"),
    `${header}${body}\n};\n`,
  );

  if (Object.keys(out).length < Object.keys(SPECS).length + MAP_SUBDIVISIONS.length) {
    const missing = MAP_SUBDIVISIONS.filter(({ childId }) => !out[childId]).map(({ childId }) => childId);
    throw new Error(`Map build omitted subdivisions: ${missing.join(", ")}`);
  }

  console.log(`wrote ${Object.keys(out).length} shapes`);
  const vertexCounts = Object.entries(out).map(([id, s]) => `${id}:${s.points.split(" ").length}`);
  console.log(vertexCounts.join(" "));
  if (warnings.length) console.log("WARNINGS:\n" + warnings.join("\n"));
}

main();
