// Kawaii UI: sun/moon mascot, time-of-day sky theming, status copy, deck render.

import {
  PLAN_WIDTH,
  PLAN_HEIGHT,
  NORTH_ANGLE_DEG,
  TOWERS,
  POOL,
  SMALL_POOL,
  DECK,
  centroid,
} from "./geometry";
import { bearingToPixelVector, type SunInfo } from "./sun";
import { allShadowPolygons, renderShadowMask } from "./shadows";
import { fmtTime, type DaySunProfile } from "./status";
import { weatherCodeInfo, windFeel, uvFeel, hourAt, type Weather } from "./weather";

// --- Sky theming ------------------------------------------------------------
// Map an hour (with altitude) to a soft gradient pair.
export function skyGradient(sun: SunInfo, hour: number): [string, string] {
  if (!sun.isUp) {
    return hour < 12 ? ["#2b2350", "#4b3b6e"] : ["#3a2d5c", "#6b5a8a"]; // night
  }
  const alt = sun.altitude; // radians
  if (alt < 0.12) {
    // near horizon → dawn/dusk pinks & golds
    return hour < 12 ? ["#ffd9a0", "#ffb3c6"] : ["#ffc59e", "#e0a3d8"];
  }
  if (alt < 0.4) {
    // golden-ish
    return ["#ffe9c7", "#ffd1dc"];
  }
  // high midday → bright cheerful
  return ["#cfeeff", "#ffe9a8"];
}

export function applySky(sun: SunInfo, date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const [top, bot] = skyGradient(sun, hour);
  const root = document.documentElement.style;
  root.setProperty("--sky-top", top);
  root.setProperty("--sky-bot", bot);
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", top);
}

// --- Mascot -----------------------------------------------------------------
// A smiling sun (or sleepy moon) that arcs across the sky strip. sunT is the
// sun's horizontal progress across daylight (0..1); rise gives the arc height.
export function renderMascot(sun: SunInfo, sunT: number, shadedPool: boolean) {
  const svg = document.getElementById("sky-mascot")!;
  const W = 400;
  const H = 160;
  // Arc: x across the width, y as a parabola (higher at midday).
  const x = 40 + sunT * (W - 80);
  const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, sunT)));
  const y = H - 24 - arc * (H - 70);

  if (!sun.isUp) {
    svg.innerHTML = moonSvg(W / 2, 70);
    return;
  }
  svg.innerHTML = sunSvg(x, y, shadedPool);
}

