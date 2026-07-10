#!/usr/bin/env node
/**
 * StockCoaster data builder.
 *
 * 1. Fetches full price history for each configured ticker from Yahoo Finance.
 * 2. Merges curated headlines/milestones from data-pipeline/headlines/<SYM>.json.
 * 3. Copies custom time-series rides from data-pipeline/series/*.json
 *    (generic format: { id, name, points: [{ date?, label?, value }], ... }).
 * 4. Writes ride-ready JSON to public/data/<ID>.json plus an index manifest.
 *
 * Run:  npm run data                (everything)
 *       npm run data -- --series-only   (skip Yahoo, rebuild custom series + index)
 * Re-run any time; it overwrites the output files. Cached raw responses live in
 * data-pipeline/.cache so repeated runs don't hammer the API (delete to refresh).
 */
import { mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const HEADLINE_DIR = path.join(__dirname, 'headlines');
const SERIES_DIR = path.join(__dirname, 'series');
const CACHE_DIR = path.join(__dirname, '.cache');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

/**
 * Ticker config. interval/range tuned so each ride has roughly 150-550 track
 * points — long enough to feel like a journey, short enough to stay fun.
 */
const TICKERS = [
  { symbol: 'SPCX',   name: 'SpaceX',           range: '1d', interval: '1m', minPoints: 24 },
  { symbol: 'NVDA',    name: 'NVIDIA',           range: 'max', interval: '1mo' },
  // explicit period bounds: range=max silently coerces 40-year histories to 3mo bars
  { symbol: 'AAPL',    name: 'Apple',            period1: '1984-12-01', interval: '1mo' },
  { symbol: 'MSFT',    name: 'Microsoft',        period1: '1986-03-01', interval: '1mo' },
  { symbol: 'AMZN',    name: 'Amazon',           range: 'max', interval: '1mo' },
  { symbol: 'TSLA',    name: 'Tesla',            range: 'max', interval: '1mo' },
  { symbol: 'META',    name: 'Meta (Facebook)',  range: 'max', interval: '1mo' },
  { symbol: 'NFLX',    name: 'Netflix',          range: 'max', interval: '1mo' },
  { symbol: 'GME',     name: 'GameStop',         period1: '2019-01-01', interval: '1wk' },
  { symbol: 'COIN',    name: 'Coinbase',         range: 'max', interval: '1wk' },
  { symbol: 'PTON',    name: 'Peloton',          range: 'max', interval: '1wk' },
  { symbol: 'ZM',      name: 'Zoom',             range: 'max', interval: '1wk' },
  { symbol: 'SPY',     name: 'S&P 500 (SPY)',    range: 'max', interval: '1mo' },
  { symbol: 'BTC-USD', name: 'Bitcoin',          range: 'max', interval: '1mo' },
];

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function fetchChart(cfg) {
  const key = `${cfg.symbol}-${cfg.interval}-${cfg.period1 ?? cfg.range}`;
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  if (await exists(cacheFile)) {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  }
  const params = new URLSearchParams({ interval: cfg.interval, events: 'div,splits' });
  if (cfg.period1) {
    params.set('period1', String(Math.floor(new Date(cfg.period1).getTime() / 1000)));
    params.set('period2', String(Math.floor(Date.now() / 1000)));
  } else {
    params.set('range', cfg.range);
  }
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cfg.symbol)}?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${cfg.symbol}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.chart?.error) throw new Error(`${cfg.symbol}: ${JSON.stringify(json.chart.error)}`);
  await writeFile(cacheFile, JSON.stringify(json));
  return json;
}

function extractPoints(chartJson, symbol) {
  const result = chartJson.chart?.result?.[0];
  if (!result) throw new Error(`${symbol}: empty chart result`);
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c) || c <= 0) continue;
    const d = new Date(ts[i] * 1000);
    points.push({
      date: d.toISOString().slice(0, 10),
      ...(result.meta?.dataGranularity?.endsWith('m') ? {
        timeLabel: d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
      } : {}),
      t: ts[i],
      close: Math.round(c * 10000) / 10000,
    });
  }
  // Yahoo appends a live-quote point on top of the current in-progress bar;
  // drop the older of the two when the tail gap is far below the bar width.
  if (points.length > 3) {
    const gaps = [];
    for (let i = 1; i < points.length - 1; i++) gaps.push(points[i].t - points[i - 1].t);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const tailGap = points[points.length - 1].t - points[points.length - 2].t;
    if (tailGap < median * 0.55) points.splice(points.length - 2, 1);
  }
  return { points, meta: result.meta ?? {} };
}

async function loadHeadlines(symbol) {
  const file = path.join(HEADLINE_DIR, `${symbol}.json`);
  if (!(await exists(file))) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    console.warn(`  ! bad headline file for ${symbol}: ${e.message}`);
    return null;
  }
}

/** Attach each headline/milestone to the nearest price point index. */
function attachEvents(points, events) {
  if (!events?.length) return [];
  // Tolerance scales with bar width so quarterly bars (~91 days apart) keep
  // mid-quarter events; anything beyond it is outside the ride span.
  const gaps = [];
  for (let i = 1; i < points.length; i++) gaps.push(points[i].t - points[i - 1].t);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] ?? 86400 * 30;
  const intraday = medianGap < 3600;
  const tolerance = intraday
    ? Math.max(300, medianGap * 8) // one-minute IPO tapes should not pin the whole morning to point zero
    : Math.max(86400 * 45, medianGap * 0.65);
  const out = [];
  for (const ev of events) {
    const t = new Date(ev.date).getTime() / 1000;
    if (!Number.isFinite(t)) continue;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].t - t);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > tolerance) continue;
    out.push({ ...ev, pointIndex: best });
  }
  out.sort((a, b) => a.pointIndex - b.pointIndex || (b.importance ?? 1) - (a.importance ?? 1));
  return out;
}

