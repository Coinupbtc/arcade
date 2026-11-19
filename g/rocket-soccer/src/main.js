// ROCKET SOCCER — input, loop, match flow, HUD.

import { createPhysics, resetKickoff } from './physics.js';
import { createCar, stepCar } from './car.js';
import { createAI, stepAI } from './ai.js';
import { createRenderer } from './render.js';
import { createState, CONFIG, inGoal, scoreGoal, tickClock, emit, makePads, tickPads, defensiveRisk, strikeDirection } from './rules.js';
import * as THREE from 'three';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);

const state = createState(Date.now() % 100000);
const input = { throttle: 0, steer: 0, boost: false, jumpPressed: false };

let ph, carCtl, aiCtl, R, camMode = 'ball', last = 0, running = false;
let pads = [];
let acc = 0;              // fixed-timestep accumulator
let paused = false;
let manualPause = false;   // the player pressed pause; a tab switch must not clear it
let ballStillFor = 0;      // seconds the ball has been pinned in one place
let lastBallPos = { x: 0, y: 0, z: 0 };
let jumpLatch = false;
let prevBallSpeed = 0, prevJumps = 2;

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  ph = await createPhysics();
  carCtl = createCar(ph);
  aiCtl = createAI(ph, 1.0);

  const canvas = $('c');
  R = createRenderer(canvas);
  await R.carReady;
  R.buildPads(pads);

  pads = makePads();
  R && R.buildPads && R.buildPads(pads);
  resetKickoff(ph, 'you');
  state.phase = 'title';
  bindInput();
  requestAnimationFrame(loop);
}

// ── input ──────────────────────────────────────────────────────────────────
function bindInput() {
  // ---- keyboard ----
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { jumpLatch = true; e.preventDefault(); }
    if (e.code === 'KeyC') camMode = camMode === 'car' ? 'ball' : 'car';
    if (e.code === 'Enter' && state.phase === 'title') startMatch();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // One input reader. The joystick wins while it is held; otherwise the keyboard
// drives. Both ALWAYS write throttle/steer so releasing a control actually stops
// the car (the old `if (th || st)` guard left it accelerating forever).
  function readInput() {
    if (stick.active) {
      input.steer = stick.x;
      input.throttle = -stick.y;      // screen up (negative y) = forward
    } else {
      let th = 0, st = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) th += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) th -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) st -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) st += 1;
      input.throttle = th;
      input.steer = st;
    }
    input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  }

  // ---- touch: left half = joystick, right half = buttons ----
  const stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

  const joy = $('joy'), knob = $('knob');

  function joyStart(e) {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    stick.active = true; stick.id = t.identifier ?? 'mouse';
    const r = joy.getBoundingClientRect();
    stick.ox = r.left + r.width / 2; stick.oy = r.top + r.height / 2;
    joyMove(e);
  }
  function joyMove(e) {
    if (!stick.active) return;
    let t = e;
    if (e.changedTouches) {
      t = [...e.changedTouches].find((x) => x.identifier === stick.id) || e.changedTouches[0];
    }
    const dx = t.clientX - stick.ox, dy = t.clientY - stick.oy;
    const R2 = joy.getBoundingClientRect().width / 2;
    const m = Math.min(1, Math.hypot(dx, dy) / R2);
    const a = Math.atan2(dy, dx);
    stick.x = Math.cos(a) * m; stick.y = Math.sin(a) * m;
    knob.style.transform = `translate(${stick.x * R2 * 0.62}px, ${stick.y * R2 * 0.62}px)`;
  }
  function joyEnd() {
    stick.active = false; stick.id = null; stick.x = 0; stick.y = 0;
    knob.style.transform = 'translate(0,0)';
  }

  joy.addEventListener('touchstart', (e) => { e.preventDefault(); joyStart(e); }, { passive: false });
  joy.addEventListener('touchmove', (e) => { e.preventDefault(); joyMove(e); }, { passive: false });
  joy.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); joyEnd(); }, { passive: false });
  joy.addEventListener('touchcancel', joyEnd);
  // desktop drag on the joystick
  joy.addEventListener('mousedown', joyStart);
  addEventListener('mousemove', (e) => { if (stick.active) joyMove(e); });
  addEventListener('mouseup', () => { if (stick.active) joyEnd(); });

  // buttons
  const bindBtn = (el, onDown, onUp) => {
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); }, { passive: false });
    el.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();   // preventDefault on a non-cancelable
      onUp && onUp();                        // touchend logs a console warning
    }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onDown(); });
    el.addEventListener('mouseup', () => onUp && onUp());
    el.addEventListener('mouseleave', () => onUp && onUp());
  };
  bindBtn($('btnjump'), () => { jumpLatch = true; }, null);
  bindBtn($('btnboost'), () => { btnBoost = true; }, () => { btnBoost = false; });

  $('btnstart').addEventListener('click', startMatch);
  $('btncam').addEventListener('click', () => {
    camMode = camMode === 'car' ? 'ball' : 'car';
    $('btncam').textContent = camMode === 'ball' ? 'BALL CAM' : 'CAR CAM';
  });
  $('btnrestart').addEventListener('click', () => { location.reload(); });
  const setPaused = (v) => {
    manualPause = v;
    paused = v;
    $('pausecard').classList.toggle('show', v);
    if (!v) last = performance.now();
  };
  $('btnpause').addEventListener('click', () => setPaused(true));
  $('btnresume').addEventListener('click', () => setPaused(false));
  $('btnquit').addEventListener('click', () => { location.reload(); });
  window.__setPaused = setPaused;

  window.__kbInput = readInput;
}

