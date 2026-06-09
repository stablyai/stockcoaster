// Sky, sun, moon, stars, blocky clouds, planets — everything that changes as
// the price (= altitude) climbs from the lava pit to outer space.
import * as THREE from 'three';
import { sampleAtmosphere, CLOUD_Y } from './zones.js';
import { lambert } from './textures.js';

export class Sky {
  constructor(scene, T, track) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    scene.fog = new THREE.Fog(0x9bc2ff, 40, 500);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.0);
    this.sun.position.set(120, 260, 80);
    scene.add(this.ambient, this.sun);

    // sun disc (blocky)
    this.sunDisc = new THREE.Mesh(
      new THREE.BoxGeometry(26, 26, 2),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3, fog: false }),
    );
    this.group.add(this.sunDisc);

    // moon — only convincing high up
    this.moon = new THREE.Mesh(
      new THREE.BoxGeometry(34, 34, 4),
      new THREE.MeshBasicMaterial({ map: T.moon, fog: false, transparent: true, opacity: 0 }),
    );
    this.group.add(this.moon);

    // stars: fixed shell re-centered on the camera every frame
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(560 + Math.random() * 240);
      if (v.y < -60) v.y = -v.y;
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.group.add(this.stars);

    // planets for the space zone
    this.planets = new THREE.Group();
    const planetDefs = [
      { c: 0xf97316, r: 18, p: [340, 160, -420] },
      { c: 0x60a5fa, r: 26, p: [-380, 220, 360] },
      { c: 0xa78bfa, r: 12, p: [240, 280, 380] },
    ];
    for (const d of planetDefs) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(d.r, 1),
        new THREE.MeshBasicMaterial({ color: d.c, fog: false, transparent: true, opacity: 0 }),
      );
      m.position.fromArray(d.p);
      m.userData.basePos = m.position.clone();
      this.planets.add(m);
    }
    // ringed planet
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(34, 4, 4, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, fog: false, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = Math.PI / 2.4;
    ring.position.copy(this.planets.children[0].position);
    ring.userData.basePos = ring.position.clone();
    this.planets.add(ring);
    this.group.add(this.planets);

    // blocky clouds along the whole track
    const xMax = track.controlPoints[track.controlPoints.length - 1].x;
    const cloudCount = Math.max(14, Math.floor(xMax / 90));
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    const slabs = [];
    for (let i = 0; i < cloudCount; i++) {
      const cx = Math.random() * (xMax + 240) - 120;
      const cz = (Math.random() - 0.5) * 320;
      const cy = CLOUD_Y + (Math.random() - 0.5) * 26;
      const parts = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < parts; k++) {
        slabs.push({
          x: cx + (Math.random() - 0.5) * 26,
          y: cy + (Math.random() - 0.5) * 5,
          z: cz + (Math.random() - 0.5) * 20,
          sx: 18 + Math.random() * 26, sz: 12 + Math.random() * 18,
        });
      }
    }
    this.clouds = new THREE.InstancedMesh(
      cloudGeo,
      new THREE.MeshBasicMaterial({ map: T.cloud, transparent: true, opacity: 0.92 }),
      slabs.length,
    );
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    slabs.forEach((sl, i) => {
      m4.compose(v.set(sl.x, sl.y, sl.z), q, s.set(sl.sx, 4.2, sl.sz));
      this.clouds.setMatrixAt(i, m4);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);

    // shooting star
    this.shooter = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0 }),
    );
    this.group.add(this.shooter);
    this.shootT = -3;

    this.skyColor = new THREE.Color();
  }

  update(dt, camPos, time) {
    const atm = sampleAtmosphere(camPos.y);
    this.skyColor.copy(atm.sky);
    this.scene.background = this.skyColor;
    this.scene.fog.color.copy(atm.fog);
    this.scene.fog.near = camPos.y > 255 ? 120 : 30;
    this.scene.fog.far = atm.fogFar;
    this.sun.intensity = atm.sun;
    this.ambient.intensity = atm.ambient;

    this.stars.material.opacity = atm.starAlpha;
    this.stars.position.copy(camPos);
    this.stars.rotation.y = time * 0.004;

    // celestial bodies track the camera horizontally so they feel infinitely far
    this.sunDisc.position.set(camPos.x + 320, Math.max(140, camPos.y + 120), camPos.z - 360);
    this.sunDisc.lookAt(camPos);
    this.sunDisc.material.color.setHex(camPos.y > 255 ? 0xfff7df : 0xffe9a3);

    const moonA = THREE.MathUtils.clamp((camPos.y - 230) / 60, 0, 1);
    this.moon.material.opacity = moonA;
    this.moon.position.set(camPos.x - 260, camPos.y + 150, camPos.z + 300);
    this.moon.lookAt(camPos);

    const spaceA = atm.spaceness;
    for (const p of this.planets.children) {
      p.material.opacity = spaceA * 0.95;
      p.position.set(
        camPos.x + p.userData.basePos.x,
        Math.max(p.userData.basePos.y, camPos.y - 80) + Math.sin(time * 0.07 + p.id) * 4,
        camPos.z + p.userData.basePos.z,
      );
    }

    // clouds fade out in deep space, drift slowly
    this.clouds.material.opacity = 0.92 * (1 - spaceA * 0.85);
    this.clouds.position.z = Math.sin(time * 0.01) * 8;

    // occasional shooting star up high
    if (atm.starAlpha > 0.6) {
      this.shootT += dt;
      if (this.shootT > 6 + (camPos.x % 5)) this.shootT = 0;
      if (this.shootT >= 0 && this.shootT < 1.1) {
        const k = this.shootT / 1.1;
        this.shooter.material.opacity = Math.sin(k * Math.PI);
        this.shooter.position.set(
          camPos.x - 200 + k * 420,
          camPos.y + 180 - k * 90,
          camPos.z - 240,
        );
        this.shooter.rotation.z = -0.21;
      } else {
        this.shooter.material.opacity = 0;
      }
    } else {
      this.shooter.material.opacity = 0;
    }
  }

  dispose() {
    this.scene.remove(this.group, this.ambient, this.sun);
  }
}
