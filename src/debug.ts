// Live tuning panel for tower size / height / position.
// Toggle with the 🛠 button (or add ?debug to the URL to auto-open).
// Editing a slider mutates the tower's footprint in place and re-renders, so the
// SHADOW updates live. "Copy values" prints paste-ready geometry for geometry.ts.

import {
  TOWERS,
  DECK,
  METRES_PER_PIXEL,
  PLAN_WIDTH,
  PLAN_HEIGHT,
  type Polygon,
} from "./geometry";
import { DECK_BORDER } from "./ui";
import { refreshDeckSamples } from "./status";
import { WIND_MODEL } from "./weather";

type RectSpec = { cx: number; cy: number; w: number; d: number };

// Derive an editable {center, width, depth} from a polygon's bbox.
function specOf(poly: Polygon): RectSpec {
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
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, d: maxY - minY };
}

// Write a {center, width, depth} rect back onto a polygon IN PLACE (4 corners).
function applySpec(poly: Polygon, s: RectSpec) {
  const x0 = s.cx - s.w / 2;
  const x1 = s.cx + s.w / 2;
  const y0 = s.cy - s.d / 2;
  const y1 = s.cy + s.d / 2;
  poly.length = 0;
  poly.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });
}

const M = (px: number) => Math.round(px * METRES_PER_PIXEL);