let btnBoost = false;
let prevBoosting = false;

// ── match flow ─────────────────────────────────────────────────────────────
function startMatch() {
  state.countdown = 1.5;
  document.body.classList.add('playing');
  SFX.initAudio();
  SFX.resumeAudio();
  SFX.startEngine();
  state.phase = 'play';
  state.clock = CONFIG.matchSeconds;
  state.scoreYou = 0; state.scoreAI = 0;
  carCtl.boost = CONFIG.boostTank;
  aiCtl.boost = CONFIG.boostTank;
  resetKickoff(ph, 'you');
  carCtl.car.yaw = Math.PI;      // your car faces upfield (-z) ... corrected below
  carCtl.car.yaw = 0;
  aiCtl.car.yaw = Math.PI;
  $('title').classList.add('hide');
  $('btnrestart').classList.add('hide');
  running = true;
  last = performance.now();
}

function kickoff() {
  resetKickoff(ph, 'you');
  carCtl.car.yaw = 0;
  aiCtl.car.yaw = Math.PI;
  carCtl.boost = CONFIG.boostTank;
  aiCtl.boost = CONFIG.boostTank;
  state.countdown = 1.6;      // short reset countdown, not a full 3 s
  state.phase = 'kickoff';
}

// ── loop ───────────────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (state.countdown > 0) {
    state.countdown -= dt;   // the match clock is frozen until play starts
    $('countdown').textContent = Math.ceil(state.countdown);
    $('countdown').classList.remove('hide');
    if (state.countdown <= 0) {
      $('countdown').classList.add('hide');
      state.phase = 'play';
    }
  }

  if (running && !paused && (state.phase === 'play' || state.phase === 'goal' || state.phase === 'kickoff')) {
    if (window.__kbInput) window.__kbInput();

    // Physics runs on a FIXED timestep so a 120 Hz phone does not play a faster game
    // than a 60 Hz one. Rendering still happens once per frame.
    const STEP = 1 / 60;
    acc = Math.min(acc + dt, 0.25);
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      acc -= STEP;
      steps++;

      const frozen = state.countdown > 0;

      // The player can ALWAYS drive. Only the AI and the ball wait for the countdown,
      // so a kickoff never swallows a touch and a goal celebration never kills input.
      stepCar(state, carCtl, {
        throttle: input.throttle, steer: input.steer,
        boost: input.boost || btnBoost, jumpPressed: jumpLatch,
      }, STEP);
      jumpLatch = false;

      // AI (never during the countdown)
      if (state.phase === 'play' && !frozen) {
        const elapsed = CONFIG.matchSeconds - state.clock;
        aiCtl.skill = Math.min(1.0, 0.58 + (elapsed / 75) * 0.42);
        const aiIn = stepAI(aiCtl, aiCtl, state, ph.ballBody.translation(), STEP);
        stepCar(state, aiCtl, aiIn, STEP);
      }

      ph.world.step();

      // Stuck-ball guard: the ball can be pinned between two cars (e.g. shoved into a
      // goal mouth with the AI sitting in its net) and the match deadlocks. If it has
      // not moved for 4 s while in play, restart from the centre.
      const bn = ph.ballBody.translation();
      const moved = Math.hypot(bn.x - lastBallPos.x, bn.y - lastBallPos.y, bn.z - lastBallPos.z);
      if (moved < 0.06) ballStillFor += STEP; else ballStillFor = 0;
      lastBallPos = { x: bn.x, y: bn.y, z: bn.z };
      if (ballStillFor > 4 && state.phase === 'play') {
        ballStillFor = 0;
        ph.ballBody.setTranslation({ x: 0, y: CONFIG.ballRadius + 0.9, z: 0 }, true);
        ph.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ph.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        emit(state, 'stuckReset');
      }

      // boost pads for both cars
      tickPads(pads, ph.carBody.translation(), carCtl, STEP);
      tickPads(pads, ph.aiBody.translation(), aiCtl, STEP);
    }
    if (!(state.countdown > 0)) jumpLatch = false;

    // ── juice: ball impact ────────────────────────────────────────────────
    const bvel = ph.ballBody.linvel();
    const bSpeed = Math.hypot(bvel.x, bvel.y, bvel.z);
    if (bSpeed - prevBallSpeed > 7) {
      const bp2 = ph.ballBody.translation();
      const cp2 = ph.carBody.translation();
      const cv2 = ph.carBody.linvel();
      const yaw = carCtl.car.yaw;
      const rightV = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
      const upV = { x: 0, y: 1, z: 0 };
      // Where the car struck the ball bends the shot. Blend the ball's velocity a
      // little toward the strike vector — a curve, not a second impulse (an impulse
      // here launched a head-on hit 20 m sideways).
      const dir = strikeDirection(cp2, cv2, bp2, rightV, upV);
      const bv2 = ph.ballBody.linvel();
      const bs = Math.hypot(bv2.x, bv2.y, bv2.z);
      if (bs > 3) {
        const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
        // A visible curve: a deliberately off-centre hit bends the shot ~30%.
        const blend = 0.30 * Math.min(1, Math.abs(dir.offR) + Math.abs(dir.offU) * 0.4);
        ph.ballBody.setLinvel({
          x: bv2.x * (1 - blend) + (dir.x / dl) * bs * blend,
          y: bv2.y * (1 - blend) + (dir.y / dl) * bs * blend,
          z: bv2.z * (1 - blend) + (dir.z / dl) * bs * blend,
        }, true);
      }
      const strength = Math.min(1, bSpeed / 45);
      R.impact(bp2.x, bp2.y, bp2.z, strength);
      R.shake(strength * 0.55);
      SFX.hitBall(bSpeed);
      state.stats.hits += 1;
    }
    prevBallSpeed = bSpeed;

    // jump / flip sounds
    if (carCtl.car.jumpsLeft < prevJumps) {
      if (carCtl.car.jumpsLeft === 1) SFX.jumpSound(); else SFX.flipSound();
    }
    prevJumps = carCtl.car.jumpsLeft;
    if (carCtl.car.boosting && !prevBoosting) SFX.boostWhoosh();
    prevBoosting = carCtl.car.boosting;
    SFX.updateEngine(carCtl.car.speed, carCtl.car.boosting);

    // goal detection
    const bp = ph.ballBody.translation();
    const who = inGoal(bp);
    if (who && state.phase === 'play') {
      scoreGoal(state, who);
      R.flash(who === 'you' ? 0x4de2ff : 0xff2d78, 0.5);
      R.shake(0.8);
      SFX.goalHorn(who === 'you');
      running = true;
    }

    // clock / phase
    const t = tickClock(state, dt);
    if (t === 'kickoff') kickoff();
    if (t === 'over') { running = false; showOver(); }
  } else if (state.phase === 'title') {
    // idle camera drift on the title screen
  }

  if (R) {
    R.sync(ph, carCtl, dt, camMode, aiCtl);
    R.render();
  }
  updateHUD();
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!carCtl) return;
  // off-screen ball marker
  const mark = $('ballmark');
  if (mark && R) {
    const bs = R.ballScreen();
    if (bs.onScreen || !running) {
      mark.classList.add('hide');
    } else {
      mark.classList.remove('hide');
      const W = innerWidth, H = innerHeight;
      let x = bs.x, y = bs.y;
      if (bs.behind) { x = 1 - x; y = 1 - y; }
      x = Math.max(0.06, Math.min(0.94, x));
      y = Math.max(0.10, Math.min(0.90, y));
      mark.style.transform = `translate(${x * W}px, ${y * H}px)`;
    }
  }
  $('you').textContent = state.scoreYou;
  $('ai').textContent = state.scoreAI;
  const m = Math.floor(state.clock / 60), s = Math.floor(state.clock % 60);
  $('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;

  const pct = Math.max(0, Math.min(100, carCtl.boost));
  const arc = $('boostarc');
  if (arc) {
    const C = 2 * Math.PI * 44;
    arc.style.strokeDasharray = C;
    arc.style.strokeDashoffset = C * (1 - pct / 100);
    arc.style.stroke = pct > 25 ? '#4de2ff' : '#ff8a1f';
  }
  const num = $('boostnum');
  if (num) num.textContent = Math.round(pct);
  $('spd').textContent = Math.round(carCtl.car.speed * 3.6);
}

