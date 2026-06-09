// STOCKCOASTER — boot, station menu, ride lifecycle, input, game loop.
import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { getTheme } from './themes.js';
import { buildTrackData, buildTrackMeshes } from './track.js';
import { buildTerrain } from './terrain.js';
import { buildBillboards, buildStations } from './billboards.js';
import { Sky } from './sky.js';
import { Cart } from './cart.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { GameAudio } from './audio.js';
import { sampleAtmosphere } from './zones.js';
import { fmtPct } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2200);
const T = buildTextures();
const hud = new Hud();
const audio = new GameAudio();

const state = {
  mode: 'menu',          // 'menu' | 'riding'
  rides: new Map(),      // symbol -> ride json
  scene: null,
  sky: null,
  cart: null,
  effects: null,
  track: null,
  ride: null,
  groups: [],
  paused: false,
  seenHeadlines: new Set(),
  seenConfetti: new Set(),
  lastDrawdownDeep: false,
  time: 0,
};

// ---------------------------------------------------------------- boot
async function boot() {
  let index;
  try {
    index = await (await fetch('data/index.json')).json();
  } catch {
    document.getElementById('menu').innerHTML =
      '<h1>STOCKCOASTER</h1><p style="text-align:center;color:#f87171;font-size:16px;margin-top:40px">' +
      'No ride data found. Run <code style="color:#fcd34d">npm run data</code> first, then reload.</p>';
    return;
  }
  const rides = await Promise.all(index.map(async e => {
    try { return await (await fetch(`data/${e.symbol}.json`)).json(); }
    catch { return null; }
  }));
  for (const r of rides) if (r) state.rides.set(r.symbol, r);
  buildMenu(index.filter(e => state.rides.has(e.symbol)));

  // ?ride=NVDA jumps straight onto a coaster (also used by automated tests)
  const params = new URLSearchParams(location.search);
  const auto = params.get('ride');
  if (auto && state.rides.has(auto.toUpperCase())) {
    await startRide(auto.toUpperCase());
    if (params.has('go')) {
      showLockHint(false);
      state.paused = false;
    }
    const at = parseFloat(params.get('at'));
    if (Number.isFinite(at) && at > 0 && at < 1) {
      state.cart.s = at * state.track.length;
    }
  }
}

function difficulty(ride) {
  let wild = 0;
  for (let i = 1; i < ride.points.length; i++) {
    wild = Math.max(wild, Math.abs(ride.points[i].close / ride.points[i - 1].close - 1));
  }
  const score = ride.stats.maxDrawdown + wild;
  if (score < 0.8) return ['SCENIC', '#86efac'];
  if (score < 1.4) return ['THRILL', '#fde047'];
  if (score < 1.95) return ['EXTREME', '#fb923c'];
  return ['NIGHTMARE', '#f87171'];
}

function buildMenu(index) {
  const menu = document.getElementById('menu');
  menu.innerHTML = `
    <h1>⛏ STOCKCOASTER 📈</h1>
    <div class="subtitle">EVERY CHART IS A ROLLERCOASTER. CHOOSE YOUR RIDE.</div>
    <div id="rides"></div>
    <div class="help-line">
      mouse — look around · <kbd>SPACE</kbd> pause · <kbd>1</kbd>-<kbd>4</kbd> speed · <kbd>M</kbd> sound · <kbd>C</kbd> hide HUD · <kbd>R</kbd> restart · <kbd>ESC</kbd> back<br/>
      altitude = price (log scale) · read the signs — they're real headlines · the lava pit is the all-time low · space is for the trillion-dollar club
    </div>`;
  const grid = document.getElementById('rides');
  for (const entry of index) {
    const ride = state.rides.get(entry.symbol);
    const [diff, diffColor] = difficulty(ride);
    const card = document.createElement('div');
    card.className = 'ride-card panel';
    const up = ride.stats.totalReturn >= 0;
    const years = ((new Date(ride.points[ride.points.length - 1].date) - new Date(ride.points[0].date)) / 31557600000).toFixed(0);
    card.innerHTML = `
      <div class="difficulty" style="background:${diffColor}">${diff}</div>
      <h2>${esc(ride.symbol)}</h2>
      <div class="co">${esc(ride.name)} · ${years} YRS · ${ride.headlines?.length ?? 0} HEADLINES</div>
      <canvas width="264" height="74"></canvas>
      <div class="tagline">${esc(ride.tagline ?? '')}</div>
      <div class="stats">
        <span>RETURN <b class="${up ? 'up' : 'down'}">${fmtPct(ride.stats.totalReturn)}</b></span>
        <span>WORST DIP <b class="down">-${Math.round(ride.stats.maxDrawdown * 100)}%</b></span>
      </div>`;
    drawPreview(card.querySelector('canvas'), ride);
    card.addEventListener('click', () => startRide(ride.symbol));
    grid.appendChild(card);
  }
}

