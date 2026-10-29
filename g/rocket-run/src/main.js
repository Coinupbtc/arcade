// Rocket Run — input, render loop, HUD, overlays.
// Mechanics live in sim.js; this file never changes speed, score or collisions by itself.

import { createSim, speedAt, gapAt } from './sim.js';
import {
  buildLab, drawLab, drawFloorTile, drawCeilingTile, buildFloorTile, buildCeilingTile,
  buildVignette, drawRunner, buildFar, drawFar, drawNeon,
  drawLaser, drawSaw, drawBot, drawMissile, drawCoin,
  drawParticles, drawSpeedLines, drawVignette,
} from './art.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const distEl = document.getElementById('dist');
const coinEl = document.getElementById('coin-count');
const hullEls = document.getElementById('hull').children;
const bestEl = document.getElementById('best');
const pauseBtn = document.getElementById('pause');
const soundBtn = document.getElementById('sound');
const overlay = document.getElementById('overlay');
const btn = document.getElementById('ov-btn');

const BEST_KEY = 'rocketrun.best';

let W = 0, H = 0, DPR = 1;
let sim = createSim({ W: 390, H: 844 });
const audio = createAudio();

let lab = null;
let far = null;
let floorTile = null;
let ceilTile = null;
let vig = null;
let bgOffset = 0;
let floorOffset = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let thrustHeld = false;
let lastMeters = 0;
let milestone = 0;
let lastResumeAt = -1e9;              // guards the click that follows a resume tap
const padWas = { a: false, start: false };

/* ------------------------------------------------------------------ sizing */

function size() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  DPR = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
  if (Math.min(w, h) < 520) DPR = Math.min(2, DPR);
  W = w; H = h;

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const floorY0 = H * 0.90;
  const ceilY0 = H * 0.08;
  lab = buildLab(W, H, DPR);
  far = buildFar(W, H, DPR);
  floorTile = buildFloorTile(H, floorY0, DPR, W);
  ceilTile = buildCeilingTile(H, ceilY0, DPR, W);
  vig = buildVignette(W, H, DPR);
  sim.setSize(W, H);
  render(performance.now(), 0);
}

/* ------------------------------------------------------------------ overlays */

function statBlock(label, value) {
  return '<div><b>' + value + '</b><span>' + label + '</span></div>';
}

function showOverlay(kind) {
  const stats = document.getElementById('ov-stats');
  const title = document.getElementById('ov-title');
  const kicker = document.getElementById('ov-kicker');
  const sub = document.getElementById('ov-sub');
  const note = document.getElementById('ov-note');
  stats.innerHTML = '';
  overlay.classList.remove('hidden');
  document.body.classList.toggle('menu-mode', kind !== 'pause');

  if (kind === 'start') {
    kicker.textContent = 'endless lab run';
    title.textContent = 'ROCKET RUN';
    sub.textContent = 'Hold to fly. Let go to fall. Three hits end the run — the hull pips show what is left.';
    btn.textContent = 'Tap to start';
    btn.dataset.action = 'start';
    note.textContent = 'one thumb · portrait or landscape · best distance kept';
  } else if (kind === 'pause') {
    kicker.textContent = 'paused';
    title.textContent = 'HOLD';
    sub.textContent = 'The lab waits.';
    btn.textContent = 'Resume';
    btn.dataset.action = 'resume';
    note.textContent = 'P or Escape also resumes';
    stats.innerHTML = statBlock('Distance', sim.meters()) + statBlock('Coins', sim.state.coins);
  } else {
    const r = sim.state.reason;
    kicker.textContent = r === 'floor' ? 'floor' : r === 'ceiling' ? 'ceiling' : r;
    title.textContent = 'HULL DOWN';
    sub.textContent = r === 'laser' ? 'You clipped a laser gate.'
      : r === 'saw' ? 'A saw blade caught you.'
      : r === 'bot' ? 'The guard bot got you.'
      : r === 'missile' ? 'The missile found you.'
      : r === 'floor' ? 'You hit the floor.'
      : 'You hit the ceiling.';
    btn.textContent = 'Fly again';
    btn.dataset.action = 'start';
    note.textContent = 'best distance is kept on this device';
    stats.innerHTML =
      statBlock('Distance', sim.meters()) +
      statBlock('Coins', sim.state.coins) +
      statBlock('Best', Math.max(best, sim.meters()));
  }
}

function hideOverlay() {
  overlay.classList.add('hidden');
  document.body.classList.remove('menu-mode');
}

function meters(worldX, h) {
  return Math.floor(worldX / (h * 0.05));
}

/* ------------------------------------------------------------------ lifecycle */

function startGame() {
  audio.unlock();
  audio.start();
  sim.start();
  thrustHeld = false;
  audio.thrust(false);
  bgOffset = 0;
  floorOffset = 0;
  lastMeters = 0;
  milestone = 0;
  updateHud();
  hideOverlay();
  const hint = document.getElementById('hint');
  if (hint) {
    hint.classList.add('on');
    clearTimeout(hint._t);
    hint._t = setTimeout(() => hint.classList.remove('on'), 2400);
  }
}

