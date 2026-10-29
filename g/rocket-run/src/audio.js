// Rocket Run — synthesised audio. Thrust is a looping filtered-noise bed; cues are short.
// Master runs through a limiter and every cue keeps energy above 250 Hz for the iPhone speaker.

export function createAudio() {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let thrustSrc = null;
  let thrustGain = null;
  let thrustOn = false;
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
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master = ac.createGain();
    master.gain.value = enabled ? 0.62 : 0.0001;
    master.connect(comp);
    comp.connect(ac.destination);

    const len = Math.floor(ac.sampleRate * 1.2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      prev = prev * 0.45 + n * 0.55;
      d[i] = prev * 0.9;
    }

    // thrust bed
    thrustSrc = ac.createBufferSource();
    thrustSrc.buffer = noiseBuf;
    thrustSrc.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 760;
    bp.Q.value = 0.7;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    thrustGain = ac.createGain();
    thrustGain.gain.value = 0.0001;
    thrustSrc.connect(bp);
    bp.connect(lp);
    lp.connect(thrustGain);
    thrustGain.connect(master);
    thrustSrc.start();
  }

  function ready() {
    return ac && ac.state === 'running' && enabled;
  }

  function tone(t0, type, f0, f1, dur, peak) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseHit(t0, dur, freq, q, peak) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.8, dur + 0.05);
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
        if (!enabled && thrustGain) thrustGain.gain.setTargetAtTime(0.0001, t, 0.05);
      }
      return enabled;
    },
    thrust(on) {
      if (!ac) return;
      if (on === thrustOn) return;
      thrustOn = on;
      const t = ac.currentTime;
      thrustGain.gain.cancelScheduledValues(t);
      thrustGain.gain.setTargetAtTime(on && enabled ? 0.16 : 0.0001, t, 0.04);
    },
    coin() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      tone(t, 'triangle', 1050, 1050, 0.10, 0.08);
      tone(t + 0.05, 'sine', 1580, 1580, 0.12, 0.06);
    },
    crash() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      noiseHit(t, 0.55, 820, 0.55, 0.55);
      tone(t, 'triangle', 150, 42, 0.6, 0.34);
      tone(t, 'sine', 300, 90, 0.35, 0.12);
      for (let i = 0; i < 7; i++) {
        noiseHit(t + 0.12 + Math.random() * 0.45, 0.05, 2300 + Math.random() * 2000, 1.4, 0.07);
      }
    },
    warn() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      tone(t, 'square', 880, 880, 0.09, 0.05);
      tone(t + 0.13, 'square', 880, 880, 0.09, 0.05);
    },
    launch() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      noiseHit(t, 0.30, 1300, 0.8, 0.22);
      tone(t, 'sine', 520, 180, 0.30, 0.08);
    },
    milestone() {
      if (!ready()) return;
      const t = ac.currentTime + 0.004;
      tone(t, 'triangle', 660, 660, 0.12, 0.07);
      tone(t + 0.08, 'triangle', 990, 990, 0.14, 0.07);
    },
    start() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 440, 660, 0.16, 0.08);
    },
    over() {
      if (!ready()) return;
      const t = ac.currentTime + 0.01;
      tone(t, 'triangle', 440, 160, 0.7, 0.12);
      tone(t + 0.1, 'sine', 220, 110, 0.7, 0.07);
    },
  };
}
