// Slice Party — synthesised sound. No files, no CDN. Master goes through a limiter.
// All cues keep their energy above 250 Hz so an iPhone speaker can actually play them.

export function createAudio() {
  let ac = null;
  let master = null;
  let noise = null;
  let enabled = true;

  function unlock() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* older Safari */ }

    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master = ac.createGain();
    master.gain.value = enabled ? 0.7 : 0.0001;
    master.connect(comp);
    comp.connect(ac.destination);

    const len = Math.floor(ac.sampleRate * 1.5);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      prev = prev * 0.4 + n * 0.6;
      d[i] = prev * 0.9;
    }
  }

  function ready() {
    return ac && ac.state === 'running' && enabled;
  }

  function noiseHit(t0, dur, freq, q, peak, rate) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = rate || 1;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0, Math.random() * 1.1, dur + 0.05);
  }

  function tone(t0, type, f0, f1, dur, peak) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    get enabled() { return enabled; },
    get state() { return ac ? ac.state : 'none'; },
    toggle() {
      unlock();
      enabled = !enabled;
      if (ac) {
        const t = ac.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(enabled ? 0.7 : 0.0001, t, 0.05);
      }
      return enabled;
    },
    slice(n) {
      if (!ready()) return;
      const t = ac.currentTime + 0.005;
      noiseHit(t, 0.085, 2100 + Math.min(6, n) * 180, 1.1, 0.30, 1.15);
      tone(t, 'sine', 880 + n * 60, 520, 0.09, 0.05);
    },
    splat() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      noiseHit(t, 0.12, 700, 0.8, 0.26, 0.9);
      tone(t, 'sine', 200, 85, 0.13, 0.10);
    },
    combo(n) {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      const notes = [660, 880, 1100, 1320, 1560];
      for (let i = 0; i < Math.min(n, 5); i++) {
        tone(t + i * 0.055, 'triangle', notes[i], notes[i], 0.16, 0.06);
      }
      tone(t, 'sine', 330, 330, 0.2, 0.05);
    },
    bomb() {
      if (!ready()) return;
      const t = ac.currentTime + 0.005;
      noiseHit(t, 0.5, 900, 0.6, 0.55, 0.7);
      tone(t, 'triangle', 160, 48, 0.55, 0.32);
      tone(t, 'sine', 320, 120, 0.3, 0.12);
      for (let i = 0; i < 8; i++) {
        noiseHit(t + 0.14 + Math.random() * 0.4, 0.04, 2600 + Math.random() * 1800, 1.5, 0.07, 1.1);
      }
    },
    miss() {
      if (!ready()) return;
      const t = ac.currentTime + 0.005;
      tone(t, 'triangle', 150, 62, 0.20, 0.16);
      noiseHit(t, 0.07, 500, 1.0, 0.10, 0.8);
    },
    tick() {
      if (!ready()) return;
      const t = ac.currentTime + 0.003;
      tone(t, 'sine', 1450, 1450, 0.05, 0.09);
    },
    start() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 440, 440, 0.12, 0.08);
      tone(t + 0.09, 'triangle', 660, 660, 0.16, 0.08);
    },
    over() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 520, 200, 0.7, 0.14);
      tone(t + 0.12, 'sine', 260, 130, 0.7, 0.08);
    },
  };
}
