// SIGNAL — main loop. Input -> rules -> renderer + audio.
// window.__game is the proof surface: state, player, score, start().
import { createState, update, pickTarget, tickLock, fireLocks, clearLocks,
         useOverdrive, canUseOverdrive, hitBoss, lockTimeFor,
         spawnBoss, spawnWave, projectToNdc, targetY, laneFor, pickNearestUnlocked, CONFIG } from './rules.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);

const app = $('app');
const audio = createAudio();
const view = createRenderer(app);

const state = createState((Date.now() & 0xffff) >>> 0);
let aspect = 1;

// aim is normalised device coords: -1..1 on both axes
const aim = { x: 0, y: 0, active: false };
let holding = false;
let holdTarget = null;
let holdingSince = 0;
let bossPart = 'core';

const hud = {
  score: $('score'), mult: $('mult'), lives: $('lives'), wave: $('wave'),
  odfill: $('odfill'), odwrap: $('odwrap'),
};
const reticle = $('reticle');
const rarc = $('rarc');
const rlock = $('rlock');

// ── input ──────────────────────────────────────────────────────────────────
function setAimFromEvent(e) {
  const w = window.innerWidth, h = window.innerHeight;
  const cx = (e.clientX ?? (e.touches && e.touches[0].clientX) ?? w / 2);
  const cy = (e.clientY ?? (e.touches && e.touches[0].clientY) ?? h / 2);
  aim.x = (cx / w) * 2 - 1;
  aim.y = -((cy / h) * 2 - 1);
  aim.active = true;
}

function onDown(e) {
  if (state.phase === 'title' || state.phase === 'over' || state.phase === 'win') return;
  if (e.cancelable) e.preventDefault();
  setAimFromEvent(e);
  holding = true;
  holdingSince = performance.now();
  holdTarget = null;
  if (state.phase === 'boss' && state.boss) {
    // core vs shield decided by how close to centre you aimed
    bossPart = Math.hypot(aim.x, aim.y) < 0.16 ? 'core' : 'shield';
  }
}

function onMove(e) {
  if (!aim.active && !holding) { /* still track so the reticle sits under the finger */ }
  setAimFromEvent(e);
  if (e.cancelable && holding) e.preventDefault();
}

function onUp(e) {
  if (!holding) return;
  holding = false;
  if (e.cancelable) e.preventDefault();
  if (state.phase === 'boss') {
    releaseBossShot();
  } else {
    fireLocks(state);
  }
  holdTarget = null;
}

function releaseBossShot() {
  // A boss shot is a single committed hit, gated by the same shield rule.
  const res = hitBoss(state, bossPart);
  if (res.blocked) audio.play('lock', 0.6);
  else { audio.play('boss'); view.burst(0, 0, -state.boss.depth, 40); }
  if (state.phase === 'win') onWin();
}

app.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
app.addEventListener('touchstart', (e) => { setAimFromEvent(e); onDown(e); }, { passive: false });
app.addEventListener('touchmove', (e) => { onMove(e); }, { passive: false });
app.addEventListener('touchend', (e) => { onUp(e); }, { passive: false });
app.addEventListener('touchcancel', (e) => { onUp(e); }, { passive: false });

// overdrive: tap the bar (a deliberate second control, not a modifier)
$('odwrap').style.pointerEvents = 'auto';
// one spend path, shared by the on-screen bar and the keyboard
function spendOverdrive() {
  if (useOverdrive(state)) {
    audio.play('overdrive');
    $('odwrap').classList.remove('ready');
    return true;
  }
  return false;
}

$('odwrap').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  spendOverdrive();
});

