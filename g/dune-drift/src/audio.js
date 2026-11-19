// Audio: Howler one-shots + a procedural engine (pitch follows speed) + one music loop.
const SFX = {
  boost_ignite: { vol: 0.5 }, boost_cut: { vol: 0.6 }, wall_scrape: { vol: 0.42 },
  jump_launch: { vol: 0.5 }, land_thud: { vol: 0.55 }, pad_kick: { vol: 0.55 },
  lap_bell: { vol: 0.4 }, count_beep: { vol: 0.45 }, finish_fanfare: { vol: 0.6 }, ui_tap: { vol: 0.35 }
};

export const Audio = {
  ready: false, muted: false, ctx: null, howls: {}, last: {}, music: null,

  load() {
    if (typeof Howl === 'undefined') return;
    Object.keys(SFX).forEach((k) => {
      try {
        this.howls[k] = new Howl({
          src: ['assets/sfx/' + k + '.ogg'],
          volume: SFX[k].vol, preload: true, html5: false
        });
      } catch (e) { /* a missing file must not stop the game */ }
    });
    try {
      this.music = new Howl({
        src: ['assets/music/race_loop.ogg'], loop: true, volume: 0.34, html5: false, preload: true
      });
    } catch (e) { this.music = null; }
  },

  // called from the template's first real gesture (arcade-input fires 'audio')
  unlock() {
    if (this.ready) return;
    this.ready = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    // engine: two detuned saws through a lowpass
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0.0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 420;
    this.engFilter.Q.value = 6;
    this.engGain.connect(this.engFilter);
    this.engFilter.connect(ctx.destination);

    this.oscs = [];
    [1, 1.5, 2.02].forEach((mul, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'square';
      o.frequency.value = 60 * mul;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.14;
      o.connect(g); g.connect(this.engGain);
      o.start();
      this.oscs.push({ o, mul });
    });

    // wind: looping noise through a bandpass
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(ctx.destination);
    src.start();

    this.ready = true;
    this.setMuted(this.muted);
  },

  setMuted(m) {
    this.muted = !!m;
    if (typeof Howler !== 'undefined') Howler.mute(this.muted);
    if (this.ctx) {
      this.engGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    if (this.music) { if (this.muted) this.music.pause(); else if (this.musicPlaying) this.music.play(); }
  },

  play(name, opts) {
    if (this.muted || !this.ready) return;
    const h = this.howls[name];
    if (!h) return;
    const now = performance.now();
    const gap = name === 'wall_scrape' ? 140 : 40;
    if (this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    try { h.rate(opts && opts.rate ? opts.rate : 1); h.play(); } catch (e) {}
  },

  startMusic() {
    if (!this.music) return;
    this.musicPlaying = true;
    if (!this.muted && !this.music.playing()) this.music.play();
  },
  stopMusic() { if (this.music) { this.music.pause(); this.musicPlaying = false; } },

  // speed 0..1, boost 0..1, running
  engine(speedFrac, boosting, active) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const base = 46 + speedFrac * 96 + boosting * 22;
    this.oscs.forEach(({ o, mul }) => {
      o.frequency.setTargetAtTime(base * mul, t, 0.06);
    });
    this.engFilter.frequency.setTargetAtTime(320 + speedFrac * 1500 + boosting * 900, t, 0.08);
    this.engGain.gain.setTargetAtTime(active ? 0.055 + speedFrac * 0.05 : 0.0, t, 0.12);
    this.windGain.gain.setTargetAtTime(active ? Math.max(0, speedFrac - 0.25) * 0.16 : 0, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(420 + speedFrac * 1400, t, 0.15);
  }
};
