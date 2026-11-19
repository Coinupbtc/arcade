// Dune Drift — one track, three laps, three rivals. Scene flow: boot -> menu -> countdown -> play -> pause -> over.
import * as THREE from 'three';
import { HDRLoader } from '../lib/HDRLoader.js';
import { CFG } from './constants.js';
import { buildTrack, heightAt, RAMP, PADS } from './track.js';
import { buildCraft } from './craft.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';

const qs = new URLSearchParams(location.search);
const AUTOSTART = qs.get('autostart') === '1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const fmt = (ms) => {
  if (!isFinite(ms) || ms <= 0) return '—';
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
};
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || n + 'th';

// ------------------------------------------------------------------ renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb07a5e, 140, 900);

const camera = new THREE.PerspectiveCamera(CFG.fovMin, window.innerWidth / window.innerHeight, 0.35, 2600);
camera.position.set(0, 6, -12);

// ------------------------------------------------------------------ lights
const sun = new THREE.DirectionalLight(0xffb37a, 3.6);
sun.position.set(120, 110, -70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);

const rim = new THREE.DirectionalLight(0x8f6bff, 0.85);
rim.position.set(-90, 50, 120);
scene.add(rim);

// ------------------------------------------------------------------ state
const race = {
  mode: 'boot',            // boot | menu | countdown | play | over
  time: 0,                 // seconds of racing
  cd: 0,                   // countdown clock
  freezeUntilInput: false,
  lap: 1,
  lapStart: 0,
  lapTimes: [],
  bestLap: 0,
  hits: 0,
  cutouts: 0,
  place: 4,
  dist: 0,
  finished: false,
  started: false,
  flashT: 0,
  shake: 0,
  hintT: 0
};

const P = {
  x: 0, z: 0, y: 0, heading: 0, speed: 0, vy: 0, air: false,
  u: 0.985, uPrev: 0.985, lap: 1, si: 0, crossed: false,
  heat: 0, cutout: 0, padT: 0, wallCd: 0, steer: 0, slip: 0,
  still: 0, lastX: 0, lastZ: 0, bounce: 0, landSquash: 0, boostHeld: false,
  respawns: 0, progress: 0
};

const rivals = [];

let track = null, fx = null, playerCraft = null;
const craftGroups = [];
let best = { time: 0, lap: 0, medal: '' };
try {
  const raw = localStorage.getItem('dunedrift.best.v1');
  if (raw) best = Object.assign(best, JSON.parse(raw));
} catch (e) { /* private mode */ }

function saveBest() {
  try { localStorage.setItem('dunedrift.best.v1', JSON.stringify(best)); } catch (e) {}
}