function drawPreview(cv, ride) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);
  const pts = ride.points;
  let lmin = Infinity, lmax = -Infinity;
  for (const p of pts) {
    const l = Math.log(p.close);
    if (l < lmin) lmin = l;
    if (l > lmax) lmax = l;
  }
  const span = Math.max(1e-9, lmax - lmin);
  ctx.strokeStyle = ride.stats.totalReturn >= 0 ? '#4ade80' : '#f87171';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = 3 + (i / (pts.length - 1)) * (W - 6);
    const y = H - 4 - ((Math.log(pts[i].close) - lmin) / span) * (H - 8);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- ride lifecycle
async function startRide(symbol) {
  const ride = state.rides.get(symbol);
  if (!ride) return;
  document.getElementById('loading').style.display = 'flex';
  // let the loading overlay actually paint before the synchronous scene build
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  disposeRide();

  const scene = new THREE.Scene();
  const theme = getTheme(ride.theme);
  const track = buildTrackData(ride, theme);

  const groups = [
    buildTrackMeshes(track, T, theme),
    buildTerrain(track, T, theme),
    buildBillboards(track, T, theme, ride),
    buildStations(track, T, theme, ride),
  ];
  for (const g of groups) scene.add(g);

  state.scene = scene;
  state.ride = ride;
  state.track = track;
  state.groups = groups;
  state.sky = new Sky(scene, T, track);
  state.cart = new Cart(scene, track, T, camera);
  state.effects = new Effects(scene);
  state.mode = 'riding';
  state.paused = false;
  state.seenHeadlines = new Set();
  state.seenConfetti = new Set();
  state.lastDrawdownDeep = false;

  document.getElementById('menu').style.display = 'none';
  document.getElementById('loading').style.display = 'none';
  hud.show(ride);
  hud.hideSummary();
  showLockHint(true);
}

const SHARED_TEXTURES = new Set(Object.values(T));

function disposeRide() {
  if (!state.scene) return;
  // dispose while everything is still in the scene graph, then detach
  state.scene.traverse(o => {
    if (o.isInstancedMesh) o.dispose(); // frees instanceMatrix/instanceColor GPU buffers
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.map && !SHARED_TEXTURES.has(m.map)) m.map.dispose(); // per-ride sign canvases
        m.dispose();
      }
    }
  });
  state.sky?.dispose();
  state.cart?.dispose();
  state.effects?.dispose();
  state.scene = null;
  state.cart = null;
  state.sky = null;
  state.effects = null;
  state.track = null;
}

function exitToMenu() {
  document.exitPointerLock?.();
  audio.stopAmbience();
  state.mode = 'menu';
  disposeRide();
  hud.hide();
  hud.hideSummary();
  showLockHint(false);
  document.getElementById('menu').style.display = 'block';
}

function finishRide() {
  document.exitPointerLock?.();
  audio.stopAmbience();
  showLockHint(false);
  state.paused = false;
  hud.showSummary(state.ride);
  if (state.ride.stats.totalReturn >= 0) audio.fanfare();
  else audio.womp();
}

// ---------------------------------------------------------------- input
const lockHint = document.getElementById('lock-hint');
function showLockHint(v) {
  lockHint.style.display = v ? 'flex' : 'none';
  if (v) state.paused = true;
}

let hadLock = false;     // pointer lock was successfully acquired at least once
let dragLook = false;    // fallback when pointer lock is unavailable/denied
let dragging = false;

lockHint.addEventListener('click', () => {
  audio.resume();
  try {
    const p = canvas.requestPointerLock?.();
    p?.catch?.(() => { dragLook = true; });
    if (!canvas.requestPointerLock) dragLook = true;
  } catch { dragLook = true; }
  showLockHint(false);
  state.paused = false;
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    hadLock = true;
    return;
  }
  // Only treat lock loss as "pause" if we actually had the lock (ESC pressed).
  // If lock never engaged (headless/denied), keep riding with drag-look.
  if (hadLock && state.mode === 'riding' && !state.cart?.finished) {
    showLockHint(true);
  } else if (state.mode === 'riding') {
    dragLook = true;
  }
  hadLock = false;
});

document.addEventListener('mousemove', e => {
  if (!state.cart) return;
  if (document.pointerLockElement === canvas) {
    state.cart.onMouse(e.movementX, e.movementY);
  } else if (dragLook && dragging) {
    state.cart.onMouse(e.movementX, e.movementY);
  }
});
canvas.addEventListener('mousedown', () => { dragging = true; });
document.addEventListener('mouseup', () => { dragging = false; });

