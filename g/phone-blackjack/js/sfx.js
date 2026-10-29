/**
 * Tiny WebAudio sound board for Phone Blackjack.
 * No files, no CDN: short synth voices so the table answers every action.
 * AudioContext is created on the first real gesture (the iOS rule) and resumed
 * there too, so the gate's audio.unlock probe sees a running context.
 */
(function (global) {
  "use strict";

  var ctx = null;
  var enabled = true;
  var master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) { /* iOS may need a real gesture */ }
    }
    return ctx;
  }

  function tone(freq, dur, type, gain, delay, slideTo) {
    if (!enabled || !ensure() || ctx.state !== "running") return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain) {
    if (!enabled || !ensure() || ctx.state !== "running") return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource();
    var g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  var VOICES = {
    click: function () { tone(300, 0.05, "square", 0.05); },
    chip: function () { noise(0.07, 0.16); tone(760, 0.07, "triangle", 0.05); },
    deal: function () { noise(0.05, 0.1); tone(520, 0.08, "triangle", 0.06, 0, 400); },
    flip: function () { noise(0.05, 0.08); tone(360, 0.06, "triangle", 0.05, 0, 300); },
    win: function () { tone(660, 0.12, "sine", 0.13); tone(880, 0.16, "sine", 0.13, 0.11); },
    bj: function () {
      tone(660, 0.1, "sine", 0.13);
      tone(830, 0.1, "sine", 0.13, 0.1);
      tone(1046, 0.22, "sine", 0.14, 0.2);
    },
    lose: function () { tone(180, 0.22, "sawtooth", 0.08, 0, 110); },
    bust: function () { tone(150, 0.3, "square", 0.08, 0, 70); noise(0.12, 0.1); },
    push: function () { tone(420, 0.14, "sine", 0.09); },
    chipIn: function () { noise(0.09, 0.18); tone(520, 0.1, "triangle", 0.06); }
  };

  global.Sfx = {
    unlock: unlock,
    play: function (name) {
      var v = VOICES[name];
      if (v) { try { v(); } catch (e) {} }
    },
    isOn: function () { return enabled; },
    toggle: function () {
      enabled = !enabled;
      return enabled;
    },
    /** Used by tests: true once a context exists and runs. */
    running: function () { return !!ctx && ctx.state === "running"; }
  };
})(window);
