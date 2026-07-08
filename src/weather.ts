// Live weather + today's hourly forecast for the pool, from Open-Meteo.
//
// Geometry (see sun.ts / status.ts) tells us whether the sun *could* reach the
// pool. Weather tells us whether it *actually will* — clouds and rain don't show
// up in shadow math. We fetch the current conditions plus today's hourly cloud
// cover and blend that into the sun reading (see effectiveSun in status.ts).
//
// Open-Meteo is free, needs no API key, and is CORS-enabled, so this stays a
// fully client-side PWA — no backend, no secrets. Every path is null-tolerant:
// if the network is down the app degrades to pure geometry.

import { LAT, LNG } from "./geometry";

export type CurrentWeather = {
  /** Air temperature, °C. */
  tempC: number;
  /** "Feels like" temperature (humidity + open-air wind), °C. */
  apparentC: number;
  /** Cloud cover as a 0..1 fraction. */
  cloudCover: number;
  /** WMO weather-interpretation code. */
  code: number;
  /** Wind speed, km/h. */
  windKmh: number;
  /** Precipitation in the last interval, mm. */
  precipMm: number;
  /** UV index (0..11+). */
  uvIndex: number;
  /** true when it's daytime at the location. */
  isDay: boolean;
};

export type HourWeather = {
  /** Minute-of-day (0..1439) for this hourly sample. */
  minute: number;
  tempC: number;
  /** "Feels like" temperature (humidity + open-air wind), °C. */
  apparentC: number;
  /** Cloud cover as a 0..1 fraction. */
  cloudCover: number;
  /** Wind speed, km/h. */
  windKmh: number;
  /** UV index (0..11+). */
  uvIndex: number;
  code: number;
  /** Chance of precipitation, 0..1. */
  precipProb: number;
};

export type Weather = {
  current: CurrentWeather;
  hourly: HourWeather[];
  /** epoch ms when this was fetched (for staleness checks). */
  fetchedAt: number;
};