const valOf = p => p.value ?? p.close;

function buildStats(points) {
  let min = Infinity, max = -Infinity, minI = 0, maxI = 0;
  for (let i = 0; i < points.length; i++) {
    const c = valOf(points[i]);
    if (c < min) { min = c; minI = i; }
    if (c > max) { max = c; maxI = i; }
  }
  const first = valOf(points[0]), last = valOf(points[points.length - 1]);
  // Max drawdown
  let peak = -Infinity, mdd = 0, mddI = 0;
  for (let i = 0; i < points.length; i++) {
    peak = Math.max(peak, valOf(points[i]));
    if (peak <= 0) continue;
    const dd = 1 - valOf(points[i]) / peak;
    if (dd > mdd) { mdd = dd; mddI = i; }
  }
  return {
    min, max, minIndex: minI, maxIndex: maxI,
    first, last,
    totalReturn: first > 0 ? last / first - 1 : null,
    multiple: min > 0 ? max / min : null,
    maxDrawdown: mdd, maxDrawdownIndex: mddI,
  };
}

/**
 * Custom time-series rides: any JSON in data-pipeline/series/ is passed
 * through with events attached to point indexes, stats computed, and gets a
 * slot in the index. Points need { value } and ideally { date }.
 */
async function buildCustomSeries() {
  if (!(await exists(SERIES_DIR))) return [];
  const files = (await readdir(SERIES_DIR)).filter(f => f.endsWith('.json')).sort();
  const ids = [];
  for (const f of files) {
    try {
      const json = JSON.parse(await readFile(path.join(SERIES_DIR, f), 'utf8'));
      const id = json.id ?? json.symbol ?? path.basename(f, '.json');
      const points = (json.points ?? []).map(p => ({
        ...p,
        ...(p.t == null && p.date ? { t: Math.floor(Date.parse(p.date) / 1000) } : {}),
      }));
      if (points.length < 2) throw new Error('needs at least 2 points');
      const hasT = points.every(p => Number.isFinite(p.t));
      const keepIndexed = evs => (evs ?? []).filter(e => e.pointIndex != null);
      const ride = {
        ...json,
        id,
        points,
        stats: buildStats(points),
        headlines: hasT ? attachEvents(points, json.headlines) : keepIndexed(json.headlines),
        milestones: hasT ? attachEvents(points, json.milestones) : keepIndexed(json.milestones),
      };
      await writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify(ride));
      ids.push(id);
      console.log(`Series ${id}: ok (${points.length} pts, ${ride.headlines.length} headlines)`);
    } catch (e) {
      console.log(`Series ${f}: FAILED: ${e.message}`);
    }
  }
  return ids;
}

/** Regenerate index.json from whatever ride files exist, in menu order. */
async function writeIndex(order) {
  const index = [];
  for (const id of order) {
    const file = path.join(OUT_DIR, `${id}.json`);
    if (!(await exists(file))) continue;
    const ride = JSON.parse(await readFile(file, 'utf8'));
    const points = ride.points ?? [];
    const stats = ride.stats ?? buildStats(points);
    index.push({
      symbol: ride.id ?? ride.symbol,
      name: ride.name,
      tagline: ride.tagline ?? null,
      theme: ride.theme ?? null,
      points: points.length,
      start: points[0]?.date ?? points[0]?.label ?? null,
      end: points[points.length - 1]?.date ?? points[points.length - 1]?.label ?? null,
      totalReturn: stats.totalReturn ?? null,
      multiple: stats.multiple ?? null,
      maxDrawdown: stats.maxDrawdown,
      headlines: ride.headlines?.length ?? 0,
    });
  }
  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  return index.length;
}

async function main() {
  const seriesOnly = process.argv.includes('--series-only');
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(HEADLINE_DIR, { recursive: true });
  await mkdir(SERIES_DIR, { recursive: true });

  if (!seriesOnly) {
    for (const cfg of TICKERS) {
      process.stdout.write(`Fetching ${cfg.symbol}... `);
      try {
        const raw = await fetchChart(cfg);
        const { points, meta } = extractPoints(raw, cfg.symbol);
        if (points.length < (cfg.minPoints ?? 24)) throw new Error(`only ${points.length} points`);
        const stats = buildStats(points);
        const curated = await loadHeadlines(cfg.symbol);
        const ride = {
          symbol: cfg.symbol,
          name: curated?.companyName || cfg.name,
          currency: meta.currency || 'USD',
          interval: cfg.interval,
          theme: curated?.theme ?? null,
          tagline: curated?.tagline ?? null,
          stats,
          points,
          headlines: attachEvents(points, curated?.headlines),
          milestones: attachEvents(points, curated?.milestones),
        };
        await writeFile(path.join(OUT_DIR, `${cfg.symbol}.json`), JSON.stringify(ride));
        console.log(`ok (${points.length} pts, ${points[0].date} → ${points[points.length - 1].date}, ${ride.headlines.length} headlines)`);
      } catch (e) {
        console.log(`FAILED: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 400)); // be polite to the API
    }
  }

  const seriesIds = await buildCustomSeries();
  const tickerIds = TICKERS.map(t => t.symbol);
  const order = [...tickerIds, ...seriesIds.filter(id => !tickerIds.includes(id))];
  const count = await writeIndex(order);
  console.log(`\nWrote index.json with ${count} rides to public/data/`);
}

main().catch(e => { console.error(e); process.exit(1); });