function showOver() {
  const win = state.scoreYou > state.scoreAI;
  const draw = state.scoreYou === state.scoreAI;
  $('overtitle').textContent = draw ? 'DRAW' : (win ? 'YOU WIN' : 'YOU LOSE');
  $('overtitle').style.color = draw ? '#ffd166' : (win ? '#4de2ff' : '#ff2d78');
  $('overscore').textContent = `${state.scoreYou} — ${state.scoreAI}`;
  $('over').classList.remove('hide');
  $('btnrestart').classList.remove('hide');
  SFX.whistle();
}

// ── proof surface ──────────────────────────────────────────────────────────
window.__game = {
  state,
  get score() { return state.scoreYou; },
  get player() {
    // x/y are SCREEN pixels (the proof harness measures movement in pixels);
    // world coordinates are exposed separately.
    const p = ph.carBody.translation();
    const v = R.renderer.domElement;
    const ndc = new THREE.Vector3(p.x, p.y, p.z).project(R.camera);
    return {
      x: (ndc.x * 0.5 + 0.5) * v.clientWidth,
      y: (-ndc.y * 0.5 + 0.5) * v.clientHeight,
      world: { x: p.x, y: p.y, z: p.z },
      screen: { w: v.clientWidth, h: v.clientHeight },
    };
  },
  get ball() { const b = ph.ballBody.translation(); return { x: b.x, y: b.y, z: b.z }; },
  start: startMatch,
  api: {
    stepCar, stepAI, resetKickoff, inGoal, scoreGoal, tickClock,
    get physics() { return ph; },
    get pads() { return pads; },
    get input() { return input; },
    get carCtl() { return carCtl; },
    get aiCtl() { return aiCtl; },
    get camera() { return R ? R.camera : null; },
    get ballScreen() { return R ? R.ballScreen() : null; },
    get camMode() { return camMode; },
    setInput(o) { Object.assign(input, o); },
  },
};

document.addEventListener('visibilitychange', () => {
  // A manual pause outranks visibility: coming back to the tab must NOT resume a
  // match the player deliberately paused.
  if (document.hidden) { paused = true; }
  else { paused = manualPause; last = performance.now(); }
});

boot().catch((e) => {
  console.error('boot failed', e);
  const el = $('title');
  if (el) el.innerHTML = '<div style="color:#ff2d78">failed to start: ' + e.message + '</div>';
});