const ENDPOINT =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}` +
  `&current=temperature_2m,apparent_temperature,cloud_cover,weather_code,wind_speed_10m,precipitation,uv_index,is_day` +
  `&hourly=temperature_2m,apparent_temperature,cloud_cover,weather_code,wind_speed_10m,precipitation_probability,uv_index` +
  `&timezone=auto&forecast_days=1`;

/** "2026-07-05T16:00" → minute-of-day (16*60). Ignores the date part. */
function timeStrToMinute(t: string): number {
  const time = t.split("T")[1] ?? "00:00";
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Fetch current + today's hourly weather for the pool. Returns null on any
 * failure (offline, API down, bad payload) so callers fall back to geometry.
 */
export async function fetchWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const j: any = await res.json();
    const c = j.current;
    const h = j.hourly;
    if (!c || !h || !Array.isArray(h.time)) return null;

    const current: CurrentWeather = {
      tempC: c.temperature_2m,
      apparentC: c.apparent_temperature ?? c.temperature_2m,
      cloudCover: (c.cloud_cover ?? 0) / 100,
      code: c.weather_code ?? 0,
      windKmh: c.wind_speed_10m ?? 0,
      precipMm: c.precipitation ?? 0,
      uvIndex: c.uv_index ?? 0,
      isDay: c.is_day === 1,
    };

    const hourly: HourWeather[] = h.time.map((t: string, i: number) => ({
      minute: timeStrToMinute(t),
      tempC: h.temperature_2m?.[i] ?? current.tempC,
      apparentC: h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? current.apparentC,
      cloudCover: (h.cloud_cover?.[i] ?? 0) / 100,
      windKmh: h.wind_speed_10m?.[i] ?? current.windKmh,
      uvIndex: h.uv_index?.[i] ?? current.uvIndex,
      code: h.weather_code?.[i] ?? 0,
      precipProb: (h.precipitation_probability?.[i] ?? 0) / 100,
    }));

    return { current, hourly, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

/** Nearest hourly sample to a given minute-of-day, or null if none. */
export function hourAt(weather: Weather, minute: number): HourWeather | null {
  let best: HourWeather | null = null;
  let bestDist = Infinity;
  for (const hr of weather.hourly) {
    const d = Math.abs(hr.minute - minute);
    if (d < bestDist) {
      bestDist = d;
      best = hr;
    }
  }
  return best;
}

/**
 * Map a WMO weather-interpretation code to a kawaii emoji + short label.
 * https://open-meteo.com/en/docs — "Weather variable documentation".
 */
export function weatherCodeInfo(
  code: number,
  isDay = true,
): { icon: string; label: string } {
  if (code === 0) return { icon: isDay ? "☀️" : "🌙", label: "Clear" };
  if (code === 1) return { icon: isDay ? "🌤️" : "🌙", label: "Mostly clear" };
  if (code === 2) return { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorm" };
  return { icon: "🌡️", label: "—" };
}

// --- Wind on the deck -------------------------------------------------------
// The pool deck sits in an urban canyon between three towers, so wind is
// funneled stronger than the open-air forecast. And the ask is how it *feels*
// on bare skin — the same wind is refreshing on a warm sunny afternoon and
// biting in shade on a cool morning. These constants are tunable (the debug
// panel exposes canyonFactor) so the model can be calibrated against reality.
export const WIND_MODEL = {
  canyonFactor: 1.5, // deck wind ÷ open-air wind
  sunRadiantC: 5, // °C of felt warmth direct sun adds to bare skin
  neutralC: 22, // bare-skin-neutral reference apparent temp (°C)
};

export type WindFeel = {
  level: 1 | 2 | 3;
  label: string;
  icon: string;
  note: string;
  /** Estimated wind between the towers, km/h (mean × canyonFactor). */
  canyonKmh: number;
};

/**
 * Rate how the wind feels on bare skin, combining canyon-amplified mean wind,
 * apparent air temperature, and how much direct sun is on the deck (effSun 0..1).
 *
 * Warmer/sunnier skin tolerates more wind before it reads as chilling, so we
 * shift the effective wind DOWN by how far felt warmth exceeds the neutral
 * reference (and UP when it's cool/shaded). The 3 buckets are the text levels
 * the user asked for.
 */
export function windFeel(
  meanWindKmh: number,
  apparentTempC: number,
  effSun: number,
): WindFeel {
  const canyonKmh = meanWindKmh * WIND_MODEL.canyonFactor;
  const warmthC = apparentTempC + WIND_MODEL.sunRadiantC * clamp01(effSun);
  const adjWind = canyonKmh - (warmthC - WIND_MODEL.neutralC);

  if (adjWind < 10) {
    return {
      level: 1,
      label: "Barely a breeze",
      icon: "🍃",
      note: "Feels calm and warm on bare skin — comfy for laying out.",
      canyonKmh,
    };
  }
  if (adjWind < 22) {
    return {
      level: 2,
      label: "Breezy",
      icon: "🌬️",
      note: "You'll feel a cool draft — a bit goosebumpy in the shade.",
      canyonKmh,
    };
  }
  return {
    level: 3,
    label: "Blustery",
    icon: "🥶",
    note: "Gusty canyon wind — it'll bite bare skin; keep a towel handy.",
    canyonKmh,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// --- UV on the deck ---------------------------------------------------------
// Same 3-level text treatment as the wind: sunbathers care whether it's safe to
// lay out, not the raw index number. Buckets follow the WHO UV scale (0-2 low,
// 3-5 moderate, 6+ high). When the pool is in shade the effective UV is much
// lower, so we scale the index by how much direct sun is on the deck (effSun).
export type UvFeel = {
  level: 1 | 2 | 3;
  label: string;
  icon: string;
  note: string;
  /** Effective UV on the deck (index × sun exposure), rounded for display. */
  effectiveUv: number;
};

export function uvFeel(uvIndex: number, effSun: number): UvFeel {
  const eff = uvIndex * clamp01(effSun);
  if (eff < 3) {
    return {
      level: 1,
      label: "Safe",
      icon: "🟢",
      note: "Low UV — bare skin's fine out here for now.",
      effectiveUv: Math.round(eff),
    };
  }
  if (eff < 6) {
    return {
      level: 2,
      label: "Moderate",
      icon: "🟡",
      note: "Some burn risk on bare skin — sunscreen's a good idea.",
      effectiveUv: Math.round(eff),
    };
  }
  return {
    level: 3,
    label: "Risky",
    icon: "🔴",
    note: "Strong UV — bare skin will burn fast; cover up or seek shade.",
    effectiveUv: Math.round(eff),
  };
}
