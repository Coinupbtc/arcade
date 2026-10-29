// Slice Party — input, render loop, HUD, overlays.
// Mechanics live in sim.js; this file never changes a score or a life by itself.

import { createSim, TYPES, DURATION, MAX_MISSES } from './sim.js';
import { buildBackground, drawBomb, drawBlade, splat, fruitSprite, halfSprite, clearSpriteCache } from './art.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const missesEl = document.getElementById('misses').children;
const pauseBtn = document.getElementById('pause');
const soundBtn = document.getElementById('sound');
const overlay = document.getElementById('overlay');
const card = document.getElementById('card');

const BEST_KEY = 'sliceparty.best';

let W = 0, H = 0, DPR = 1;
let sim = createSim({ W: 390, H: 844 });
const audio = createAudio();

let bg = null;
let bgCtx = null;

let trail = [];
const cutFx = [];
let pointerDown = false;
let pointerId = null;
let bladeHead = { x: 0, y: 0 };
let lastSecond = DURATION;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let swings = 0;                       // every swipe start, however it was triggered
let lastResumeAt = -1e9;              // guards the click that follows a resume tap
const keysDown = new Set();           // held arrow/WASD keys move the blade
const padWas = { a: false, start: false };

/* ------------------------------------------------------------------ sizing */

function size() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  DPR = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1));
  if (Math.min(w, h) < 520) DPR = Math.min(1.6, DPR);
  W = w; H = h;

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  bg = buildBackground(W, H, DPR);
  bgCtx = bg.getContext('2d');
  bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  clearSpriteCache();

  sim.setSize(W, H);
  draw(performance.now(), 0);
}

/* ------------------------------------------------------------------ overlays */

function showOverlay(kind) {
  const stats = document.getElementById('ov-stats');
  const title = document.getElementById('ov-title');
  const kicker = document.getElementById('ov-kicker');
  const sub = document.getElementById('ov-sub');
  const btn = document.getElementById('ov-btn');
  const note = document.getElementById('ov-note');
  stats.innerHTML = '';
  overlay.classList.remove('hidden');
  document.body.classList.toggle('menu-mode', kind === 'start' || kind === 'over');

  if (kind === 'start') {
    kicker.textContent = '60 seconds';
    title.textContent = 'SLICE PARTY';
    sub.textContent = 'Swipe through fruit. Dodge the bombs. Five drops and the run is over. Desktop: arrows or WASD move the blade, Z swings. Pad: stick aims the blade, A swings.';
    note.textContent = 'points: pineapple 4 · watermelon 3 · lime kiwi banana 2 · citrus strawberry 1 · short flicks pay combos';
    btn.textContent = 'Tap to start';
    note.textContent = 'one finger · portrait or landscape';
    btn.dataset.action = 'start';
  } else if (kind === 'pause') {
    kicker.textContent = 'paused';
    title.textContent = 'HOLD IT';
    sub.textContent = 'The fruit are waiting.';
    btn.textContent = 'Resume';
    note.textContent = 'P or Escape also resumes';
    btn.dataset.action = 'resume';
    stats.innerHTML = statBlock('Score', sim.state.score) + statBlock('Time', timeText(sim.state.timeLeft));
  } else if (kind === 'over') {
    const r = sim.state.reason;
    kicker.textContent = 'run over';
    title.textContent = r === 'bomb' ? 'BOOM!' : r === 'misses' ? 'FIVE DROPS' : 'TIME!';
    sub.textContent = r === 'bomb'
      ? 'You sliced the bomb. The dojo is closed.'
      : r === 'misses'
        ? 'Five fruit hit the floor. Keep the blade moving.'
        : 'Sixty seconds, that is the whole run.';
    btn.textContent = 'Slice again';
    btn.dataset.action = 'start';
    note.textContent = 'best score is kept on this device';
    stats.innerHTML =
      statBlock('Score', sim.state.score) +
      statBlock('Best', Math.max(best, sim.state.score)) +
      statBlock('Combo', sim.state.stats.bestCombo ? 'x' + sim.state.stats.bestCombo : '—') +
      statBlock('Sliced', sim.state.stats.sliced);
  }
  card.dataset.kind = kind;
}

