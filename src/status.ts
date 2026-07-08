// Pool sun-coverage sampling + sunny-hours computation for a day.

import { DECK, pointInPolygon, type Polygon, type Point } from "./geometry";
import { getSun } from "./sun";
import { allShadowPolygons } from "./shadows";

/** Build a grid of sample points inside a polygon (in its bounding box). */
function samplePoints(poly: Polygon, step = 12): Point[] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pts: Point[] = [];
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const p = { x, y };
      if (pointInPolygon(p, poly)) pts.push(p);
    }
  }
  return pts.length ? pts : [{ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }];
}

let DECK_SAMPLES = samplePoints(DECK);

/** Rebuild the deck sample grid after DECK is edited (used by the debug panel). */
export function refreshDeckSamples() {
  DECK_SAMPLES = samplePoints(DECK);
}

/**
 * Fraction (0..1) of the whole amenity deck in direct sun at a given moment.
 * 0 when the sun is down; otherwise the share of sample points not covered by
 * any tower shadow.
 */
export function poolSunFraction(date: Date, poolSamples: Point[] = DECK_SAMPLES): number {
  const sun = getSun(date);
  if (!sun.isUp) return 0;
  const shadows = allShadowPolygons(sun);
  if (shadows.length === 0) return 1;

  let sunlit = 0;
  for (const p of poolSamples) {
    let shaded = false;
    for (const poly of shadows) {
      if (pointInPolygon(p, poly)) {
        shaded = true;
        break;
      }
    }
    if (!shaded) sunlit++;
  }
  return sunlit / poolSamples.length;
}

/**
 * Attenuate the geometric sun fraction by live cloud cover (0..1).
 * Full overcast still leaves some diffuse brightness, so we scale by up to 85%
 * rather than dropping to zero — a cloudy day isn't pitch dark.
 */
export function effectiveSun(geometric: number, cloudCover: number): number {
  return geometric * (1 - 0.85 * cloudCover);
}

export type SunnyRange = { startMin: number; endMin: number };

export type DaySunProfile = {
  /** Sampled fraction-in-sun per minute-of-day (indexed by minute step). */
  stepMin: number;
  samples: { minute: number; fraction: number }[];
  /** Contiguous ranges where the pool is meaningfully sunny. */
  ranges: SunnyRange[];
};

/**
 * Walk a day in `stepMin` increments, computing pool sun fraction at each step.
 * A step counts as "sunny" when fraction >= threshold.
 */
export function computeDayProfile(
  day: Date,
  stepMin = 10,
  threshold = 0.4,
): DaySunProfile {
  const samples: { minute: number; fraction: number }[] = [];
  for (let m = 0; m < 24 * 60; m += stepMin) {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(m);
    samples.push({ minute: m, fraction: poolSunFraction(d) });
  }

  const ranges: SunnyRange[] = [];
  let start: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    const sunny = samples[i].fraction >= threshold;
    if (sunny && start === null) start = samples[i].minute;
    if (!sunny && start !== null) {
      ranges.push({ startMin: start, endMin: samples[i].minute });
      start = null;
    }
  }
  if (start !== null) ranges.push({ startMin: start, endMin: 24 * 60 - 1 });

  return { stepMin, samples, ranges };
}

/** Format minutes-of-day as a friendly 12h time, e.g. "1:05 pm". */
export function fmtTime(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const ampm = h24 < 12 ? "am" : "pm";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}
