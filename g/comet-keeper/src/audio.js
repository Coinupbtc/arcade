// Sound: decoded buffers through the AudioContext that arcade-input unlocks on the first gesture.
CK.Audio = {
  ctx: null, master: null, sfx: {}, buffers: {}, muted: false, musicSrc: null, musicOn: false, ready: false,

  init: function (ctx) {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);
    try { this.muted = localStorage.getItem("cometkeeper.muted") === "1"; } catch (e) {}
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.load();
  },

  load: function () {
    var self = this;
    var names = ["deflect", "crack", "pulse", "chain", "wave", "pick", "over", "music"];
    names.forEach(function (n) {
      var url = (n === "music" ? "assets/music/" : "assets/sfx/") + n + ".ogg";
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      }).then(function (buf) {
        return new Promise(function (res, rej) { self.ctx.decodeAudioData(buf, res, rej); });
      }).then(function (ab) {
        self.buffers[n] = ab;
        if (n === "music") self.ready = true;
      }).catch(function () { /* a missing sound is silent, never a crash */ });
    });
  },

  play: function (name, variant) {
    if (!this.ctx || this.muted) return;
    var b = this.buffers[name];
    if (!b) return;
    var src = this.ctx.createBufferSource();
    src.buffer = b;
    var g = this.ctx.createGain();
    g.gain.value = name === "music" ? 0.5 : 0.7;
    if (name === "deflect" && variant === "fast") src.playbackRate.value = 1.18;
    if (name === "deflect" && variant === "split") src.playbackRate.value = 0.9;
    src.connect(g); g.connect(this.master);
    src.start(0);
  },

  music: function (on) {
    if (!this.ctx) return;
    if (on && !this.musicOn && this.buffers.music) {
      this.musicSrc = this.ctx.createBufferSource();
      this.musicSrc.buffer = this.buffers.music;
      this.musicSrc.loop = true;
      var g = this.ctx.createGain();
      g.gain.value = 0.30;
      this.musicSrc.connect(g); g.connect(this.master);
      this.musicSrc.start(0);
      this.musicOn = true;
    } else if (!on && this.musicOn && this.musicSrc) {
      try { this.musicSrc.stop(0); } catch (e) {}
      this.musicSrc = null; this.musicOn = false;
    }
  },

  toggleMute: function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    try { localStorage.setItem("cometkeeper.muted", this.muted ? "1" : "0"); } catch (e) {}
    return this.muted;
  }
};