function statBlock(label, value) {
  return '<div><b>' + value + '</b><span>' + label + '</span></div>';
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
  trail.length = 0;
  cutFx.length = 0;
  // fresh wood: stains from the last run disappear with it
  bg = buildBackground(W, H, DPR);
  bgCtx = bg.getContext('2d');
  bgCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  lastSecond = DURATION;
  updateHud();
  hideOverlay();
  canvas.focus && canvas.focus();
}

function gameOver() {
  const s = sim.state.score;
  if (s > best) {
    best = s;
    localStorage.setItem(BEST_KEY, String(best));
  }
  audio.over();
  showOverlay('over');
}

function pauseGame() {
  if (sim.state.status !== 'playing') return;
  sim.pause();
  trail.length = 0;
  showOverlay('pause');
}

function resumeGame() {
  if (sim.state.status !== 'paused') return;
  sim.resume();
  hideOverlay();
  lastResumeAt = performance.now();
}

/* ------------------------------------------------------------------ input */

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function swipeStart(p) {
  swings++;
  trail.length = 0;
  trail.push({ x: p.x, y: p.y, t: performance.now() });
  bladeHead = { x: p.x, y: p.y };
  sim.beginSwipe();
  sim.swipeTo(p.x, p.y);
}

function swipeMove(p) {
  const now = performance.now();
  trail.push({ x: p.x, y: p.y, t: now });
  bladeHead = { x: p.x, y: p.y };
  while (trail.length > 2 && now - trail[0].t > 170) trail.shift();
  sim.swipeTo(p.x, p.y);
}

window.addEventListener('pointerdown', (e) => {
  if (e.target === pauseBtn || e.target === soundBtn) return;
  audio.unlock();
  if (sim.state.status === 'ready' || sim.state.status === 'over') { startGame(); }
  if (sim.state.status !== 'playing') return;
  pointerDown = true;
  pointerId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  swipeStart(pos(e));
}, { passive: true });

window.addEventListener('pointermove', (e) => {
  if (!pointerDown || e.pointerId !== pointerId) return;
  if (sim.state.status !== 'playing') return;
  swipeMove(pos(e));
}, { passive: true });

function endPointer(e) {
  if (!pointerDown || (e && e.pointerId !== pointerId)) return;
  pointerDown = false;
  pointerId = null;
  sim.endSwipe();
  trail.length = 0;
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') endPointer(e); });

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
  // Resume is forgiving: a tap anywhere on the pause card resumes. A restart is only the
  // button, so a swipe still in progress cannot skip the result screen (playtest 2026-10-27).
  const action = document.getElementById('ov-btn').dataset.action;
  audio.unlock();
  if (action === 'resume') { resumeGame(); return; }
  if (e.target.closest('#ov-btn')) startGame();
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  const move = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
    k === 'a' || k === 'd' || k === 'w' || k === 's';
  if (move) {
    e.preventDefault();
    keysDown.add(k);
    return;
  }
  if (k === 'z' || k === 'Z' || k === 'j' || k === 'J') {
    e.preventDefault();
    if (e.repeat) return;                       // a held key must not swing every repeat
    if (sim.state.status === 'ready' || sim.state.status === 'over') startGame();
    // Direction from the held movement keys, so a keyboard player can slash up/down too.
    let ang = 0;
    if (keysDown.has('ArrowUp') || keysDown.has('w')) ang = -Math.PI / 2;
    else if (keysDown.has('ArrowDown') || keysDown.has('s')) ang = Math.PI / 2;
    else if (keysDown.has('ArrowLeft') || keysDown.has('a')) ang = Math.PI;
    swingAt(bladeHead.x, bladeHead.y, ang);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (sim.state.status === 'ready' || sim.state.status === 'over') startGame();
    else if (sim.state.status === 'playing') pauseGame();
    else if (sim.state.status === 'paused') resumeGame();
  } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (sim.state.status === 'playing') pauseGame();
    else if (sim.state.status === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key));

// Desktop mouse: the blade follows the cursor, so a plain click-drag or a click
// at the fruit still cuts it. Touch never runs this branch.
window.addEventListener('pointermove', (e) => {
  if (pointerDown || e.pointerType !== 'mouse') return;
  if (sim.state.status !== 'playing') return;
  const p = pos(e);
  bladeHead = { x: p.x, y: p.y };
  const now = performance.now();
  trail.push({ x: p.x, y: p.y, t: now });
  while (trail.length > 2 && now - trail[0].t > 170) trail.shift();
});

/* ------------------------------------------------------------ one swing verb */

