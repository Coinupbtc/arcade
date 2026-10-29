/* BRIDGEWRIGHT — WebAudio synth. No asset files. */
(function (root) {
  'use strict';

  const A = {
    ctx: null, muted: false, lastCreak: 0,

    init() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    env(node, t0, a, d, peak) {
      const g = node.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(0.0001, t0);
      g.exponentialRampToValueAtTime(peak, t0 + a);
      g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    },

    tone(freq, dur, type, vol, slide) {
      if (this.muted || !this.ctx) return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
      o.connect(g); g.connect(this.ctx.destination);
      this.env(g, t0, 0.006, dur, vol || 0.12);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    noise(dur, vol, filterFreq, type) {
      if (this.muted || !this.ctx) return;
      const t0 = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.value = filterFreq || 900;
      f.Q.value = 1.2;
      const g = this.ctx.createGain();
      src.connect(f); f.connect(g); g.connect(this.ctx.destination);
      this.env(g, t0, 0.004, dur, vol || 0.2);
      src.start(t0);
    },

    tap() { this.tone(520, 0.08, 'triangle', 0.10, 380); this.noise(0.04, 0.06, 2400); },
    place() { this.tone(300, 0.10, 'square', 0.07, 240); this.noise(0.05, 0.08, 1600); },
    error() { this.tone(180, 0.16, 'sawtooth', 0.08, 120); },
    creak(level) {
      const now = performance.now();
      if (now - this.lastCreak < 420) return;
      this.lastCreak = now;
      const f = 220 + Math.random() * 120 + level * 180;
      this.tone(f, 0.16, 'sawtooth', 0.035, f * 0.8);
    },
    snap() {
      this.noise(0.22, 0.35, 700, 'lowpass');
      this.tone(140, 0.22, 'sawtooth', 0.12, 60);
      this.tone(90, 0.3, 'square', 0.08, 45);
    },
    splash() {
      this.noise(0.35, 0.25, 1200, 'lowpass');
      this.tone(220, 0.18, 'sine', 0.06, 90);
    },
    thud(heavy) {
      this.tone(heavy ? 90 : 150, 0.12, 'sine', heavy ? 0.12 : 0.06, heavy ? 55 : 90);
      this.noise(0.05, heavy ? 0.12 : 0.05, 500, 'lowpass');
    },
    cross(heavy) {
      this.tone(heavy ? 420 : 620, 0.1, 'triangle', 0.07, heavy ? 300 : 760);
      this.noise(0.05, heavy ? 0.09 : 0.05, 700, 'lowpass');
    },
    medal() {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.1), i * 95));
      setTimeout(() => this.noise(0.3, 0.12, 2600, 'highpass'), 420);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.11), i * 110));
    },
    lose() {
      const notes = [330, 294, 247, 196];
      notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.26, 'sawtooth', 0.07), i * 130));
    },
  };

  root.BW_AUDIO = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
