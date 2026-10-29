// WebAudio engine. The chart clock IS the audio clock: songTime() is measured from
// the same schedule the synth notes are placed on, so notes cannot drift from sound.
const LOOKAHEAD = 0.3;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.startTime = 0;
    this.events = [];
    this.idx = 0;
    this.timer = null;
    this.master = null;
    this.analyser = null;
    this.buf = null;
    this.noise = null;
    // Clock health. The chart clock is the audio clock — but an AudioContext can be
    // suspended, or its render thread starved on a loaded machine, and then
    // ctx.currentTime stops dead while the page keeps rendering. A frozen clock used
    // to freeze the whole run at the countdown. So the wall clock is a fallback,
    // entered only when the audio clock is provably not keeping time.
    this.running = false;
    this.paused = false;
    this.stalled = false;
    this.wallAnchor = 0;   // performance.now()/1000 of "song time zero"
    this.pauseAt = 0;      // performance.now() when the pause began
    this.pauseWall = 0;    // seconds lost to pauses
    this.watchMs = 0;
    this.watchA = null;
    this.pendingStart = null;
  }

  async init() {
    // iOS: reuse ONE AudioContext for the life of the page. Creating a fresh one
    // after an await loses the user-gesture chain and leaves it suspended.
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.82;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.buf = new Uint8Array(this.analyser.fftSize);

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // delay send for the lead, gives the arp air without reverb cost
    this.delay = this.ctx.createDelay(0.6);
    this.delay.delayTime.value = 60 / 112 * 0.75;
    this.fb = this.ctx.createGain();
    this.fb.gain.value = 0.26;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.3;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.wet); this.wet.connect(this.master);

    this.noise = this.makeNoise(1.0);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.applyPending();
  }

  /** Cheap per-gesture call: create the context once, resume it if it went to sleep. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* gesture lost */ });
      this.applyPending();
      return;
    }
    this.init().catch(() => { /* keep playing silently */ });
  }

  /** A run that started before the context existed joins it at the right position. */
  applyPending() {
    if (!this.pendingStart || !this.ctx) return;
    const { at, leadIn } = this.pendingStart;
    this.pendingStart = null;
    const left = Math.max(0, at + leadIn - performance.now() / 1000);
    this.startTime = this.ctx.currentTime + left;
    if (this.events.length) this.startScheduler();
  }

  startScheduler() {
    if (this.timer) return;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopScheduler() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Seconds since the chart clock reached zero; pauses are removed. */
  wallTime() {
    const ms = this.paused ? this.pauseAt : performance.now();
    return ms / 1000 - this.wallAnchor - this.pauseWall;
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Schedule a whole song. leadIn = seconds of countdown before the first beat. */
  start(song, leadIn = 1.2) {
    this.stopScheduler();
    this.events = song.events;
    this.idx = 0;
    this.running = true;
    this.paused = false;
    this.stalled = false;
    this.pauseWall = 0;
    this.watchMs = 0;
    this.watchA = null;
    const now = performance.now() / 1000;
    this.wallAnchor = now + leadIn;
    if (this.ctx && this.ctx.state !== 'closed') {
      this.startTime = this.ctx.currentTime + leadIn;
      this.pendingStart = null;
      this.startScheduler();
    } else {
      // No context yet: run the chart on the wall clock and let init() rebase the audio.
      this.pendingStart = { at: now, leadIn };
    }
  }

  schedule() {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (this.idx < this.events.length && this.startTime + this.events[this.idx].t < horizon) {
      const ev = this.events[this.idx++];
      this.play(ev, this.startTime + ev.t);
    }
  }

  play(ev, t) {
    switch (ev.type) {
      case 'kick': return this.kick(t, ev.vel);
      case 'snare': return this.snare(t, ev.vel);
      case 'hat': return this.hat(t, ev.vel);
      case 'bass': return this.bass(t, ev.freq, ev.dur, ev.vel);
      case 'lead': return this.lead(t, ev.freq, ev.dur, ev.vel);
      case 'pad': return this.pad(t, ev.freq, ev.dur, ev.vel);
      default: return undefined;
    }
  }

  kick(t, vel = 1) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.34);
  }

  snare(t, vel = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 0.2);
  }

  hat(t, vel = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.055);
    s.connect(hp); hp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + 0.07);
  }

  bass(t, freq, dur, vel = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + Math.min(dur, 0.4));
    lp.Q.value = 5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.19 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.08);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.1);
  }

  lead(t, freq, dur, vel = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.002; // tiny shimmer
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.05);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.07); o2.stop(t + dur + 0.07);
  }

  pad(t, freq, dur, vel = 1) {
    for (const det of [-4, 4]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1150; lp.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 * vel, t + Math.min(0.3, dur * 0.35));
      g.gain.setValueAtTime(0.05 * vel, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur + 0.2);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.22);
    }
  }

  /** A quiet click on the finger, so every tap has a same-frame answer. */
  click(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * strength, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.05);
  }

  songTime() {
    if (!this.running) return this.frozen ?? -2.2;
    const wall = this.wallTime();
    if (!this.ctx || this.stalled) return wall;
    const a = this.ctx.currentTime - this.startTime;
    if (this.paused) return a;
    // Once every 700 ms: is the audio clock keeping time with the wall clock?
    // Normal lag is a few ms (render-quantum quantisation). Half a second behind
    // means the audio thread is stalled — trust the wall clock and stand the synth
    // down, rather than freeze the run or fire a burst of late notes.
    const ms = performance.now();
    if (ms - this.watchMs > 700) {
      this.watchMs = ms;
      if (wall - a > 0.45) {
        this.stalled = true;
        this.stopScheduler();
        return wall;
      }
      this.watchA = a;
    }
    return a;
  }

  /** 0..1 RMS, drives the background pulse. */
  level() {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 3.4);
  }

  /** Down-sampled waveform (-1..1) for the resonance strip. Real signal, not noise. */
  waveform(n = 64) {
    const out = new Float32Array(n);
    if (!this.analyser) return out;
    this.analyser.getByteTimeDomainData(this.buf);
    const step = Math.floor(this.buf.length / n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < step; k++) s += (this.buf[i * step + k] - 128) / 128;
      out[i] = s / step;
    }
    return out;
  }

  /** Freeze the song. currentTime stops while suspended, so songTime holds. */
  async pause() {
    if (this.paused) return;
    this.paused = true;
    this.pauseAt = performance.now();
    if (!this.ctx) return;
    try { await this.ctx.suspend(); } catch (_) { /* already suspended */ }
  }

  async resume() {
    if (!this.ctx) { this.paused = false; return; }
    try { await this.ctx.resume(); } catch (_) { /* gesture lost; the wall clock carries the run */ }
    if (this.paused) {
      this.pauseWall += Math.max(0, (performance.now() - this.pauseAt) / 1000);
      this.paused = false;
    }
  }

  /** Resume from inside a real gesture (iOS rule). Safe to call on every press. */
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* gesture lost */ });
    // A stalled clock gets one more chance on a real tap: rebase the synth onto the
    // wall clock so sound comes back in step with the chart, instead of staying silent.
    if (this.stalled && this.ctx.state === 'running') {
      const past = this.wallTime();
      this.startTime = this.ctx.currentTime - past;
      this.stalled = false;
      this.watchMs = 0;
      // Skip the events the stall already carried past: no burst of late notes.
      while (this.idx < this.events.length && this.events[this.idx].t < past) this.idx += 1;
      if (this.idx < this.events.length) this.startScheduler();
    }
  }

  stop() {
    // The clock keeps its last reading instead of jumping to a sentinel, so
    // __game.time still tells the truth on the results screen.
    if (this.running) this.frozen = this.songTime();
    this.stopScheduler();
    this.idx = 0;
    this.events = [];
    this.running = false;
    // Do NOT suspend: the scheduler runs 0.3 s ahead, and the context must stay
    // alive for the next track (iOS counts contexts and refuses new ones).
  }

  async close() {
    this.stop();
    if (this.ctx) { try { await this.ctx.close(); } catch (_) { /* already closed */ } }
    this.ctx = null;
  }
}
