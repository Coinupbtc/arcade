// game.js - state machine, render, input, audio.
// Physics and geometry live in car.js / route.js so the tests drive the exact
// same functions the touch handler drives.

import { buildRoute, pointAt, project } from './route.js';
import { createCar, step, MODES, suggestedSpeed } from './car.js';

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

let VW = 1, VH = 1, MW = 120, MH = 90;

const G = {
  mode: 'menu',          // menu | playing | paused | won | lost
  level: null,
  route: null,
  car: null,
  img: null,
  input: { throttle: 0, brake: 0, steer: 0 },
  keys: new Set(),
  touch: { gas: false, brake: false, left: false, right: false },
  cam: { x: 0, y: 0, zoom: 0.6 },
  mapView: false,
  best: null,
  acc: 0,
  last: 0,
  toast: '', toastUntil: 0,
  audio: null,
};

// ------------------------------------------------------------------ helpers
const el = (id) => document.getElementById(id);
const fmt = (t) => (t < 60 ? t.toFixed(2) + 's' : Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0'));

function toast(msg, ms = 1400) {
  G.toast = msg;
  G.toastUntil = performance.now() + ms;
}

function grade(time, par) {
  // S/A were too generous: a first try graded S while par was 40% slower.
  if (time <= par * 0.72) return 'S';
  if (time <= par * 0.85) return 'A';
  if (time <= par) return 'B';
  return 'C';
}
function bestKey() { return 'rc-best-' + (G.level ? G.level.name : 'route'); }

function loadBest() {
  try {
    const v = localStorage.getItem(bestKey());
    return v ? parseFloat(v) : null;
  } catch (e) { return null; }
}

function saveBest(t) {
  try {
    const cur = loadBest();
    if (cur === null || t < cur) { localStorage.setItem(bestKey(), String(t)); return true; }
  } catch (e) {}
  return false;
}

// ------------------------------------------------------------------- audio
function initAudio() {
  if (G.audio) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  const master = ac.createGain();
  master.gain.value = 0.6;
  master.connect(ac.destination);

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.connect(master);

  // engine: fundamental + two harmonics, so it survives a phone speaker
  // (phone speakers roll off below ~200 Hz - a lone 60 Hz hum is inaudible there)
  const oscs = [];
  const gains = [0.055, 0.028, 0.014];
  for (let i = 0; i < 3; i++) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    const g = ac.createGain();
    g.gain.value = 0;
    o.connect(g); g.connect(lp);
    o.start();
    oscs.push({ o, g, mult: i + 1, base: gains[i] });
  }

  // off-road rumble from generated noise
  const buf = ac.createBuffer(1, ac.sampleRate * 1.0, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const nf = ac.createBiquadFilter();
  nf.type = 'bandpass'; nf.frequency.value = 620; nf.Q.value = 0.7;
  const ng = ac.createGain(); ng.gain.value = 0;
  noise.connect(nf); nf.connect(ng); ng.connect(master);
  noise.start();

  G.audio = { ac, oscs, ng, master, lp };
}

function audioTick() {
  const a = G.audio;
  if (!a) return;
  const car = G.car;
  const live = G.mode === 'playing' && car;
  const spd = live ? car.speed / MODES.car.vmax : 0;
  const f = 78 + spd * 150;
  for (const s of a.oscs) {
    s.o.frequency.setTargetAtTime(f * s.mult, a.ac.currentTime, 0.06);
    s.g.gain.setTargetAtTime(live ? s.base * (0.45 + spd * 0.75) : 0, a.ac.currentTime, 0.08);
  }
  const off = live && car.offroad ? 0.5 : 0;
  a.ng.gain.setTargetAtTime(off, a.ac.currentTime, 0.05);
}

function blip(freq = 880) {
  const a = G.audio;
  if (!a) return;
  const o = a.ac.createOscillator();
  const g = a.ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, a.ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(freq * 1.6, a.ac.currentTime + 0.1);
  g.gain.setValueAtTime(0.18, a.ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.ac.currentTime + 0.18);
  o.connect(g); g.connect(a.ac.destination);
  o.start(); o.stop(a.ac.currentTime + 0.2);
}

// ------------------------------------------------------------------- input
function readInput() {
  const k = G.keys;
  const t = G.touch;
  const up = k.has('ArrowUp') || k.has('w') || k.has('W');
  const down = k.has('ArrowDown') || k.has('s') || k.has('S');
  const left = k.has('ArrowLeft') || k.has('a') || k.has('A');
  const right = k.has('ArrowRight') || k.has('d') || k.has('D');
  G.input.throttle = Math.min(1, (up ? 1 : 0) + (t.gas ? 1 : 0));
  G.input.brake = Math.min(1, (down ? 1 : 0) + (t.brake ? 1 : 0));
  G.input.steer = (right || t.right ? 1 : 0) - (left || t.left ? 1 : 0);
  return G.input;
}

window.addEventListener('keydown', (e) => {
  initAudio();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  G.keys.add(e.key);
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
  if (e.key === 'r' || e.key === 'R') { if (G.mode !== 'menu') startRun(); }
  if (e.key === 'm' || e.key === 'M') { G.mapView = !G.mapView; }
});
window.addEventListener('keyup', (e) => G.keys.delete(e.key));
window.addEventListener('blur', () => { G.keys.clear(); });
// leaving the tab must not leave the car driving into a fail
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'playing') togglePause();
});

