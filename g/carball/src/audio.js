// CARBALL — all sound is synthesised here, so the game ships with no audio files.
// Engine pitch follows speed; boost is filtered noise; hits are a noise burst plus a thump.

let ctx = null;
let master = null;
let engOsc = null, engGain = null, engFilter = null;
let boostSrc = null, boostGain = null;
let noiseBuf = null;
let ready = false;

function makeNoise(seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function initAudio() {
  try {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    noiseBuf = makeNoise();

    // engine: sawtooth through a lowpass
    engOsc = ctx.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 55;
    engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 320;
    engGain = ctx.createGain();
    engGain.gain.value = 0.0;
    engOsc.connect(engFilter).connect(engGain).connect(master);
    engOsc.start();

    // boost: looping noise through a bandpass
    boostSrc = ctx.createBufferSource();
    boostSrc.buffer = noiseBuf;
    boostSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    boostGain = ctx.createGain();
    boostGain.gain.value = 0;
    boostSrc.connect(bp).connect(boostGain).connect(master);
    boostSrc.start();

    ready = true;
  } catch (e) {
    ready = false;
  }
}

export function setEngine(speed, throttle, boosting) {
  if (!ready) return;
  const t = ctx.currentTime;
  const f = 48 + Math.min(1.4, speed / 16) * 70 + (boosting ? 22 : 0);
  engOsc.frequency.setTargetAtTime(f, t, 0.06);
  engFilter.frequency.setTargetAtTime(260 + speed * 26 + (boosting ? 500 : 0), t, 0.08);
  const g = 0.018 + 0.035 * Math.min(1, Math.abs(throttle)) + (boosting ? 0.018 : 0);
  engGain.gain.setTargetAtTime(g, t, 0.08);
  boostGain.gain.setTargetAtTime(boosting ? 0.10 : 0, t, 0.05);
}

function burst(dur, freq, gain, type = 'lowpass') {
  if (!ready) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', slideTo = null, delay = 0) {
  if (!ready) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function hitSound(power) {
  const p = Math.max(0.08, Math.min(1, power));
  burst(0.16 + p * 0.12, 900 + p * 1400, 0.25 + p * 0.45);
  tone(70 + p * 40, 0.16, 0.30 * p, 'sine', 45);
}

export function padSound(big) {
  tone(big ? 620 : 900, big ? 0.22 : 0.12, big ? 0.22 : 0.13, 'triangle', big ? 1240 : 1320);
  if (big) tone(930, 0.26, 0.14, 'sine', 1560, 0.05);
}

export function jumpSound() { tone(300, 0.10, 0.10, 'square', 520); }

export function goalSound(blue) {
  const base = blue ? 392 : 330;
  tone(base, 0.5, 0.18, 'sawtooth', base);
  tone(base * 1.26, 0.5, 0.14, 'sawtooth', base * 1.26, 0.02);
  tone(base * 1.5, 0.7, 0.16, 'sawtooth', base * 1.5, 0.04);
  burst(0.7, 1400, 0.18);
  tone(base * 2, 0.9, 0.10, 'sine', base * 2, 0.12);
}

export function beep(high) { tone(high ? 880 : 440, high ? 0.30 : 0.16, 0.16, 'square'); }

export function uiSound() { tone(520, 0.08, 0.10, 'triangle', 720); }
