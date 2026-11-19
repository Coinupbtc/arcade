/* Orbit Putt — audio. WebAudio for SFX (iOS-safe m4a buffers), one looping music track,
 * one mute switch that owns both. The context is created inside the first real gesture by
 * arcade-input's AudioKit; nothing plays before that. */
(function (root) {
  "use strict";
  var A = { ctx: null, buf: {}, muted: false, ready: false, music: null, musicOn: false, master: null };

  var NAMES = ["putt", "bounce", "sink", "lip", "lost", "ui", "star", "card"];

  function load(name) {
    return fetch("assets/sfx/" + name + ".wav").then(function (r) {
      if (!r.ok) throw new Error("sfx " + name);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) {
        A.ctx.decodeAudioData(ab, function (b) { A.buf[name] = b; res(b); }, rej);
      });
    }).catch(function () { /* a missing sound is not a crash */ });
  }

  A.make = function () {
    if (A.ctx) return A.ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = 0.9;
    A.master.connect(A.ctx.destination);
    NAMES.forEach(function (n) { if (n !== "card") load(n); });
    load("card");
    return A.ctx;
  };

  A.unlock = function () {
    var c = A.make();
    if (c && c.state === "suspended") c.resume();
    A.ready = true;
    A.startMusic();
  };

  A.play = function (name, opt) {
    if (A.muted || !A.ctx || !A.buf[name]) return;
    opt = opt || {};
    var s = A.ctx.createBufferSource();
    s.buffer = A.buf[name];
    s.playbackRate.value = opt.rate || 1;
    var g = A.ctx.createGain();
    g.gain.value = (opt.gain == null ? 0.8 : opt.gain);
    s.connect(g); g.connect(A.master);
    try { s.start(0); } catch (e) {}
  };

  A.startMusic = function () {
    if (A.musicOn || A.muted) return;
    var m = A.music;
    if (!m) {
      m = A.music = new Audio();
      // Chromium ships without AAC; Safari has no Vorbis on older iOS. Offer both.
      var s1 = document.createElement("source"); s1.src = "assets/music/loop.ogg"; s1.type = "audio/ogg";
      var s2 = document.createElement("source"); s2.src = "assets/music/loop.m4a"; s2.type = "audio/mp4";
      m.appendChild(s1); m.appendChild(s2);
      m.loop = true; m.preload = "auto"; m.volume = 0.0;
    }
    var p = m.play();
    if (p && p.then) p.then(function () { A.musicOn = true; fade(m, 0.24, 1600); }).catch(function () {});
    else { A.musicOn = true; fade(m, 0.24, 1600); }
  };

  function fade(el, to, ms) {
    var from = el.volume, t0 = performance.now();
    (function tick() {
      var k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(tick);
    })();
  }

  A.setMuted = function (m) {
    A.muted = !!m;
    try { localStorage.setItem("orbitputt.muted", A.muted ? "1" : "0"); } catch (e) {}
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.9;
    if (A.music) {
      if (A.muted) { A.music.pause(); A.musicOn = false; }
      else { A.startMusic(); }
    }
    return A.muted;
  };

  A.initMuted = function () {
    try { A.muted = localStorage.getItem("orbitputt.muted") === "1"; } catch (e) {}
    return A.muted;
  };

  root.OP_A = A;
})(window);