function bindHold(btn, act) {
  const on = (e) => {
    e.preventDefault();
    initAudio();
    // capture the pointer: a thumb that slides off GAS or a steer button must not
    // silently drop the input mid-corner
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    G.touch[act] = true;
  };
  const off = (e) => { e.preventDefault(); G.touch[act] = false; };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
}

for (const b of document.querySelectorAll('[data-act]')) bindHold(b, b.dataset.act);

// ------------------------------------------------------------------- screens
function show(id) {
  for (const s of ['menu', 'pause', 'result']) el(s).classList.toggle('hidden', s !== id);
  if (id === null) for (const s of ['menu', 'pause', 'result']) el(s).classList.add('hidden');
}
function hideAll() { for (const s of ['menu', 'pause', 'result']) el(s).classList.add('hidden'); }

function startRun() {
  initAudio();
  if (G.audio && G.audio.ac.state === 'suspended') G.audio.ac.resume();
  G.car = createCar(G.route);
  G.mode = 'playing';
  G.acc = 0;
  G.mapView = false;
  G.best = loadBest();
  G.cam.x = G.car.x; G.cam.y = G.car.y;
  hideAll();
  toast('HOLD GAS · FOLLOW THE ROAD', 2200);
}

function togglePause() {
  if (G.mode === 'playing') { G.mode = 'paused'; show('pause'); }
  else if (G.mode === 'paused') { G.mode = 'playing'; hideAll(); }
}

function finish(win) {
  G.mode = win ? 'won' : 'lost';
  const c = G.car;
  el('rTitle').textContent = win ? 'FINISHED' : 'RUN OVER';
  el('rTime').textContent = fmt(c.time);
  if (win) {
    const g = grade(c.time, G.route.par);
    el('rGrade').textContent = 'GRADE ' + g;
    const isBest = saveBest(c.time);
    const b = loadBest();
    el('rBest').textContent = (isBest ? 'NEW BEST  ' : 'BEST  ') + fmt(b);
  } else {
    el('rGrade').textContent = c.failReason || 'OUT OF TIME';
    el('rBest').textContent = 'PAR ' + fmt(G.route.par);
  }
  show('result');
  blip(win ? 1180 : 300);
}

el('driveBtn').addEventListener('click', () => { initAudio(); startRun(); });
el('againBtn').addEventListener('click', () => startRun());
el('menuBtn2').addEventListener('click', () => { G.mode = 'menu'; show('menu'); });
el('resumeBtn').addEventListener('click', togglePause);
el('restartBtn').addEventListener('click', () => startRun());
el('pausebtn').addEventListener('click', togglePause);
el('mapbtn').addEventListener('click', () => { G.mapView = !G.mapView; });

