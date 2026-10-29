// Bubble Bay — synthesised cues. Master limiter; pops stay above 250 Hz for phone speakers.

export function createAudio() {
  let ac = null, master = null, noise = null, enabled = true;

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ac.createGain();
    master.gain.value = enabled ? 0.62 : 0.0001;
    master.connect(comp); comp.connect(ac.destination);

    const len = Math.floor(ac.sampleRate * 1.0);
    noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = noise.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; prev = prev * 0.4 + n * 0.6; d[i] = prev * 0.9; }
  }

  function ready() { return ac && ac.state === 'running' && enabled; }

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

  function noiseHit(t0, dur, freq, q, peak) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0, Math.random() * 0.7, dur + 0.05);
  }

  return {
    unlock,
    get state() { return ac ? ac.state : 'none'; },
    get enabled() { return enabled; },
    toggle() {
      unlock();
      enabled = !enabled;
      if (ac) {
        const t = ac.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(enabled ? 0.62 : 0.0001, t, 0.05);
      }
      return enabled;
    },
    shoot() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      noiseHit(t, 0.10, 1800, 1.2, 0.22);
      tone(t, 'sine', 520, 300, 0.10, 0.06);
    },
    bounce() {
      if (!ready()) return;
      const t = ac.currentTime + 0.002;
      tone(t, 'triangle', 900, 900, 0.05, 0.05);
    },
    pop(combo) {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      const base = 560 + Math.min(6, combo) * 70;
      tone(t, 'triangle', base, base, 0.10, 0.09);
      tone(t + 0.05, 'sine', base * 1.5, base * 1.5, 0.12, 0.06);
      noiseHit(t, 0.09, 2600, 1.4, 0.12);
    },
    drop() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      noiseHit(t, 0.32, 900, 0.7, 0.20);
      tone(t, 'sine', 380, 140, 0.28, 0.10);
      for (let i = 0; i < 4; i++) tone(t + 0.06 + i * 0.06, 'triangle', 1200 - i * 140, 900 - i * 140, 0.07, 0.05);
    },
    row() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      tone(t, 'square', 300, 240, 0.12, 0.07);
      tone(t + 0.16, 'square', 300, 240, 0.12, 0.07);
      noiseHit(t, 0.2, 700, 0.8, 0.14);
    },
    clear() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      const notes = [660, 880, 1100, 1320];
      notes.forEach((f, i) => tone(t + i * 0.09, 'triangle', f, f, 0.22, 0.09));
    },
    over() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 420, 120, 0.8, 0.16);
      tone(t + 0.15, 'sine', 210, 90, 0.8, 0.08);
    },
    start() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 440, 660, 0.14, 0.08);
      tone(t + 0.10, 'triangle', 660, 880, 0.16, 0.08);
    },
  };
}
