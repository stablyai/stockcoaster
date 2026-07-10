# ⛏ STOCKCOASTER 📈
1-shotted w/ Claude Fable (and made with [Orca 🐋](https://github.com/stablyai/orca))
## Demo
Try now: https://stockcoaster.vercel.app/

## Overview
A Minecraft-like browser game where you ride rollercoasters that are **real stock
charts**. Altitude is the (log-scaled) price: start NVIDIA in a lava trench at its
1999 all-time low and climb into outer space — stars, moon, planets — as it joins
the trillion-dollar club. Ride Peloton the other way down. Billboard signs along
the track show **real, dated headlines** so you understand the journey as you live it.

## Quick start

```bash
npm install
npm run data    # fetch real price history from Yahoo Finance + merge curated headlines
npm run dev     # open the printed URL (default http://localhost:5173)
```

`npm run build` produces a static site in `dist/` (serve it next to `public/data/`,
which is copied in automatically). Tip: jump straight onto a coaster with
`?ride=NVDA` (add `&go=1` to skip the click-to-ride screen).

## The rides

13 coasters, each themed by its story: NVDA, AAPL, MSFT, AMZN, TSLA, META, NFLX,
GME (meme), COIN & BTC-USD (crypto), PTON & ZM (boom-bust rust), SPY (scenic index).
Plus TOKENS — a demo ride built from a *non-stock* series (a startup's daily Claude
token usage), because the engine now takes any time series (see below).

- **Altitude = log price.** A 7,000x run reads as cave → plains → foothills →
  alpine → cloud layer → stratosphere → outer space.
- **The lava pit** is the all-time low. Deep drawdowns rain red embers.
- **Confetti + fanfare** at meaningful new all-time highs; gold blocks under the peak.
- **Billboards** are real headlines (green = good news, red = bad), curated and
  fact-checked per ticker; gold arches mark milestones (IPO, splits, $1T club...).
- **Signs of the times**: year markers, station platforms, a minimap chart HUD
  showing where you are in history.

## Ride any time series

The coaster engine is data-agnostic: a ride is just a JSON time series. Two ways in:

1. **Drop a file in `data-pipeline/series/`** and run `npm run data:series` — it's
   copied to `public/data/`, events get attached to the nearest points, and it
   appears in the station menu (that's how the TOKENS demo ride is built, from
   `data-pipeline/series/TOKENS.json`).
2. **Point the app at a URL**: `?data=<url>` fetches a series JSON and boards it
   directly (e.g. `?data=data/TOKENS.json&go=1`). Add `&ride=<ID>` to load it but
   start a different ride.

The generic format:

```jsonc
{
  "id": "TOKENS",                     // short ride id (menu card / HUD / terrain seed)
  "name": "Claude Token Usage",
  "tagline": "Optional menu blurb",
  "theme": "crypto",                  // optional, one of src/themes.js (default: classic)
  "scale": "log",                     // optional: "log" | "linear"; auto-detected if omitted
  "unit": { "prefix": "", "suffix": " tok" },   // optional value formatting
  "points": [                         // the only required bits: 2+ points with values
    { "date": "2026-01-01", "value": 1500000 },  // date optional; "label" also accepted
    { "date": "2026-01-02", "value": 1730000 }
  ],
  "headlines":  [{ "date": "2026-01-02", "title": "...", "sentiment": "pos", "importance": 2 }],
  "milestones": [{ "date": "2026-01-02", "label": "1M A DAY" }]
}
```

Altitude is the (log- or linear-) scaled value; drawdowns still rain embers, new
highs still get confetti, and the all-time low still carves the lava trench —
whatever the series measures. The legacy stock format (`points[].close`,
`currency`) is still accepted; everything is normalized in `src/series.js`.

## Controls

| Input | Action |
|---|---|
| Mouse | Look around (pointer lock, or drag if denied) |
| `SPACE` | Pause |
| `1`–`4` | Ride speed |
| `M` | Mute |
| `C` | Cinematic mode (hide HUD) |
| `R` | Restart ride |
| `ESC` | Pause overlay / back to station |

## How it's built

- **Engine**: [Three.js](https://threejs.org) + Vite, no other runtime deps.
  Everything is procedural: 16×16 canvas pixel textures, instanced voxel terrain,
  block rails/ties/supports, WebAudio synth (wind, rail clacks, dings, fanfares).
- **Data pipeline** (`data-pipeline/build-data.mjs`): pulls full price history per
  ticker from Yahoo Finance's chart API (monthly/weekly bars tuned per ticker),
  computes stats (max drawdown, total return, multiple), attaches curated
  headlines/milestones (`data-pipeline/headlines/*.json`) to the nearest bar, and
  writes ride JSON to `public/data/`. Responses are cached in
  `data-pipeline/.cache` — delete it to refresh prices.
- **Headlines** were curated and adversarially fact-checked (dates verified to the
  month) — ~490 of them across the 13 rides.

## Tests

```bash
npx vite --port 5179 --strictPort   # in one terminal
node test/smoke.mjs                 # headless browser smoke test + screenshots
```
