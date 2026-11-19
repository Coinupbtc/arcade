// ROCKET SOCCER — sound, synthesised with WebAudio (no asset files, no network).

let ctx = null;
let master = null;
let engine = null;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  return ctx;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(seconds = 0.5) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Ball hit: a short thump whose pitch and weight follow the impact speed.
export function hitBall(speed) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const strength = Math.min(1, speed / 45);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180 - strength * 70, t);
  osc.frequency.exponentialRampToValueAtTime(52, t + 0.16);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.42 * (0.4 + strength), t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain); gain.connect(master);
  osc.start(t); osc.stop(t + 0.24);

  // click transient
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.06);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + strength * 1800;
  bp.Q.value = 1.1;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.20 * strength, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(bp); bp.connect(ng); ng.connect(master);
  src.start(t);
}

export function jumpSound() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.11);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + 0.16);
}

export function flipSound() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.25);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t);
}

export function goalHorn(youScored) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const freqs = youScored ? [392, 523, 659] : [330, 262, 196];
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const start = t + i * 0.10;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(start); o.stop(start + 0.6);
  });
}

// Continuous engine hum, driven by speed and boost.
export function startEngine() {
  if (!ctx || engine) return;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  osc.type = 'sawtooth';
  osc2.type = 'square';
  osc.frequency.value = 70;
  osc2.frequency.value = 35;
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  g.gain.value = 0.0;
  osc.connect(lp); osc2.connect(lp); lp.connect(g); g.connect(master);
  osc.start(); osc2.start();
  engine = { osc, osc2, g, lp };
}

export function updateEngine(speed, boosting) {
  if (!engine) return;
  const t = ctx.currentTime;
  const s = Math.min(1, speed / 38);
  engine.osc.frequency.setTargetAtTime(70 + s * 130 + (boosting ? 40 : 0), t, 0.08);
  engine.osc2.frequency.setTargetAtTime(35 + s * 65, t, 0.08);
  engine.lp.frequency.setTargetAtTime(380 + s * 900 + (boosting ? 700 : 0), t, 0.08);
  engine.g.gain.setTargetAtTime(0.055 + s * 0.05, t, 0.1);
}

export function boostWhoosh() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.10, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t);
}

export function whistle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [1850, 2300]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 1.05, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.62);
  }
}