// ------------------------------------------------------------------- update
function update(dt) {
  if (G.mode !== 'playing') return;
  // the whole-map view is a look, not a drive: pausing here means pressing MAP
  // can never cost you the run
  if (G.mapView) return;
  const input = readInput();
  G.acc += dt;
  const h = 1 / 60;
  let guard = 0;
  while (G.acc >= h && guard++ < 8) {
    const ev = step(G.car, G.route, input, h, MODES.car);
    G.acc -= h;
    if (ev.cp) { blip(); toast(G.car.nextCp >= G.route.checkpoints.length ? 'FINISH' : 'CHECKPOINT ' + G.car.nextCp, 900); }
    if (ev.offroadChanged && G.car.offroad) toast('OFF ROUTE', 1200);
    if (ev.finished) { finish(true); return; }
    if (G.car.failed) { finish(false); return; }
  }
}

// ------------------------------------------------------------------- render
function resize() {
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.round(VW * dpr);
  canvas.height = Math.round(VH * dpr);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.cam.zoom = Math.max(0.30, Math.min(1.1, Math.min(VW, VH) / 1100));

  const r = mini.getBoundingClientRect();
  MW = Math.max(60, r.width); MH = Math.max(45, r.height);
  mini.width = Math.round(MW * dpr);
  mini.height = Math.round(MH * dpr);
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildVignette();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

function roadPath(r) {
  const p = new Path2D();
  p.moveTo(r.pts[0][0], r.pts[0][1]);
  for (let i = 1; i < r.pts.length; i++) p.lineTo(r.pts[i][0], r.pts[i][1]);
  return p;
}

function drawBackdrop(r, z) {
  const im = G.img;
  if (!im) return;
  const S = r.world.scale || 6;
  // full-image scale + clip measures faster here than a source-rect crop
  ctx.drawImage(im, 0, 0, r.world.w, r.world.h);
  // dim only what is on screen, so the printed street names survive
  const hw = VW / (2 * z) + 4, hh = VH / (2 * z) + 4;
  ctx.fillStyle = 'rgba(6,10,16,0.22)';
  ctx.fillRect(G.cam.x - hw, G.cam.y - hh, hw * 2, hh * 2);
}

function drawWorld(now) {
  const r = G.route, car = G.car;
  if (!r) return;
  ctx.clearRect(0, 0, VW, VH);

  // camera
  let tx = car ? car.x : r.world.w / 2;
  let ty = car ? car.y : r.world.h / 2;
  let tz = G.cam.zoom;
  if (G.mapView) {
    // fit the route's own bounding box, not the whole paper: that is the part
    // the human actually drew
    const bb = routeBBox(r);
    tx = (bb.minX + bb.maxX) / 2;
    ty = (bb.minY + bb.maxY) / 2;
    tz = Math.min((VW * 0.92) / Math.max(1, bb.maxX - bb.minX),
                  (VH * 0.74) / Math.max(1, bb.maxY - bb.minY));
  } else if (car) {
    tx += Math.cos(car.heading) * car.speed * 0.22;
    ty += Math.sin(car.heading) * car.speed * 0.22;
  }
  const ease = G.mapView ? 0.12 : 0.14;
  G.cam.x += (tx - G.cam.x) * ease;
  G.cam.y += (ty - G.cam.y) * ease;
  G.cam.zoom += (tz - G.cam.zoom) * 0.12;
  const z = G.cam.zoom;

  ctx.save();
  ctx.translate(VW / 2, VH / 2);
  ctx.scale(z, z);
  ctx.translate(-G.cam.x, -G.cam.y);

  // the printed map itself - this is the "I know this place" layer
  drawBackdrop(r, z);

  const path = roadPath(r);

  // shoulder -> asphalt -> centre line. The visible asphalt edge sits exactly
  // where the OFF ROUTE warning triggers, so the warning never fires while the
  // car still looks like it is on the road.
  const vh = r.halfWidth - 46;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(10,14,20,0.9)';
  ctx.lineWidth = vh * 2 + 90;
  ctx.stroke(path);
  ctx.strokeStyle = '#39424f';
  ctx.lineWidth = vh * 2;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(140,170,200,0.55)';
  ctx.lineWidth = vh * 2;
  ctx.stroke(path);
  ctx.strokeStyle = '#3d4756';
  ctx.lineWidth = vh * 2 - 16;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(210,226,244,0.75)';
  ctx.lineWidth = 5;
  ctx.setLineDash([52, 44]);
  ctx.stroke(path);
  ctx.setLineDash([]);

  // checkpoints
  const cps = r.checkpoints;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const done = car ? i < car.nextCp : false;
    const next = car ? i === car.nextCp : i === 0;
    const pulse = next ? 1 + 0.06 * Math.sin(now / 220) : 1;
    ctx.beginPath();
    ctx.arc(cp.p[0], cp.p[1], 260 * pulse, 0, Math.PI * 2);
    ctx.lineWidth = next ? 14 : 8;
    ctx.strokeStyle = done ? 'rgba(60,220,140,0.85)'
      : next ? 'rgba(245,200,70,0.95)' : 'rgba(150,170,195,0.45)';
    ctx.stroke();
    if (next) {
      ctx.fillStyle = 'rgba(245,200,70,0.10)';
      ctx.fill();
    }
  }

  // landmarks - the talking-point labels. Font size is set in WORLD units, so it
  // must be screenPx / zoom or the whole-map view renders 1 px tall text.
  const screenPx = G.mapView ? 16 : 13;
  const labWorld = screenPx / Math.max(0.02, z);
  ctx.font = '700 ' + labWorld.toFixed(1) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const lm of r.landmarks) {
    const x = lm.p[0];
    const y = lm.p[1] - labWorld * 2.0;
    // a label sitting on top of the car is noise
    if (G.car && Math.hypot(x - G.car.x, lm.p[1] - G.car.y) * z < 150) continue;
    const w = ctx.measureText(lm.name).width;
    const padX = labWorld * 0.55, padY = labWorld * 0.42;
    const bw = w + padX * 2, bh = labWorld + padY * 2;

    // do not draw a label that would be clipped by the screen edge
    const sx = VW / 2 + (x - G.cam.x) * z;
    const sy = VH / 2 + (y - G.cam.y) * z;
    const halfPx = (bw * z) / 2;
    const topLimit = G.mapView ? 40 : 64;
    const botLimit = G.mapView ? VH - 70 : VH - 120;
    if (sx - halfPx < 6 || sx + halfPx > VW - 6 || sy < topLimit || sy > botLimit) continue;

    const bx = x - w / 2 - padX, by = y - labWorld / 2 - padY;
    const rad = labWorld * 0.45;
    ctx.beginPath();
    ctx.moveTo(bx + rad, by);
    ctx.lineTo(bx + bw - rad, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rad);
    ctx.lineTo(bx + bw, by + bh - rad);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rad, by + bh);
    ctx.lineTo(bx + rad, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rad);
    ctx.lineTo(bx, by + rad);
    ctx.quadraticCurveTo(bx, by, bx + rad, by);
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,13,20,0.78)';
    ctx.fill();
    ctx.fillStyle = 'rgba(238,246,255,0.98)';
    ctx.fillText(lm.name, x, y);
  }
  ctx.textBaseline = 'alphabetic';

  // car
  if (car) {
    const L = 170, W = 92;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading + Math.PI / 2);
    // shadow so the car sits on the road instead of floating over it
    ctx.beginPath();
    ctx.ellipse(0, L * 0.10, W * 0.72, L * 0.56, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();
    if (carSprite) {
      ctx.drawImage(carSprite, -W / 2, -L / 2, W, L);
    }
    ctx.restore();

    if (car.offroad) {
      ctx.beginPath();
      ctx.arc(car.x, car.y, 230, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,90,70,' + (0.5 + 0.3 * Math.sin(now / 120)) + ')';
      ctx.lineWidth = 10;
      ctx.stroke();
    }
  }

  ctx.restore();

  // vignette: depth without hiding the map. Built once per resize, not per frame -
  // a full-screen radial gradient every frame costs more than the whole scene in
  // software rendering.
  if (!vignette) buildVignette();
  if (vignette) ctx.drawImage(vignette, 0, 0, VW, VH);

  // off-screen pointer to the next checkpoint: without it the player has no
  // idea where to go when the ring is outside the view
  drawCpArrow(z);
}