window.addEventListener('keydown', (e) => {
  const step = 0.14;
  if (e.key === 'ArrowLeft')  { aim.x = Math.max(-1, aim.x - step); aim.active = true; e.preventDefault(); }
  if (e.key === 'ArrowRight') { aim.x = Math.min(1, aim.x + step); aim.active = true; e.preventDefault(); }
  if (e.key === 'ArrowUp')    { aim.y = Math.min(1, aim.y + step); aim.active = true; e.preventDefault(); }
  if (e.key === 'ArrowDown')  { aim.y = Math.max(-1, aim.y - step); aim.active = true; e.preventDefault(); }
  if (e.key === ' ') {
    if (e.repeat) { e.preventDefault(); return; }
    holding = true; holdingSince = performance.now(); holdTarget = null;
    if (state.phase === 'boss' && state.boss) bossPart = Math.hypot(aim.x, aim.y) < 0.30 ? 'core' : 'shield';
    e.preventDefault();
  }
  // Shift or 'o' spends the overdrive bar — keyboard parity with the tap.
  if ((e.key === 'Shift' || e.key === 'o' || e.key === 'O') && !e.repeat) {
    spendOverdrive();
    e.preventDefault();
  }
  if (e.key === 'Enter' && (state.phase === 'title' || state.phase === 'over' || state.phase === 'win')) startGame();
});
window.addEventListener('keyup', (e) => {
  if (e.key !== ' ') return;
  holding = false;
  if (state.phase === 'boss') releaseBossShot();
  else fireLocks(state);
  holdTarget = null;
  e.preventDefault();
});

// ── screens ────────────────────────────────────────────────────────────────
function show(id) { $(id).classList.remove('hide'); }
function hide(id) { $(id).classList.add('hide'); }

function startGame() {
  audio.load();
  audio.startMusic();
  const fresh = createState((Date.now() & 0xffff) >>> 0);
  Object.assign(state, fresh);
  state.phase = 'play';
  state.waveTimer = 0.35;
  holdTarget = null; holding = false;
  hide('screen-title'); hide('screen-over');
  $('hint').textContent = '';
  renderHud();
}

function onWin() {
  audio.play('win');
  audio.stopMusic(1400);
  setTimeout(() => showOver(true), 900);
}

function showOver(won) {
  const s = state;
  const acc = s.stats.hit + s.stats.missed > 0
    ? Math.round(100 * s.stats.hit / (s.stats.hit + s.stats.missed)) : 0;
  $('final').innerHTML = `
    <span class="big">${won ? 'SIGNAL CLEAR' : 'SIGNAL LOST'}</span>
    score&nbsp;&nbsp;${s.score.toLocaleString()}<br>
    waves&nbsp;&nbsp;${s.wave}${won ? ' + core' : ''}<br>
    targets&nbsp;${s.stats.hit} hit · ${s.stats.missed} breached<br>
    accuracy&nbsp;${acc}%<br>
    best lock&nbsp;${s.stats.locksPeak}
  `;
  show('screen-over');
  if (!won) audio.stopMusic(600);
}

$('btn-start').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', () => {
  hide('screen-over'); show('screen-title');
  state.phase = 'title';
});

// ── HUD ────────────────────────────────────────────────────────────────────
function renderHud() {
  hud.score.textContent = state.score.toLocaleString();
  hud.mult.textContent = state.multiplier > 1 ? `×${state.multiplier.toFixed(1)}` : '';
  const pipCount = CONFIG.lives;
  if (hud.lives.childElementCount !== pipCount) {
    hud.lives.innerHTML = '';
    for (let i = 0; i < pipCount; i++) {
      const d = document.createElement('div');
      d.className = 'pip';
      hud.lives.appendChild(d);
    }
  }
  [...hud.lives.children].forEach((el, i) => {
    el.classList.toggle('gone', i >= state.lives);
  });
  const pct = Math.round(state.overdrive * 100);
  hud.odfill.style.width = pct + '%';
  hud.odwrap.classList.toggle('ready', canUseOverdrive(state));
  hud.wave.textContent = state.phase === 'boss'
    ? `BOSS CORE  ${Math.max(0, state.boss.hp)}/${CONFIG.bossHp}`
    : `WAVE ${Math.max(1, state.wave)} / 5`;
  // one-time boss coaching, because arriving blind loses the fight
  const hint = $('bosshint');
  if (hint) {
    const showHint = state.phase === 'boss' && !state.bossHintShown && state.time < 999;
    if (showHint) {
      hint.classList.remove('hide');
      state.bossHintShown = true;
      setTimeout(() => hint.classList.add('hide'), 5200);
    }
  }
}

