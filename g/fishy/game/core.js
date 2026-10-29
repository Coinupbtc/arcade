/* FISHY — core: viewport, palette, cached fish drawing, synth audio.
   Split into game/core.js, game/world.js, game/render.js, game/main.js so every file stays small.
   Nothing here touches input; that is main.js. */

"use strict";

/* ---------- viewport ---------- */
var W = 0, H = 0, DPR = 1;
function resizeView() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  updateSizeScale();
  if (typeof buildBackdrop === "function") buildBackdrop();
  if (typeof layoutUiRects === "function") layoutUiRects();
}

/* ---------- math ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
function wrapDX(dx) { if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W; return dx; }
function fmtTime(sec) {
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

/* ---------- size ladder ----------
   tier 0 = 24 px minnow ... tier 12 = 180 px leviathan.  Cap is deliberate: the old
   436 px giants swamped the phone screen and made the pond unreadable (playtest #5). */
var MAX_TIER = 12;
var SIZE_SCALE = 1;
var PACE = 1;                       // swim speed follows the width of the pond on screen                 // fish are drawn to the size of the pond on screen
var TARGET_TIER = 10;              // grow to APEX = tier 10 -> the pond is cleared
var DEEP_TARGET = 12;              // the deep is meaner, not longer: 13 stretched a run past 2 minutes
function updateSizeScale() {
  SIZE_SCALE = clamp((W * 0.55 + H * 0.45) / 900, 0.62, 1.05);
  PACE = clamp(W / 1100, 0.45, 1.05);   // a 390 px phone is not a 1280 px desktop
}
function fishLen(t) { return (24 + 13 * clamp(t, 0, MAX_TIER + 1)) * SIZE_SCALE; }

var SIZE_COLORS = [
  { back: "#7fd4e8", belly: "#d8f4fa", fin: "#4fa8c4" },  // 0 tiny
  { back: "#4f9fe0", belly: "#a8d4f0", fin: "#3572b8" },  // 1 small blue
  { back: "#3ab5e8", belly: "#8fdcf7", fin: "#2591c4" },  // 2 cyan
  { back: "#4f8fe0", belly: "#8fc4ef", fin: "#3a6fc0" },  // 3 blue
  { back: "#7a5fd0", belly: "#b9a5ec", fin: "#5c42ad" },  // 4 purple
  { back: "#9a4fd0", belly: "#cfa5ec", fin: "#7535ad" },  // 5 violet
  { back: "#d05fa8", belly: "#f0b8d8", fin: "#ad3f88" },  // 6 magenta
  { back: "#d970a6", belly: "#f0c4d8", fin: "#b84f88" },  // 7 pink
  { back: "#e05f5f", belly: "#f7b8b8", fin: "#b83a3a" },  // 8 red
  { back: "#c43a4f", belly: "#f0a0b0", fin: "#9a2535" },  // 9 crimson
  { back: "#a82a3f", belly: "#e08a96", fin: "#7f1a28" }   // 10 deep crimson (giants)
];
function colorForTier(t) { return SIZE_COLORS[clamp(Math.floor(t), 0, SIZE_COLORS.length - 1)]; }
var PLAYER_BASE = { back: "#e8641f", belly: "#f7d878", fin: "#c4481a" };

function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mixHex(a, b, t) {
  var A = hexToRgb(a), B = hexToRgb(b);
  var c = A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); });
  return "#" + c.map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
}

/* ---------- fish drawing, cached ----------
   The old code rebuilt ~12 gradients and ~20 paths for every fish, every frame. That is
   why the gate measured 35 fps. Here the geometry is built once as Path2D in a unit
   (100 px) space and each colour plate keeps its gradients, so a fish is 12 fills at
   most and the tail wag reuses five pre-built tail paths. */
var PATHS = null;
var TAIL_WAG = [-0.20, -0.10, 0, 0.10, 0.20];
var gradCache = {};