let bboxCache = null;

function routeBBox(r) {
  if (bboxCache) return bboxCache;
  let minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18;
  for (const p of r.pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  bboxCache = { minX, minY, maxX, maxY };
  return bboxCache;
}

function drawCpArrow(z) {
  if (!G.car || G.mode !== 'playing') return;
  const r = G.route;
  const i = G.car.nextCp;
  if (i >= r.checkpoints.length) return;
  const cp = r.checkpoints[i];
  const sx = VW / 2 + (cp.p[0] - G.cam.x) * z;
  const sy = VH / 2 + (cp.p[1] - G.cam.y) * z;
  const m = 58, top = 96, bottom = VH - 132;
  if (sx > m && sx < VW - m && sy > top && sy < bottom) return; // ring is on screen

  // a fixed ring around the screen centre: never lands on the pause button or
  // the pedals the way an edge-clamped arrow did
  const ang = Math.atan2(sy - VH / 2, sx - VW / 2);
  const R = Math.min(VW, VH) * 0.32;
  const cx = VW / 2 + Math.cos(ang) * R;
  const cy = VH / 2 + Math.sin(ang) * R;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  ctx.scale(dpr, dpr);
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-12, 12);
  ctx.lineTo(-12, -12);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245,200,70,0.95)';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

let vignette = null;

