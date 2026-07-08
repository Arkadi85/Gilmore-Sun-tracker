// Traced geometry + calibration constants for the Gilmore Place pool amenity.
//
// Calibrated against the pool-centered realistic render: public/pool.png (1024x1024).
// All pixel coordinates are in that image's space.
//
// ORIENTATION (the important bit):
//   Calibrated to the North arrow the user drew on the render: North points UP
//   and slightly LEFT (~15° west of straight up). NORTH_ANGLE_DEG is that screen
//   direction of compass-North (deg clockwise from screen-up), so 360-15 = 345.
//     up-left  = North     down-right = South
//     up-right = East      down-left  = West
//   A small compass arrow is drawn on the canvas so this can be checked against
//   the drawn arrow. Adjust NORTH_ANGLE_DEG until it matches exactly.

export type Point = { x: number; y: number };
export type Polygon = Point[];

// Location: Gilmore Place, Burnaby BC (49°15'57"N, 123°0'49"W)
export const LAT = 49 + 15 / 60 + 57 / 3600; // 49.2658
export const LNG = -(123 + 0 / 60 + 49 / 3600); // -123.0136

// Source render intrinsic size (px). It's square, so the canvas stays square and
// the photo is drawn without distortion.
export const PLAN_WIDTH = 1024;
export const PLAN_HEIGHT = 1024;

// --- Calibration ------------------------------------------------------------

// The main pool's long edge measured in the render, in pixels.
export const POOL_LENGTH_PX = 490;
// Real-world pool length in metres.
export const POOL_LENGTH_M = 25;
// Derived: metres per image pixel.
export const METRES_PER_PIXEL = POOL_LENGTH_M / POOL_LENGTH_PX; // ~0.051 m/px

// Compass-North's on-screen direction, degrees clockwise from screen-up.
// The user's drawn North arrow points up and ~15° to the left → 345°.
export const NORTH_ANGLE_DEG = 355;

// Towers rise from a ~6-storey podium the pool sits on; only height ABOVE the
// podium casts a shadow across the deck.
export const PODIUM_HEIGHT_M = 18;

// --- Towers -----------------------------------------------------------------
// All three towers are drawn as stylized graphic blocks that each cast a shadow.
// T2 sits directly north of the pool (its core is the grey structure in the
// render). T1 and T3 are across the podium and off the photo frame, so they are
// placed as graphic blocks in their approximate real-world directions from the
// pool — positions are easy to nudge here.

export type Tower = {
  id: string;
  label: string;
  floors: number;
  color: string; // pastel body colour for the graphic block
  roof: string; // slightly darker roof colour
  heightM: number;
  footprint: Polygon; // used for SHADOW casting (full building extent)
  pin?: Point; // where to draw the small marker (defaults to footprint centroid)
  draw?: boolean; // false = cast a shadow but don't render a marker (off-frame)
};

// Positions derived from the site plan, relative to the Outdoor Amenity Pool:
//   T2 is directly NORTH of the pool  → render "up"       (top)
//   T1 is directly SOUTH of the pool  → render "down"     (bottom)
//   T3 is to the EAST of the pool     → render "up-right" (upper-right)
// (Bearings T2≈N, T1≈S, T3≈E mapped through NORTH_ANGLE_DEG = 345.)
//
// Sizes: the grey blocks in the site plan are WHOLE tower floorplates, so these
// are large. T1 and T3 are far across the podium and mostly off the photo frame,
// so they poke in from the correct edge (stylized — the photo only frames T2).
export const TOWERS: Tower[] = [
  {
    id: "T2",
    label: "T2 · 64 fl",
    floors: 64,
    color: "#b8b0cf",
    roof: "#9c93b8",
    heightM: 216, // tallest building in BC — immediately north of the pool
    // SHADOW footprint (tuned): wide building extent north of the pool.
    footprint:  [
      { x: 78, y: 15 },
      { x: 910, y: 15 }, 
      { x: 910, y: 401 }, 
      { x: 78, y: 401 } ],
    pin: { x: 500, y: 205 }, // on the grey core in the render
  },
  {
    id: "T1",
    label: "T1 · 51 fl",
    floors: 51,
    color: "#a7d8c4",
    roof: "#89c0aa",
    heightM: 178,
    // SHADOW footprint (tuned): wide building extent south of the pool.
    footprint: [ { x: 45, y: 929 }, { x: 986, y: 929 }, { x: 986, y: 1481 }, { x: 45, y: 1481 } ],
    pin: { x: 500, y: 980 }, // bottom edge, below the pool
  },
  {
    id: "T3",
    label: "T3 · 43 fl",
    floors: 43,
    color: "#f2d59b",
    roof: "#e3bf7a",
    heightM: 148,
    // Far to the EAST across the podium (upper-right). Off-frame in this render,
    // so it is NOT drawn — it only casts its shadow. Placed in the correct
    // real-world direction from the pool.
    draw: false,
    footprint: [
      { x: 1120, y: 120 },
      { x: 1420, y: 120 },
      { x: 1420, y: 520 },
      { x: 1120, y: 520 },
    ],
  },
];

// --- Pool -------------------------------------------------------------------
// Main rectangular pool (the sun target for the status %).
// Measured from pool.png: water spans x[341,831], y[607,785].
export const POOL: Polygon = [
  { x: 341, y: 607 },
  { x: 831, y: 607 },
  { x: 831, y: 785 },
  { x: 341, y: 785 },
];

// Smaller square pool to its left (drawn/glowed too, not sampled for %).
// Measured: x[170,290], y[607,780].
export const SMALL_POOL: Polygon = [
  { x: 170, y: 607 },
  { x: 290, y: 607 },
  { x: 290, y: 780 },
  { x: 170, y: 780 },
];

// The whole outdoor amenity deck (pools + loungers + walkways). Sun % and status
// are computed over THIS region — "is the amenity area sunny", not just the water.
// Traced to cover the open deck in pool.png.
export const DECK: Polygon = [ { x: 39, y: 422 }, { x: 1007, y: 422 }, { x: 1007, y: 938 }, { x: 39, y: 938 } ];

// --- Helpers ----------------------------------------------------------------

/** Standard ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Centroid of a polygon (average of vertices — fine for convex shapes). */
export function centroid(poly: Polygon): Point {
  let x = 0;
  let y = 0;
  for (const pt of poly) {
    x += pt.x;
    y += pt.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}
