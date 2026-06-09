# ⛏ STOCKCOASTER 📈
1-shotted w/ Claude Fable (and made with [Orca 🐋](https://github.com/stablyai/orca))
Try now: https://stockcoaster.vercel.app/

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

- **Altitude = log price.** A 7,000x run reads as cave → plains → foothills →
  alpine → cloud layer → stratosphere → outer space.
- **The lava pit** is the all-time low. Deep drawdowns rain red embers.
- **Confetti + fanfare** at meaningful new all-time highs; gold blocks under the peak.
- **Billboards** are real headlines (green = good news, red = bad), curated and
  fact-checked per ticker; gold arches mark milestones (IPO, splits, $1T club...).
- **Signs of the times**: year markers, station platforms, a minimap chart HUD
  showing where you are in history.

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