function buildVignette() {
  vignette = document.createElement('canvas');
  vignette.width = Math.max(1, Math.round(VW));
  vignette.height = Math.max(1, Math.round(VH));
  const c = vignette.getContext('2d');
  const vg = c.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.28,
                                    VW / 2, VH / 2, Math.max(VW, VH) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  c.fillStyle = vg;
  c.fillRect(0, 0, VW, VH);
}

let carSprite = null;

function drawMini() {
  const r = G.route;
  if (!r) return;
  mctx.clearRect(0, 0, MW, MH);
  const pad = 6;
  const s = Math.min((MW - pad * 2) / r.world.w, (MH - pad * 2) / r.world.h);
  const ox = (MW - r.world.w * s) / 2;
  const oy = (MH - r.world.h * s) / 2;
  mctx.save();
  mctx.translate(ox, oy);
  mctx.scale(s, s);
  mctx.lineCap = 'round';
  mctx.strokeStyle = 'rgba(150,185,220,0.85)';
  mctx.lineWidth = Math.max(6, 120);
  mctx.beginPath();
  mctx.moveTo(r.pts[0][0], r.pts[0][1]);
  for (let i = 1; i < r.pts.length; i++) mctx.lineTo(r.pts[i][0], r.pts[i][1]);
  mctx.stroke();
  mctx.restore();

  const put = (wx, wy, col, rad) => {
    const x = ox + wx * s, y = oy + wy * s;
    mctx.beginPath(); mctx.arc(x, y, rad, 0, Math.PI * 2);
    mctx.fillStyle = col; mctx.fill();
  };
  const cps = r.checkpoints;
  for (let i = 0; i < cps.length; i++) {
    put(cps[i].p[0], cps[i].p[1], i === (G.car ? G.car.nextCp : 0) ? '#f5c846' : 'rgba(160,180,200,0.7)', 2.4);
  }
  if (G.car) put(G.car.x, G.car.y, '#ff5544', 3.2);
}

