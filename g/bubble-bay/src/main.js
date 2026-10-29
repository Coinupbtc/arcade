// Bubble Bay — input, loop, HUD, overlays. Mechanics live in sim.js.

import { createSim, COLORS } from './sim.js';
import {
  buildHall, drawBubble, drawGuide, drawLauncher, drawPreview,
  drawDanger, drawParticles, drawPops, clearBubbleCache,
} from './art.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('score');
const roundEl = document.getElementById('round');
const bestEl = document.getElementById('best');
const pauseBtn = document.getElementById('pause');
const soundBtn = document.getElementById('sound');
const swapBtn = document.getElementById('swap');
const overlay = document.getElementById('overlay');
const btn = document.getElementById('ov-btn');

const BEST_KEY = 'bubblebay.best';

let W = 0, H = 0, DPR = 1;
let sim = createSim({ W: 390, H: 844 });
const audio = createAudio();

let hall = null;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let aiming = false;
let aimingPointer = null;
let aimPoint = null;
let lastBounceAt = 0;
// A tap that resumes from the pause overlay lifts over the pause button, so the
// click that follows would pause again. Ignore pause clicks for 350 ms.
let lastResumeAt = -1e9;

/* ------------------------------------------------------------------ sizing */

function geo() {
  return { topY: sim.topY, floorY: sim.H * 0.92, left: sim.gridLeft, right: sim.gridRight };
}

function size() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  DPR = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
  if (Math.min(w, h) < 520) DPR = Math.min(1.5, DPR);
  W = w; H = h;

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  sim.setSize(W, H);
  hall = buildHall(W, H, DPR, geo());
  clearBubbleCache();
  render(performance.now());
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
    kicker.textContent = 'bubble bay';
    title.textContent = 'BUBBLE BAY';
    sub.textContent = 'Drag to aim, release to shoot. Match three, cut the supports, and keep the wall above the line.';
    btn.textContent = 'Tap to start';
    btn.dataset.action = 'start';
    note.textContent = 'one thumb · portrait or landscape · best score kept';
  } else if (kind === 'pause') {
    kicker.textContent = 'paused';
    title.textContent = 'HOLD';
    sub.textContent = 'The wall is waiting.';
    btn.textContent = 'Resume';
    btn.dataset.action = 'resume';
    note.textContent = 'P or Escape also resumes';
  } else if (kind === 'clear') {
    kicker.textContent = 'round clear';
    title.textContent = 'CLEAN SWEEP';
    sub.textContent = 'The wall is empty. The next round adds a row and a colour.';
    btn.textContent = 'Next round';
    btn.dataset.action = 'next';
    note.textContent = 'score keeps climbing across rounds';
    stats.innerHTML = statBlock('Round', sim.state.round) + statBlock('Score', sim.state.score);
  } else {
    kicker.textContent = 'the line broke';
    title.textContent = 'WALL DOWN';
    sub.textContent = 'A bubble crossed the danger line. Clear faster or aim for the supports.';
    btn.textContent = 'Play again';
    btn.dataset.action = 'start';
    note.textContent = 'best score is kept on this device';
    stats.innerHTML =
      statBlock('Round', sim.state.round) +
      statBlock('Score', sim.state.score) +
      statBlock('Best', Math.max(best, sim.state.score));
  }
}

function hideOverlay() {
  overlay.classList.add('hidden');
  document.body.classList.remove('menu-mode');
}

/* ------------------------------------------------------------------ lifecycle */

function startGame() {
  audio.unlock();
  audio.start();
  sim.start();
  aiming = false;
  aimPoint = null;
  updateHud();
  hideOverlay();
}

function nextRound() {
  sim.nextRound();
  aiming = false;
  aimPoint = null;
  updateHud();
  hideOverlay();
}

function pauseGame() {
  if (sim.state.status !== 'playing') return;
  sim.pause();
  showOverlay('pause');
}

function resumeGame() {
  if (sim.state.status !== 'paused') return;
  sim.resume();
  hideOverlay();
  lastResumeAt = performance.now();
}

function gameOver() {
  const s = sim.state.score;
  if (s > best) { best = s; localStorage.setItem(BEST_KEY, String(best)); }
  audio.over();
  showOverlay('over');
}

/* ------------------------------------------------------------------ input */

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function aimFrom(p) {
  sim.aimAt(p.x, p.y);
  const a = sim.state.aim.angle;
  const dist = Math.hypot(sim.H * 0.5, sim.W * 0.5);
  aimPoint = { x: sim.launchX + Math.cos(a) * dist, y: sim.launchY + Math.sin(a) * dist };
}

