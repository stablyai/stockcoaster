// The minecart, the camera rig, and the ride physics.
// Speed is semi-physical: gravity along the track plus a "chain motor" that
// pulls speed back toward cruise so climbs never stall and drops still rip.
import * as THREE from 'three';
import { frameAt, makeFrame, pointIndexAtU } from './track.js';
import { lambert } from './textures.js';

const CRUISE = 17;
const V_MIN = 7;
const V_MAX = 64;

export class Cart {
  constructor(scene, track, T, camera) {
    this.track = track;
    this.camera = camera;
    this.scene = scene;

    this.s = 2;             // arc length along track
    this.v = 10;
    this.speedMult = 1;
    this.paused = false;
    this.finished = false;
    this.frame = makeFrame();
    this.yaw = 0;
    this.pitch = 0;
    this.smoothTan = new THREE.Vector3(1, 0, 0);
    this.smoothUp = new THREE.Vector3(0, 1, 0);
    this.shake = 0;

    // --- minecart mesh
    const g = new THREE.Group();
    const ironMat = lambert(T.iron);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 3.2), ironMat);
    body.position.y = 0.62;
    g.add(body);
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.5, 2.7),
      new THREE.MeshLambertMaterial({ color: 0x7a3030 }),
    );
    inner.position.y = 1.0;
    g.add(inner);
    for (const [wx, wz] of [[-1.1, -1.05], [1.1, -1.05], [-1.1, 1.05], [1.1, 1.05]]) {
      const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.62), ironMat);
      wheel.position.set(wx, 0.18, wz);
      g.add(wheel);
    }
    this.mesh = g;
    scene.add(g);

    this.tmpQ = new THREE.Quaternion();
    this.tmpM = new THREE.Matrix4();
    this.camTarget = new THREE.Vector3();
    this.lookDir = new THREE.Vector3();
  }

  onMouse(dx, dy) {
    this.yaw -= dx * 0.0024;
    this.pitch -= dy * 0.0022;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -2.7, 2.7);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 1.25);
  }

  update(dt) {
    if (this.finished) return;
    const u = THREE.MathUtils.clamp(this.s / this.track.length, 0, 1);
    frameAt(this.track, u, this.frame);

    if (!this.paused) {
      const slope = this.frame.tan.y;
      // gravity along track + motor toward cruise speed
      this.v += (-22 * slope) * dt;
      this.v += (CRUISE * this.speedMult - this.v) * 0.4 * dt;
      this.v = THREE.MathUtils.clamp(this.v, V_MIN, V_MAX * this.speedMult * 1.1);
      this.s += this.v * dt;
      if (this.s >= this.track.length - 1.2) {
        this.s = this.track.length - 1.2;
        this.finished = true;
      }
    }

    // orientation smoothing keeps the camera from jittering on noisy frames
    const k = 1 - Math.exp(-10 * dt);
    this.smoothTan.lerp(this.frame.tan, k).normalize();
    this.smoothUp.lerp(this.frame.up, k).normalize();

    // place cart
    const lat = new THREE.Vector3().crossVectors(this.smoothTan, this.smoothUp).negate().normalize();
    this.tmpM.makeBasis(lat, this.smoothUp, this.smoothTan);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    this.mesh.position.copy(this.frame.pos).addScaledVector(this.frame.up, 0.25);
    this.mesh.quaternion.copy(this.tmpQ);

    // camera: seat position + free look (yaw/pitch relative to travel direction)
    this.shake = Math.min(1, this.v / V_MAX);
    const t = performance.now() * 0.001;
    const shakeAmp = 0.05 * this.shake;
    this.camTarget.copy(this.frame.pos)
      .addScaledVector(this.smoothUp, 2.1)
      .addScaledVector(this.smoothTan, 0.7)
      .addScaledVector(lat, Math.sin(t * 23) * shakeAmp)
      .addScaledVector(this.smoothUp, Math.sin(t * 31) * shakeAmp);
    this.camera.position.copy(this.camTarget);

    this.lookDir.copy(this.smoothTan)
      .applyAxisAngle(this.smoothUp, this.yaw);
    const pitchAxis = new THREE.Vector3().crossVectors(this.smoothUp, this.lookDir).normalize();
    this.lookDir.applyAxisAngle(pitchAxis, -this.pitch);
    this.camTarget.addScaledVector(this.lookDir, 10);
    this.camera.up.copy(this.smoothUp);
    this.camera.lookAt(this.camTarget);

    // dynamic FOV: subtle speed rush
    const targetFov = 72 + 16 * Math.pow(this.v / V_MAX, 1.6);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();
  }

  get u() { return THREE.MathUtils.clamp(this.s / this.track.length, 0, 1); }
  get pointIndex() { return pointIndexAtU(this.track, this.u); }

  restart() {
    this.s = 2;
    this.v = 10;
    this.finished = false;
    this.yaw = 0;
    this.pitch = 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
  }
}