function pauseGame() {
  if (sim.state.status !== 'playing') return;
  sim.pause();
  thrustHeld = false;
  sim.setThrust(false);
  audio.thrust(false);
  showOverlay('pause');
}

function resumeGame() {
  if (sim.state.status !== 'paused') return;
  sim.resume();
  hideOverlay();
  lastResumeAt = performance.now();
}

function crashUI() {
  const m = sim.meters();
  if (m > best) {
    best = m;
    localStorage.setItem(BEST_KEY, String(best));
  }
  audio.thrust(false);
  audio.over();
  showOverlay('over');
}

/* ------------------------------------------------------------------ input */

function press(e) {
  if (e.target === pauseBtn || e.target === soundBtn) return;
  if (e.target.closest && e.target.closest('#overlay')) return;   // the overlay owns its own tap
  audio.unlock();
  // the tap that starts a first run is not a flying input: the rocket keeps flying itself
  // until the player presses again, so "TAP TO START" can never kill a first-timer.
  // After a crash the player already knows the control, so that press also thrusts.
  if (sim.state.status === 'ready') { startGame(); return; }
  if (sim.state.status === 'over') {
    startGame();
    thrustHeld = true;
    sim.setThrust(true);
    audio.thrust(true);
    return;
  }
  if (sim.state.status !== 'playing') return;
  thrustHeld = true;
  sim.setThrust(true);
  audio.thrust(true);
}

function release() {
  thrustHeld = false;
  sim.setThrust(false);
  audio.thrust(false);
}

window.addEventListener('pointerdown', press, { passive: true });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') release(); });

pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  if (performance.now() - lastResumeAt < 350) return;
  if (sim.state.status === 'playing') pauseGame();
  else if (sim.state.status === 'paused') resumeGame();
});

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const on = audio.toggle();
  soundBtn.classList.toggle('on', on);
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  soundBtn.innerHTML = on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9.5v5h3.2l4.3 3.4V6.1L7.2 9.5H4z" fill="currentColor" stroke="none"/><path d="M15.4 8.6a4.6 4.6 0 0 1 0 6.8"/><path d="M18 6a8 8 0 0 1 0 12"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9.5v5h3.2l4.3 3.4V6.1L7.2 9.5H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l4.5 5"/><path d="M20.5 9.5l-4.5 5"/></svg>';
});

overlay.addEventListener('pointerdown', (e) => {
  if (e.target === overlay || e.target.closest('#card')) {
    audio.unlock();
    if (btn.dataset.action === 'resume') resumeGame();
    else startGame();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    e.preventDefault();
    if (sim.state.status === 'ready') { startGame(); return; }
    if (sim.state.status === 'over') {
      startGame();
      thrustHeld = true; sim.setThrust(true); audio.thrust(true);
      return;
    }
    if (sim.state.status === 'paused') { resumeGame(); return; }
    if (!thrustHeld) { thrustHeld = true; sim.setThrust(true); audio.thrust(true); }
  } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (sim.state.status === 'playing') pauseGame();
    else if (sim.state.status === 'paused') resumeGame();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') release();
});

/* ------------------------------------------------------------------ gamepad */

// One button, one axis: A (or DPad up) is thrust, Start pauses. Holding A flies.
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[0];
  if (!p) return;
  const down = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const edge = (i, key) => {
    const v = down(i);
    const fired = v && !padWas[key];
    padWas[key] = v;
    return fired;
  };
  const aHeld = down(0) || down(12);
  const aTap = edge(0, 'a');
  const startTap = edge(9, 'start');
  const st = sim.state.status;

  if (st === 'ready' || st === 'over') {
    if (aTap || startTap) {
      audio.unlock();
      startGame();
      if (aTap && st === 'over') { thrustHeld = true; sim.setThrust(true); audio.thrust(true); }
    }
    return;
  }
  if (startTap) {
    if (st === 'playing') pauseGame();
    else if (st === 'paused') resumeGame();
    return;
  }
  if (st !== 'playing') { if (thrustHeld) release(); return; }

  if (aHeld && !thrustHeld) { thrustHeld = true; sim.setThrust(true); audio.thrust(true); }
  else if (!aHeld && thrustHeld) release();
}

/* ------------------------------------------------------- leaving the tab */

