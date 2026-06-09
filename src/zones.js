// Altitude bands: as the track (= log price) climbs, the world changes around you.
// sampleAtmosphere(y) interpolates sky/fog/lighting between bands.
import * as THREE from 'three';

export const GROUND_Y = 20;          // nominal terrain surface height
export const CAVE_Y = GROUND_Y - 3;  // track below this carves a lava trench
export const CLOUD_Y = 195;          // blocky cloud layer altitude
export const SPACE_Y = 300;

// [altitude, zone label, sky color, fog color, fog far, sun intensity, ambient intensity]
const BANDS = [
  [-10, 'THE PIT',          '#27060a', '#3a0d08', 70,   0.25, 0.5],
  [16,  'THE PIT',          '#43130f', '#552012', 110,  0.4,  0.55],
  [24,  'GREEN PLAINS',     '#7fb8ff', '#cfe5ff', 520,  1.0,  0.75],
  [70,  'THE FOOTHILLS',    '#74a9f5', '#c2dbf7', 560,  1.0,  0.72],
  [125, 'ALPINE HEIGHTS',   '#5f8fe0', '#a9c4ea', 620,  1.05, 0.68],
  [185, 'CLOUD LAYER',      '#4a6fc4', '#ffffff', 420,  1.1,  0.78],
  [225, 'STRATOSPHERE',     '#2b3a86', '#7d8fd0', 760,  1.0,  0.6],
  [275, 'EDGE OF SPACE',    '#141a4a', '#2a3060', 900,  0.9,  0.5],
  [320, 'OUTER SPACE',      '#04040c', '#070716', 1400, 0.8,  0.45],
];

const ZONE_ICONS = {
  'THE PIT': '🕳️', 'GREEN PLAINS': '🌿', 'THE FOOTHILLS': '🌲',
  'ALPINE HEIGHTS': '🏔️', 'CLOUD LAYER': '☁️', 'STRATOSPHERE': '🎈',
  'EDGE OF SPACE': '🌠', 'OUTER SPACE': '🌌',
};

const _sky = new THREE.Color(), _fog = new THREE.Color();
const _a = new THREE.Color(), _b = new THREE.Color();

export function sampleAtmosphere(y) {
  let i = 0;
  while (i < BANDS.length - 1 && y > BANDS[i + 1][0]) i++;
  const cur = BANDS[i];
  const next = BANDS[Math.min(i + 1, BANDS.length - 1)];
  const span = Math.max(1e-6, next[0] - cur[0]);
  const t = cur === next ? 0 : THREE.MathUtils.clamp((y - cur[0]) / span, 0, 1);

  _a.set(cur[2]); _b.set(next[2]); _sky.copy(_a).lerp(_b, t);
  _a.set(cur[3]); _b.set(next[3]); _fog.copy(_a).lerp(_b, t);

  // Label flips halfway through the transition.
  const label = t < 0.5 ? cur[1] : next[1];
  return {
    sky: _sky, fog: _fog,
    fogFar: THREE.MathUtils.lerp(cur[4], next[4], t),
    sun: THREE.MathUtils.lerp(cur[5], next[5], t),
    ambient: THREE.MathUtils.lerp(cur[6], next[6], t),
    label,
    icon: ZONE_ICONS[label] ?? '',
    starAlpha: THREE.MathUtils.clamp((y - 215) / 90, 0, 1),
    spaceness: THREE.MathUtils.clamp((y - 255) / 80, 0, 1),
  };
}
