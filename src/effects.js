// Particle effects: ATH confetti, crash embers, alpine snow, space sparkles,
// rocket exhaust on monster green candles. One instanced-box pool, CPU updated.
import * as THREE from 'three';

const MAX = 700;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ transparent: true }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.scene = scene;

    this.parts = [];
    for (let i = 0; i < MAX; i++) {
      this.parts.push({
        alive: false,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, maxLife: 1, size: 0.3, color: new THREE.Color(),
        gravity: 0, spin: Math.random() * 6,
      });
    }
    this.cursor = 0;
    this.snowAcc = 0;
    this.emberAcc = 0;
    this.sparkleAcc = 0;
  }

  spawn(pos, vel, color, size, life, gravity = 0) {
    const p = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.color.set(color);
    p.size = size;
    p.life = 0;
    p.maxLife = life;
    p.gravity = gravity;
  }

  /** Golden/green confetti explosion at an all-time high. */
  confetti(pos) {
    const colors = [0xfcd34d, 0x4ade80, 0xf472b6, 0x60a5fa, 0xfb923c, 0xffffff];
    for (let i = 0; i < 130; i++) {
      _v.randomDirection().multiplyScalar(6 + Math.random() * 16);
      _v.y = Math.abs(_v.y) + 6;
      this.spawn(pos, _v.clone(), colors[i % colors.length], 0.34, 1.6 + Math.random() * 1.4, -14);
    }
  }

  /** Green rocket exhaust behind the cart on big up-moves. */
  rocketBoost(pos, backDir) {
    for (let i = 0; i < 3; i++) {
      _v.copy(backDir).multiplyScalar(14 + Math.random() * 8);
      _v.x += (Math.random() - 0.5) * 5;
      _v.y += (Math.random() - 0.5) * 5;
      _v.z += (Math.random() - 0.5) * 5;
      this.spawn(pos, _v.clone(), Math.random() < 0.7 ? 0x4ade80 : 0xfde047, 0.26, 0.6, 0);
    }
  }

  /** Ambient weather around the camera, driven by altitude + drawdown. */
  ambient(dt, camPos, altY, drawdown, spaceness) {
    // snow in the alpine band
    if (altY > 120 && altY < 250) {
      this.snowAcc += dt * 26;
      while (this.snowAcc >= 1) {
        this.snowAcc -= 1;
        _v.set(camPos.x + (Math.random() - 0.5) * 80, camPos.y + 16 + Math.random() * 10, camPos.z + (Math.random() - 0.5) * 80);
        this.spawn(_v, new THREE.Vector3((Math.random() - 0.5) * 2, -7 - Math.random() * 3, (Math.random() - 0.5) * 2), 0xffffff, 0.22, 4.4, 0);
      }
    }
    // red embers when deep in a drawdown (crash sections)
    if (drawdown > 0.45) {
      this.emberAcc += dt * (10 + drawdown * 26);
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        _v.set(camPos.x + (Math.random() - 0.5) * 60, camPos.y - 8 + Math.random() * 8, camPos.z + (Math.random() - 0.5) * 60);
        this.spawn(_v, new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 3),
          Math.random() < 0.6 ? 0xf97316 : 0xef4444, 0.17, 3.2, 0);
      }
    }
    // glittering stardust in space
    if (spaceness > 0.4) {
      this.sparkleAcc += dt * 14;
      while (this.sparkleAcc >= 1) {
        this.sparkleAcc -= 1;
        _v.set(camPos.x + (Math.random() - 0.5) * 70, camPos.y + (Math.random() - 0.5) * 40, camPos.z + (Math.random() - 0.5) * 70);
        this.spawn(_v, new THREE.Vector3(0, (Math.random() - 0.5) * 1.4, 0),
          Math.random() < 0.5 ? 0xc4b5fd : 0xe0f2fe, 0.16, 2.6, 0);
      }
    }
  }

  update(dt) {
    let count = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; continue; }
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const fade = 1 - p.life / p.maxLife;
      _q.setFromAxisAngle(_v.set(0.4, 0.8, 0.2).normalize(), p.spin + p.life * 5);
      _m.compose(p.pos, _q, _s.setScalar(p.size * (0.4 + 0.6 * fade)));
      this.mesh.setMatrixAt(count, _m);
      this.mesh.setColorAt(count, _c.copy(p.color));
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