// ------------------------------------------------------------------ assets
function texLoader() {
  const L = new THREE.TextureLoader();
  return (url, opts) => new Promise((res, rej) => {
    L.load(url, (t) => {
      const o = opts || {};
      if (o.srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
      res(t);
    }, undefined, rej);
  });
}

let bootStep = 0;
const BOOT_STEPS = 8;
function bootProgress(msg) {
  bootStep++;
  $('bootbar').style.width = Math.round((bootStep / BOOT_STEPS) * 100) + '%';
  if (msg) $('bootmsg').textContent = msg;
}

async function loadAll() {
  const TL = texLoader();
  const tex = {};
  const jobs = [
    TL('assets/pbr/sand_01/albedo.jpg', { srgb: true }).then((t) => (tex.sand = t)),
    TL('assets/pbr/sand_01/normal.jpg').then((t) => (tex.sandN = t)),
    TL('assets/pbr/sand_01/arm.jpg').then((t) => (tex.sandR = t)),
    TL('assets/pbr/rock/albedo.jpg', { srgb: true }).then((t) => (tex.rock = t)),
    TL('assets/pbr/rock/normal.jpg').then((t) => (tex.rockN = t)),
    TL('assets/pbr/rock/arm.jpg').then((t) => (tex.rockR = t))
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((r, i) => { if (r.status === 'rejected') console.warn('texture ' + i + ' failed', r.reason && r.reason.message); });
  bootProgress('textures');

  // HDRI: 1k lights the scene through PMREM, 2k is the sky you see
  try {
    const hdr = await new HDRLoader().loadAsync('assets/hdri/the_sky_is_on_fire_1k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(hdr);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    bootProgress('sky light');
    const bg = await new HDRLoader().loadAsync('assets/hdri/the_sky_is_on_fire_2k.hdr');
    bg.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = bg;
    scene.backgroundIntensity = 1.0;
  } catch (e) {
    console.warn('HDRI failed, using gradient sky', e && e.message);
    scene.background = gradientSky();
    scene.environment = null;
  }
  bootProgress('sky');
  return tex;
}

function gradientSky() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#2b1b3d');
  grd.addColorStop(0.45, '#7a3f5c');
  grd.addColorStop(0.72, '#e08a4a');
  grd.addColorStop(1, '#ffc793');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// ------------------------------------------------------------------ build world
function placeCraft(obj, u, lat) {
  const s = track.sampleAtU(u);
  const p = new THREE.Vector3().copy(s.p).addScaledVector(s.right, lat);
  obj.position.set(p.x, s.p.y + CFG.hoverHeight, p.z);
  return { x: p.x, z: p.z, y: s.p.y + CFG.hoverHeight, heading: Math.atan2(s.t.x, s.t.z) };
}

function buildWorld(tex) {
  track = buildTrack(scene, tex);
  bootProgress('canyon');

  fx = new FX(scene);
  bootProgress('dust');

  playerCraft = buildCraft(CFG.playerCol, CFG.col.cyan);
  playerCraft.scale.setScalar(1.15);
  scene.add(playerCraft);
  craftGroups.push(playerCraft);

  // grid: player 4th, three rivals staggered ahead
  const grid = [
    { u: 0.997, lat: -3.2 },
    { u: 0.993, lat: 3.2 },
    { u: 0.989, lat: 0 },
    { u: 0.984, lat: 0 }
  ];
  const startPos = placeCraft(playerCraft, grid[3].u, grid[3].lat);
  P.x = startPos.x; P.z = startPos.z; P.y = startPos.y; P.heading = startPos.heading;
  P.u = P.uPrev = grid[3].u;
  P.lastX = P.x; P.lastZ = P.z;

  for (let i = 0; i < 3; i++) {
    const g = buildCraft(0x1c1226, CFG.rivalCols[i]);
    g.scale.setScalar(1.15);
    scene.add(g);
    craftGroups.push(g);
    const sp = placeCraft(g, grid[i].u, grid[i].lat);
    rivals.push({
      i, group: g, u: grid[i].u, uPrev: grid[i].u, lat: grid[i].lat,
      latBase: grid[i].lat, x: sp.x, z: sp.z, y: sp.y, heading: sp.heading,
      speed: 0, air: false, vy: 0, lap: 1, crossed: false, si: 0,
      still: 0, lastX: sp.x, lastZ: sp.z, skill: 0.985 - i * 0.012, respawns: 0,
      progress: 0, wob: Math.random() * 6.28
    });
  }
  bootProgress('rivals');
}

// ------------------------------------------------------------------ input
let input = null;
let lastDevice = '';

function promptRow(items) {
  if (!input) return '';
  return items.map(([act, label]) => {
    const url = input.prompt(act, input.device);
    return url ? '<span class="ai-prompt"><img src="' + url + '" alt=""><i>' + label + '</i></span>'
               : '<span class="ai-prompt"><i>' + label + '</i></span>';
  }).join('');
}

function renderControls() {
  const dev = input ? input.device : 'keyboard';
  const menu = $('menucontrols');
  const pause = $('pausecontrols');
  const hint = $('hint');
  if (dev === 'touch') {
    menu.innerHTML = '<span class="ai-prompt"><i>LEFT THUMB — STEER</i></span>' +
      '<span class="ai-prompt"><i>BOOST</i></span><span class="ai-prompt"><i>AIR-BRAKE</i></span>' +
      '<span class="ai-prompt"><i>⏸ PAUSE</i></span>';
    hint.innerHTML = '<span><b>LEFT THUMB</b> STEER</span><span><b>BOOST</b> +35% · watch HEAT</span><span><b>AIR-BRAKE</b> tightens turns</span>';
  } else if (dev === 'pad') {
    menu.innerHTML = '<span class="ai-prompt"><i>LEFT STICK — STEER</i></span>' +
      '<span class="ai-prompt"><i>A — BOOST</i></span><span class="ai-prompt"><i>X — AIR-BRAKE</i></span>' +
      '<span class="ai-prompt"><i>START — PAUSE</i></span>';
    hint.innerHTML = '<span><b>STICK</b> STEER</span><span><b>A</b> BOOST · watch HEAT</span><span><b>X</b> AIR-BRAKE</span>';
  } else {
    menu.innerHTML = '<span class="ai-prompt"><i>A / D or ← → — STEER</i></span>' +
      '<span class="ai-prompt"><i>SPACE — BOOST</i></span><span class="ai-prompt"><i>S / ↓ — AIR-BRAKE</i></span>' +
      '<span class="ai-prompt"><i>P — PAUSE</i></span>';
    hint.innerHTML = '<span><b>A / D</b> STEER</span><span><b>SPACE</b> BOOST · watch HEAT</span><span><b>S</b> AIR-BRAKE</span>';
  }
  pause.innerHTML = menu.innerHTML;
  lastDevice = dev;
}

// ------------------------------------------------------------------ HUD layout from the real canvas
const hudEls = {};
function layoutHUD() {
  const w = window.innerWidth, h = window.innerHeight;
  const root = document.documentElement.style;
  const s = clamp(Math.min(w, h) / 430, 0.74, 1.12);
  root.setProperty('--possize', Math.round(46 * s) + 'px');
  root.setProperty('--lapsize', Math.round(14 * s) + 'px');
  root.setProperty('--spdsize', Math.round(34 * s) + 'px');
  root.setProperty('--heath', Math.round(12 * s) + 'px');

  // keep the bottom-centre block clear of the template's own thumb buttons (real rects)
  let leftMost = w;
  if (input && input.ui) {
    input.ui().forEach((b) => { if (b.name !== 'pause' && b.x < leftMost) leftMost = b.x; });
  }
  const bc = $('hud-bc');
  const freeW = 2 * (leftMost - w / 2);
  if (leftMost < w - 20 && freeW < 150) {
    // portrait: no room between the thumbs -> lift the speed block above the buttons
    let topY = h;
    if (input && input.ui) input.ui().forEach((b) => { if (b.name !== 'pause') topY = Math.min(topY, b.y); });
    bc.style.bottom = Math.round(h - topY + 10) + 'px';
    bc.style.width = Math.round(clamp(w * 0.42, 132, 190)) + 'px';
  } else {
    bc.style.bottom = Math.round(14 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sb')) || 0)) + 'px';
    bc.style.width = Math.round(Math.min(w * 0.42, 232 * s)) + 'px';
  }
  document.body.classList.toggle('portrait', h > w);
}

// ------------------------------------------------------------------ race control
function setMode(m) {
  race.mode = m;
  document.body.classList.toggle('playing', m === 'play' || m === 'countdown');
  $('menu').classList.toggle('on', m === 'menu');
  $('over').classList.toggle('on', m === 'over');
  $('pausescreen').classList.toggle('on', m === 'paused');
  $('boot').classList.toggle('on', m === 'boot');
  if (m !== 'play' && m !== 'countdown') $('hint').classList.remove('on');
}

function resetRace() {
  if (input) input.pause.reset();
  race.time = 0; race.cd = 0; race.lap = 1; race.lapStart = 0; race.lapTimes = [];
  race.bestLap = 0; race.hits = 0; race.cutouts = 0; race.dist = 0; race.place = 4;
  race.finished = false; race.started = false; race.shake = 0;
  const grid = [
    { u: 0.997, lat: -3.2 }, { u: 0.993, lat: 3.2 }, { u: 0.989, lat: 0 }, { u: 0.984, lat: 0 }
  ];
  const sp = placeCraft(playerCraft, grid[3].u, grid[3].lat);
  Object.assign(P, {
    x: sp.x, z: sp.z, y: sp.y, heading: sp.heading, speed: 0, vy: 0, air: false,
    u: grid[3].u, uPrev: grid[3].u, lap: 1, crossed: false, heat: 0, cutout: 0, padT: 0,
    wallCd: 0, steer: 0, slip: 0, still: 0, lastX: sp.x, lastZ: sp.z, landSquash: 0, respawns: 0, progress: 0
  });
  P.si = track.nearest(sp.x, sp.z, null).i;
  rivals.forEach((a, i) => {
    const g = grid[i];
    const rp = placeCraft(a.group, g.u, g.lat);
    Object.assign(a, {
      u: g.u, uPrev: g.u, lat: g.lat, latBase: g.lat, x: rp.x, z: rp.z, y: rp.y,
      heading: rp.heading, speed: 0, air: false, vy: 0, lap: 1, crossed: false,
      still: 0, lastX: rp.x, lastZ: rp.z, respawns: 0, progress: 0
    });
  });
  fx.clear();
  Audio.engine(0, 0, false);
}

function startRace(opts) {
  resetRace();
  race.freezeUntilInput = !!(opts && opts.freeze);
  setMode('countdown');
  race.cd = 3.2;
  race.lastBeep = 4;
  lastCount = '';
  Audio.startMusic();
  showCount('3');
}

function toMenu() {
  setMode('menu');
  resetRace();
  Audio.stopMusic();
  updateMenuMeta();
}

let lastCount = '';
function showCount(txt) {
  const el = $('count');
  if (txt === '') { el.classList.remove('on'); lastCount = ''; return; }
  if (txt === lastCount) return;
  lastCount = txt;
  el.textContent = txt;
  el.classList.add('on');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function updateMenuMeta() {
  const m = $('menumeta');
  const parts = [];
  if (best.time) parts.push('BEST RACE <b>' + fmt(best.time) + '</b>');
  if (best.lap) parts.push('BEST LAP <b>' + fmt(best.lap) + '</b>');
  if (best.medal) parts.push('<b>' + best.medal.toUpperCase() + '</b> MEDAL');
  m.innerHTML = parts.length ? parts.join(' · ') : 'First run: finish 3 laps to set a best.';
}

// ------------------------------------------------------------------ race physics
function respawnPlayer() {
  const s = track.sampleAtU(P.u);
  P.x = s.p.x; P.z = s.p.z; P.y = s.p.y + CFG.hoverHeight;
  P.heading = Math.atan2(s.t.x, s.t.z);
  P.speed = 8; P.vy = 0; P.air = false; P.heat = Math.max(0, P.heat - 40);
  P.lastX = P.x; P.lastZ = P.z; P.still = 0; P.respawns++;
  race.flashT = 0.32;
  fx.dust(P.x, P.y - 0.5, P.z, 16, 0x35e1e8, 5);
  Audio.play('pad_kick');
}

function wallHit(nx, nz) {
  P.speed *= 1 - CFG.wallLoss;
  P.wallCd = CFG.wallCooldown;
  race.hits++;
  race.shake = Math.min(6, race.shake + 4.2);
  fx.sparks(P.x, P.y + 0.3, P.z, 12, 0xffb347, nx, nz);
  Audio.play('wall_scrape');
  if (navigator.vibrate) navigator.vibrate(18);
  if (input) input.rumble(90, 0.5, 0.2);
}

function stepPlayer(dt, f, hold) {
  const running = race.mode === 'play' && !hold;
  if (hold) { P.speed = 0; P.steer = 0; P.slip = 0; }
  const steerIn = running ? clamp(f.move.x, -1, 1) : 0;
  P.steer = damp(P.steer, steerIn, CFG.steerSmooth, dt);
  const braking = running && !!f.held.secondary;
  const wantBoost = running && !!f.held.primary;

  if (wantBoost && !P.boostHeld) Audio.play('boost_ignite');
  P.boostHeld = wantBoost;

  const speedFrac = clamp(P.speed / CFG.topSpeed, 0, 1.35);

  // heat + boost
  let boosting = false;
  if (running) {
    if (P.cutout > 0) {
      P.cutout -= dt;
      if (P.cutout <= 0) P.cutout = 0;
    } else if (P.padT > 0) {
      P.padT -= dt; boosting = true;
    } else if (wantBoost) {
      boosting = true;
      P.heat = Math.min(100, P.heat + CFG.heatPerSec * dt);
      if (P.heat >= 100) {
        P.cutout = CFG.cutoutSec;
        race.cutouts++;
        Audio.play('boost_cut');
        race.shake = Math.min(6, race.shake + 3);
        $('cutflash').classList.add('on');
        if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
      }
    }
    if (!boosting && P.padT <= 0) P.heat = Math.max(0, P.heat - CFG.coolPerSec * dt);
  }

  // speed
  let target = CFG.topSpeed;
  if (boosting) target *= CFG.boostMul;
  if (P.cutout > 0) target = CFG.topSpeed * CFG.cutoutSpeedMul;
  if (P.air) target *= 0.99;
  if (race.mode !== 'play') target = 0;

  if (braking) {
    P.speed = Math.max(0, P.speed - CFG.brakeDecel * dt);
  } else {
    const k = target > P.speed ? CFG.accelTau : CFG.coastTau;
    P.speed += (target - P.speed) * clamp(k * dt, 0, 1);
  }
  P.speed = clamp(P.speed, 0, CFG.topSpeed * CFG.boostMul + 2);

  // steering (falls with speed; air-brake tightens)
  const yaw = lerp(CFG.steerAt0, CFG.steerAtTop, clamp(P.speed / CFG.topSpeed, 0, 1)) *
    (braking ? CFG.brakeTurnMul : 1);
  // screen-right is -X when the craft faces +Z (three cameras look down local -Z): right thumb = -yaw
  P.heading -= P.steer * yaw * dt;
  P.slip = damp(P.slip, -P.steer * Math.min(0.16, speedFrac * 0.18), 8, dt);

  // move
  const dirx = Math.sin(P.heading), dirz = Math.cos(P.heading);
  const px = P.x, pz = P.z;
  P.x += dirx * P.speed * dt;
  P.z += dirz * P.speed * dt;
  race.dist += Math.hypot(P.x - px, P.z - pz);

  // track relation
  const near = track.nearest(P.x, P.z, P.si);
  P.si = near.i;
  const s = track.samples[P.si];
  const dx = P.x - s.p.x, dz = P.z - s.p.z;
  const lat = dx * s.right.x + dz * s.right.z;

  // wall: clamp laterally (so the hull slides), lose 20% once per contact
  if (Math.abs(lat) > CFG.wallHalf) {
    const over = Math.abs(lat) - CFG.wallHalf;
    const sg = Math.sign(lat);
    P.x -= s.right.x * over * sg;
    P.z -= s.right.z * over * sg;
    P.speed = Math.max(0, P.speed - CFG.scrapeDrag * dt);
    if (P.wallCd <= 0) wallHit(-s.right.x * sg, -s.right.z * sg);
  }
  P.wallCd = Math.max(0, P.wallCd - dt);

  // progress along the line
  const u = (P.si + 0.5) / track.N;
  P.uPrev = P.u;
  P.u = u;

  // jump lip
  if (!P.air && P.uPrev < RAMP.lip && P.u >= RAMP.lip && P.uPrev > RAMP.lip - 0.02) {
    P.air = true;
    P.vy = clamp(P.speed * CFG.jumpVy, 2.2, 9.5);
    Audio.play('jump_launch');
    race.shake = Math.min(6, race.shake + 1.6);
    fx.dust(P.x, P.y, P.z, 10, 0xe8c48a, 4);
  }

  const roadY = heightAt(P.u);
  if (P.air) {
    P.vy -= CFG.gravity * dt;
    P.y += P.vy * dt;
    if (P.y <= roadY + CFG.hoverHeight) {
      P.y = roadY + CFG.hoverHeight;
      P.air = false;
      P.landSquash = 1;
      race.shake = Math.min(6, race.shake + 2.4);
      fx.dust(P.x, P.y - 0.4, P.z, 22, 0xe8c48a, 7);
      Audio.play('land_thud');
      if (navigator.vibrate) navigator.vibrate(24);
    }
  } else {
    P.y = roadY + CFG.hoverHeight + Math.sin(race.time * 6 + P.u * 60) * 0.035;
  }

  // boost pads
  PADS.forEach((pad) => {
    const du = Math.abs(((P.u - pad.u + 1.5) % 1) - 0.5);
    if (du < 0.0035) {
      const s2 = track.sampleAtU(pad.u);
      const d = (P.x - s2.p.x) * s2.right.x + (P.z - s2.p.z) * s2.right.z;
      if (Math.abs(d - pad.lat) < 4.2 && P.padT <= 0) {
        P.padT = CFG.padBoostSec;
        Audio.play('pad_kick');
        fx.sparks(P.x, P.y, P.z, 18, 0x35e1e8, dirx, dirz);
        race.shake = Math.min(6, race.shake + 1.2);
      }
    }
  });

  // stuck -> respawn on the racing line
  const moved = Math.hypot(P.x - P.lastX, P.z - P.lastZ);
  P.lastX = P.x; P.lastZ = P.z;
  if (race.mode === 'play' && !hold) {
    if (moved > 0.02) P.still = 0; else P.still += dt;
    if (P.still > CFG.respawnAfter) respawnPlayer();
  }

  // laps
  if (race.mode === 'play') {
    if (P.uPrev > 0.85 && P.u < 0.15) {
      if (!P.crossed) {
        P.crossed = true;
        race.started = true;
        race.lapStart = race.time;
        Audio.play('lap_bell');
      } else {
        const lt = (race.time - race.lapStart) * 1000;
        race.lapTimes.push(lt);
        if (!race.bestLap || lt < race.bestLap) race.bestLap = lt;
        race.lapStart = race.time;
        P.lap++;
        if (P.lap > CFG.laps) {
          finishRace();
        } else {
          Audio.play('lap_bell');
          showCount('LAP ' + P.lap);
          setTimeout(() => { if (race.mode === 'play') showCount(''); }, 1100);
        }
      }
    } else if (P.uPrev < 0.15 && P.u > 0.85) {
      if (P.lap > 1) P.lap--;
    }
    if (P.crossed) race.time += dt;
  }

  // craft visuals
  const g = playerCraft;
  g.position.set(P.x, P.y, P.z);
  g.rotation.set(0, P.heading + P.slip, 0);
  g.rotation.z = P.steer * 0.2 + P.slip * 0.35;
  g.rotation.x = clamp(-P.vy * 0.02, -0.2, 0.2) + (P.air ? 0 : Math.sin(race.time * 3) * 0.008);
  P.landSquash = Math.max(0, P.landSquash - dt * 4);
  const sq = 1 - P.landSquash * 0.28;
  g.scale.set(1.15 * (2 - sq), 1.15 * sq, 1.15 * (2 - sq));

  const ud = g.userData;
  const heatF = P.heat / 100;
  ud.ventMat.emissiveIntensity = 1.1 + heatF * 2.6 + (boosting ? 1.6 : 0);
  ud.glowSprite.material.opacity = 0.45 + heatF * 0.4 + (boosting ? 0.4 : 0);
  ud.glowSprite.scale.setScalar(2.2 + heatF * 1.1 + (boosting ? 1.2 : 0));
  ud.flame.material.opacity = damp(ud.flame.material.opacity, boosting ? 0.75 : 0, 12, dt);
  ud.flame.scale.set(1, 1, 0.55 + speedFrac * 0.9 + (boosting ? 0.9 : 0));
  ud.cushion.material.opacity = 0.2 + Math.min(0.35, speedFrac * 0.3);
  if (ud.shimmer) {
    ud.shimmer.material.opacity = heatF > 0.55 ? (heatF - 0.55) * 1.6 * (0.6 + 0.4 * Math.sin(race.time * 22)) : 0;
    ud.shimmer.scale.setScalar(0.9 + heatF * 0.9);
  }

  // dust + speed lines
  if (!P.air && P.speed > 6) {
    const back = { x: P.x - dirx * 2.2, z: P.z - dirz * 2.2 };
    fx.dust(back.x, P.y - 0.8, back.z, P.speed > 30 ? 1 : 1, 0xc9a877, 1.1 + speedFrac * 1.4);
  }
  if (P.cutout > 0) fx.smoke(P.x - dirx * 1.8, P.y + 0.5, P.z - dirz * 1.8, 2, 0x9a8f8a);
  if (boosting) fx.dust(P.x - dirx * 2.4, P.y + 0.2, P.z - dirz * 2.4, 2, 0x35e1e8, 2.2);
}

// ------------------------------------------------------------------ rivals
function stepRival(a, dt) {
  const live = race.mode === 'play';
  const s = track.sampleAtU(a.u);
  const k = Math.abs(s.k);
  const vCorner = Math.sqrt(CFG.aiLatAccel / Math.max(k, 0.0009));
  const gap = (P.lap + P.u) - (a.lap + a.u);
  const rubber = 1 + clamp(gap * 0.06, -CFG.aiRubber, CFG.aiRubber);
  let target = Math.min(CFG.aiTop[a.i] * a.skill * rubber, vCorner);
  target = clamp(target, 14, CFG.aiTop[a.i] * 1.12);
  if (!live) target = 0;
  if (a.cutout > 0) { a.cutout -= dt; target *= CFG.cutoutSpeedMul; }
  a.speed = damp(a.speed, target, target > a.speed ? 1.8 : 3.2, dt);

  a.uPrev = a.u;
  a.u = (a.u + (a.speed * dt) / track.length + 1) % 1;

  // same jump lip rule as the player
  if (!a.air && a.uPrev < RAMP.lip && a.u >= RAMP.lip && a.uPrev > RAMP.lip - 0.03) {
    a.air = true;
    a.vy = clamp(a.speed * CFG.jumpVy, 2.2, 9.5);
  }
  const roadY = heightAt(a.u);
  if (a.air) {
    a.vy -= CFG.gravity * dt;
    a.y += a.vy * dt;
    if (a.y <= roadY + CFG.hoverHeight) { a.y = roadY + CFG.hoverHeight; a.air = false; }
  } else {
    a.y = roadY + CFG.hoverHeight;
  }

  const lat = clamp(a.latBase + Math.sin(a.u * 34 + a.wob) * 0.9, -7.2, 7.2);
  const s2 = track.sampleAtU(a.u);
  const x = s2.p.x + s2.right.x * lat;
  const z = s2.p.z + s2.right.z * lat;
  a.x = x; a.z = z;
  a.heading = Math.atan2(s2.t.x, s2.t.z);

  // every rival gets the same no-progress guard as the player
  const moved = Math.hypot(a.x - a.lastX, a.z - a.lastZ);
  a.lastX = a.x; a.lastZ = a.z;
  if (live) {
    if (moved > 0.02) a.still = 0; else a.still += dt;
    if (a.still > CFG.respawnAfter) {
      const r = track.sampleAtU(a.u);
      a.x = r.p.x; a.z = r.p.z; a.y = r.p.y + CFG.hoverHeight;
      a.heading = Math.atan2(r.t.x, r.t.z);
      a.speed = 9; a.air = false; a.still = 0; a.lastX = a.x; a.lastZ = a.z; a.respawns++;
    }
  }

  // laps
  if (a.uPrev > 0.85 && a.u < 0.15) {
    if (!a.crossed) a.crossed = true;
    else a.lap++;
  } else if (a.uPrev < 0.15 && a.u > 0.85 && a.lap > 1) a.lap--;

  a.progress = a.lap + a.u;

  const g = a.group;
  g.position.set(a.x, a.y, a.z);
  g.rotation.set(0, a.heading, 0);
  g.rotation.z = clamp((a.latBase - lat) * -0.06, -0.16, 0.16);
  const ud = g.userData;
  ud.ventMat.emissiveIntensity = 1.0 + Math.min(1, a.speed / 36) * 1.2;
  ud.glowSprite.material.opacity = 0.4 + Math.min(1, a.speed / 36) * 0.4;
  ud.cushion.material.opacity = 0.18;
  ud.flame.material.opacity = damp(ud.flame.material.opacity, a.speed > 26 ? 0.35 : 0, 8, dt);
  if (!a.air && a.speed > 12) fx.dust(a.x - Math.sin(a.heading) * 2, a.y - 0.8, a.z - Math.cos(a.heading) * 2, 1, 0xd9b184, 1.2);
}

// ------------------------------------------------------------------ standings
function standings() {
  const list = [{ id: -1, p: P.lap + P.u, isP: true }];
  rivals.forEach((a, i) => list.push({ id: i, p: a.lap + a.u, isP: false }));
  list.sort((x, y) => y.p - x.p);
  return list;
}

// ------------------------------------------------------------------ finish
function finishRace() {
  race.finished = true;
  const st = standings();
  race.place = st.findIndex((e) => e.isP) + 1;
  const totalMs = race.time * 1000;
  if (!race.lapTimes.length && race.lapStart) race.lapTimes.push(totalMs);
  let medalName = 'bronze';
  if (totalMs <= CFG.goldSec * 1000 && race.cutouts === 0) medalName = 'gold';
  else if (totalMs <= CFG.silverSec * 1000) medalName = 'silver';

  $('overplace').textContent = ordinal(race.place);
  $('overeyebrow').textContent = race.place === 1 ? 'RELAY WON' : 'RACE OVER';
  $('overtime').textContent = fmt(totalMs);
  $('overlap').textContent = fmt(race.bestLap);
  const me = $('overmedal');
  me.textContent = medalName.toUpperCase();
  me.className = medalName;
  const bestLine = [];
  if (!best.time || totalMs < best.time) { best.time = totalMs; bestLine.push('NEW BEST RACE'); }
  if (!best.lap || race.bestLap < best.lap) { best.lap = race.bestLap; bestLine.push('NEW BEST LAP'); }
  const medal = (m) => ({ gold: 3, silver: 2, bronze: 1 })[m] || 0;
  if (medal(medalName) >= medal(best.medal)) best.medal = medalName;
  saveBest();
  $('overbest').innerHTML = (bestLine.length ? '<b>' + bestLine.join(' · ') + '</b><br>' : '') +
    'BEST RACE ' + fmt(best.time) + ' · BEST LAP ' + fmt(best.lap);
  Audio.play('finish_fanfare');
  Audio.stopMusic();
  setMode('over');
  race.shake = 2;
}

// ------------------------------------------------------------------ camera
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();
const ray = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  if (race.mode === 'menu' || race.mode === 'boot') {
    const t = performance.now() / 1000;
    if (!track) { camera.position.set(0, 6, -12); camera.lookAt(0, 1, 0); return; }
    const g0 = track.samples[0];
    const fwd = new THREE.Vector3(g0.t.x, 0, g0.t.z);
    const rgt = new THREE.Vector3(g0.right.x, 0, g0.right.z);
    const drift = Math.sin(t * 0.22) * 2.2;
    camera.position.set(
      g0.p.x + rgt.x * (5.5 + drift) - fwd.x * 19,
      g0.p.y + 5.0 + Math.sin(t * 0.35) * 0.5,
      g0.p.z + rgt.z * (5.5 + drift) - fwd.z * 19
    );
    camLook.set(g0.p.x + fwd.x * 9, g0.p.y + 2.2, g0.p.z + fwd.z * 9);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 58, 3, dt);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return;
  }
  const fwd = tmpV.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  const speedFrac = clamp(P.speed / CFG.topSpeed, 0, 1.2);
  const wantDist = CFG.camDist + speedFrac * 0.9;
  const wantH = CFG.camHeight + speedFrac * 0.25;

  const desired = new THREE.Vector3(
    P.x - fwd.x * wantDist, P.y + wantH, P.z - fwd.z * wantDist
  );

  // never inside rock: cast from the craft to the camera and pull in
  if (track) {
    const origin = new THREE.Vector3(P.x, P.y + 1.1, P.z);
    const dir = desired.clone().sub(origin);
    const len = dir.length();
    dir.normalize();
    ray.set(origin, dir);
    ray.far = len;
    const hits = ray.intersectObjects(track.walls, false);
    if (hits.length) {
      const d = Math.max(1.7, hits[0].distance - 0.7);
      desired.copy(origin).addScaledVector(dir, d);
    }
  }

  if (!camInit) { camera.position.copy(desired); camInit = true; }
  const k = 1 - Math.exp(-9 * dt);
  camera.position.lerp(desired, k);

  camLook.lerp(new THREE.Vector3(P.x + fwd.x * CFG.camLook, P.y + 1.25, P.z + fwd.z * CFG.camLook), 1 - Math.exp(-7 * dt));
  camera.lookAt(camLook);

  // shake
  if (race.shake > 0.01) {
    const s = race.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.9;
    camera.position.y += (Math.random() - 0.5) * s * 0.7;
    camera.position.z += (Math.random() - 0.5) * s * 0.9;
    race.shake *= Math.exp(-6 * dt);
  } else race.shake = 0;

  const wantFov = lerp(CFG.fovMin, CFG.fovMax, clamp(speedFrac, 0, 1));
  camera.fov = damp(camera.fov, wantFov, 4, dt);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ HUD
let hudT = 0;
function updateHUD(dt) {
  const st = standings();
  const place = st.findIndex((e) => e.isP) + 1;
  race.place = place;
  const posn = $('posn'), poss = $('poss');
  const suffix = ['st', 'nd', 'rd', 'th'][place - 1] || 'th';
  if (posn.textContent !== String(place)) posn.textContent = place;
  if (poss.textContent !== suffix) poss.textContent = suffix;
  $('pos').style.opacity = race.mode === 'play' || race.mode === 'countdown' ? 1 : 0;

  const lapN = Math.min(CFG.laps, P.lap);
  if ($('lapn').textContent !== String(lapN)) $('lapn').textContent = lapN;

  const kmh = Math.round(P.speed * 3.6);
  if ($('speed').textContent !== String(kmh)) $('speed').textContent = kmh;

  const heat = $('heatfill');
  heat.style.width = clamp(P.heat, 0, 100) + '%';
  $('heat').classList.toggle('hot', P.heat > 78 || P.cutout > 0);
  $('warn').classList.toggle('on', P.cutout > 0);
  $('heatlabel').textContent = P.cutout > 0 ? 'CUT' : (P.padT > 0 ? 'PAD' : 'HEAT');

  // flash overlays
  if (race.flashT > 0) {
    race.flashT -= dt;
    $('flash').style.opacity = Math.max(0, race.flashT / 0.32) * 0.55;
  } else $('flash').style.opacity = 0;
  if (P.cutout <= 0) $('cutflash').classList.remove('on');

  // hint for the first 10 s of the run
  if (race.mode === 'play' && race.time < 10) {
    $('hint').classList.add('on');
  } else if (race.mode === 'play') {
    $('hint').classList.remove('on');
  }

  hudT += dt;
  if (hudT > 0.5) { hudT = 0; layoutHUD(); }
}

// ------------------------------------------------------------------ loop
let lastT = performance.now();
let frameCount = 0;

function frame(now) {
  const dtRaw = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(0.05, Math.max(0.0001, dtRaw));
  frameCount++;

  const f = input ? input.poll() : { move: { x: 0, y: 0 }, held: {}, pressed: {}, dt };
  if (input && input.device !== lastDevice) renderControls();

  if (race.mode === 'countdown') {
    race.cd -= dt;
    if (Math.abs(f.move.x) > 0.25 || (f.pressed && (f.pressed.primary || f.pressed.secondary))) {
      race.cd = Math.min(race.cd, 0.35);
    }
    const n = Math.max(1, Math.min(3, Math.ceil(race.cd - 0.2)));
    if (race.cd > 0.2) {
      showCount(String(n));
      if (n !== race.lastBeep) { race.lastBeep = n; Audio.play('count_beep'); }
    } else {
      showCount('GO');
      if (race.lastBeep !== 0) { race.lastBeep = 0; Audio.play('count_beep'); }
      if (race.cd <= 0) {
        setMode('play');
        race.time = 0;
        setTimeout(() => { if (race.mode === 'play') showCount(''); }, 550);
      }
    }
  }

  if (race.mode === 'play' && race.freezeUntilInput) {
    const anyIn = Math.abs(f.move.x) > 0.12 || (f.held && (f.held.primary || f.held.secondary));
    if (anyIn) race.freezeUntilInput = false;
  }
  const frozen = race.mode === 'play' && race.freezeUntilInput;

  stepPlayer(dt, frozen ? { move: { x: 0, y: 0 }, held: {}, pressed: {} } : f, frozen);
  rivals.forEach((a) => stepRival(a, dt));

  if (track) track.update(dt, now / 1000);
  if (fx) fx.update(dt);
  if (fx && race.mode === 'play' && P.speed > 24) {
    fx.speedMotes(camera.position, new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading)), P.speed, dt, 0x9fe9ff);
  }

  updateCamera(dt);
  updateHUD(dt);
  Audio.engine(clamp(P.speed / CFG.topSpeed, 0, 1.2), P.boostHeld ? 1 : 0, race.mode === 'play' && !frozen);

  // sun follows the player so the shadow camera stays tight
  if (track) {
    sun.position.set(P.x + 90, P.y + 120, P.z - 60);
    sun.target.position.set(P.x, P.y, P.z);
    sun.target.updateMatrixWorld();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ boot
function refit() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layoutHUD();
}

async function boot() {
  Audio.load();
  const tex = await loadAll();
  buildWorld(tex);
  bootProgress('ready');
  // heat shimmer sprite on the player's vent
  const ud = playerCraft.userData;
  const shim = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ud.glowTex, color: 0xff7a3c, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0
  }));
  shim.scale.setScalar(1.2);
  shim.position.set(0, 0.62, -1.75);
  playerCraft.add(shim);
  ud.shimmer = shim;

  input = ArcadeInput.create({
    surface: canvas,
    isRunning: () => race.mode === 'play' || race.mode === 'countdown',
    onPause: () => {
      if (race.mode === 'play' || race.mode === 'countdown') {
        race.modeBeforePause = race.mode;
        setMode('paused');
        Audio.play('ui_tap');
      }
    },
    onResume: () => {
      if (race.mode === 'paused') setMode(race.modeBeforePause === 'countdown' ? 'countdown' : 'play');
    },
    onRefit: refit,
    promptBase: 'prompts/',
    labels: { primary: 'BOOST', secondary: 'AIR-BRAKE', move: 'STEER' },
    touchButtons: ['primary', 'secondary'],
    bindings: {
      primary: { keys: ['Space', 'Enter', 'KeyJ'], pad: ['A'], mouse: [] },
      secondary: { keys: ['ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown', 'KeyK'], pad: ['X'], mouse: [] }
    }
  });
  // The template boots as "keyboard" and only flips to touch on the first touch event, so a phone
  // player's very first tap is swallowed by a hidden stick zone. A coarse pointer is touch from frame one.
  if (input.touchCapable) input._setDevice('touch');
  input.on('audio', () => Audio.unlock());
  input.on('device', () => { renderControls(); layoutHUD(); });

  // window.__game: honest state, real player position, start()
  input.installHook({
    getState: () => race.mode === 'boot' ? 'menu' : race.mode,
    getScore: () => Math.round(race.dist),
    getPlayer: () => ({ x: P.x, y: P.z, world: { x: P.x, y: P.y, z: P.z } }),
    start: () => startRace({ freeze: true }),
    restart: () => startRace({ freeze: true }),
    fields: {
      lap: () => P.lap,
      place: () => race.place,
      speed: () => Math.round(P.speed * 3.6),
      heat: () => Math.round(P.heat),
      time: () => Math.round(race.time * 1000),
      rivals: () => rivals.length
    }
  });
  window.__game.camera = camera;
  Object.defineProperty(window.__game, 'camera', { value: camera, enumerable: false, configurable: true });
  Object.defineProperty(window.__game, 'extra', {
    enumerable: false, configurable: true,
    get: () => ({ camDir: { x: Math.sin(P.heading), z: Math.cos(P.heading) } })
  });

  // UI wiring
  $('playbtn').addEventListener('click', () => { Audio.play('ui_tap'); Audio.unlock(); startRace({ freeze: false }); });
  $('againbtn').addEventListener('click', () => { Audio.play('ui_tap'); startRace({ freeze: false }); });
  $('titlebtn').addEventListener('click', () => { Audio.play('ui_tap'); toMenu(); });
  $('resumebtn').addEventListener('click', () => { if (race.mode === 'paused') { input.pause.resume(); } });
  $('restartbtn').addEventListener('click', () => { startRace({ freeze: false }); });
  $('quitbtn').addEventListener('click', () => { toMenu(); });
  $('mute').addEventListener('click', () => {
    Audio.unlock();
    Audio.setMuted(!Audio.muted);
    $('mute').classList.toggle('off', Audio.muted);
    $('mute').textContent = Audio.muted ? 'MUTED' : 'SOUND';
    if (!Audio.muted && race.mode === 'play') Audio.startMusic();
  });

  renderControls();
  refit();
  updateMenuMeta();

  if (AUTOSTART) {
    setMode('play');
    startRace({ freeze: true });
  } else {
    setMode('menu');
  }
  $('boot').classList.remove('on');
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error('boot failed', e);
  $('bootmsg').textContent = 'failed to load: ' + (e && e.message ? e.message : e);
});

// expose a few handles for the test scripts
window.__dd = { P, race, rivals, CFG, get track() { return track; } };
