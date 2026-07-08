# Pool Sun ☀️ — Gilmore Place

A cute, mobile-first PWA that answers: **is there sun on the outdoor amenity pool right now?**
It computes the real sun position for Gilmore Place (Burnaby, BC), projects the three
towers' shadows across the pool deck, and blends in **live weather** so you know whether
the sun will actually reach you — and how it'll feel out there on bare skin.

## Run

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build (tsc + PWA) into dist/
npm run preview  # serve the production build
```

### Docker

A production image (static build served by nginx) is included:

```bash
docker compose up --build   # serves on http://localhost:7685
```

## How it works

- Base layer is the realistic pool render `public/pool.png` (1024×1024, pool-centered).
  Its baked-in transparency checkerboard is flood-filled away at load so the pastel
  backdrop shows through (`knockoutCheckerboard` in [`src/ui.ts`](src/ui.ts)).
- **Sun position** from [SunCalc](https://github.com/mourner/suncalc) for the deck's lat/lng
  ([`src/sun.ts`](src/sun.ts)).
- **Shadows** are projected on the flat deck: `length = height / tan(altitude)`, cast opposite
  the sun. Each tower's ground shadow is the convex hull of its footprint plus the footprint
  translated by the shadow vector, and the union is blended onto the photo with `multiply` so
  shade looks real ([`src/shadows.ts`](src/shadows.ts)). Only tower height *above the ~18 m
  podium* casts across the deck.
- **Deck sun %** samples a grid inside the amenity-deck polygon (`DECK`) and checks shadow
  coverage — it answers "is the amenity area sunny", not just the water ([`src/status.ts`](src/status.ts)).
- **Sunny hours** step the whole day in 10-min increments and report the sunny stretches as a
  ribbon.
- **Live weather** ([`src/weather.ts`](src/weather.ts)) comes from [Open-Meteo](https://open-meteo.com)
  — free, no API key, CORS-enabled, so the app stays fully client-side. Today's cloud cover is
  blended into the geometric reading (`effectiveSun` scales sun by up to 85% under full overcast),
  and the app degrades gracefully to pure geometry if the network is down.
  - **Wind feel** rates how the breeze reads on bare skin (`windFeel`), amplifying the open-air
    forecast by a canyon factor (the deck sits between towers) and shifting for how warm/sunny
    it feels — bucketed into *Barely a breeze / Breezy / Blustery*.
  - **UV feel** scales the UV index by how much direct sun is actually on the deck (`uvFeel`),
    bucketed into *Safe / Moderate / Risky*.

### UI touches

- The page sky gradient and browser theme-color shift with the time of day (`applySky`).
- A sun-direction indicator is drawn on the deck pointing toward the sun's bearing, with a
  gently *breathing* glow/rays (disabled under `prefers-reduced-motion`).
- A small North compass is drawn on the canvas so the orientation can be checked by eye.
- Scrub the time slider or pick any day; **Now** snaps back to the live moment and refreshes weather.

### Orientation (the key calibration)

The North arrow drawn on the render points **up and slightly left** (~5° west of straight up),
so `NORTH_ANGLE_DEG = 355` (screen degrees clockwise from screen-up). That gives:
`up-left = North · up-right = East · down-right = South · down-left = West`. Result: T2 (directly
north of the pool) throws its shadow down onto the deck around midday/afternoon; the on-canvas
compass should match the drawn arrow exactly. Adjust `NORTH_ANGLE_DEG` if it doesn't.

Towers modelled (heights above the podium cast the shade):

| Tower | Floors | Height | Position vs. pool | Drawn? |
|-------|--------|--------|-------------------|--------|
| **T2** | 64 | 216 m (tallest in BC) | directly **north** (top) | pin marker |
| **T1** | 51 | 178 m | directly **south** (bottom) | pin marker |
| **T3** | 43 | 148 m | **east** (off-frame) | shadow only |

Towers are drawn as small labelled map-pins (never big blocks that could cover the pool); the
shadow math always uses each tower's full footprint.

## Re-calibrating

Everything tunable lives in [`src/geometry.ts`](src/geometry.ts):
- `PLAN_WIDTH` / `PLAN_HEIGHT` — image pixel size.
- `TOWERS[*].footprint` / `heightM` / `floors`, `POOL`, `SMALL_POOL`, `DECK` — pixel polygons
  traced from `pool.png` and building heights.
- `POOL_LENGTH_PX` — the main pool's long edge in pixels (real length = `POOL_LENGTH_M` = 25 m);
  together these set `METRES_PER_PIXEL`.
- `NORTH_ANGLE_DEG` — on-screen direction of compass-North (355° here).
- `PODIUM_HEIGHT_M` — deck offset (~18 m).

The wind model constants (`WIND_MODEL`: canyon factor, radiant-sun warmth, neutral temp) live in
[`src/weather.ts`](src/weather.ts).

Open the tuning UI in-browser with `?debug=1` in the URL ([`src/debug.ts`](src/debug.ts)) to nudge
geometry live. If the photo fails to load, the app falls back to a pastel schematic automatically.

## Known limitations

- Only T1/T2 are visible in this pool-centered crop; T3 and any off-plan buildings are either
  shadow-only or unmodelled.
- The deck is treated as flat (planters/pergolas ignored).
- Live weather covers today only, so cloud/wind/UV blending applies when the selected day is today;
  other days fall back to pure geometry.
- Accuracy depends on the calibration constants above — all exposed in `geometry.ts`.
