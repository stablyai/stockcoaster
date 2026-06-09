// Converts a price series into a 3D coaster track.
//  - altitude = log-scaled price (so a 7000x run reads as cave -> space)
//  - the path meanders laterally so it feels like a coaster, not a chart
//  - blocky rails/ties/supports built from instanced boxes
import * as THREE from 'three';
import { groundHeight } from './terrain.js';
import { lambert } from './textures.js';

export const POINT_SPACING = 6;
const UP = new THREE.Vector3(0, 1, 0);
export const Y_BASE = 12;

export function buildTrackData(ride, theme) {
  const pts = ride.points;
  const n = pts.length;

  let logMin = Infinity, logMax = -Infinity;
  for (const p of pts) {
    const l = Math.log(p.close);
    if (l < logMin) logMin = l;
    if (l > logMax) logMax = l;
  }
  const logSpan = Math.max(1e-9, logMax - logMin);
  const multiple = Math.exp(logSpan);
  const ySpanMult = theme?.rockets ? 1.25 : 1.0; // meme stocks get extra altitude
  const ySpan = THREE.MathUtils.clamp(95 * Math.log10(multiple) * ySpanMult, 70, 318);

  // Raw altitudes, then two smoothing passes: keeps the macro chart shape but
  // turns per-bar volatility sawtooth into rideable hills. HUD prices stay raw.
  let ys = [];
  for (let i = 0; i < n; i++) {
    const p = (Math.log(pts[i].close) - logMin) / logSpan;
    ys.push(Y_BASE + Math.pow(p, 1.12) * ySpan);
  }
  for (let pass = 0; pass < 2; pass++) {
    const t = ys.slice();
    for (let i = 1; i < n - 1; i++) ys[i] = 0.25 * t[i - 1] + 0.5 * t[i] + 0.25 * t[i + 1];
  }

  const controlPoints = [];
  const meta = [];
  let runningMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const c = pts[i].close;
    const p = (Math.log(c) - logMin) / logSpan;
    const x = i * POINT_SPACING;
    const y = ys[i];
    const z = 34 * Math.sin(x * 0.0045 + 1.7) + 14 * Math.sin(x * 0.013 + 0.5);
    controlPoints.push(new THREE.Vector3(x, y, z));

    const prevMax = runningMax;
    runningMax = Math.max(runningMax, c);
    meta.push({
      normPrice: p,
      drawdown: prevMax > 0 ? Math.max(0, 1 - c / prevMax) : 0,
      isATH: c >= runningMax && i > 0,
      gain: i > 0 ? c / pts[i - 1].close - 1 : 0,
      trench: false, // filled in below once we know ground height
    });
  }
  for (let i = 0; i < n; i++) {
    const cp = controlPoints[i];
    meta[i].trench = cp.y < groundHeight(cp.x, cp.z, ride.symbol) + 2.5;
  }

  // ATH parties: a new all-time high only deserves confetti after a real dip
  // (>=15% drawdown since the previous high), plus the ride's absolute peak.
  let ddSinceATH = 0;
  for (let i = 1; i < n; i++) {
    if (meta[i].isATH) {
      meta[i].athParty = ddSinceATH >= 0.15;
      ddSinceATH = 0;
    } else {
      ddSinceATH = Math.max(ddSinceATH, meta[i].drawdown);
      meta[i].athParty = false;
    }
  }
  meta[0].athParty = false;
  if (ride.stats?.maxIndex > 0) meta[ride.stats.maxIndex].athParty = true;

  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal', 0.5);
  curve.arcLengthDivisions = Math.max(2000, n * 12);
  const length = curve.getLength();

  // u (arc-length param 0..1) at each control point, for sign placement & HUD.
  const divs = curve.arcLengthDivisions;
  const lengths = curve.getLengths(divs);
  const total = lengths[lengths.length - 1];
  const uAtPoint = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const j = Math.min(divs, Math.round(t * divs));
    uAtPoint.push(lengths[j] / total);
  }

  // Precomputed frame table: position, tangent, lateral, up (with banking).
  const samples = Math.max(600, n * 6);
  const frames = sampleFrames(curve, samples);

  return { ride, pts, controlPoints, meta, curve, length, uAtPoint, frames, ySpan, samples };
}

function sampleFrames(curve, samples) {
  const pos = [], tan = [], lat = [], up = [];
  let prevLat = null;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    let l;
    if (prevLat === null) {
      l = new THREE.Vector3().crossVectors(t, UP);
      if (l.lengthSq() < 1e-6) l.set(0, 0, 1);
      l.normalize();
    } else {
      // Parallel transport, then bleed accumulated roll back toward horizontal.
      l = prevLat.clone().addScaledVector(t, -prevLat.dot(t));
      if (l.lengthSq() < 1e-6) l = prevLat.clone();
      l.y *= 0.82;
      l.normalize();
    }
    prevLat = l;
    pos.push(p); tan.push(t); lat.push(l);
    up.push(new THREE.Vector3().crossVectors(l, t).normalize());
  }
  // Banking: roll into turns based on yaw rate, smoothed.
  const bank = new Float32Array(samples + 1);
  for (let i = 1; i < samples; i++) {
    const a = Math.atan2(tan[i - 1].z, tan[i - 1].x);
    const b = Math.atan2(tan[i + 1].z, tan[i + 1].x);
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    bank[i] = THREE.MathUtils.clamp(d * 6, -0.55, 0.55);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < samples; i++) bank[i] = (bank[i - 1] + bank[i] + bank[i + 1]) / 3;
  }
  const q = new THREE.Quaternion();
  for (let i = 0; i <= samples; i++) {
    if (Math.abs(bank[i]) > 1e-4) {
      q.setFromAxisAngle(tan[i], bank[i]);
      lat[i].applyQuaternion(q);
      up[i].applyQuaternion(q);
    }
  }
  return { pos, tan, lat, up };
}

