// Sun position + the bridge from real-world compass bearings to plan-image pixels.

import SunCalc from "suncalc";
import { LAT, LNG, NORTH_ANGLE_DEG, METRES_PER_PIXEL } from "./geometry";

const DEG = Math.PI / 180;

export type SunInfo = {
  /** Altitude above horizon, radians (<= 0 means the sun is down). */
  altitude: number;
  /** Compass bearing to the sun, degrees clockwise from North (0..360). */
  bearingDeg: number;
  /** true when the sun is above the horizon. */
  isUp: boolean;
};

/**
 * Get the sun's position for a given date/time at Gilmore Place.
 *
 * SunCalc's azimuth is measured from SOUTH, clockwise toward WEST (0 = south,
 * +PI/2 = west). We convert to a standard compass bearing (clockwise from North)
 * with: compassBearing = 180 + azimuthDeg.
 */
export function getSun(date: Date): SunInfo {
  const pos = SunCalc.getPosition(date, LAT, LNG);
  const azimuthDeg = pos.azimuth / DEG;
  let bearingDeg = (180 + azimuthDeg) % 360;
  if (bearingDeg < 0) bearingDeg += 360;
  return {
    altitude: pos.altitude,
    bearingDeg,
    isUp: pos.altitude > 0,
  };
}

/**
 * Convert a compass bearing (deg clockwise from North) to a UNIT vector in
 * plan-image pixel space.
 *
 * The plan is rotated so compass-North points at NORTH_ANGLE_DEG (screen
 * degrees clockwise from screen-up). A bearing therefore maps to a screen angle
 * of (NORTH_ANGLE_DEG + bearing). In screen coordinates (y increases downward),
 * an angle measured clockwise from "up" has direction (sin, -cos).
 */
export function bearingToPixelVector(bearingDeg: number): { x: number; y: number } {
  const screenAngle = (NORTH_ANGLE_DEG + bearingDeg) * DEG;
  return { x: Math.sin(screenAngle), y: -Math.cos(screenAngle) };
}

/**
 * The direction shadows fall on the plan, as a unit pixel vector: opposite the
 * direction toward the sun.
 */
export function shadowDirection(sun: SunInfo): { x: number; y: number } {
  return bearingToPixelVector((sun.bearingDeg + 180) % 360);
}

/**
 * Length of the shadow cast by an object of the given height, in plan pixels.
 * shadowMetres = height / tan(altitude); convert to pixels via METRES_PER_PIXEL.
 * Returns a large-but-finite length when the sun is very low so shadows read as
 * "covering everything" rather than exploding to Infinity.
 */
export function shadowLengthPx(heightM: number, altitude: number): number {
  if (altitude <= 0) return 0; // caller treats sun-down as fully shaded
  const minAlt = 0.5 * DEG; // clamp so tan() doesn't blow up near the horizon
  const a = Math.max(altitude, minAlt);
  const metres = heightM / Math.tan(a);
  return metres / METRES_PER_PIXEL;
}