function buildFishPaths() {
  var P = { tail: [], body: null, sheen: null, stripe1: null, stripe2: null, dorsal: null,
            pelvic: null, pectoral: null, gills: [], mouth: null, mouthOpen: null,
            eyeWhite: null, pupil: null, glint: null, lid: null };
  var bodyL = 62, bodyH = 26, tailL = 20, tailH = 34, bx = -8;

  for (var w = 0; w < TAIL_WAG.length; w++) {
    var p = new Path2D();
    p.moveTo(2, 0);
    p.quadraticCurveTo(-tailL * 0.7, -tailH * 0.55, -tailL, -tailH * 0.5);
    p.quadraticCurveTo(-tailL * 0.35, 0, -tailL, tailH * 0.5);
    p.quadraticCurveTo(-tailL * 0.7, tailH * 0.55, 2, 0);
    p.closePath();
    P.tail.push(p);
  }
  var b = new Path2D();
  b.ellipse(bx, 0, bodyL / 2, bodyH / 2, 0, 0, Math.PI * 2);
  P.body = b;

  var sh = new Path2D();
  sh.ellipse(bx - 2, -bodyH * 0.30, bodyL * 0.34, bodyH * 0.16, -0.12, 0, Math.PI * 2);
  P.sheen = sh;

  var s1 = new Path2D(); s1.rect(bx - bodyL * 0.10, -bodyH, 4, bodyH * 2);
  var s2 = new Path2D(); s2.rect(bx - bodyL * 0.28, -bodyH, 3, bodyH * 2);
  P.stripe1 = s1; P.stripe2 = s2;

  var d = new Path2D();
  d.moveTo(-18, -bodyH / 2 + 2);
  d.quadraticCurveTo(-2, -bodyH / 2 - 10, 14, -bodyH / 2 + 2);
  d.closePath();
  P.dorsal = d;

  var pv = new Path2D(); pv.ellipse(-14, bodyH * 0.42, 7, 4, -0.5, 0, Math.PI * 2);
  P.pelvic = pv;
  var pc = new Path2D(); pc.ellipse(2, 6, 9, 5, 0.5, 0, Math.PI * 2);
  P.pectoral = pc;

  for (var i = 0; i < 2; i++) {
    var gp = new Path2D(); gp.arc(6 + i * 5, 0, bodyH * 0.42, -0.9, 0.9); P.gills.push(gp);
  }
  var mo = new Path2D();
  mo.moveTo(bodyL / 2 + bx, 0); mo.lineTo(bodyL / 2 + bx - 8, -4.5); mo.lineTo(bodyL / 2 + bx - 8, 4.5);
  mo.closePath(); P.mouth = mo;
  var mo2 = new Path2D();
  mo2.moveTo(bodyL / 2 + bx, 0); mo2.lineTo(bodyL / 2 + bx - 11, -4.5); mo2.lineTo(bodyL / 2 + bx - 11, 4.5);
  mo2.closePath(); P.mouthOpen = mo2;

  var ex = bx + bodyL * 0.22, ey = -bodyH * 0.18, er = Math.max(2.2, bodyH * 0.28);
  var ew = new Path2D(); ew.arc(ex, ey, er, 0, Math.PI * 2); P.eyeWhite = ew;
  var pu = new Path2D(); pu.arc(ex + er * 0.25, ey, er * 0.62, 0, Math.PI * 2); P.pupil = pu;
  var gl = new Path2D(); gl.arc(ex + er * 0.55, ey - er * 0.35, er * 0.24, 0, Math.PI * 2); P.glint = gl;
  var ld = new Path2D(); ld.arc(ex, ey, er, Math.PI * 1.15, Math.PI * 1.85); P.lid = ld;

  PATHS = P;
}

function plateGrads(plate) {
  var key = plate.back + plate.belly + plate.fin;
  var g = gradCache[key];
  if (g) return g;
  var body = ctx.createLinearGradient(0, -26, 0, 26);
  body.addColorStop(0, plate.back);
  body.addColorStop(1, plate.belly);
  var tail = ctx.createLinearGradient(-20, 0, 8, 0);
  tail.addColorStop(0, plate.belly);
  tail.addColorStop(1, plate.fin);
  g = { body: body, tail: tail };
  gradCache[key] = g;
  return g;
}

/* Draw one fish at unit scale (caller has translated/rotated/scaled so 100 = len). */
function drawFishUnit(g, plate, wagIdx, opts) {
  if (!PATHS) buildFishPaths();
  var gr = plateGrads(plate);
  var P = PATHS;

  g.save();
  g.translate(-27, 0);
  g.rotate(TAIL_WAG[wagIdx % TAIL_WAG.length] * (opts.wagAmp || 1));
  g.fillStyle = gr.tail;
  g.fill(P.tail[0]);
  g.restore();

  g.fillStyle = gr.body;
  g.fill(P.body);

  g.fillStyle = "rgba(255,255,255,0.22)";
  g.fill(P.sheen);

  g.save();
  g.clip(P.body);
  g.fillStyle = "rgba(0,0,0,0.10)";
  g.fill(P.stripe1);
  g.fill(P.stripe2);
  g.restore();

  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 1.1;
  g.stroke(P.body);

  g.fillStyle = plate.fin;
  g.fill(P.dorsal);
  g.globalAlpha = 0.85; g.fill(P.pelvic);
  g.globalAlpha = 0.9; g.fill(P.pectoral);
  g.globalAlpha = 1;

  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 1;
  g.stroke(P.gills[0]);
  g.stroke(P.gills[1]);

  if (opts.mouth) {
    g.fillStyle = "rgba(120,20,20,0.9)";
    g.fill(opts.bite ? P.mouthOpen : P.mouth);
  }

  g.fillStyle = "#fff"; g.fill(P.eyeWhite);
  g.fillStyle = "#0a0a12"; g.fill(P.pupil);
  g.fillStyle = "#fff"; g.fill(P.glint);
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 0.8; g.stroke(P.lid);
}

