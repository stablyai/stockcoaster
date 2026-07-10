// Canonical series layer: normalizes any ride JSON into the shape the engine
// consumes, so the coaster can render any time series, not just stock prices.
//
// Accepted inputs:
//  - legacy stock format: { symbol, currency, points: [{ date, close }], stats, ... }
//  - generic format:      { id, name, tagline, theme,
//                           scale: 'log' | 'linear',        // optional, auto-detected
//                           unit: { prefix, suffix },       // optional, e.g. { suffix: ' tok' }
//                           points: [{ date?, label?, value }],
//                           headlines: [{ date? | pointIndex, title, sentiment, importance }],
//                           milestones: [{ date? | pointIndex, label }] }
//
// Output ride shape (superset of input):
//   id, points (each with .value, .label), stats, scale,
//   norm(v) -> 0..1 altitude, spanScore (drives track height span),
//   fmtValue(v) -> display string, up (ended >= started), currency?

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return `${MONTHS[(Number(m[2]) - 1 + 12) % 12]} ${m[1]}`;
}

export function fmtMoney(v, currency = 'USD') {
  const sym = currency === 'USD' ? '$' : currency + ' ';
  if (v >= 1000) return sym + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1) return sym + v.toFixed(2);
  return sym + v.toFixed(4);
}

export function fmtPct(p) {
  const v = p * 100;
  const sign = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 10000) return `${sign}${(v / 1000).toFixed(1)}k%`;
  return `${sign}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;
}

function abbrev(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(a < 1e13 ? 2 : 1) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(a < 1e10 ? 2 : 1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a < 1e7 ? 2 : 1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  if (a === 0) return '0';
  return v.toFixed(4);
}

function makeFormatter(json) {
  if (json.currency) return v => fmtMoney(v, json.currency);
  const prefix = json.unit?.prefix ?? '';
  const suffix = json.unit?.suffix ?? '';
  return v => prefix + abbrev(v) + suffix;
}

export function buildStats(values) {
  let min = Infinity, max = -Infinity, minI = 0, maxI = 0, minPositive = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) { min = v; minI = i; }
    if (v > max) { max = v; maxI = i; }
    if (v > 0 && v < minPositive) minPositive = v;
  }
  if (!Number.isFinite(minPositive)) minPositive = 1;
  const first = values[0], last = values[values.length - 1];
  let peak = -Infinity, mdd = 0, mddI = 0;
  for (let i = 0; i < values.length; i++) {
    peak = Math.max(peak, values[i]);
    if (peak > 0) {
      const dd = 1 - values[i] / peak;
      if (dd > mdd) { mdd = dd; mddI = i; }
    }
  }
  return {
    min, max, minIndex: minI, maxIndex: maxI, minPositive,
    first, last,
    totalReturn: first > 0 ? last / first - 1 : null,
    multiple: min > 0 ? max / min : null,
    maxDrawdown: mdd, maxDrawdownIndex: mddI,
  };
}

function makeScale(stats, name) {
  if (name === 'log') {
    // non-positive values are clamped to the smallest positive one
    const floor = stats.minPositive;
    const lmin = Math.log(Math.max(Math.min(stats.min > 0 ? stats.min : floor, floor), 1e-12));
    const lmax = Math.log(Math.max(stats.max, floor));
    const span = Math.max(1e-9, lmax - lmin);
    return v => Math.min(1, Math.max(0, (Math.log(Math.max(v, floor)) - lmin) / span));
  }
  const span = Math.max(1e-9, stats.max - stats.min);
  return v => Math.min(1, Math.max(0, (v - stats.min) / span));
}

/** Attach events (headlines/milestones) to the nearest point by date. */
function attachEvents(points, events) {
  if (!events?.length) return [];
  const times = points.map(p => p.t ?? (p.date ? Date.parse(p.date) / 1000 : null));
  const out = [];
  for (const ev of events) {
    if (ev.pointIndex != null) {
      if (ev.pointIndex >= 0 && ev.pointIndex < points.length) out.push(ev);
      continue;
    }
    const t = ev.date ? Date.parse(ev.date) / 1000 : NaN;
    if (!Number.isFinite(t)) continue;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (times[i] == null) continue;
      const d = Math.abs(times[i] - t);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) out.push({ ...ev, pointIndex: best });
  }
  out.sort((a, b) => a.pointIndex - b.pointIndex || (b.importance ?? 1) - (a.importance ?? 1));
  return out;
}

export function normalizeRide(json) {
  const id = json.id ?? json.symbol;
  const points = (json.points ?? []).map((p, i) => ({
    ...p,
    value: p.value ?? p.close,
    label: p.label ?? (p.date ? fmtDate(p.date) : `#${i + 1}`),
  }));
  const values = points.map(p => p.value);
  const stats = buildStats(values);
  const scale = json.scale ?? (stats.min > 0 && stats.max / stats.min >= 4 ? 'log' : 'linear');
  const spanScore = scale === 'log' ? Math.log10(Math.max(1.0001, stats.max / stats.minPositive)) : 1.8;
  return {
    ...json,
    id,
    points,
    stats,
    scale,
    spanScore,
    hasDates: points.length > 0 && points.every(p => p.date),
    norm: makeScale(stats, scale),
    fmtValue: makeFormatter(json),
    up: stats.last >= stats.first,
    headlines: attachEvents(points, json.headlines),
    milestones: attachEvents(points, json.milestones),
  };
}
