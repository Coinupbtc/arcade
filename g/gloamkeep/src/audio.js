/* GLOAMKEEP — WebAudio synth. No audio files. */
window.GK = window.GK || {};

(function () {
  let ac = null;
  let master = null;
  let muted = false;
  let music = null;

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    return ac;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq, delay) {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1200;
    const g = a.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  const SFX = {
    shoot() { tone(880, 0.06, 'square', 0.05, 520); },
    boom()  { noise(0.22, 0.28, 900); tone(90, 0.18, 'sawtooth', 0.08, 50); },
    zap()   { tone(1400, 0.08, 'sawtooth', 0.05, 300); noise(0.05, 0.08, 3000); },
    frost() { tone(1200, 0.1, 'triangle', 0.035, 900); },
    build() { tone(320, 0.07, 'square', 0.09); tone(480, 0.08, 'square', 0.08, null, 0.07); },
    coin()  { tone(1320, 0.05, 'sine', 0.05); tone(1760, 0.06, 'sine', 0.04, null, 0.04); },
    leak()  { tone(140, 0.3, 'sawtooth', 0.12, 60); noise(0.2, 0.12, 400); },
    horn()  { tone(196, 0.5, 'sawtooth', 0.07); tone(294, 0.5, 'sawtooth', 0.05, null, 0.05); },
    win()   { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.08, null, i * 0.13)); },
    lose()  { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.07, null, i * 0.16)); },
    tap()   { tone(600, 0.03, 'square', 0.03); },
    deny()  { tone(180, 0.12, 'square', 0.06, 120); },
    // a kill in a streak: the pitch climbs with the chain, so the ear hears the run building
    tick(n) { const s = Math.min(18, (n || 1)); tone(520 + s * 46, 0.05, 'triangle', 0.035, 520 + s * 46 + 90); },
    // the keep lantern: a bright rising chord, above 200 Hz so a phone speaker carries it
    flare() { [392, 523, 659, 880].forEach((f, i) => tone(f, 0.30, 'triangle', 0.07, null, i * 0.05));
              noise(0.3, 0.10, 2600); },
    // KEEP HEAT: one short ping per heat step, climbing. It is the ear's cue that the chain is paying.
    heat(n) { tone(620 + Math.min(10, n || 1) * 40, 0.10, 'triangle', 0.05, 900 + Math.min(10, n) * 60); }
  };

  // ambient pad: two detuned saws an octave up from the old 55 Hz drone (phone speakers cut below
  // ~200 Hz, so the bed was inaudible on the device this game is built for) plus a slow bell motif.
  function startMusic() {
    const a = ctx(); if (!a || music) return;
    const g = a.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.05, a.currentTime + 3);
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 1.4;
    const o1 = a.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 110;
    const o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 110.6;
    const o3 = a.createOscillator(); o3.type = 'sine'; o3.frequency.value = 220;
    o1.connect(f); o2.connect(f); o3.connect(f);
    f.connect(g); g.connect(master);
    o1.start(); o2.start(); o3.start();
    const lfo = a.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lg = a.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    music = { g, o1, o2, o3, lfo };
    // sparse bells, one note above the pad so it reads on a phone speaker
    const bell = () => {
      if (!music || muted) return;
      const notes = [440, 523.25, 587.33, 659.25, 880];
      tone(notes[(Math.random() * notes.length) | 0], 1.6, 'sine', 0.03);
      setTimeout(bell, 6000 + Math.random() * 9000);
    };
    setTimeout(bell, 4000);
  }

  GK.Audio = {
    ctx,
    state() { const a = ctx(); return a ? a.state : 'none'; },
    unlock() {
      const a = ctx(); if (!a) return;
      if (a.state === 'suspended') a.resume();
      startMusic();
    },
    play(name, arg) {
      if (muted) return;
      const f = SFX[name];
      if (f) f(arg);
    },
    toggle() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; }
  };
})();
