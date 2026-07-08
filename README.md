# Pool Sun ☀️ — Gilmore Place

A cute, mobile-first PWA that answers: **is there sun on the outdoor amenity pool right now?**
It computes the real sun position for Gilmore Place (Burnaby, BC) and projects the three
towers' shadows across the pool deck.

## Run

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build (PWA) into dist/
npm run preview  # serve the production build
```

## How it works

- Base layer is the realistic pool render `public/pool.png` (1024×1024, pool-centered).
  Its baked-in transparency checkerboard is flood-filled away at load so the pastel
  backdrop shows through (`knockoutCheckerboard` in [`src/ui.ts`](src/ui.ts)).
- **Sun position** from [SunCalc](https://github.com/mourner/suncalc) for the deck's lat/lng.
- **Shadows** are projected on the flat deck: `length = height / tan(altitude)`, cast opposite
  the sun, blended onto the photo with `multiply` so shade looks real. Only tower height
  *above the ~6-storey podium* casts across the pool.
- **Pool sun %** samples a grid inside the pool polygon and checks shadow coverage.
- **Sunny hours** step the whole day and report the sunny stretches.

### Orientation (the key calibration)

Ground truth from the resident: the sun sets in the **west** and in the evening passes
**behind Tower 2**, whose core sits directly **above** the pool in this render. For T2's
evening shadow to fall down onto the pool, **west points "up"** in the image →
`NORTH_ANGLE_DEG = 90`. Result: pool is sunny all morning/midday and goes into T2's shade
in the late afternoon/evening. ✔

Tower height used: **T2** 64 fl ≈ 216 m (tallest in BC). T1/T3 are off-frame in this
pool-centered crop and aren't modelled here.

## Re-calibrating

Everything tunable lives in [`src/geometry.ts`](src/geometry.ts):
- `PLAN_WIDTH` / `PLAN_HEIGHT` — image pixel size.
- `TOWERS[*].footprint`, `POOL`, `SMALL_POOL` — pixel polygons traced from `pool.png`.
- `POOL_LENGTH_PX` — the main pool's long edge in pixels (real length = 25 m).
- `NORTH_ANGLE_DEG` — on-screen direction of compass-North (west-up here → 90°).
- `PODIUM_HEIGHT_M` — deck offset (~18 m).

If the photo fails to load, the app falls back to a pastel schematic automatically.

## Known limitations (v1)

- Only Tower 2 shades this pool view; other towers/off-plan buildings aren't modelled.
- The deck is treated as flat (planters/pergolas ignored).
- Accuracy depends on the calibration constants above — all exposed in `geometry.ts`.