// click the HUD minimap to jump anywhere in the ride
hud.onSeek = index => {
  if (state.mode !== 'riding' || !state.track || !state.cart) return;
  const track = state.track;
  const i = Math.min(index, track.uAtPoint.length - 1);
  state.cart.s = Math.max(2, Math.min(track.length - 2, track.uAtPoint[i] * track.length));
  state.cart.v = 12;
  state.cart.finished = false;
  hud.hideSummary();
  // everything before the target is "already seen" (no toast flood);
  // everything after re-arms so a replayed section celebrates again
  state.seenHeadlines = new Set(
    (state.ride.headlines ?? [])
      .filter(h => h.pointIndex < i - 1)
      .map(h => h.pointIndex + ':' + h.title),
  );
  state.seenConfetti = new Set();
  for (let k = 0; k < i; k++) state.seenConfetti.add(k);
  // clicking the map while the pause overlay is up counts as "ride"
  if (lockHint.style.display === 'flex') {
    audio.resume();
    showLockHint(false);
    state.paused = false;
  }
};

document.addEventListener('keydown', e => {
  if (state.mode !== 'riding') return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (lockHint.style.display !== 'flex') state.paused = !state.paused;
      break;
    case 'Digit1': state.cart.speedMult = 0.6; break;
    case 'Digit2': state.cart.speedMult = 1.0; break;
    case 'Digit3': state.cart.speedMult = 1.7; break;
    case 'Digit4': state.cart.speedMult = 2.6; break;
    case 'KeyM': audio.toggleMute(); break;
    case 'KeyC': hud.toggleCinematic(); break;
    case 'KeyR':
      state.cart.restart();
      state.seenHeadlines.clear();
      state.seenConfetti.clear();
      hud.hideSummary();
      if (document.pointerLockElement !== canvas) showLockHint(true);
      break;
    case 'Escape':
      // browser releases pointer lock on its own; second ESC (overlay visible) exits
      if (lockHint.style.display === 'flex' || state.cart?.finished) exitToMenu();
      break;
  }
});

document.getElementById('btn-again').addEventListener('click', () => {
  state.cart.restart();
  state.seenHeadlines.clear();
  state.seenConfetti.clear();
  hud.hideSummary();
  showLockHint(true);
});
document.getElementById('btn-station').addEventListener('click', exitToMenu);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- ride events
const _back = new THREE.Vector3();
function rideEvents(dt) {
  const { cart, ride, track } = state;
  const idx = cart.pointIndex;
  const meta = track.meta[idx];

  // headline toasts + ding
  for (const h of ride.headlines ?? []) {
    if (h.pointIndex <= idx && !state.seenHeadlines.has(h.pointIndex + ':' + h.title)) {
      if (idx - h.pointIndex <= 2) {
        hud.toast(h);
        audio.ding();
      }
      state.seenHeadlines.add(h.pointIndex + ':' + h.title);
    }
  }

  // confetti + fanfare at meaningful new all-time highs
  if (meta.athParty && !state.seenConfetti.has(idx)) {
    state.seenConfetti.add(idx);
    state.effects.confetti(cart.frame.pos);
    hud.flashATH();
    audio.fanfare();
  }

  // womp when first diving deep underwater (drawdown > 50%)
  const deep = meta.drawdown > 0.5;
  if (deep && !state.lastDrawdownDeep) audio.womp();
  state.lastDrawdownDeep = deep;

  // rocket exhaust on monster green candles (meme magic)
  if (meta.gain > 0.35 && !cart.paused) {
    _back.copy(cart.frame.tan).negate();
    state.effects.rocketBoost(cart.frame.pos, _back);
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;

  if (state.mode !== 'riding' || !state.scene) return;

  const wasFinished = state.cart.finished;
  state.cart.paused = state.paused;
  state.cart.update(dt);
  if (state.cart.finished && !wasFinished) finishRide();

  const camY = camera.position.y;
  const atm = sampleAtmosphere(camY);
  state.sky.update(dt, camera.position, state.time);

  const idx = state.cart.pointIndex;
  const meta = state.track.meta[idx];
  if (!state.paused) {
    state.effects.ambient(dt, camera.position, camY, meta.drawdown, atm.spaceness);
    rideEvents(dt);
  }
  state.effects.update(dt);

  hud.update(state.ride, idx, atm, state.cart.v, state.paused, dt);
  audio.update(dt, state.cart.v, !state.paused && !state.cart.finished);

  renderer.render(state.scene, camera);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

boot();
loop();
