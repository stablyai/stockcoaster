// Voxel terrain ribbon under the track: instanced columns with grass caps,
// trees/flowers, a lava trench carved wherever the price scrapes its all-time
// low, and a gold patch under the all-time-high peak.
import * as THREE from 'three';
import { lambert, emissive } from './textures.js';

const COL = 4;           // column footprint (world units)
const HALF_WIDTH = 44;   // terrain extends this far on each side of the path

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(ix, iz, seed) {
  let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function noise2(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx), v = smooth(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Deterministic terrain height. Used by track supports and terrain alike. */
export function groundHeight(x, z, symbol) {
  const seed = hashStr(symbol || 'STONK');
  const n1 = noise2(x * 0.022 + 31.7, z * 0.022 + 11.3, seed);
  const n2 = noise2(x * 0.006 + 7.1, z * 0.006 + 3.9, seed ^ 0x9e3779b9);
  return 15 + n1 * 5 + n2 * 8;
}

export function buildTerrain(track, T, theme) {
  const group = new THREE.Group();
  const symbol = track.ride.symbol;
  const seed = hashStr(symbol);
  const n = track.controlPoints.length;
  const box = new THREE.BoxGeometry(1, 1, 1);

  const xMin = -24, xMax = (n - 1) * 6 + 24;
  const cols = [];
  const lava = [];
  const decor = { tree: [], dead: [], flower: [], gold: [], ore: [] };

  const peakX = track.ride.stats.maxIndex * 6;

  for (let x = xMin; x <= xMax; x += COL) {
    // nearest data point for trench/meander lookup
    const pi = THREE.MathUtils.clamp(Math.round(x / 6), 0, n - 1);
    const cp = track.controlPoints[pi];
    const trench = track.meta[pi].trench;
    for (let dz = -HALF_WIDTH; dz <= HALF_WIDTH; dz += COL) {
      const z = Math.round((cp.z + dz) / COL) * COL;
      const gh = groundHeight(x, z, symbol);
      const r = hash2(x * 13, z * 7, seed ^ 0x51ed);

      if (trench && Math.abs(z - cp.z) < 10) {
        // carved trench: low scorched floor, lava pools
        const floorY = 7.5 + r * 1.2;
        cols.push({ x, z, h: floorY, kind: 'trench' });
        if (r > 0.72) lava.push({ x, z, y: floorY + 0.1 });
        continue;
      }

      cols.push({ x, z, h: gh, kind: 'grass', r });

      const nearTrack = Math.abs(z - cp.z) < 11;
      if (!nearTrack) {
        if (Math.abs(x - peakX) < 10 && r > 0.45) {
          decor.gold.push({ x, z, y: gh });
        } else if (r > 0.962) {
          (theme.deadTrees ? decor.dead : decor.tree).push({ x, z, y: gh, s: 0.8 + r * 0.5 });
        } else if (r > 0.91) {
          decor.flower.push({ x, z, y: gh, c: theme.flowers[Math.floor(r * 997) % theme.flowers.length] });
        } else if (theme.neonOre && r < 0.025) {
          decor.ore.push({ x, z, y: gh });
        }
      }
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const colC = new THREE.Color();

  // --- column bodies (dirt sides, stretched from y=0 to surface)
  const bodies = new THREE.InstancedMesh(box, lambert(T.dirt), cols.length);
  // --- caps (tintable near-white grass texture)
  const caps = new THREE.InstancedMesh(box, lambert(T.grassTop), cols.length);
  const grassA = new THREE.Color(theme.grass), grassB = new THREE.Color(theme.grassAlt);
  const trenchC = new THREE.Color(0x6b3b34);

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    m.compose(v.set(c.x, c.h / 2, c.z), q, sc.set(COL, c.h, COL));
    bodies.setMatrixAt(i, m);
    m.compose(v.set(c.x, c.h + 0.35, c.z), q, sc.set(COL, 0.7, COL));
    caps.setMatrixAt(i, m);
    if (c.kind === 'trench') {
      caps.setColorAt(i, trenchC);
      bodies.setColorAt(i, colC.set(0x6b4540));
    } else {
      const t = hash2(c.x * 3, c.z * 5, seed ^ 0xabc1) * 0.9;
      caps.setColorAt(i, colC.copy(grassA).lerp(grassB, t));
      bodies.setColorAt(i, colC.set(0xffffff));
    }
  }
  group.add(bodies, caps);

  // --- lava pools
  if (lava.length) {
    const lavaMesh = new THREE.InstancedMesh(box, emissive(T.lava, 0xff6a00, 1.0), lava.length);
    lava.forEach((p, i) => {
      m.compose(v.set(p.x, p.y, p.z), q, sc.set(COL, 0.5, COL));
      lavaMesh.setMatrixAt(i, m);
    });
    group.add(lavaMesh);
  }

  // --- trees: trunks + leaf blobs
  if (decor.tree.length) {
    const trunks = new THREE.InstancedMesh(box, lambert(T.log), decor.tree.length);
    const leaves = new THREE.InstancedMesh(box, lambert(T.leaves), decor.tree.length * 2);
    const leafC = new THREE.Color(theme.foliage);
    decor.tree.forEach((t, i) => {
      m.compose(v.set(t.x, t.y + 1.9 * t.s, t.z), q, sc.set(1.1, 3.8 * t.s, 1.1));
      trunks.setMatrixAt(i, m);
      m.compose(v.set(t.x, t.y + 4.4 * t.s, t.z), q, sc.set(4.4 * t.s, 2.6 * t.s, 4.4 * t.s));
      leaves.setMatrixAt(i * 2, m);
      m.compose(v.set(t.x, t.y + 6.2 * t.s, t.z), q, sc.set(2.4 * t.s, 1.6 * t.s, 2.4 * t.s));
      leaves.setMatrixAt(i * 2 + 1, m);
      leaves.setColorAt(i * 2, leafC);
      leaves.setColorAt(i * 2 + 1, leafC);
    });
    group.add(trunks, leaves);
  }

  // --- dead trees (rust theme): bare trunks with a stub branch
  if (decor.dead.length) {
    const trunks = new THREE.InstancedMesh(box, lambert(T.log), decor.dead.length * 2);
    decor.dead.forEach((t, i) => {
      m.compose(v.set(t.x, t.y + 2.2 * t.s, t.z), q, sc.set(0.9, 4.4 * t.s, 0.9));
      trunks.setMatrixAt(i * 2, m);
      m.compose(v.set(t.x + 0.9, t.y + 3.4 * t.s, t.z), q, sc.set(1.8, 0.6, 0.6));
      trunks.setMatrixAt(i * 2 + 1, m);
    });
    const gray = new THREE.Color(0x7a7a72);
    for (let i = 0; i < decor.dead.length * 2; i++) trunks.setColorAt(i, gray);
    group.add(trunks);
  }

  // --- flowers
  if (decor.flower.length) {
    const flowers = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), decor.flower.length);
    decor.flower.forEach((f, i) => {
      m.compose(v.set(f.x, f.y + 1.0, f.z), q, sc.set(0.45, 0.8, 0.45));
      flowers.setMatrixAt(i, m);
      flowers.setColorAt(i, colC.set(f.c));
    });
    group.add(flowers);
  }

  // --- gold patch under the all-time-high peak
  if (decor.gold.length) {
    const gold = new THREE.InstancedMesh(box, emissive(T.gold, 0xb8860b, 0.35), decor.gold.length);
    decor.gold.forEach((g, i) => {
      m.compose(v.set(g.x, g.y + 0.45, g.z), q, sc.set(COL, 0.9, COL));
      gold.setMatrixAt(i, m);
    });
    group.add(gold);
  }

  // --- glowing crypto ore
  if (decor.ore.length) {
    const ore = new THREE.InstancedMesh(box, emissive(T.neonOre, 0x22d3ee, 0.8), decor.ore.length);
    decor.ore.forEach((o, i) => {
      m.compose(v.set(o.x, o.y + 0.6, o.z), q, sc.set(1.6, 1.2, 1.6));
      ore.setMatrixAt(i, m);
    });
    group.add(ore);
  }

  // --- distant floor so the world never shows void
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(xMax - xMin + 3000, 8, 3000),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.grass).multiplyScalar(0.45) }),
  );
  floor.position.set((xMin + xMax) / 2, 5, 0);
  group.add(floor);

  group.traverse(o => {
    if (o.isInstancedMesh) {
      o.instanceMatrix.needsUpdate = true;
      if (o.instanceColor) o.instanceColor.needsUpdate = true;
      o.frustumCulled = false;
    }
  });
  return group;
}