// A keyboard or pad swing is the same three sim calls the pointer handler makes.
function swingAt(x, y, angle) {
  if (sim.state.status !== 'playing') return false;
  const a = angle == null ? 0 : angle;
  swipeStart({ x: x - Math.cos(a) * 70, y: y - Math.sin(a) * 70 });
  swipeMove({ x, y });
  swipeMove({ x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70 });
  sim.endSwipe();
  return true;
}

/* ------------------------------------------------------------------ gamepad */

function pollPad(dt) {
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
  const aTap = edge(0, 'a');
  const startTap = edge(9, 'start');
  const st = sim.state.status;

  if (st === 'ready' || st === 'over') {
    if (aTap || startTap) {
      audio.unlock();
      startGame();
    }
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
    moveBlade(lx * 420 * dt, ly * 420 * dt);
  }
  // D-pad speed is per second, not per frame (playtest: it was twice as fast at 120 Hz).
  if (down(12)) moveBlade(0, -420 * dt);
  if (down(13)) moveBlade(0, 420 * dt);
  if (down(14)) moveBlade(-420 * dt, 0);
  if (down(15)) moveBlade(420 * dt, 0);
  if (aTap) {
    const mag = Math.hypot(lx, ly);
    const ang = mag > 0.35 ? Math.atan2(ly, lx) : 0;   // swing along the stick, else horizontal
    swingAt(bladeHead.x, bladeHead.y, ang);
  }
}

function moveBlade(dx, dy) {
  bladeHead = {
    x: Math.max(20, Math.min(W - 20, bladeHead.x + dx)),
    y: Math.max(20, Math.min(H - 20, bladeHead.y + dy)),
  };
  const now = performance.now();
  trail.push({ x: bladeHead.x, y: bladeHead.y, t: now });
  while (trail.length > 2 && now - trail[0].t > 170) trail.shift();
}

/* ------------------------------------------------------- leaving the tab */

function autoPause() {
  if (sim.state.status === 'playing') pauseGame();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);

/* ------------------------------------------------------------------ hud + loop */

