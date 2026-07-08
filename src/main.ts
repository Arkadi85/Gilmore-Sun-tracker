// Bootstrap: wire controls, compute sun, render everything.

import "./styles.css";
import { getSun } from "./sun";
import { poolSunFraction, computeDayProfile, effectiveSun } from "./status";
import { initDebugPanel } from "./debug";
import { fetchWeather, hourAt, type Weather } from "./weather";
import {
  loadPlan,
  renderDeck,
  applySky,
  statusCopy,
  renderRibbon,
  renderWeather,
} from "./ui";

const canvas = document.getElementById("deck-canvas") as HTMLCanvasElement;
const slider = document.getElementById("time-slider") as HTMLInputElement;
const timeReadout = document.getElementById("time-readout")!;
const nowBtn = document.getElementById("now-btn")!;
const datePicker = document.getElementById("date-picker") as HTMLInputElement;
const statusLine = document.getElementById("status-line")!;
const meterFill = document.getElementById("sun-meter-fill")!;
const meterLabel = document.getElementById("sun-meter-label")!;

// State: selected day + minute-of-day.
let selectedDay = new Date();
let profileCache: ReturnType<typeof computeDayProfile> | null = null;

// Animation phase (0..1) driving the pool's breathing sun indicator. Advanced by
// a requestAnimationFrame ticker; one full cycle every ~3.6s.
let animPhase = 0;
const prefersReducedMotion =
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Live weather (null until fetched / on failure). Only today's forecast exists,
// so it's only blended when the selected day is today.
let weather: Weather | null = null;
const WEATHER_STALE_MS = 15 * 60 * 1000;

/** Cloud cover (0..1) to blend at the selected minute, or null (→ pure geometry). */
function cloudCoverAt(minute: number): number | null {
  if (!weather || !isToday(selectedDay)) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Within ~30 min of real "now" → use live current conditions; else hourly.
  if (Math.abs(minute - nowMin) <= 30) return weather.current.cloudCover;
  return hourAt(weather, minute)?.cloudCover ?? null;
}

function currentDate(): Date {
  const d = new Date(selectedDay);
  const minute = parseInt(slider.value, 10);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minute);
  return d;
}

function fmtReadout(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  const ampm = h24 < 12 ? "am" : "pm";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function isToday(day: Date): boolean {
  const now = new Date();
  return (
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate()
  );
}

// Last-computed sun/fraction, so the animation ticker can re-render the deck
// (for the breathing sun indicator) without recomputing geometry every frame.
let lastSun: ReturnType<typeof getSun> | null = null;
let lastFraction = 0;

function update() {
  const date = currentDate();
  const minute = parseInt(slider.value, 10);
  const sun = getSun(date);
  const fraction = poolSunFraction(date);
  lastSun = sun;
  lastFraction = fraction;

  // Blend live cloud cover into the geometric reading (today only).
  const cc = cloudCoverAt(minute);
  const eff = cc != null ? effectiveSun(fraction, cc) : fraction;

  // Update the browser theme-color to match the time of day.
  applySky(sun, date);

  // Deck (shadow render stays geometric; the meter reflects the weather blend)
  renderDeck(canvas, sun, fraction, animPhase);

  // Status card
  statusLine.textContent = statusCopy(sun, fraction, cc ?? undefined);
  const pct = Math.round(eff * 100);
  meterFill.style.width = `${sun.isUp ? pct : 0}%`;
  meterLabel.textContent = sun.isUp ? `${pct}% in sun` : "night";

  // Weather card + hourly strip (highlight the current hour only when on today).
  // Pass the cloud-blended effective sun so the wind-feel rating knows how much
  // direct sun is on the deck.
  renderWeather(weather, isToday(selectedDay) ? minute : null, eff);

  // Readout
  timeReadout.textContent = fmtReadout(minute);

  // Ribbon (recompute profile only when the day changes)
  if (!profileCache) profileCache = computeDayProfile(selectedDay);
  renderRibbon(profileCache, isToday(selectedDay) ? minute : null);
}

function setToNow() {
  const now = new Date();
  selectedDay = new Date(now);
  profileCache = null;
  datePicker.value = toDateInput(now);
  slider.value = String(now.getHours() * 60 + now.getMinutes());
  update();
  refreshWeatherIfStale();
}

/** (Re)fetch weather when we have none or it's older than WEATHER_STALE_MS. */
function refreshWeatherIfStale() {
  if (weather && Date.now() - weather.fetchedAt < WEATHER_STALE_MS) return;
  fetchWeather().then((w) => {
    if (w) {
      weather = w;
      update();
    }
  });
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// --- "Try me" slider hint: bob for a beat, then fade out (or as soon as the
// user first touches the slider, whichever comes first).
const sliderHint = document.getElementById("slider-hint");
let hintDismissed = false;
function dismissHint() {
  if (hintDismissed || !sliderHint) return;
  hintDismissed = true;
  sliderHint.classList.add("hide");
  sliderHint.addEventListener("animationend", () => sliderHint.remove(), {
    once: true,
  });
}
const hintTimer = setTimeout(dismissHint, 2000);
slider.addEventListener(
  "pointerdown",
  () => {
    clearTimeout(hintTimer);
    dismissHint();
  },
  { once: true },
);

// --- Events ---
slider.addEventListener("input", update);
nowBtn.addEventListener("click", setToNow);
datePicker.addEventListener("change", () => {
  const [y, m, d] = datePicker.value.split("-").map(Number);
  if (y && m && d) {
    selectedDay = new Date(y, m - 1, d);
    profileCache = null;
    update();
  }
});

// Re-render after a debug edit: tower geometry changed, so drop the day profile.
function rerenderAfterEdit() {
  profileCache = null;
  update();
}

// --- Animation ticker ---
// Re-render just the deck each frame so the sun indicator's glow/rays breathe.
// Skipped entirely when the user prefers reduced motion, or when the sun is
// down (nothing to animate on the deck).
const CYCLE_MS = 3600;
function tick(t: number) {
  animPhase = (t % CYCLE_MS) / CYCLE_MS;
  if (lastSun?.isUp) renderDeck(canvas, lastSun, lastFraction, animPhase);
  requestAnimationFrame(tick);
}

// --- Init ---
async function init() {
  await loadPlan("./pool.png"); // falls back to schematic if missing
  setToNow();
  // Debug panel is hidden in production; open it with ?debug=1 in the URL.
  if (new URLSearchParams(location.search).has("debug")) {
    initDebugPanel(rerenderAfterEdit);
  }
  if (!prefersReducedMotion) requestAnimationFrame(tick);
}

init();