/** Interpolated frame at arc-length parameter u in [0,1]. Writes into `out`. */
export function frameAt(track, u, out) {
  const { pos, tan, lat, up } = track.frames;
  const f = THREE.MathUtils.clamp(u, 0, 1) * track.samples;
  const i0 = Math.min(track.samples - 1, Math.floor(f));
  const i1 = i0 + 1;
  const t = f - i0;
  out.pos.lerpVectors(pos[i0], pos[i1], t);
  out.tan.lerpVectors(tan[i0], tan[i1], t).normalize();
  out.lat.lerpVectors(lat[i0], lat[i1], t).normalize();
  out.up.lerpVectors(up[i0], up[i1], t).normalize();
  return out;
}

export function makeFrame() {
  return { pos: new THREE.Vector3(), tan: new THREE.Vector3(), lat: new THREE.Vector3(), up: new THREE.Vector3() };
}

/** Data point index nearest to arc parameter u (for HUD date/price). */
export function pointIndexAtU(track, u) {
  const arr = track.uAtPoint;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < u) lo = mid + 1; else hi = mid;
  }
  if (lo > 0 && Math.abs(arr[lo - 1] - u) < Math.abs(arr[lo] - u)) lo--;
  return lo;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _negLat = new THREE.Vector3();

function setInstance(mesh, idx, pos, tanV, latV, upV, scale) {
  // lat/up/tan from sampleFrames form a LEFT-handed triple (lat×up = -tan);
  // negate the lateral so the basis is a pure rotation, or the quaternion
  // extraction degenerates and every rail/tie renders world-axis-aligned.
  _basis.makeBasis(_negLat.copy(latV).negate(), upV, tanV);
  _q.setFromRotationMatrix(_basis);
  _s.copy(scale);
  _m.compose(pos, _q, _s);
  mesh.setMatrixAt(idx, _m);
}

export function buildTrackMeshes(track, T, theme) {
  const group = new THREE.Group();
  const { pos, tan, lat, up } = track.frames;
  const S = track.samples;
  const box = new THREE.BoxGeometry(1, 1, 1);

  // --- rails: one small box per sample segment per side
  const railMat = lambert(T.iron);
  const rails = new THREE.InstancedMesh(box, railMat, S * 2);
  const segP = new THREE.Vector3(), segT = new THREE.Vector3(), segL = new THREE.Vector3(), segU = new THREE.Vector3();
  let ri = 0;
  for (let i = 0; i < S; i++) {
    const segLen = pos[i].distanceTo(pos[i + 1]) + 0.12;
    segP.addVectors(pos[i], pos[i + 1]).multiplyScalar(0.5);
    segT.subVectors(pos[i + 1], pos[i]).normalize();
    segL.addVectors(lat[i], lat[i + 1]).normalize();
    segU.addVectors(up[i], up[i + 1]).normalize();
    for (const side of [-1, 1]) {
      const p = segP.clone().addScaledVector(segL, side * 1.0).addScaledVector(segU, 0.12);
      setInstance(rails, ri++, p, segT, segL, segU, _s.set(0.3, 0.24, segLen));
    }
  }
  rails.count = ri;
  group.add(rails);

  // --- ties: planks every ~2 samples
  const tieCount = Math.ceil(S / 2);
  const ties = new THREE.InstancedMesh(box, lambert(T.planks), tieCount);
  let ti = 0;
  for (let i = 0; i < S; i += 2) {
    setInstance(ties, ti++, pos[i], tan[i], lat[i], up[i], _s.set(2.9, 0.22, 1.0));
  }
  ties.count = ti;
  group.add(ties);

  // --- support pillars: every 6th data point, stacked log blocks down to ground
  const pillarPositions = [];
  for (let i = 0; i < track.controlPoints.length; i += 6) {
    const cp = track.controlPoints[i];
    if (track.meta[i].trench) continue;
    const gy = groundHeight(cp.x, cp.z, track.ride.symbol);
    if (cp.y - gy < 3) continue;
    pillarPositions.push({ cp, gy });
  }
  let blockTotal = 0;
  for (const p of pillarPositions) blockTotal += Math.ceil((p.cp.y - 0.8 - p.gy) / 1.7) + 1;
  if (blockTotal > 0) {
    const pillars = new THREE.InstancedMesh(box, lambert(T.log), blockTotal);
    let pi = 0;
    for (const { cp, gy } of pillarPositions) {
      const topY = cp.y - 0.8;
      const count = Math.ceil((topY - gy) / 1.7) + 1;
      for (let k = 0; k < count; k++) {
        const y = Math.min(topY, gy + k * 1.7 + 0.85);
        _m.compose(
          _s.set(cp.x, y, cp.z).clone(),
          _q.identity(),
          new THREE.Vector3(1.5, 1.75, 1.5),
        );
        pillars.setMatrixAt(pi++, _m);
      }
    }
    pillars.count = pi;
    group.add(pillars);
  }

  group.traverse(o => { if (o.isInstancedMesh) { o.instanceMatrix.needsUpdate = true; o.frustumCulled = false; } });
  return group;
}
