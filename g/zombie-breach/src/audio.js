/* ZOMBIE BREACH — sound. Synthesised in WebAudio, created inside a real gesture (iOS rule). */

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noise = null;
    this.bed = null;
    this._bedLevel = -1;
    this._bedCut = -1;
  }

  /* Call from a trusted gesture: pointerdown / keydown / touchstart. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this._noise = this._makeNoise(0.6);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  _makeNoise(sec) {
    const n = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(node, t0, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  _tone(type, f0, f1, dur, peak, at) {
    const t0 = this.ctx.currentTime + (at || 0);
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this._env(o, t0, peak, 0.006, dur);
    o.start(t0);
    o.stop(t0 + dur + 0.04);
  }

  _burst(dur, peak, freq, q, at) {
    const t0 = this.ctx.currentTime + (at || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    src.connect(bp);
    this._env(bp, t0, peak, 0.004, dur);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------------- ambience ----------------
     A quiet bed under the fight, built from oscillators (no files). The fundamentals sit at
     220 / 330 Hz so a phone speaker, which cuts below ~150 Hz, still carries the tune; the
     110 Hz layer only adds weight on a desktop. It starts on the first unlock and fades
     with the state: up in play, near silent on menu / pause / verdict. */
  _ensureBed() {
    if (this.bed || !this.ctx) return;
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(this.master);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 820; filt.Q.value = 0.7;
    filt.connect(g);
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 220;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 330; o2.detune.value = -9;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 110;
    const g1 = ctx.createGain(); g1.gain.value = 0.55; o1.connect(g1); g1.connect(filt);
    const g2 = ctx.createGain(); g2.gain.value = 0.28; o2.connect(g2); g2.connect(filt);
    const g3 = ctx.createGain(); g3.gain.value = 0.22; o3.connect(g3); g3.connect(filt);
    const src = ctx.createBufferSource(); src.buffer = this._makeNoise(2.4); src.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 520; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.09;
    src.connect(nf); nf.connect(ng); ng.connect(filt);
    o1.start(); o2.start(); o3.start(); src.start();
    this.bed = { g: g, filt: filt, o1: o1, o2: o2, o3: o3, src: src };
  }

  bedFor(state, wave, hp) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    this._ensureBed();
    const b = this.bed;
    if (!b) return;
    const t = this.ctx.currentTime;
    const want = state === 'play' ? (hp <= 35 ? 0.12 : 0.085) : 0.0001;
    if (this._bedLevel !== want) {
      this._bedLevel = want;
      b.g.gain.cancelScheduledValues(t);
      b.g.gain.setTargetAtTime(want, t, want > 0.01 ? 1.4 : 0.6);
    }
    const cut = 780 + Math.min(6, wave || 1) * 130 + (hp <= 35 ? 320 : 0);
    if (cut !== this._bedCut) {
      this._bedCut = cut;
      b.filt.frequency.setTargetAtTime(cut, t, 0.9);
    }
  }

  play(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    switch (name) {
      case 'shot':
        this._burst(0.09, 0.42, 1250, 0.9);
        this._tone('sine', 190, 55, 0.11, 0.28);
        break;
      case 'shotPierce':
        this._burst(0.11, 0.5, 1700, 0.8);
        this._tone('sine', 240, 60, 0.14, 0.3);
        this._tone('triangle', 880, 440, 0.06, 0.1);
        break;
      case 'warden':
        this._tone('sawtooth', 150, 48, 0.95, 0.3);
        this._burst(0.7, 0.22, 260, 0.5);
        break;
      case 'heart':
        this._tone('sine', 220, 150, 0.13, 0.18);
        this._burst(0.07, 0.1, 300, 0.9);
        break;
      case 'hit':
        this._burst(0.05, 0.2, 2400, 1.4);
        this._tone('square', 300, 180, 0.05, 0.08);
        break;
      case 'kill':
        this._burst(0.16, 0.3, 700, 0.7);
        this._tone('sawtooth', 120, 48, 0.2, 0.16);
        break;
      case 'reload':
        this._tone('square', 720, 520, 0.03, 0.08);
        this._tone('square', 520, 760, 0.03, 0.08, 0.5);
        break;
      case 'empty':
        this._tone('square', 210, 190, 0.03, 0.07);
        break;
      case 'hurt':
        this._tone('sawtooth', 160, 70, 0.28, 0.22);
        this._burst(0.12, 0.18, 420, 0.6);
        break;
      case 'wave':
        this._tone('sine', 196, 196, 0.34, 0.16);
        this._tone('sine', 294, 294, 0.34, 0.14, 0.2);
        break;
      case 'clear':
        this._tone('sine', 392, 392, 0.2, 0.16);
        this._tone('sine', 523, 523, 0.3, 0.16, 0.16);
        break;
      case 'pickup':
        this._tone('triangle', 660, 990, 0.12, 0.16);
        break;
      case 'jump':
        this._burst(0.05, 0.07, 900, 0.8);
        break;
      case 'death':
        this._tone('sawtooth', 240, 44, 0.9, 0.24);
        this._burst(0.5, 0.16, 380, 0.4);
        break;
      case 'step':
        this._burst(0.04, 0.05, 520, 0.8);
        break;
      case 'land':
        this._tone('sine', 128, 46, 0.2, 0.26);
        this._burst(0.16, 0.2, 280, 0.6);
        break;
      case 'spitWarn':
        this._burst(0.2, 0.16, 900, 1.3);
        this._tone('sawtooth', 150, 95, 0.24, 0.12);
        break;
      case 'spit':
        this._burst(0.12, 0.2, 1600, 0.7);
        this._tone('triangle', 520, 260, 0.12, 0.09);
        break;
      case 'splat':
        this._burst(0.2, 0.24, 480, 0.8);
        this._tone('sine', 180, 70, 0.2, 0.16);
        break;
      case 'supply':
        this._tone('triangle', 660, 660, 0.1, 0.16);
        this._tone('triangle', 990, 990, 0.12, 0.16, 0.08);
        this._tone('sine', 1320, 1320, 0.14, 0.09, 0.16);
        break;
    }
  }
}
