// News billboards, milestone arches, year markers and the start/end stations.
// Sign faces are canvas textures drawn at low res and upscaled -> pixel look.
import * as THREE from 'three';
import { lambert } from './textures.js';
import { groundHeight } from './terrain.js';
import { fmtDate } from './series.js';

const SENTIMENT = {
  pos: { frame: '#15803d', accent: '#4ade80', tag: 'GOOD NEWS' },
  neg: { frame: '#b91c1c', accent: '#f87171', tag: 'BAD NEWS' },
  neutral: { frame: '#52525b', accent: '#d4d4d8', tag: 'NEWS' },
};

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? line + ' ' + w : w;
    if (ctx.measureText(probe).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

function panelTexture({ title, dateLabel, sentiment = 'neutral', big = false }) {
  const s = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const W = 128;

  // Measure first, then grow the sign canvas vertically. Long IPO headlines used
  // to overflow a fixed 80px texture; now every wrapped line gets real pixels.
  const measure = document.createElement('canvas');
  measure.width = W; measure.height = 1;
  const mctx = measure.getContext('2d');
  const fontPx = big && String(title).length < 64 ? 10 : 9;
  const lineH = fontPx + 3;
  mctx.font = `bold ${fontPx}px monospace`;
  const lines = wrap(mctx, title, W - 18);
  const top = dateLabel ? 26 : 14;
  const bottom = 8;
  const H = Math.max(80, top + lines.length * lineH + bottom);

  const lo = document.createElement('canvas');
  lo.width = W; lo.height = H;
  const ctx = lo.getContext('2d');

  ctx.fillStyle = '#cdb27c';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 7) { ctx.fillStyle = 'rgba(124,94,52,.28)'; ctx.fillRect(0, y, W, 1); }
  ctx.fillStyle = s.frame;
  ctx.fillRect(0, 0, W, 4); ctx.fillRect(0, H - 4, W, 4);
  ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H);

  ctx.fillStyle = '#3b2a16';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  if (dateLabel) {
    ctx.fillStyle = s.frame;
    ctx.fillRect(W / 2 - 30, 7, 60, 11);
    ctx.fillStyle = '#fff';
    ctx.fillText(dateLabel, W / 2, 16);
  }
  ctx.fillStyle = '#2b1d0e';
  ctx.font = `bold ${fontPx}px monospace`;
  let y = top + fontPx;
  for (const l of lines) { ctx.fillText(l, W / 2, y); y += lineH; }

  // upscale 4x with no smoothing -> chunky pixels
  const hi = document.createElement('canvas');
  hi.width = W * 4; hi.height = H * 4;
  const hctx = hi.getContext('2d');
  hctx.imageSmoothingEnabled = false;
  hctx.drawImage(lo, 0, 0, hi.width, hi.height);

  const tex = new THREE.CanvasTexture(hi);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.aspect = W / H;
  tex.userData.lineCount = lines.length;
  return tex;
}

function makeSign(tex, w, h, T, frameColor = 0x6b4a2a) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.22),
    [
      lambert(T.planks), lambert(T.planks), lambert(T.planks), lambert(T.planks),
      new THREE.MeshBasicMaterial({ map: tex }), // front face (+z): unlit so it's readable everywhere
      lambert(T.planks),
    ],
  );
  g.add(panel);
  const postMat = new THREE.MeshLambertMaterial({ color: frameColor });
  // posts run from panel center down to ~3.6 below the panel, hidden behind it
  const postLen = h / 2 + 3.6;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, postLen, 0.38), postMat);
    post.position.set(side * (w / 2 - 0.35), -(h / 4 + 1.8), -0.16);
    g.add(post);
  }
  g.userData.panelWidth = w;
  g.userData.panelHeight = h;
  return g;
}