function timeText(t) {
  const s = Math.max(0, Math.ceil(t));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function updateHud() {
  scoreEl.textContent = String(sim.state.score);
  timerEl.textContent = timeText(sim.state.timeLeft);
  timerEl.classList.toggle('low', sim.state.timeLeft <= 10);
  for (let i = 0; i < missesEl.length; i++) {
    missesEl[i].classList.toggle('lost', i < sim.state.misses);
  }
}

function draw(now, dt) {
  const s = sim.state;

  ctx.save();
  if (s.shake > 0.4) {
    ctx.translate((Math.random() - 0.5) * s.shake * 0.5, (Math.random() - 0.5) * s.shake * 0.5);
  }

  ctx.drawImage(bg, 0, 0, W, H);

  // fruit (baked sprite, drawn with its rotation)
  for (const f of s.fruits) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    if (f.bomb) {
      drawBomb(ctx, f.r, now / 1000);
    } else {
      const sp = fruitSprite(f.type, f.r, DPR, TYPES[f.type].value);
      ctx.drawImage(sp, -f.r * 1.5, -f.r * 1.5, f.r * 3, f.r * 3);
    }
    ctx.restore();
  }

  // halves
  for (const h of s.halves) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, h.life / 0.7);
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    const hs = halfSprite(h.type, h.r, h.side, DPR);
    ctx.drawImage(hs, -h.r * 1.2, -h.r * 1.2, h.r * 2.4, h.r * 2.4);
    ctx.restore();
  }

  // juice: droplets stretched along their own velocity so they read as liquid
  for (const j of s.juice) {
    const t = j.age / j.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillStyle = j.color;
    const a = Math.atan2(j.vy, j.vx);
    ctx.beginPath();
    ctx.ellipse(j.x, j.y, j.r * (1.45 - 0.35 * t), j.r * 0.62, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // cut impact: a short white flash and a streak along the blade angle
  if (cutFx.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = cutFx.length - 1; i >= 0; i--) {
      const fx = cutFx[i];
      fx.age += dt;
      if (fx.age > 0.22) { cutFx.splice(i, 1); continue; }
      const t = fx.age / 0.22;
      const alpha = 1 - t;
      const rad = 34 * (0.45 + 1.5 * t);
      const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, rad);
      g.addColorStop(0, 'rgba(255,255,242,' + (0.55 * alpha).toFixed(3) + ')');
      g.addColorStop(0.5, 'rgba(255,230,170,' + (0.18 * alpha).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rad, 0, Math.PI * 2);
      ctx.fill();

      const dx = Math.cos(fx.a), dy = Math.sin(fx.a);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * alpha).toFixed(3) + ')';
      ctx.lineWidth = 2.4 * alpha + 0.6;
      ctx.beginPath();
      ctx.moveTo(fx.x - dx * rad * 0.85, fx.y - dy * rad * 0.85);
      ctx.lineTo(fx.x + dx * rad * 0.85, fx.y + dy * rad * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  // blade
  drawBlade(ctx, trail);

  // combo popups
  for (const p of s.pops) {
    const t = p.age / p.life;
    const scale = 0.8 + 0.5 * Math.min(1, t * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.pow(t, 2));
    ctx.translate(p.x, p.y - t * 26);
    ctx.scale(scale, scale);
    ctx.font = '900 30px ui-sans-serif,-apple-system,"Helvetica Neue",Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(30,10,0,0.85)';
    ctx.strokeText(p.text, 0, 0);
    const g = ctx.createLinearGradient(0, -20, 0, 20);
    g.addColorStop(0, '#fff6e0');
    g.addColorStop(1, '#ffcf6a');
    ctx.fillStyle = g;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  // bomb flash
  if (s.flash > 0) {
    ctx.fillStyle = 'rgba(255,244,220,' + (s.flash * 0.55).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }

  // slow-motion edge tint
  if (s.slowmo > 0) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(150,220,255,0)');
    vg.addColorStop(1, 'rgba(150,220,255,0.22)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (sim.state.status === 'playing' && keysDown.size) {
    const v = 420 * dt;
    let dx = 0, dy = 0;
    if (keysDown.has('ArrowLeft') || keysDown.has('a')) dx -= v;
    if (keysDown.has('ArrowRight') || keysDown.has('d')) dx += v;
    if (keysDown.has('ArrowUp') || keysDown.has('w')) dy -= v;
    if (keysDown.has('ArrowDown') || keysDown.has('s')) dy += v;
    if (dx || dy) moveBlade(dx, dy);
  }
  pollPad(dt);

  sim.update(dt);

  const events = sim.drain();
  for (const ev of events) {
    if (ev.type === 'slice') { audio.slice(1); cutFx.push({ x: ev.x, y: ev.y, a: ev.angle || 0, age: 0 }); }
    else if (ev.type === 'miss') audio.miss();
    else if (ev.type === 'bomb') audio.bomb();
    else if (ev.type === 'combo') audio.combo(ev.n);
    else if (ev.type === 'over') gameOver();
    else if (ev.type === 'wave') {
      // nothing; spawn is silent
    }
  }

  // stains + splats on the wood, like the reference
  for (const ev of events) {
    if (ev.type === 'slice') {
      const f = TYPES[ev.fruit];
      if (f) splat(bgCtx, ev.x, ev.y, 26 + Math.random() * 16, f.juice);
    }
  }

  // last-five tick
  const sec = Math.ceil(sim.state.timeLeft);
  if (sec !== lastSecond) {
    if (sec <= 5 && sec > 0 && sim.state.status === 'playing') audio.tick();
    lastSecond = sec;
  }

  updateHud();
  draw(now, dt);
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
  get player() { return { x: bladeHead.x, y: bladeHead.y }; },
  get extra() {
    return {
      status: sim.state.status,
      reason: sim.state.reason,
      misses: sim.state.misses,
      timeLeft: +sim.state.timeLeft.toFixed(2),
      fruits: sim.state.fruits.length,
      halves: sim.state.halves.length,
      swings: swings,
      best: best,
      audio: audio.state,
    };
  },
  start() { startGame(); },
  slice(x1, y1, x2, y2) {
    sim.beginSwipe();
    sim.swipeTo(x1, y1);
    sim.swipeTo(x2, y2);
    return sim.endSwipe();
  },
  get fruits() {
    return sim.state.fruits.map(f => ({
      x: +f.x.toFixed(1), y: +f.y.toFixed(1), r: +f.r.toFixed(1),
      bomb: f.bomb, type: f.type,
    }));
  },
  spawn(type, x, y, opts) { return sim.addFruit(type, x, y, opts || {}); },
};
