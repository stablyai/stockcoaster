// Procedural 16x16 pixel-art textures, Minecraft style. No external assets.
import * as THREE from 'three';

function makeCanvas(draw, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Deterministic PRNG so textures look the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, size, colors, seed = 1) {
  const r = rng(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function buildTextures() {
  const T = {};

  // Near-white grass so InstancedMesh instanceColor can tint per biome/theme.
  T.grassTop = makeCanvas((ctx, s) => speckle(ctx, s, ['#ffffff', '#f2f2f2', '#e4e4e4', '#d6d6d6'], 7));
  T.dirt = makeCanvas((ctx, s) => speckle(ctx, s, ['#9b6a44', '#8a5d3b', '#7c5234', '#a8754d'], 11));
  T.grassSide = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#9b6a44', '#8a5d3b', '#7c5234', '#a8754d'], 13);
    const r = rng(5);
    for (let x = 0; x < s; x++) {
      const h = 3 + Math.floor(r() * 3);
      for (let y = 0; y < h; y++) {
        ctx.fillStyle = ['#ffffff', '#ececec', '#dcdcdc'][Math.floor(r() * 3)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  T.stone = makeCanvas((ctx, s) => speckle(ctx, s, ['#8a8a8a', '#7d7d7d', '#919191', '#737373'], 17));
  T.deepRock = makeCanvas((ctx, s) => speckle(ctx, s, ['#4a3535', '#553b3b', '#3e2c2c', '#5e4040'], 19));
  T.lava = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#ff7b00', '#ff5200', '#ffa200', '#e63900'], 23);
    const r = rng(29);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = '#ffe680';
      ctx.fillRect(Math.floor(r() * s), Math.floor(r() * s), 2, 1);
    }
  });
  T.sand = makeCanvas((ctx, s) => speckle(ctx, s, ['#e7d8a7', '#dbcb96', '#efe2b8', '#d2c188'], 31));
  T.snow = makeCanvas((ctx, s) => speckle(ctx, s, ['#ffffff', '#f1f5fb', '#e6ecf5'], 37));
  T.log = makeCanvas((ctx, s) => {
    const r = rng(41);
    for (let x = 0; x < s; x++) {
      const shade = ['#6b4a2a', '#5e4125', '#785430'][Math.floor(r() * 3)];
      ctx.fillStyle = shade;
      ctx.fillRect(x, 0, 1, s);
      if (x % 4 === 0) { ctx.fillStyle = '#4c351e'; ctx.fillRect(x, 0, 1, s); }
    }
  });
  T.planks = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#b08850', '#a37c46', '#bc9258'], 43);
    ctx.fillStyle = '#7c5e34';
    for (let y = 3; y < s; y += 4) ctx.fillRect(0, y, s, 1);
  });
  T.leaves = makeCanvas((ctx, s) => speckle(ctx, s, ['#ffffff', '#ededed', '#d9d9d9', '#c9c9c9'], 47));
  T.iron = makeCanvas((ctx, s) => speckle(ctx, s, ['#5b6168', '#50555c', '#666c74', '#454a50'], 53));
  T.gold = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#fcd34d', '#fbbf24', '#f59e0b', '#fde68a'], 59);
    ctx.fillStyle = '#fff7cc';
    ctx.fillRect(3, 3, 2, 2); ctx.fillRect(10, 9, 2, 2);
  });
  T.moon = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#e5e7eb', '#d1d5db', '#f3f4f6'], 61);
    const r = rng(67);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#9ca3af';
      const x = Math.floor(r() * (s - 3)), y = Math.floor(r() * (s - 3));
      ctx.fillRect(x, y, 2 + Math.floor(r() * 2), 2);
    }
  });
  T.cloud = makeCanvas((ctx, s) => speckle(ctx, s, ['#ffffff', '#fafafa', '#f2f2f2'], 71));
  T.neonOre = makeCanvas((ctx, s) => {
    speckle(ctx, s, ['#1e1b4b', '#312e81', '#1e293b'], 73);
    const r = rng(79);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = ['#22d3ee', '#a78bfa', '#34d399'][Math.floor(r() * 3)];
      ctx.fillRect(Math.floor(r() * (s - 2)), Math.floor(r() * (s - 2)), 2, 2);
    }
  });

  return T;
}

/** Material helpers — Lambert keeps the flat blocky look and is cheap. */
export function lambert(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, ...opts });
}

export function emissive(map, color, intensity = 1) {
  return new THREE.MeshLambertMaterial({
    map, emissive: new THREE.Color(color), emissiveIntensity: intensity, emissiveMap: map,
  });
}