function autoPause() {
  if (sim.state.status === 'playing') pauseGame();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

/* ------------------------------------------------------------------ hud + loop */

function updateHud() {
  const m = sim.meters();                 // includes the coin bonus, not just the clock
  distEl.innerHTML = m + '<span>M</span>';
  coinEl.textContent = String(sim.state.coins);
  for (let i = 0; i < hullEls.length; i++) hullEls[i].classList.toggle('lost', i >= sim.state.hull);
  bestEl.textContent = 'BEST ' + Math.max(best, m) + 'M';
}

function render(now, dt) {
  const s = sim.state;
  const t = now / 1000;
  const sc = speedAt(s.elapsed, sim.H);
  const ratio = Math.max(0, Math.min(1, (sc - 240 * (H / 844)) / (320 * (H / 844))));

  ctx.save();
  if (s.shake > 0.4) {
    ctx.translate((Math.random() - 0.5) * s.shake * 0.55, (Math.random() - 0.5) * s.shake * 0.55);
  }

  drawLab(ctx, lab, W, H, bgOffset);
  ctx.globalAlpha = 0.9;
  drawFar(ctx, far, W, H, bgOffset * 0.34);
  ctx.globalAlpha = 1;
  drawSpeedLines(ctx, W, H, ratio, t, floorOffset * 0.8);

  const floorY = H * 0.90;
  const ceilY = H * 0.08;
  drawFloorTile(ctx, floorTile, W, H, floorY, floorOffset);
  drawCeilingTile(ctx, ceilTile, W, floorOffset);
  drawNeon(ctx, W, H, H * 0.075);

  // coins first so hazards sit on top
  for (const c of s.pickups) {
    const sx = c.x - s.worldX;
    if (sx < -40 || sx > W + 60) continue;
    drawCoin(ctx, sx, c, t, DPR);
  }

  for (const h of s.hazards) {
    const sx = h.x - s.worldX;
    if (sx < -W * 0.4 || sx > W + W * 0.4) continue;
    if (h.type === 'laser') drawLaser(ctx, sx, h, H, floorY, ceilY, t);
    else if (h.type === 'saw') drawSaw(ctx, sx, h, t);
    else if (h.type === 'bot') drawBot(ctx, sx, h, t);
    else if (h.type === 'missile') drawMissile(ctx, sx, h, H, t, W);
  }

  drawParticles(ctx, s.particles);
  drawRunner(ctx, s.player.x, s.player.y, s.player.r, s.thrust && s.status === 'playing', t);

  ctx.drawImage(vig, 0, 0, W, H);

  if (s.flash > 0) {
    ctx.fillStyle = 'rgba(255,240,220,' + (s.flash * 0.5).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  pollPad();
  sim.update(dt);

  if (sim.state.status === 'playing') {
    const sc = speedAt(sim.state.elapsed, sim.H);
    bgOffset += sc * 0.28 * dt;
    floorOffset += sc * dt;
  }

  const events = sim.drain();
  for (const ev of events) {
    if (ev.type === 'coin') audio.coin();
    else if (ev.type === 'crash') {
      audio.crash();
      // explosion particles are already in the sim
    }    else if (ev.type === 'warn') audio.warn();
    else if (ev.type === 'shield') audio.milestone();
    else if (ev.type === 'shieldUsed') { audio.crash(); }
    else if (ev.type === 'hullLost') audio.crash();
    else if (ev.type === 'launch') audio.launch();
    else if (ev.type === 'over') crashUI();
  }

  const m = sim.meters();
  if (sim.state.status === 'playing') {
    const step = Math.floor(m / 100);
    if (step > milestone) { milestone = step; audio.milestone(); }
  }

  updateHud();
  render(now, dt);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ boot */

window.addEventListener('resize', size);
window.addEventListener('orientationchange', () => setTimeout(size, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', size);

size();
showOverlay('start');
if (new URLSearchParams(location.search).get('autostart') === '1') startGame();
requestAnimationFrame(frame);

/* test / self-use hook */
window.__game = {
  get state() {
    const st = sim.state.status;
    if (st === 'ready') return 'menu';
    if (st === 'playing') return 'play';
    if (st === 'paused') return 'paused';
    return 'over';
  },
  get score() { return sim.meters(); },
  get player() { return { x: +sim.state.player.x.toFixed(1), y: +sim.state.player.y.toFixed(1), vy: +sim.state.player.vy.toFixed(1) }; },
  get extra() {
    return {
      status: sim.state.status,
      reason: sim.state.reason,
      meters: sim.meters(),
      coins: sim.state.coins,
      hull: sim.state.hull,
      hazards: sim.state.hazards.length,
      pickups: sim.state.pickups.length,
      thrust: sim.state.thrust,
      best: best,
      audio: audio.state,
    };
  },
  get hazards() {
    return sim.state.hazards.map(h => ({
      type: h.type,
      x: +(h.x - sim.state.worldX).toFixed(1),
      y: h.y != null ? +h.y.toFixed(1) : null,
      gapTop: h.gapTop != null ? +h.gapTop.toFixed(1) : null,
      gapBottom: h.gapBottom != null ? +h.gapBottom.toFixed(1) : null,
      r: h.r || null,
      warn: h.warn != null ? +h.warn.toFixed(2) : null,
    }));
  },
  start() { startGame(); },
  thrust(on) { thrustHeld = !!on; sim.setThrust(!!on); audio.thrust(!!on); },
};