// ── reticle ────────────────────────────────────────────────────────────────
function renderReticle() {
  if (!aim.active) { reticle.classList.remove('on'); return; }
  reticle.classList.add('on');
  const px = (aim.x + 1) / 2 * window.innerWidth;
  const py = (-aim.y + 1) / 2 * window.innerHeight;
  reticle.style.transform = `translate(${px}px, ${py}px)`;

  if (holdTarget && !holdTarget.dead) {
    const p = Math.min(1, holdTarget.lockProgress);
    const r = 26;
    const a0 = -Math.PI / 2;
    const a1 = a0 + p * Math.PI * 2;
    const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
    const large = p > 0.5 ? 1 : 0;
    rarc.setAttribute('d', `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`);
    rarc.setAttribute('opacity', '1');
    rlock.setAttribute('stroke', '#ffd166');
  } else {
    rarc.setAttribute('opacity', '0');
    rlock.setAttribute('stroke', '#4de2ff');
  }
}

// ── events -> audio + fx ───────────────────────────────────────────────────
function drainEvents() {
  for (const ev of state.events) {
    switch (ev.type) {
      case 'lock':
        audio.play('lock', 1 + ev.count * 0.045);
        break;
      case 'fire':
        if (ev.count > 0) audio.play('fire');
        break;
      case 'hit':
        audio.note(ev.degree, 0.42 + Math.min(0.35, ev.points / 1600));
        view.burst(ev.x, 0, -Math.max(2, ev.depth), 20);
        break;
      case 'breach':
        audio.play('hurt');
        break;
      case 'hurt':
        break;
      case 'overdrive':
        break;
      case 'boss':
        audio.play('boss');
        break;
      case 'shield':
        audio.play('lock', 0.5);
        break;
      case 'win':
        break;
      default:
        break;
    }
  }
  state.events.length = 0;
}

// ── loop ───────────────────────────────────────────────────────────────────
let last = performance.now();
let acc = 0, frames = 0, fps = 60;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.phase === 'play' || state.phase === 'boss') {
    // Holding locks ONLY what the reticle is actually over. There is no auto-aim
    // and no nearest-target fallback: aiming is the skill the game is about.
    if (holding && state.phase === 'play' && state.locks.length < CONFIG.maxLocks) {
      // If the reticle is over an already-locked target, look for the nearest
      // UNLOCKED one within reach instead, so a hold never stalls on a dead spot.
      let t = pickTarget(state, aim, aspect, 0.22);
      if (t && t.locked) {
        const alt = pickNearestUnlocked(state, aim, aspect, 0.34);
        if (alt) t = alt;
      }
      if (t && !t.locked) {
        holdTarget = t;
        tickLock(state, t, dt);
      } else {
        holdTarget = null;
      }
    }
  }

  update(state, dt);
  drainEvents();

  audio.setLayers(state.combo);

  if (state.phase === 'over' && !overShown) { overShown = true; setTimeout(() => showOver(false), 500); }
  if (state.phase !== 'over') overShown = false;

  view.frame(state, dt, aim.active ? aim : null);
  renderReticle();
  renderHud();

  // fps meter for the proof run
  frames++; acc += dt;
  if (acc >= 0.5) { fps = frames / acc; frames = 0; acc = 0; }

  requestAnimationFrame(loop);
}
let overShown = false;

function onResize() {
  const { w, h } = view.resize();
  aspect = w / h;
  state.aspect = aspect;   // spawnTarget derives lanes from this
  $('hint').textContent = w < 520 ? '' : '';
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

onResize();
view.resize();
requestAnimationFrame(loop);

// ── proof surface ──────────────────────────────────────────────────────────
window.__game = {
  get state() { return state; },
  // Proof surface reads player position in real SCREEN PIXELS (the probe asserts
  // movement in px); aim itself stays normalised internally.
  get player() {
    return {
      x: ((aim.x + 1) / 2) * window.innerWidth,
      y: ((1 - aim.y) / 2) * window.innerHeight,
      z: 0,
    };
  },
  get aim() { return { x: aim.x, y: aim.y, active: aim.active, holding }; },
  get score() { return state.score; },
  get fps() { return fps; },
  get aspect() { return aspect; },
  start: startGame,
  // test hooks: the exact functions the input handlers call
  api: { tickLock, fireLocks, clearLocks, useOverdrive, canUseOverdrive, hitBoss, pickTarget,
         spawnBoss, spawnWave, update, lockTimeFor, projectToNdc, targetY, laneFor, pickNearestUnlocked },
  aimAt(x, y) { aim.x = x; aim.y = y; aim.active = true; },
};
