// Procedural WebAudio: wind, rail clacks, headline dings, ATH fanfare.
// No audio assets; everything is synthesized. Created lazily on first gesture.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.clackTimer = 0;
  }

  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // wind: looped noise through a bandpass we modulate with speed
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.windSrc = this.ctx.createBufferSource();
      this.windSrc.buffer = buf;
      this.windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 400;
      this.windFilter.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
      this.windSrc.start();
    } catch { this.ctx = null; }
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** dt-driven update. `active` = actually riding (not paused/finished/menu). */
  update(dt, speed, active) {
    if (!this.ctx) return;
    if (!active || this.muted) {
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    const k = Math.min(1, speed / 60);
    this.windGain.gain.setTargetAtTime(0.02 + k * 0.22, this.ctx.currentTime, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + k * 900, this.ctx.currentTime, 0.1);

    this.clackTimer -= dt;
    if (this.clackTimer <= 0 && speed > 2) {
      this.clackTimer = Math.max(0.075, 2.4 / speed);
      this.clack(0.05 + k * 0.1);
    }
  }

  /** Hard-stop the ambience (ride end, back to station). */
  stopAmbience() {
    if (this.ctx) this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  clack(vol) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 95 + Math.random() * 50;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  ding() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (const [f, dt0] of [[880, 0], [1320, 0.09]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt0);
      g.gain.exponentialRampToValueAtTime(0.16, t + dt0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt0 + 0.5);
      osc.connect(g).connect(this.master);
      osc.start(t + dt0);
      osc.stop(t + dt0 + 0.55);
    }
  }

  fanfare() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + (i === 3 ? 0.7 : 0.16));
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }

  womp() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.85);
  }
}