function sunSvg(cx: number, cy: number, sleepyEyes: boolean): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r1 = 30;
    const r2 = 40;
    const x1 = cx + Math.cos(a) * r1;
    const y1 = cy + Math.sin(a) * r1;
    const x2 = cx + Math.cos(a) * r2;
    const y2 = cy + Math.sin(a) * r2;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`;
  }).join("");
  const eyes = sleepyEyes
    ? `<path d="M ${cx - 14} ${cy - 3} q 6 6 12 0" stroke="#5b4a6a" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M ${cx + 2} ${cy - 3} q 6 6 12 0" stroke="#5b4a6a" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="${cx - 9}" cy="${cy - 3}" r="3.5" fill="#5b4a6a"/>
       <circle cx="${cx + 9}" cy="${cy - 3}" r="3.5" fill="#5b4a6a"/>`;
  const cloud = sleepyEyes
    ? `<g opacity="0.95">
         <ellipse cx="${cx + 8}" cy="${cy + 20}" rx="46" ry="20" fill="#ffffff"/>
         <ellipse cx="${cx - 20}" cy="${cy + 24}" rx="28" ry="16" fill="#f3eefa"/>
         <ellipse cx="${cx + 34}" cy="${cy + 24}" rx="26" ry="15" fill="#f3eefa"/>
       </g>`
    : "";
  return `
    ${rays}
    <circle cx="${cx}" cy="${cy}" r="30" fill="#ffe066"/>
    ${eyes}
    <circle cx="${cx - 18}" cy="${cy + 6}" r="5" fill="#ffb3a7" opacity="0.7"/>
    <circle cx="${cx + 18}" cy="${cy + 6}" r="5" fill="#ffb3a7" opacity="0.7"/>
    <path d="M ${cx - 8} ${cy + 9} q 8 8 16 0" stroke="#5b4a6a" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${cloud}
  `;
}

function moonSvg(cx: number, cy: number): string {
  const stars = [
    [cx - 90, cy - 30],
    [cx + 80, cy - 40],
    [cx + 110, cy + 10],
    [cx - 120, cy + 20],
  ]
    .map(
      ([x, y]) =>
        `<text x="${x}" y="${y}" font-size="18" fill="#ffe066" opacity="0.8">✦</text>`,
    )
    .join("");
  return `
    ${stars}
    <circle cx="${cx}" cy="${cy}" r="30" fill="#f4efd0"/>
    <circle cx="${cx + 12}" cy="${cy - 6}" r="26" fill="var(--sky-top, #2b2350)"/>
    <path d="M ${cx - 12} ${cy + 6} q 6 6 12 0" stroke="#5b4a6a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="${cx - 12}" cy="${cy - 4}" r="2.6" fill="#5b4a6a"/>
    <text x="${cx + 30}" y="${cy - 24}" font-size="16" fill="#f4efd0">z</text>
    <text x="${cx + 42}" y="${cy - 34}" font-size="20" fill="#f4efd0">z</text>
  `;
}

// --- Status copy ------------------------------------------------------------
// `cloudCover` (0..1) is the live sky when known; when the geometry says the sun
// reaches the pool but a cloud deck has rolled in, we say so instead of promising
// sun that isn't there. `fraction` here is the geometric (pre-weather) value.
export function statusCopy(
  sun: SunInfo,
  fraction: number,
  cloudCover?: number,
): string {
  if (!sun.isUp) return "The sun's gone to bed 🌙 zzz…";
  // Sun geometrically reaches the pool, but the sky's covered.
  if (fraction >= 0.5 && cloudCover != null && cloudCover >= 0.7) {
    return "Sun's angle is right, but a cloud deck's in ☁️";
  }
  if (fraction >= 0.5 && cloudCover != null && cloudCover >= 0.4) {
    return "Sun on the pool through some clouds 🌤️";
  }
  if (fraction >= 0.85) return "The pool is soaking up the sun! ✨🏊";
  if (fraction >= 0.5) return "Mostly sunny by the pool ☀️ grab a towel!";
  if (fraction >= 0.15) return "A tower's shadow is visiting 🌥️ patchy sun";
  return "The pool's in the shade right now 🌥️💤";
}

// --- Deck rendering ---------------------------------------------------------
let planCanvas: HTMLCanvasElement | null = null;
let planReady = false;

export function loadPlan(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      planCanvas = knockoutCheckerboard(img);
      planReady = true;
      resolve();
    };
    img.onerror = () => {
      planReady = false; // fall back to schematic
      resolve();
    };
    img.src = src;
  });
}

/**
 * The render has a baked-in transparency checkerboard (light neutral squares)
 * around the deck. Flood-fill from the borders, clearing bright-neutral pixels
 * to transparent and stopping at the darker deck/tree edges. Returns a canvas
 * with a real alpha channel so the pastel backdrop shows through.
 */
function knockoutCheckerboard(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // A pixel is "checkerboard" if it's bright and near-neutral (low saturation).
  const isCheck = (i: number) => {
    const r = px[i],
      g = px[i + 1],
      b = px[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return min > 195 && max - min < 22; // bright + grey/white
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const pushEdge = (x: number, y: number) => {
    const p = y * w + x;
    if (!visited[p]) {
      visited[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    pushEdge(x, 0);
    pushEdge(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushEdge(0, y);
    pushEdge(w - 1, y);
  }

  while (stack.length) {
    const p = stack.pop()!;
    const i = p * 4;
    if (!isCheck(i)) continue;
    px[i + 3] = 0; // clear alpha
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0 && !visited[p - 1]) {
      visited[p - 1] = 1;
      stack.push(p - 1);
    }
    if (x < w - 1 && !visited[p + 1]) {
      visited[p + 1] = 1;
      stack.push(p + 1);
    }
    if (y > 0 && !visited[p - w]) {
      visited[p - w] = 1;
      stack.push(p - w);
    }
    if (y < h - 1 && !visited[p + w]) {
      visited[p + w] = 1;
      stack.push(p + w);
    }
  }

  ctx.putImageData(data, 0, 0);
  return c;
}

export function renderDeck(
  canvas: HTMLCanvasElement,
  sun: SunInfo,
  fraction: number,
  phase = 0,
) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = PLAN_WIDTH;
  canvas.height = PLAN_HEIGHT;

  // Soft pastel backdrop behind the transparent PNG (so the cut-out edges sit on
  // theme colour, not checkerboard).
  ctx.fillStyle = "#fbf4ec";
  ctx.fillRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT);

  // Base layer: the pool render (square → no distortion), else pastel schematic.
  if (planReady && planCanvas) {
    ctx.drawImage(planCanvas, 0, 0, PLAN_WIDTH, PLAN_HEIGHT);
  } else {
    drawSchematic(ctx);
  }

  // Warm sunny wash vs cool evening tint over the whole deck, by time of day.
  drawTimeWash(ctx, sun);

  // Tower shadow union, blended as real shade (multiply) so it darkens the photo
  // naturally rather than painting a flat grey shape.
  const shadows = allShadowPolygons(sun);
  if (shadows.length) {
    const mask = renderShadowMask(shadows, "#4a4160");
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.5;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
  } else if (!sun.isUp) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#3a2d5c";
    ctx.fillRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT);
    ctx.restore();
  }

  // Outline of the amenity deck (the region the sun % is computed over).
  drawDeckBorder(ctx);

  // Draw the three towers as graphic blocks on top (they cast the shadows above).
  drawTowers(ctx);

  // Highlight the pools: golden sparkle when sunny, cool overlay when shaded.
  drawPoolState(ctx, POOL, fraction, sun.isUp, true);
  drawPoolState(ctx, SMALL_POOL, fraction, sun.isUp, false);

  // Sun-direction arrow from the pool toward the sun.
  if (sun.isUp) drawSunArrow(ctx, sun, phase);

  // North compass so the orientation can be checked against the drawn arrow.
  drawCompass(ctx);
}

// --- Deck border ------------------------------------------------------------
// Outline of the DECK region (what the sun % is computed over). Edit these to
// control the border's look.
export const DECK_BORDER = {
  color: "#ff8fb1", // border colour
  width: 5, // line thickness (px in the 1024 image space)
  alpha: 0.9, // 0 = invisible, 1 = solid
  dashed: true, // dashed vs solid line
  radius: 22, // rounded-corner radius
};

function drawDeckBorder(ctx: CanvasRenderingContext2D) {
  if (DECK_BORDER.alpha <= 0) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of DECK) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  ctx.save();
  ctx.globalAlpha = DECK_BORDER.alpha;
  ctx.strokeStyle = DECK_BORDER.color;
  ctx.lineWidth = DECK_BORDER.width;
  ctx.setLineDash(DECK_BORDER.dashed ? [16, 12] : []);
  ctx.beginPath();
  ctx.roundRect(minX, minY, maxX - minX, maxY - minY, DECK_BORDER.radius);
  ctx.stroke();
  ctx.restore();
}

// Towers are shown as compact circular PIN markers (like a map pin), never as
// big filled blocks — so they can't cover the pool/deck. The shadow math still
// uses each tower's full footprint; this only draws a small labelled dot at the
// tower's position (clamped just inside the frame edge).
function drawTowers(ctx: CanvasRenderingContext2D) {
  const R = 46;
  const M = R + 40; // margin so the pin + its caption stay fully on-canvas
  for (const t of TOWERS) {
    if (t.draw === false) continue; // off-frame tower: shadow only, no marker
    const c = t.pin ?? centroid(t.footprint);
    const px = Math.max(M, Math.min(PLAN_WIDTH - M, c.x));
    const py = Math.max(M, Math.min(PLAN_HEIGHT - M, c.y));

    ctx.save();
    // drop shadow
    ctx.shadowColor = "rgba(60,50,80,0.28)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    // disc
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fill();
    // ring
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 5;
    ctx.strokeStyle = t.roof;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.stroke();
    // label
    ctx.fillStyle = "#3a3350";
    ctx.font = "800 34px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.id, px, py + 2);
    // floors caption under the pin
    ctx.font = "700 18px 'Nunito', sans-serif";
    ctx.fillStyle = "rgba(58,51,80,0.8)";
    ctx.fillText(`${t.floors} fl`, px, py + R + 16);
    ctx.restore();
  }
}

// Small North compass in the top-left corner, pointing along NORTH_ANGLE_DEG.
function drawCompass(ctx: CanvasRenderingContext2D) {
  const cx = 92;
  const cy = 92;
  const r = 46;
  const ang = (NORTH_ANGLE_DEG * Math.PI) / 180; // clockwise from up
  const nx = cx + Math.sin(ang) * r;
  const ny = cy - Math.cos(ang) * r;
  const sx = cx - Math.sin(ang) * (r * 0.7);
  const sy = cy + Math.cos(ang) * (r * 0.7);
  ctx.save();
  // dial
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,100,150,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  // south tail
  ctx.strokeStyle = "#b8a9e0";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  // north needle
  ctx.strokeStyle = "#ff6f61";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.fillStyle = "#ff6f61";
  ctx.beginPath();
  ctx.arc(nx, ny, 8, 0, Math.PI * 2);
  ctx.fill();
  // "N"
  ctx.fillStyle = "#ff6f61";
  ctx.font = "800 26px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx + Math.sin(ang) * (r + 24), cy - Math.cos(ang) * (r + 24));
  ctx.restore();
}

// Whole-deck colour wash keyed to the sun's altitude/time.
function drawTimeWash(ctx: CanvasRenderingContext2D, sun: SunInfo) {
  if (!sun.isUp) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  if (sun.altitude < 0.18) {
    // low sun → warm golden-hour glow
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffb26b";
  } else {
    // high sun → light, bright
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#fff2c2";
  }
  ctx.fillRect(0, 0, PLAN_WIDTH, PLAN_HEIGHT);
  ctx.restore();
}

// Fallback schematic (only if the photo fails to load).
function drawSchematic(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "#e7dcf0";
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, PLAN_WIDTH - 80, PLAN_HEIGHT - 80);
  for (const t of TOWERS) {
    const c = centroid(t.footprint);
    ctx.fillStyle = t.color;
    polyFill(ctx, t.footprint);
    ctx.fillStyle = "#5b4a6a";
    ctx.font = "700 30px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(t.id, c.x, c.y);
  }
  ctx.fillStyle = "#7cc7e8";
  polyFill(ctx, POOL);
  polyFill(ctx, SMALL_POOL);
}

function drawPoolState(
  ctx: CanvasRenderingContext2D,
  pool: typeof POOL,
  fraction: number,
  sunUp: boolean,
  withSparkles: boolean,
) {
  const sunny = sunUp && fraction >= 0.5;
  const c = centroid(pool);

  ctx.save();
  ctx.globalCompositeOperation = sunny ? "soft-light" : "multiply";
  ctx.globalAlpha = sunny ? 0.75 : 0.4;
  ctx.fillStyle = sunny ? "#ffe58a" : "#6d7a99";
  polyFill(ctx, pool);
  ctx.restore();

  // Soft outline ring in the state colour.
  ctx.save();
  ctx.strokeStyle = sunny ? "#ffd23f" : "#8a93ad";
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.85;
  polyStroke(ctx, pool);
  ctx.restore();

  if (withSparkles && sunny) {
    ctx.save();
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.95;
    ctx.fillText("✨", c.x - 150, c.y);
    ctx.fillText("✨", c.x + 150, c.y - 30);
    ctx.restore();
  }
}

/**
 * Sun-direction indicator, drawn on the pool. An anchor dot sits centered on the
 * pool; a soft tapered pointer runs toward the sun's compass bearing; at the tip
 * a little sun with a radial glow and rays makes the direction unmistakably
 * "that way is the sun". `phase` (0..1, optional) gently animates the glow/rays.
 */
function drawSunArrow(ctx: CanvasRenderingContext2D, sun: SunInfo, phase = 0) {
  const c = centroid(DECK);
  const dir = bearingToPixelVector(sun.bearingDeg);
  const len = 150;
  const ex = c.x + dir.x * len;
  const ey = c.y + dir.y * len;
  // Breathing factor for the glow + ray length (subtle: ±8%).
  const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  const sunR = 22;

  ctx.save();

  // --- Anchor on the pool: a small ringed dot marking "you are here". ---
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff8c42";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
  ctx.stroke();

  // --- Tapered pointer from the anchor toward the sun. ---
  // A slim quad that's wider at the base and narrows toward the tip.
  const nx = -dir.y; // perpendicular (left/right of the direction)
  const ny = dir.x;
  const baseW = 7;
  const tipW = 2.5;
  const startGap = 12; // leave the anchor dot visible
  const bx = c.x + dir.x * startGap;
  const by = c.y + dir.y * startGap;
  const tx = c.x + dir.x * (len - sunR - 4);
  const ty = c.y + dir.y * (len - sunR - 4);
  const grad = ctx.createLinearGradient(bx, by, tx, ty);
  grad.addColorStop(0, "#ffb703");
  grad.addColorStop(1, "#ff8c42");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(bx + nx * baseW, by + ny * baseW);
  ctx.lineTo(bx - nx * baseW, by - ny * baseW);
  ctx.lineTo(tx - nx * tipW, ty - ny * tipW);
  ctx.lineTo(tx + nx * tipW, ty + ny * tipW);
  ctx.closePath();
  ctx.fill();

  // --- Radial glow behind the sun so it clearly reads as light. ---
  const glowR = sunR * (2.6 + 0.5 * pulse);
  const glow = ctx.createRadialGradient(ex, ey, sunR * 0.5, ex, ey, glowR);
  glow.addColorStop(0, "rgba(255,214,64,0.55)");
  glow.addColorStop(0.55, "rgba(255,183,3,0.22)");
  glow.addColorStop(1, "rgba(255,183,3,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ex, ey, glowR, 0, Math.PI * 2);
  ctx.fill();

  // --- Rays around the sun (alternating long/short, gently breathing). ---
  const rayN = 12;
  ctx.strokeStyle = "#ffcf3f";
  ctx.lineCap = "round";
  for (let i = 0; i < rayN; i++) {
    const a = (i / rayN) * Math.PI * 2 + phase * 0.6;
    const long = i % 2 === 0;
    const r1 = sunR + 5;
    const r2 = sunR + (long ? 16 : 10) + pulse * 3;
    ctx.lineWidth = long ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * r1, ey + Math.sin(a) * r1);
    ctx.lineTo(ex + Math.cos(a) * r2, ey + Math.sin(a) * r2);
    ctx.stroke();
  }

  // --- The sun disc: warm radial fill + crisp rim. ---
  const disc = ctx.createRadialGradient(
    ex - sunR * 0.3,
    ey - sunR * 0.3,
    sunR * 0.2,
    ex,
    ey,
    sunR,
  );
  disc.addColorStop(0, "#fff2b0");
  disc.addColorStop(1, "#ffd23f");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(ex, ey, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffb703";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(ex, ey, sunR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function polyFill(ctx: CanvasRenderingContext2D, poly: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.fill();
}

function polyStroke(ctx: CanvasRenderingContext2D, poly: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
  ctx.stroke();
}

// --- Sunny-hours ribbon -----------------------------------------------------
export function renderRibbon(profile: DaySunProfile, nowMinute: number | null) {
  const el = document.getElementById("hours-ribbon")!;
  const dayMin = 24 * 60;
  const segs = profile.ranges
    .map((r) => {
      const left = (r.startMin / dayMin) * 100;
      const width = ((r.endMin - r.startMin) / dayMin) * 100;
      return `<div class="sunny-seg" style="left:${left}%;width:${width}%"></div>`;
    })
    .join("");
  const nowMark =
    nowMinute != null
      ? `<div class="now-mark" style="left:${(nowMinute / dayMin) * 100}%"></div>`
      : "";
  el.innerHTML = segs + nowMark;

  const summary = document.getElementById("hours-summary")!;
  if (profile.ranges.length === 0) {
    summary.textContent = "No direct sun on the pool today 🌥️";
  } else {
    summary.textContent = profile.ranges
      .map((r) => `${fmtTime(r.startMin)} – ${fmtTime(r.endMin)}`)
      .join("  ·  ");
  }
}

// --- Weather card + hourly strip --------------------------------------------
// Renders live conditions and today's hourly forecast. `weather` is null when
// the fetch failed (offline / API down) — we show a gentle note and hide the
// strip so the app stays fully usable on geometry alone. `nowMinute` highlights
// the hour the time slider currently sits on (null when a non-today day is
// selected, so nothing is highlighted). `effSun` (0..1, cloud-blended) is how
// much direct sun is on the deck — it folds into the wind-feel rating.
export function renderWeather(
  weather: Weather | null,
  nowMinute: number | null,
  effSun = 1,
) {
  const card = document.getElementById("weather-card")!;
  const windEl = document.getElementById("weather-wind")!;
  const uvEl = document.getElementById("weather-uv")!;

  if (!weather) {
    card.innerHTML =
      `<p class="wx-unavailable">Weather unavailable — showing sun geometry only 🌇</p>`;
    windEl.innerHTML = "";
    uvEl.innerHTML = "";
    return;
  }

  const c = weather.current;
  const info = weatherCodeInfo(c.code, c.isDay);
  card.innerHTML = `
    <div class="wx-now">
      <span class="wx-icon">${info.icon}</span>
      <span class="wx-temp">${Math.round(c.tempC)}°</span>
      <span class="wx-label">${info.label}</span>
    </div>
    <div class="wx-chips">
      <span class="wx-chip">☁️ ${Math.round(c.cloudCover * 100)}%</span>
      <span class="wx-chip">💨 ${Math.round(c.windKmh)} km/h</span>
      ${c.precipMm > 0 ? `<span class="wx-chip">🌧️ ${c.precipMm.toFixed(1)} mm</span>` : ""}
    </div>
  `;

  // Wind + UV on the deck — the "how it feels on bare skin" ratings, both as the
  // same compact 3-level pill. Use the forecast sample at the selected hour when
  // scrubbing; else the current conditions.
  const sample = nowMinute != null ? hourAt(weather, nowMinute) : null;
  const meanWind = sample?.windKmh ?? c.windKmh;
  const apparent = sample?.apparentC ?? c.apparentC;
  const uvIndex = sample?.uvIndex ?? c.uvIndex;

  const wf = windFeel(meanWind, apparent, effSun);
  windEl.innerHTML = levelPill(
    "Wind",
    wf.icon,
    wf.label,
    wf.level,
    wf.note,
    `≈ ${Math.round(wf.canyonKmh)} km/h between the towers`,
  );

  const uv = uvFeel(uvIndex, effSun);
  uvEl.innerHTML = levelPill(
    "UV",
    uv.icon,
    uv.label,
    uv.level,
    uv.note,
    `UV index ${uv.effectiveUv} on the deck`,
  );
}

// A compact 3-level "how it feels" pill (shared by Wind and UV). `level` (1..3)
// drives the colour tint via the wx-lvl-l{n} class.
function levelPill(
  kind: string,
  icon: string,
  label: string,
  level: 1 | 2 | 3,
  note: string,
  sub: string,
): string {
  // The full "how it feels" note stays as a hover tooltip to keep the pill short.
  return `
    <div class="wx-lvl wx-lvl-l${level}" title="${note}">
      <span class="wx-lvl-icon">${icon}</span>
      <div class="wx-lvl-body">
        <span class="wx-lvl-head"><span class="wx-lvl-kind">${kind}</span> · ${label}</span>
        <span class="wx-lvl-sub">${sub}</span>
      </div>
    </div>`;
}