window.addEventListener('pointerdown', (e) => {
  if (e.target === pauseBtn || e.target === soundBtn || e.target === swapBtn) return;
  if (e.target.closest && e.target.closest('#overlay')) return;   // the overlay owns its own tap
  audio.unlock();
  // The gesture that starts a round or leaves the clear screen must not also fire a shot:
  // the tap that closed the overlay used to cost one bubble (playtest 2026-10-27).
  if (sim.state.status === 'ready' || sim.state.status === 'over') { startGame(); return; }
  if (sim.state.status === 'clear') { nextRound(); return; }
  if (sim.state.status !== 'playing') return;
  aiming = true;
  aimingPointer = e.pointerId;
  aimFrom(pos(e));
}, { passive: true });

// A mouse aims by hovering: the guide and the launcher follow the cursor before any click.
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  if (sim.state.status !== 'playing' || sim.state.projectile) return;
  if (aiming) return;
  aimFrom(pos(e));
}, { passive: true });

window.addEventListener('pointermove', (e) => {
  if (!aiming || e.pointerId !== aimingPointer) return;
  if (sim.state.status !== 'playing' || sim.state.projectile) return;
  aimFrom(pos(e));
}, { passive: true });

function releaseAim() {
  if (!aiming) return;
  aiming = false;
  aimingPointer = null;
  if (sim.state.status !== 'playing') return;
  if (sim.shoot()) { aimPoint = null; }
}

window.addEventListener('pointerup', releaseAim);
window.addEventListener('pointercancel', () => { aiming = false; aimingPointer = null; });

pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  if (performance.now() - lastResumeAt < 350) return;
  if (sim.state.status === 'playing') pauseGame();
  else if (sim.state.status === 'paused') resumeGame();
});

swapBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  if (sim.swap()) { /* swapped */ }
});

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const on = audio.toggle();
  soundBtn.classList.toggle('on', on);
  soundBtn.innerHTML = on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9.5v5h3.2l4.3 3.4V6.1L7.2 9.5H4z" fill="currentColor" stroke="none"/><path d="M15.4 8.6a4.6 4.6 0 0 1 0 6.8"/><path d="M18 6a8 8 0 0 1 0 12"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 9.5v5h3.2l4.3 3.4V6.1L7.2 9.5H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l4.5 5"/><path d="M20.5 9.5l-4.5 5"/></svg>';
});

overlay.addEventListener('pointerdown', (e) => {
  if (e.target !== overlay && !e.target.closest('#card')) return;
  audio.unlock();
  const action = btn.dataset.action;
  if (action === 'resume') resumeGame();
  else if (action === 'next') nextRound();
  else startGame();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (sim.state.status === 'playing') pauseGame();
    else if (sim.state.status === 'paused') resumeGame();
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (sim.state.status === 'ready' || sim.state.status === 'over') { startGame(); }
    else if (sim.state.status === 'clear') nextRound();
    else if (sim.state.status === 'playing') sim.shoot();
  } else if (e.key === 's' || e.key === 'S') {
    sim.swap();
  }
});

/* ------------------------------------------------------------------ gamepad */

// One standard-mapping gamepad: A shoots (and starts), Start pauses, the left
// stick aims. Edges are read once per frame so a held button fires once.
const padWas = { a: false, start: false };

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[0];
  if (!p) return;
  const down = (i) => !!(p.buttons[i] && p.buttons[i].pressed && p.buttons[i].pressed !== 0);
  const edge = (i, key) => {
    const v = down(i);
    const fired = v && !padWas[key];
    padWas[key] = v;
    return fired;
  };
  const aTap = edge(0, 'a');
  const startTap = edge(9, 'start');
  const st = sim.state.status;

  if (st === 'ready' || st === 'over') {
    if (aTap || startTap) { audio.unlock(); startGame(); }
    return;
  }
  if (st === 'clear') {
    if (aTap || startTap) nextRound();
    return;
  }
  if (startTap) {
    if (st === 'playing') pauseGame();
    else if (st === 'paused') resumeGame();
    return;
  }
  if (st !== 'playing') return;

  const lx = p.axes[0] || 0;
  const ly = p.axes[1] || 0;
  if (Math.hypot(lx, ly) > 0.35) {
    aiming = false;
    aimingPointer = null;
    aimPoint = null;
    sim.aimAt(sim.launchX + lx * 220, sim.launchY + ly * 220);
  }
  if (down(12)) sim.aimAt(sim.launchX, sim.launchY - 220);      // DPad up aims straight up
  if (down(13)) sim.aimAt(sim.launchX, sim.launchY + 220);      // DPad down = flat shot
  if (down(14)) sim.aimAt(sim.launchX - 220, sim.launchY - 60); // DPad left
  if (down(15)) sim.aimAt(sim.launchX + 220, sim.launchY - 60); // DPad right
  if (aTap) { audio.unlock(); sim.shoot(); }
}