function drawFishAt(g, x, y, len, plate, ang, wagIdx, opts) {
  g.save();
  g.translate(x, y);
  if (ang) g.rotate(ang);
  var s = len / 100;
  if (s !== 1) g.scale(s, s);
  drawFishUnit(g, plate, wagIdx, opts || {});
  g.restore();
}

/* ---------- audio ----------
   One AudioContext, unlocked by the input layer inside the first real gesture.
   Everything you must hear sits above 200 Hz: phone speakers cut lower than that
   (learned the hard way on the silk piece). */
var AC = null, master = null, padGain = null, musicEl = null, ambEl = null, noiseBuf = null, audioStarted = false;

function ensureAudioCtx() {
  if (!AC) {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    master = AC.createGain();
    master.gain.value = 0.55;
    master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.6), AC.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
  return AC;
}

function startAmbient() {
  if (audioStarted || !AC) return;
  audioStarted = true;
  // warm water pad: 220 + 330 Hz (audible on a phone speaker), slow tremolo
  padGain = AC.createGain();
  padGain.gain.value = 0.055;
  var lp = AC.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 1200;
  padGain.connect(lp); lp.connect(master);
  [220, 330, 440].forEach(function (f, i) {
    var o = AC.createOscillator();
    o.type = i === 1 ? "triangle" : "sine";
    o.frequency.value = f;
    var g = AC.createGain();
    g.gain.value = i === 2 ? 0.25 : 0.5;
    o.connect(g); g.connect(padGain);
    o.start();
  });
  var lfo = AC.createOscillator(); lfo.frequency.value = 0.09;
  var lg = AC.createGain(); lg.gain.value = 0.02;
  lfo.connect(lg); lg.connect(padGain.gain); lfo.start();
  // soft filtered water noise
  var n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  var bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 820; bp.Q.value = 0.7;
  var ng = AC.createGain(); ng.gain.value = 0.016;
  n.connect(bp); bp.connect(ng); ng.connect(master); n.start();
}

function startMusic() {
  if (musicEl) return;
  musicEl = new Audio("audio/chill-waters.mp3");
  musicEl.loop = true; musicEl.volume = 0.34;
  musicEl.play().catch(function () {});
  ambEl = musicEl;
}

function audioWake() {
  if (!ensureAudioCtx()) return null;
  startAmbient();
  startMusic();
  return AC;
}

function tone(freq, dur, type, vol, slideTo, delay) {
  if (!AC) return;
  var t0 = AC.currentTime + (delay || 0);
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, type, f0, f1) {
  if (!AC || !noiseBuf) return;
  var t0 = AC.currentTime;
  var s = AC.createBufferSource(); s.buffer = noiseBuf;
  var f = AC.createBiquadFilter(); f.type = type || "bandpass";
  f.frequency.setValueAtTime(f0 || 900, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  f.Q.value = 0.9;
  var g = AC.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
}

function sfx(name, k) {
  if (!AC) return;
  k = k || 0;
  switch (name) {
    case "eat":        tone(560 + k * 260, 0.09, "triangle", 0.20, 900 + k * 300); break;
    case "eatBig":     noise(0.10, 0.16, "bandpass", 700, 1800); tone(300 + k * 120, 0.14, "sawtooth", 0.16, 520); break;
    case "grow":       tone(784, 0.13, "sine", 0.10, 1046, 0.05); break;
    case "die":        noise(0.42, 0.34, "lowpass", 1600, 200); tone(220, 0.36, "sawtooth", 0.22, 110); break;
    case "burst":      noise(0.20, 0.16, "bandpass", 420, 1900); break;
    case "nearmiss":   tone(880, 0.07, "sine", 0.13); tone(1174, 0.09, "sine", 0.11, null, 0.06); break;
    case "wave":       tone(1046, 0.20, "sine", 0.10, 1318); break;
    case "clear":      tone(523, 0.16, "sine", 0.16); tone(659, 0.16, "sine", 0.16, null, 0.14);
                        tone(784, 0.24, "sine", 0.18, null, 0.28); break;
    case "hunter":     tone(233, 0.30, "triangle", 0.16, 196); break;
  }
}