export function buildBillboards(track, T, theme, ride) {
  const group = new THREE.Group();
  const n = track.controlPoints.length;
  const lookTarget = new THREE.Vector3();

  const place = (sign, pointIndex, side, dist, lift) => {
    const i = THREE.MathUtils.clamp(pointIndex, 0, n - 1);
    const cp = track.controlPoints[i];
    const prev = track.controlPoints[Math.max(0, i - 3)];
    const tangent = new THREE.Vector3().subVectors(cp, prev);
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    tangent.normalize();
    const lat = new THREE.Vector3(-tangent.z, 0, tangent.x);
    sign.position.copy(cp).addScaledVector(lat, side * dist);
    const surfaceY = groundHeight(sign.position.x, sign.position.z, ride.id);
    const panelH = sign.userData.panelHeight ?? 4.6;
    // Low launch-day tracks can sit inside a trench; signs should read above the nearby terrain, not drown in it.
    sign.position.y = Math.max(cp.y + lift, surfaceY + panelH * 0.5 + 4.1);
    // face a spot on the track ~4 points back, where the rider reads it from
    const back = track.controlPoints[Math.max(0, i - 4)];
    lookTarget.set(back.x, sign.position.y, back.z);
    sign.lookAt(lookTarget);
    group.add(sign);
  };

  // --- headline signs, alternating sides; same-point signs fan out so they
  // never overlap (opposite side first, then further out and higher)
  let side = 1;
  const stacked = new Map(); // pointIndex -> how many signs already placed there
  for (const h of ride.headlines ?? []) {
    if (h.pointIndex == null) continue;
    const count = stacked.get(h.pointIndex) ?? 0;
    stacked.set(h.pointIndex, count + 1);
    const imp = h.importance ?? 1;
    const launchOpening = theme.launchDay && h.pointIndex < 12;
    const baseScale = imp === 3 ? 1.45 : imp === 2 ? 1.18 : 1.0;
    // The first SPCX minutes are dense; keep opening signs readable without giant panels filling the camera.
    const scale = launchOpening ? Math.min(baseScale, 0.92) : baseScale;
    const tex = panelTexture({
      title: h.title,
      dateLabel: h.date ? fmtDate(h.date) : null,
      sentiment: h.sentiment,
      big: imp >= 3,
    });
    const signW = 7.4 * scale;
    const signH = signW / (tex.userData.aspect || 1.6);
    const sign = makeSign(tex, signW, signH, T, theme.signFrame);
    const s = count % 2 === 0 ? side : -side;
    const tier = launchOpening ? 0 : Math.floor(count / 2);
    const visualIndex = launchOpening ? Math.min(n - 1, h.pointIndex + 5) : h.pointIndex;
    const dist = launchOpening ? 13.5 + imp * 0.35 : 9.5 + imp * 0.8 + tier * 7;
    const lift = launchOpening ? 9.5 + scale + count * 0.55 : 2.4 + scale + tier * 3.4;
    place(sign, visualIndex, s, dist, lift);
    if (count === 0) side *= -1;
  }

  // --- milestone arches spanning the track
  for (const ms of ride.milestones ?? []) {
    if (ms.pointIndex == null) continue;
    const i = ms.pointIndex;
    const cp = track.controlPoints[i];
    const next = track.controlPoints[Math.min(n - 1, i + 2)];
    const dir = new THREE.Vector3().subVectors(next, cp);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    const lat = new THREE.Vector3(-dir.z, 0, dir.x);

    const arch = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({
      color: 0xfcd34d, emissive: 0x8a6508, emissiveIntensity: 0.55,
    });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9.2, 0.7), gold);
      post.position.copy(lat).multiplyScalar(s * 5.4);
      post.position.y = 1.8;
      arch.add(post);
    }
    const lo = document.createElement('canvas'); // banner texture
    lo.width = 128; lo.height = 24;
    const ctx = lo.getContext('2d');
    ctx.fillStyle = '#1c1917'; ctx.fillRect(0, 0, 128, 24);
    ctx.fillStyle = '#fcd34d'; ctx.fillRect(0, 0, 128, 2); ctx.fillRect(0, 22, 128, 2);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#fde68a';
    const label = String(ms.label).slice(0, 26);
    ctx.fillText(label, 64, 16);
    const hi = document.createElement('canvas');
    hi.width = 512; hi.height = 96;
    const hctx = hi.getContext('2d');
    hctx.imageSmoothingEnabled = false;
    hctx.drawImage(lo, 0, 0, 512, 96);
    const btex = new THREE.CanvasTexture(hi);
    btex.magFilter = THREE.NearestFilter;
    btex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 2.2, 0.3),
      [gold, gold, gold, gold,
        new THREE.MeshBasicMaterial({ map: btex }),
        new THREE.MeshBasicMaterial({ map: btex })],
    );
    banner.position.y = 5.5;
    arch.add(banner);

    const archGround = groundHeight(cp.x, cp.z, ride.id);
    arch.position.set(cp.x, Math.max(cp.y, archGround + 1.4), cp.z);
    const yaw = Math.atan2(dir.x, dir.z);
    arch.rotation.y = yaw;
    group.add(arch);
  }

  // --- year marker posts (only for series with dated points)
  if (ride.hasDates) {
    const span = (new Date(ride.points[n - 1].date).getTime() - new Date(ride.points[0].date).getTime()) / 31557600000;
    const step = span > 24 ? 5 : 1;
    let lastYear = null;
    for (let i = 0; i < n; i++) {
      const year = Number(ride.points[i].date.slice(0, 4));
      if (year !== lastYear) {
        lastYear = year;
        if (i === 0 || year % step !== 0) continue;
        const tex = panelTexture({ title: String(year), sentiment: 'neutral', big: true });
        const sign = makeSign(tex, 3.0, 1.9, T, theme.signFrame);
        place(sign, i, (year % 2) * 2 - 1, 6.5, 1.1);
      }
    }
  }

  return group;
}

