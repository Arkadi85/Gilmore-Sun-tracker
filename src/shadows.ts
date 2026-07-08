// Project tower shadows onto the flat deck and render their union.

import {
  TOWERS,
  PODIUM_HEIGHT_M,
  PLAN_WIDTH,
  PLAN_HEIGHT,
  type Polygon,
  type Point,
} from "./geometry";
import { shadowDirection, shadowLengthPx, type SunInfo } from "./sun";

/**
 * Ground shadow of an extruded prism (flat ground) = convex hull of the
 * footprint vertices together with those vertices translated by the shadow
 * vector. For a convex footprint this is exactly the swept silhouette.
 */
export function towerShadowPolygon(
  footprint: Polygon,
  heightM: number,
  sun: SunInfo,
): Polygon | null {
  if (!sun.isUp) return null;
  const castHeight = Math.max(0, heightM - PODIUM_HEIGHT_M);
  if (castHeight <= 0) return null;

  const len = shadowLengthPx(castHeight, sun.altitude);
  const dir = shadowDirection(sun);
  const dx = dir.x * len;
  const dy = dir.y * len;

  const pts: Point[] = [];
  for (const p of footprint) {
    pts.push({ x: p.x, y: p.y });
    pts.push({ x: p.x + dx, y: p.y + dy });
  }
  return convexHull(pts);
}

/** All tower shadow polygons for the current sun. */
export function allShadowPolygons(sun: SunInfo): Polygon[] {
  const out: Polygon[] = [];
  for (const t of TOWERS) {
    const poly = towerShadowPolygon(t.footprint, t.heightM, sun);
    if (poly) out.push(poly);
  }
  return out;
}

/**
 * Render the union of shadow polygons to an offscreen canvas at full opacity.
 * Overdraw naturally produces the union (no polygon-boolean lib needed). The
 * caller composites this layer onto the plan at whatever opacity it likes.
 */
export function renderShadowMask(
  polys: Polygon[],
  fill = "#3a2d5c",
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PLAN_WIDTH;
  c.height = PLAN_HEIGHT;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = fill;
  for (const poly of polys) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

/** Andrew's monotone chain convex hull. */
function convexHull(points: Point[]): Point[] {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