/* ------------------------------------------------------- leaving the tab */

// A hidden tab or a lost window focus pauses a live run (the arcade gate
// checks this; iOS does it on every app switch).
function autoPause() {
  if (sim.state.status === 'playing') pauseGame();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

/* ------------------------------------------------------------------ hud + loop */

function updateHud() {
  scoreEl.textContent = String(sim.state.score);
  roundEl.textContent = 'ROUND ' + sim.state.round;
  bestEl.textContent = 'BEST ' + Math.max(best, sim.state.score);
}

function render(now) {
  const s = sim.state;
  const t = now / 1000;

  ctx.save();
  if (s.shake > 0.4) {
    ctx.translate((Math.random() - 0.5) * s.shake * 0.5, (Math.random() - 0.5) * s.shake * 0.5);
  }

  ctx.drawImage(hall, 0, 0, W, H);

  // danger line, hotter when the wall is close
  let close = false;
  for (const b of s.grid.values()) if (b.y + sim.R > sim.dangerY - sim.rowH * 1.2) { close = true; break; }
  drawDanger(ctx, W, sim.dangerY, t, close);

  // grid
  for (const b of s.grid.values()) {
    if (b.y < -sim.R * 2 || b.y > H + sim.R * 2) continue;
    drawBubble(ctx, b.x, b.y, sim.R * 0.96, b.color, DPR, 1);
  }

  // projectile + trail
  if (s.projectile) {
    const p = s.projectile;
    const tx = p.x - p.vx * 0.03, ty = p.y - p.vy * 0.03;
    drawBubble(ctx, tx, ty, sim.R * 0.55, p.color, DPR, 0.25);
    drawBubble(ctx, p.x, p.y, sim.R * 0.95, p.color, DPR, 1);
  }

  // aim guide while aiming
  if (s.status === 'playing' && !s.projectile && (aiming || s.aim.active)) {
    drawGuide(ctx, sim.aimPreview(2), sim.R, t);
  }

  // next bubble preview + launcher
  drawPreview(ctx, sim.launchX + sim.R * 3.4, sim.launchY - sim.R * 2.4, sim.R * 0.62, s.next, DPR, 'NEXT');
  drawLauncher(ctx, sim.launchX, sim.launchY, sim.R, s.aim.angle, s.current, t, DPR);

  drawParticles(ctx, s.particles);
  drawPops(ctx, s.pops);

  if (s.flash > 0) {
    ctx.fillStyle = 'rgba(255,240,210,' + (s.flash * 0.34).toFixed(3) + ')';
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

  const events = sim.drain();
  for (const ev of events) {
    if (ev.type === 'shoot') audio.shoot();
    else if (ev.type === 'bounce') {
      if (now - lastBounceAt > 70) { lastBounceAt = now; audio.bounce(); }
    } else if (ev.type === 'pop') {
      audio.pop(ev.n);
      if (ev.dropped > 0) audio.drop();
    } else if (ev.type === 'dropRow') {
      audio.row();
    } else if (ev.type === 'clear') {
      audio.clear();
      showOverlay('clear');
    } else if (ev.type === 'over') {
      gameOver();
    }
  }

  updateHud();
  render(now);
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
  get score() { return sim.state.score; },
  // the aim head is what a finger moves, so the proof can measure a drag
  get player() {
    if (aimPoint) return { x: +aimPoint.x.toFixed(1), y: +aimPoint.y.toFixed(1) };
    const a = sim.state.aim.angle;
    return {
      x: +(sim.launchX + Math.cos(a) * sim.H * 0.4).toFixed(1),
      y: +(sim.launchY + Math.sin(a) * sim.H * 0.4).toFixed(1),
    };
  },
  get extra() {
    return {
      status: sim.state.status,
      round: sim.state.round,
      bubbles: sim.state.grid.size,
      shots: sim.state.shots,
      sinceDrop: sim.state.shotsSinceDrop,
      perDrop: sim.state.shotsPerDrop,
      current: sim.state.current,
      next: sim.state.next,
      projectile: !!sim.state.projectile,
      best: best,
      audio: audio.state,
    };
  },
  get grid() {
    return [...sim.state.grid.values()].map(b => ({
      r: b.r, c: b.c, x: +b.x.toFixed(1), y: +b.y.toFixed(1), color: b.color,
    }));
  },
  start() { startGame(); },
  nextRound() { nextRound(); },
  aim(x, y) { aimFrom({ x, y }); return sim.state.aim.angle; },
  shoot() { return sim.shoot(); },
  swap() { return sim.swap(); },
};