function drawHud(now) {
  const car = G.car, r = G.route;
  if (!car || !r) return;
  el('time').textContent = fmt(car.time);
  const p = Math.max(0, Math.min(1, car.s / r.length));
  el('bar').style.width = (p * 100).toFixed(1) + '%';
  const total = r.checkpoints.length;
  const cpn = Math.min(car.nextCp + 1, total);
  el('cpcount').textContent = 'NEXT ' + cpn + '/' + total;
  const nextCp = r.checkpoints[Math.min(car.nextCp, total - 1)];
  // percent of the way to the next ring - honest, unlike a made-up distance unit
  const pct = nextCp.s > 0 ? Math.min(100, Math.round((car.s / nextCp.s) * 100)) : 100;
  el('nextcp').textContent = pct + '%';
  el('speed').textContent = 'SPD ' + Math.round((car.speed / MODES.car.vmax) * 100) + '%';
  const warn = el('warn');
  if (car.offroad) {
    warn.textContent = 'OFF ROUTE  ' + car.offroadTime.toFixed(1) + 's';
    warn.style.opacity = '1';
  } else {
    warn.textContent = '';
    warn.style.opacity = '0';
  }
  const t = el('toast');
  if (now < G.toastUntil && !G.mapView) {
    t.textContent = G.toast;
    t.classList.remove('hidden');
  } else {
    t.classList.add('hidden');
  }
}

// --------------------------------------------------------------------- loop
function frame(now) {
  const dt = Math.min(0.1, (now - (G.last || now)) / 1000);
  G.last = now;
  update(dt);
  drawWorld(now);
  drawMini();
  if (G.mode === 'playing' || G.mode === 'won' || G.mode === 'lost') drawHud(now);
  audioTick();

  if (G.car) {
    window.__game.player.x = G.car.x;
    window.__game.player.y = G.car.y;
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------- levels
const LEVELS = [
  { file: 'data/level.json', label: 'Test Commute' },
  { file: 'data/level-side.json', label: 'Side Streets' },
];

const imgCache = {};
async function levelImage(name) {
  if (imgCache[name]) return imgCache[name];
  const im = await new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = 'assets/' + name;
  });
  imgCache[name] = im;
  return im;
}

async function loadLevel(i) {
  const lvl = await (await fetch(LEVELS[i].file)).json();
  G.level = lvl;
  G.route = buildRoute(lvl);
  G.route.world = lvl.world;
  bboxCache = null;
  G.best = loadBest();
  // each level carries its own underlay: the second route used to load the
  // first route's photo, with the wrong ink stroke drawn on it
  G.img = await levelImage(lvl.photo_file || 'map.jpg');
  el('menuSub').textContent = lvl.name;
  el('menuMeta').textContent = lvl.points.length + ' points · ' +
    lvl.checkpoints.length + ' checkpoints · par ' + lvl.par.toFixed(1) + 's';
  el('parline').textContent = 'PAR ' + lvl.par.toFixed(1) + 's';
  for (let k = 0; k < LEVELS.length; k++) {
    const b = el('lvl-' + k);
    if (b) b.classList.toggle('on', k === i);
  }
}

// --------------------------------------------------------------------- boot
async function boot() {
  const box = el('levels');
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button');
    b.id = 'lvl-' + i;
    b.className = 'chip';
    b.textContent = L.label;
    b.addEventListener('click', async () => {
      await loadLevel(i);
      if (G.mode !== 'menu') { G.mode = 'menu'; show('menu'); }
    });
    box.appendChild(b);
  });
  await loadLevel(0);

  carSprite = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = 'assets/car.png';
  });

  resize();
  G.cam.x = G.route.world.w / 2;
  G.cam.y = G.route.world.h / 2;
  G.cam.zoom = 0.6;

  G.best = loadBest();
  show('menu');
  requestAnimationFrame(frame);
}

window.__game = {
  get state() { return G.mode; },
  player: { x: 0, y: 0 },
  get score() { return G.car ? G.car.cpTaken : 0; },
  get info() {
    return {
      mode: G.mode,
      time: G.car ? G.car.time : 0,
      speed: G.car ? G.car.speed : 0,
      progress: G.car && G.route ? G.car.s / G.route.length : 0,
      cp: G.car ? G.car.nextCp : 0,
      offroad: G.car ? G.car.offroad : false,
    };
  },
  start() { startRun(); },
};

boot();