/** Wooden platform + big title sign at the start, buffer stop at the end. */
export function buildStations(track, T, theme, ride) {
  const group = new THREE.Group();
  const n = track.controlPoints.length;

  const mkPlatform = (cp, tangent) => {
    const g = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.BoxGeometry(16, 1.1, 12), lambert(T.planks));
    plat.position.set(0, -1.35, 0);
    g.add(plat);
    const postMat = lambert(T.log);
    for (const [px, pz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 14, 1), postMat);
      leg.position.set(px, -8, pz);
      g.add(leg);
      const torch = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.9, 0.4),
        new THREE.MeshLambertMaterial({ color: 0xffc14d, emissive: 0xff9d00, emissiveIntensity: 1.4 }),
      );
      torch.position.set(px, 0.6, pz);
      g.add(torch);
    }
    g.position.set(cp.x, cp.y, cp.z);
    g.rotation.y = Math.atan2(tangent.x, tangent.z) - Math.PI / 2;
    return g;
  };

  const t0 = new THREE.Vector3().subVectors(track.controlPoints[1], track.controlPoints[0]).setY(0).normalize();
  const start = mkPlatform(track.controlPoints[0], t0);
  const titleTex = panelTexture({
    title: `${ride.id} — ${ride.name}`,
    dateLabel: 'NOW BOARDING',
    sentiment: 'pos',
    big: true,
  });
  const titleSign = makeSign(titleTex, 9, 5.4, T, theme.signFrame);
  titleSign.position.set(0, 4.6, -5.4);
  titleSign.rotation.y = Math.PI;
  start.add(titleSign);
  group.add(start);

  const tEnd = new THREE.Vector3().subVectors(
    track.controlPoints[n - 1], track.controlPoints[n - 2],
  ).setY(0).normalize();
  const end = mkPlatform(track.controlPoints[n - 1], tEnd);
  group.add(end);

  // buffer stop
  const stop = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 1.2), lambert(T.iron));
  const endCp = track.controlPoints[n - 1];
  stop.position.copy(endCp).addScaledVector(tEnd, 5);
  stop.position.y = endCp.y + 0.8;
  group.add(stop);

  return group;
}