export function initDebugPanel(rerender: () => void) {
  const btn = document.createElement("button");
  btn.textContent = "🛠";
  btn.title = "Tune buildings";
  btn.className = "dbg-toggle";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "dbg-panel";
  panel.style.display = "none";
  document.body.appendChild(panel);

  const open = new URLSearchParams(location.search).has("debug");
  panel.style.display = open ? "block" : "none";

  btn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  const rowsHtml = TOWERS.map((t, i) => {
    const s = specOf(t.footprint);
    const draw = t.draw !== false;
    return `
      <div class="dbg-tower" data-i="${i}">
        <div class="dbg-h">${t.id} · <span class="dbg-floors-lbl">${t.floors}</span> fl
          <label class="dbg-draw"><input type="checkbox" data-k="draw" ${draw ? "checked" : ""}/> show pin</label>
        </div>
        ${sliderRow(i, "w", "width", s.w, 40, 1600)}
        ${sliderRow(i, "d", "depth", s.d, 40, 1600)}
        ${sliderRow(i, "cx", "x", s.cx, -400, PLAN_WIDTH + 400)}
        ${sliderRow(i, "cy", "y", s.cy, -400, PLAN_HEIGHT + 400)}
        ${sliderRow(i, "floors", "floors", t.floors, 1, 80, true)}
      </div>`;
  }).join("");

  // DECK section (data-i="deck") — the sun-% sampling region + its border.
  const ds = specOf(DECK);
  const deckHtml = `
    <div class="dbg-tower" data-i="deck">
      <div class="dbg-h">Deck area (sun %)
        <label class="dbg-draw"><input type="checkbox" data-k="border" ${DECK_BORDER.alpha > 0 ? "checked" : ""}/> show border</label>
      </div>
      ${sliderRow("deck", "w", "width", ds.w, 40, PLAN_WIDTH)}
      ${sliderRow("deck", "d", "depth", ds.d, 40, PLAN_HEIGHT)}
      ${sliderRow("deck", "cx", "x", ds.cx, 0, PLAN_WIDTH)}
      ${sliderRow("deck", "cy", "y", ds.cy, 0, PLAN_HEIGHT)}
    </div>`;

  // WIND section — canyon amplification factor for the "how it feels" rating.
  const cf = WIND_MODEL.canyonFactor;
  const windHtml = `
    <div class="dbg-tower" data-i="wind">
      <div class="dbg-h">Wind (deck feel)</div>
      <label class="dbg-row">
        <span class="dbg-k">canyon×</span>
        <input type="range" data-k="canyon" min="10" max="30" step="1" value="${Math.round(cf * 10)}"/>
        <span class="dbg-val" data-k="canyon">${cf.toFixed(1)}× open-air</span>
      </label>
    </div>`;

  panel.innerHTML = `
    <div class="dbg-top">
      <strong>Tune buildings</strong>
      <div>
        <button class="dbg-copy">Copy values</button>
        <button class="dbg-close">✕</button>
      </div>
    </div>
    <p class="dbg-note">Editing size/height updates the shadow live. Scale ≈ ${METRES_PER_PIXEL.toFixed(3)} m/px.</p>
    ${rowsHtml}
    ${deckHtml}
    ${windHtml}
    <pre class="dbg-out" hidden></pre>
  `;

  panel.querySelector(".dbg-close")!.addEventListener("click", () => {
    panel.style.display = "none";
  });

  // Wire every slider.
  panel.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const towerEl = inp.closest(".dbg-tower") as HTMLElement;
      const id = towerEl.dataset.i!;
      const k = inp.dataset.k as keyof RectSpec | "floors" | "canyon";
      const val = Number(inp.value);
      const valEl = towerEl.querySelector(`.dbg-val[data-k="${k}"]`)!;
      const sizeTxt =
        k === "w" || k === "d" ? `${Math.round(val)} px (~${M(val)} m)` : `${Math.round(val)} px`;

      // WIND: slider value is factor×10 (integer step); update the feel model.
      if (id === "wind") {
        WIND_MODEL.canyonFactor = val / 10;
        valEl.textContent = `${WIND_MODEL.canyonFactor.toFixed(1)}× open-air`;
        rerender();
        return;
      }

      // DECK: mutate the sampling polygon in place.
      if (id === "deck") {
        const s = specOf(DECK);
        s[k as keyof RectSpec] = val;
        applySpec(DECK, s);
        refreshDeckSamples(); // rebuild sample grid so the % reflects the new area
        valEl.textContent = sizeTxt;
        rerender();
        return;
      }

      const t = TOWERS[Number(id)];
      if (k === "floors") {
        t.floors = val;
        t.heightM = Math.round(val * 3.15); // ~3.15 m/floor incl. mechanical
        valEl.textContent = `${val} fl (~${t.heightM} m)`;
        towerEl.querySelector(".dbg-floors-lbl")!.textContent = String(val);
      } else {
        const s = specOf(t.footprint);
        s[k as keyof RectSpec] = val;
        applySpec(t.footprint, s);
        valEl.textContent = sizeTxt;
      }
      rerender();
    });
  });

  // Pin show/hide toggles (towers).
  panel.querySelectorAll<HTMLInputElement>('input[data-k="draw"]').forEach((inp) => {
    inp.addEventListener("change", () => {
      const i = Number((inp.closest(".dbg-tower") as HTMLElement).dataset.i);
      TOWERS[i].draw = inp.checked;
      rerender();
    });
  });

  // Deck border show/hide toggle.
  panel.querySelector<HTMLInputElement>('input[data-k="border"]')!.addEventListener("change", (e) => {
    DECK_BORDER.alpha = (e.target as HTMLInputElement).checked ? 0.9 : 0;
    rerender();
  });

  // Copy values → print geometry snippet.
  panel.querySelector(".dbg-copy")!.addEventListener("click", () => {
    const out = panel.querySelector(".dbg-out") as HTMLElement;
    out.hidden = false;
    const towerLines = TOWERS.map((t) => {
      const fp = t.footprint
        .map((p) => `{ x: ${Math.round(p.x)}, y: ${Math.round(p.y)} }`)
        .join(", ");
      return `${t.id}: floors ${t.floors}, heightM ${t.heightM}, draw ${t.draw !== false}\n  footprint: [ ${fp} ],`;
    }).join("\n");
    const deckFp = DECK.map((p) => `{ x: ${Math.round(p.x)}, y: ${Math.round(p.y)} }`).join(", ");
    out.textContent = `${towerLines}\nDECK: [ ${deckFp} ]\nWIND_MODEL.canyonFactor: ${WIND_MODEL.canyonFactor.toFixed(1)}`;
    navigator.clipboard?.writeText(out.textContent || "").catch(() => {});
  });
}

function sliderRow(
  i: number | string,
  k: string,
  label: string,
  val: number,
  min: number,
  max: number,
  isFloors = false,
): string {
  const valTxt = isFloors
    ? `${Math.round(val)} fl`
    : k === "w" || k === "d"
      ? `${Math.round(val)} px (~${M(val)} m)`
      : `${Math.round(val)} px`;
  return `
    <label class="dbg-row">
      <span class="dbg-k">${label}</span>
      <input type="range" data-k="${k}" min="${min}" max="${max}" step="1" value="${Math.round(val)}" data-tower="${i}"/>
      <span class="dbg-val" data-k="${k}">${valTxt}</span>
    </label>`;
}
