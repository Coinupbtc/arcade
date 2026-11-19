// CARBALL — boot, match flow, physics loop and glue.
// Rules live in carModel.js / ai.js; this file only moves bodies and draws.

import * as THREE from '../lib/three.module.js';
import RAPIER from '../lib/rapier/rapier.mjs';
import * as C from './config.js';
import { makeCarState, driveStep, jumpStep, landCar, strikeImpulse, isGoal, resetCar, ballHitResponse, boxContactNormal, inGoalBox } from './carModel.js';
import { aiInput, AI_MAX_SPEED } from './ai.js';
import { buildArena, animatePads, setPadActive } from './arena.js';
import { createCarVisual, createCarBody, updateCarVisual, quatFromYaw } from './car.js';
import { createBall, updateBallVisual } from './ball.js';
import { resetCamera, updateCamera } from './camera.js';
import { input, bindInput, consumeJump, consumeCam, consumePause, consumeStart, consumeRestart } from './input.js';
import { hud } from './hud.js';
import * as SFX from './audio.js';

const $ = (id) => document.getElementById(id);

const DIFF = {
  rookie: { speed: 17.8, aim: 2.6, reaction: 0.22, boost: 0.7, holdTime: 11.0, holdZ: 6, off: 0.6 },
  pro: { speed: 21.0, aim: 0.9, reaction: 0.10, boost: 1.0, holdTime: 4.0, holdZ: 5, off: 0.25 },
};

// CUP: five rounds, the same physics for both cars, the AI's speed, aim and patience climb.
const CUP = [
  { name: 'ROUND 1 · ROOKIE', speed: 17.6, aim: 2.9, reaction: 0.24, boost: 0.7, holdTime: 12.0, holdZ: 6, off: 0.6 },
  { name: 'ROUND 2 · STEADY', speed: 19.2, aim: 2.1, reaction: 0.17, boost: 0.8, holdTime: 9.0, holdZ: 6, off: 0.45 },
  { name: 'ROUND 3 · PRESS', speed: 20.4, aim: 1.4, reaction: 0.12, boost: 0.9, holdTime: 6.5, holdZ: 5.5, off: 0.32 },
  { name: 'ROUND 4 · PRO', speed: 21.2, aim: 0.8, reaction: 0.09, boost: 1.0, holdTime: 4.5, holdZ: 5, off: 0.2 },
  { name: 'ROUND 5 · ACE', speed: 22.0, aim: 0.4, reaction: 0.06, boost: 1.0, holdTime: 3.0, holdZ: 5, off: 0.1 },
];
const CUP_KEY = 'carball.cup.best';

const game = {
  phase: 'menu',            // menu | kickoff | play | goal | over | paused
  score: { blue: 0, orange: 0 },
  time: C.MATCH_TIME,
  overtime: false,
  kickoffT: 0,
  goalPause: 0,
  ballCam: true,
  shake: 0,
  paused: false,
  aiJumpCd: 0,
  fps: 60,
  difficulty: 'rookie',
  mode: 'quick',            // quick | cup
  cupRound: 0,              // 0-based index into CUP
  cupBest: 0,
  hintShown: false,
  dbg: { events: 0, playerEvents: 0, aiEvents: 0, nullResp: 0, cdSkips: 0, lastHitTry: null },
};

let world, eventQueue, scene, camera, renderer;
let arena, pads = [];
let ball, playerBody, playerCollider, aiBody, aiCollider;
let playerVis, aiVis;
const pc = makeCarState(0, -29, 0);
const ac = makeCarState(0, 29, Math.PI);
const aiMem = {};
let pendingJump = false;
let last = 0, acc = 0;
const preSolve = { ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, pc: null, ac: null };
let hitCd = 0;
let ticks = 0;
let sparks = null;

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -C.GRAVITY, z: 0 });
  world.timestep = C.TICK;
  eventQueue = new RAPIER.EventQueue(true);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);
  scene.fog = new THREE.FogExp2(0x05080f, 0.0048);

  camera = new THREE.PerspectiveCamera(C.CAM_FOV, window.innerWidth / window.innerHeight, 0.1, 220);

  const canvas = $('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x0a0f18, 1.05);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x6f9cc8, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(18, 34, 10);
  scene.add(key);
  const blueLight = new THREE.PointLight(0x2f7bff, 260, 110, 1.7);
  blueLight.position.set(-24, 14, -26);
  scene.add(blueLight);
  const orangeLight = new THREE.PointLight(0xff7a1a, 260, 110, 1.7);
  orangeLight.position.set(24, 14, 26);
  scene.add(orangeLight);
  const centre = new THREE.PointLight(0xbfe6ff, 120, 90, 1.8);
  centre.position.set(0, 18, 0);
  scene.add(centre);

  arena = buildArena(scene, world, RAPIER);
  pads = arena.pads;

  ball = createBall(scene, world, RAPIER);

  const p = createCarBody(world, RAPIER, 0, -38, 0);
  playerBody = p.body; playerCollider = p.collider;
  const a = createCarBody(world, RAPIER, 0, 38, Math.PI);
  aiBody = a.body; aiCollider = a.collider;

  playerVis = createCarVisual('blue');
  aiVis = createCarVisual('orange');
  scene.add(playerVis);
  scene.add(aiVis);

  sparks = createSparks(scene);
  resetPositions();
  resetCamera(pc, ball.body.translation());
  bindInput(() => SFX.initAudio());
  bindButtons();
  bindResize();

  hud.hud(false);
  hud.menu(true);
  hud.setCamLabel(game.ballCam);

  window.__game = {
    get state() { return game.phase === 'menu' ? 'menu' : game.phase === 'over' ? 'over' : 'play'; },
    get player() { return { x: pc.x, y: pc.z, world: { x: pc.x, y: pc.y, z: pc.z } }; },
    get score() { return `${game.score.blue}-${game.score.orange}`; },
    get extra() { return { phase: game.phase, speed: pc.speed, boost: pc.boost, fps: game.fps, aiSpeed: ac.speed,
      kickoffT: game.kickoffT, ticks,
      ball: (() => { const t = ball.body.translation(), v = ball.body.linvel(); return { x: t.x, y: t.y, z: t.z, vx: v.x, vy: v.y, vz: v.z }; })(),
      ai: { x: ac.x, y: ac.y, z: ac.z, speed: ac.speed, mode: aiMem.mode },
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      camDir: (() => { const v = new THREE.Vector3(); camera.getWorldDirection(v); return { x: v.x, y: v.y, z: v.z }; })(),
      visVisible: playerVis.visible, visKids: playerVis.children.length,
      visWorld: (() => { const v = new THREE.Vector3(); playerVis.getWorldPosition(v); return { x: v.x, y: v.y, z: v.z }; })(),
      carScreen: (() => { const v = new THREE.Vector3(pc.x, pc.y + 0.25, pc.z).project(camera); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, z: v.z }; })(),
      car: { x: pc.x, y: pc.y, z: pc.z, yaw: pc.yaw },
      lastHit: game.lastHit || null,
      dbg: game.dbg,
      mode: game.mode, cupRound: game.cupRound, cupBest: game.cupBest,
      inGoal: inGoalBox(pc), goalT: pc.goalT || 0,
      vis: { x: playerVis.position.x, y: playerVis.position.y, z: playerVis.position.z } }; },
    start() { startMatch(); },
    restart() { startMatch(); },
  };

  if (/[?&]autostart=1/.test(location.search)) startMatch();

  last = performance.now();
  requestAnimationFrame(loop);
}

function bindButtons() {
  const play = $('btn-play');
  if (play) play.addEventListener('click', () => { SFX.initAudio(); SFX.uiSound(); startMatch({ mode: 'quick' }); });
  const cup = $('btn-cup');
  if (cup) cup.addEventListener('click', () => { SFX.initAudio(); SFX.uiSound(); startMatch({ mode: 'cup', round: 0 }); });
  const again = $('btn-again');
  if (again) again.addEventListener('click', () => {
    SFX.uiSound();
    if (game.overAction === 'next') startMatch({ mode: 'cup', round: Math.min(CUP.length - 1, game.cupRound + 1) });
    else if (game.overAction === 'replayround') startMatch({ mode: 'cup', round: game.cupRound });
    else if (game.overAction === 'cupretry') startMatch({ mode: 'cup', round: 0 });
    else startMatch({ mode: game.mode, round: game.cupRound });
  });
  const menu = $('btn-menu');
  if (menu) menu.addEventListener('click', () => { SFX.uiSound(); toMenu(); });
  const resume = $('btn-resume');
  if (resume) resume.addEventListener('click', () => setPaused(false));
  const pause = $('btn-pause');
  if (pause) pause.addEventListener('click', () => setPaused(!game.paused));
  document.querySelectorAll('#diff button').forEach((b) => {
    b.addEventListener('click', () => {
      game.difficulty = b.dataset.diff;
      document.querySelectorAll('#diff button').forEach((x) => x.classList.toggle('on', x === b));
      SFX.uiSound();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !game.paused &&
      (game.phase === 'play' || game.phase === 'kickoff' || game.phase === 'goal')) setPaused(true);
  });
}

function loadCupBest() {
  try { game.cupBest = Number(localStorage.getItem(CUP_KEY)) || 0; } catch { game.cupBest = 0; }
  const el = $('cup-best');
  if (el) {
    el.textContent = game.cupBest >= CUP.length
      ? `CUP CLEARED · best ${game.cupBest}/5`
      : game.cupBest > 0 ? `BEST · reached round ${game.cupBest + 1} of 5` : 'BEST · not started';
  }
}
function saveCupBest() {
  try { localStorage.setItem(CUP_KEY, String(game.cupBest)); } catch { /* private mode */ }
}

function toMenu() {
  game.phase = 'menu';
  game.paused = false;
  hud.hud(false);
  hud.over(false);
  hud.pause(false);
  hud.menu(true);
  hud.setCup('');
  loadCupBest();
  resetPositions();
}

function bindResize() {
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    // portrait gets a wider lens: the car then leaves more of the pitch visible
    camera.fov = C.CAM_FOV + (camera.aspect < 0.85 ? 10 : 0);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
}

// ── match flow ─────────────────────────────────────────────────────────────
const debugClock = Number(new URLSearchParams(location.search).get('clock')) || 0;

function startMatch(opts = {}) {
  game.mode = opts.mode || game.mode || 'quick';
  game.cupRound = opts.round ?? (game.mode === 'cup' ? game.cupRound : 0);
  game.score.blue = 0;
  game.score.orange = 0;
  game.time = debugClock || C.MATCH_TIME;
  game.overtime = false;
  game.phase = 'kickoff';
  game.kickoffT = 0.9;
  game.kickoffUntil = performance.now() + 900;
  game.goalPause = 0;
  game.paused = false;
  game.shake = 0;
  game.overAction = 'again';
  hud.menu(false);
  hud.over(false);
  hud.pause(false);
  hud.hud(true);
  hud.setScore(0, 0);
  hud.setClock(game.time, false);
  hud.setBoost(34);
  hud.setCup(game.mode === 'cup' ? `CUP ${game.cupRound + 1}/${CUP.length} · ${CUP[game.cupRound].name}` : 'QUICK MATCH');
  resetPositions();
  SFX.beep(false);
  setTimeout(() => SFX.beep(true), 180);
  if (!game.hintShown) {
    game.hintShown = true;
    setTimeout(() => hud.hint('Drive into the ball · tap JUMP twice to flip · gold pads refill boost', 5600), 1400);
  }
}

function resetPositions() {
  const keeperZ = C.PITCH_HALF_L - 7;
  resetCar(pc, 0, -29, 0);
  resetCar(ac, 0, keeperZ, Math.PI);
  pc.boost = 34;
  ac.boost = 34;
  ac.skill = game.mode === 'cup' ? CUP[game.cupRound] : DIFF[game.difficulty];
  pc.goalT = 0; ac.goalT = 0;

  playerBody.setTranslation({ x: 0, y: C.CAR_REST_Y, z: -29 }, true);
  playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  playerBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  playerBody.setRotation(quatFromYaw(RAPIER, 0), true);

  aiBody.setTranslation({ x: 0, y: C.CAR_REST_Y, z: keeperZ }, true);
  aiBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  aiBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  aiBody.setRotation(quatFromYaw(RAPIER, Math.PI), true);

  ball.body.setTranslation({ x: 0, y: C.BALL_RADIUS + 0.04, z: 0 }, true);
  ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

  for (const pad of pads) { pad.timer = 0; setPadActive(pad, true); }
  resetCamera(pc, ball.body.translation());
  aiMem.timer = 0;
  aiMem.target = { x: 0, z: 2.1 };
  aiMem.mode = 'chase';
  game.aiJumpCd = 0;
  pendingJump = false;
}

function setPaused(on) {
  if (game.phase === 'menu' || game.phase === 'over') return;
  game.paused = on;
  hud.pause(on);
}

function endMatch() {
  game.phase = 'over';
  hud.hud(false);
  const b = game.score.blue, o = game.score.orange;
  const won = b > o;
  let title = won ? 'YOU WIN' : b < o ? 'AI WINS' : 'DRAW';
  let sub = `${b} — ${o}`;
  let btn = 'PLAY AGAIN';

  if (game.mode === 'cup') {
    if (won) {
      game.cupBest = Math.max(game.cupBest, game.cupRound + 1);
      saveCupBest();
      if (game.cupRound >= CUP.length - 1) {
        title = 'CUP WON';
        sub = `${b} — ${o} · all ${CUP.length} rounds`;
        btn = 'PLAY CUP AGAIN';
        game.overAction = 'cupretry';
      } else {
        title = 'ROUND WON';
        sub = `${b} — ${o} · next: ${CUP[game.cupRound + 1].name}`;
        btn = 'NEXT ROUND';
        game.overAction = 'next';
      }
    } else if (b === o) {
      // a draw is not a loss: replay the round you were on
      title = 'ROUND DRAWN';
      sub = `${b} — ${o} · replay ${CUP[game.cupRound].name}`;
      btn = 'REPLAY ROUND';
      game.overAction = 'replayround';
    } else {
      title = 'ROUND LOST';
      sub = `${b} — ${o} · back to round 1`;
      btn = 'RESTART CUP';
      game.overAction = 'cupretry';
    }
  } else {
    game.overAction = 'again';
  }
  hud.over(true, title, sub);
  const again = $('btn-again');
  if (again) again.textContent = btn;
  SFX.goalSound(won);
}

function scoreGoal(team) {
  if (team === 'blue') game.score.blue++; else game.score.orange++;
  hud.setScore(game.score.blue, game.score.orange);
  hud.flash('GOAL', team, 1500);
  SFX.goalSound(team === 'blue');
  game.shake = 0.55;
  const bp = ball.body.translation();
  sparks.burst(bp.x, bp.y, bp.z, team === 'blue' ? 0x59d8ff : 0xffb347, 90);
  game.phase = 'goal';
  game.goalPause = 2.0;
}

// ── one physics tick ───────────────────────────────────────────────────────
function step(dt) {
  ticks++;
  hitCd = Math.max(0, hitCd - dt);
  // read bodies into plain state
  readCar(pc, playerBody);
  readCar(ac, aiBody);

  const frozen = game.phase !== 'play';
  const live = game.phase === 'play';

  let pIn = { throttle: 0, steer: 0, boost: false, slide: false };
  if (live && !frozen) {
    pIn = { throttle: input.throttle, steer: input.steer, boost: input.boost, slide: input.slide };
  }
  driveStep(pc, pIn, dt);

  if (pendingJump) {
    pendingJump = false;
    if (live && !frozen) {
      const kind = jumpStep(pc, pIn);
      if (kind) SFX.jumpSound();
    }
  }

  // AI
  let aIn = { throttle: 0, steer: 0, boost: false, jump: false };
  if (live && !frozen) {
    const bp = ball.body.translation();
    aIn = aiInput(ac, { x: bp.x, y: bp.y, z: bp.z, vx: ball.body.linvel().x, vy: ball.body.linvel().y, vz: ball.body.linvel().z }, dt, aiMem);
  }
  driveStep(ac, aIn, dt);
  // difficulty cap: the AI never reaches the player's boost top speed
  const asp = Math.hypot(ac.vx, ac.vz);
  const aiCap = ac.skill?.speed ?? AI_MAX_SPEED;
  if (asp > aiCap) {
    const k = aiCap / asp;
    ac.vx *= k; ac.vz *= k;
  }
  game.aiJumpCd -= dt;
  if (aIn.jump && ac.grounded && game.aiJumpCd <= 0 && live && !frozen) {
    jumpStep(ac, { throttle: 1 });
    game.aiJumpCd = 0.55;
    SFX.jumpSound();
  }

  if (frozen) { pc.vx = 0; pc.vz = 0; ac.vx = 0; ac.vz = 0; }

  // write bodies
  writeCar(pc, playerBody);
  writeCar(ac, aiBody);

  // Pre-solve snapshot. Collision events are drained AFTER world.step, and by then the
  // solver has already pushed the ball away — a hit rule that reads the ball's velocity at
  // that moment sees "separating" and does nothing (this is exactly how the player's hits
  // were being skipped and the raw solver lob was being felt instead). The impulse must be
  // computed from the state at the moment of contact.
  const bt0 = ball.body.translation();
  const bv0 = ball.body.linvel();
  preSolve.ball = { x: bt0.x, y: bt0.y, z: bt0.z, vx: bv0.x, vy: bv0.y, vz: bv0.z };
  preSolve.pc = { x: pc.x, y: pc.y, z: pc.z, yaw: pc.yaw, vx: pc.vx, vy: pc.vy, vz: pc.vz };
  preSolve.ac = { x: ac.x, y: ac.y, z: ac.z, yaw: ac.yaw, vx: ac.vx, vy: ac.vy, vz: ac.vz };

  // kickoff uses wall-clock time, so a long first-frame shader compile cannot
  // stretch the freeze into seconds of a dead car
  if (game.phase === 'kickoff' && performance.now() >= (game.kickoffUntil || 0)) {
    game.kickoffT = 0;
    game.phase = 'play';
    hud.flash('GO', 'go', 500);
  }

  world.step(eventQueue);
  handleCollisions();
  clampBall();
  containBody(playerBody, C.PITCH_HALF_W - 0.7, C.PITCH_HALF_L + C.GOAL_DEPTH - 0.7, C.WALL_H - 1.0);
  containBody(aiBody, C.PITCH_HALF_W - 0.7, C.PITCH_HALF_L + C.GOAL_DEPTH - 0.7, C.WALL_H - 1.0);
  recoverFromGoal(pc, playerBody, -1, dt, true);
  recoverFromGoal(ac, aiBody, 1, dt, false);

  // boost pads
  pickupPads(pc);
  pickupPads(ac);
  for (const pad of pads) {
    if (!pad.active) {
      pad.timer -= dt;
      if (pad.timer <= 0) setPadActive(pad, true);
    }
  }

  // goal and clock
  if (game.phase === 'play') {
    const bp = ball.body.translation();
    const g = isGoal(bp);
    if (g) {
      scoreGoal(g);
      if (game.overtime) { game.phase = 'goal'; game.goalPause = 1.2; }
    } else {
      game.time -= dt;
      if (game.time <= 0) {
        if (!game.overtime && game.score.blue === game.score.orange) {
          game.overtime = true;
          game.time = C.OVERTIME_TIME;
          hud.flash('OVERTIME', 'ot', 1600);
          SFX.beep(true);
        } else {
          endMatch();
        }
      }
    }
  } else if (game.phase === 'goal') {
    game.goalPause -= dt;
    if (game.goalPause <= 0) {
      if (game.overtime) { endMatch(); return; }
      game.phase = 'kickoff';
      game.kickoffT = 1.2;
      game.kickoffUntil = performance.now() + 1200;
      resetPositions();
    }
  }
}

function readCar(car, body) {
  const t = body.translation();
  const v = body.linvel();
  car.x = t.x; car.y = t.y; car.z = t.z;
  car.vx = v.x; car.vy = v.y; car.vz = v.z;
  const grounded = t.y <= C.CAR_REST_Y + 0.06 && v.y < 1.5;
  if (grounded && !car.grounded) landCar(car);
  car.grounded = grounded;
  if (grounded) car.jumps = 2;
  car.speed = Math.hypot(v.x, v.z);
}

function writeCar(car, body) {
  body.setLinvel({ x: car.vx, y: car.vy, z: car.vz }, true);
  body.setRotation(quatFromYaw(RAPIER, car.yaw), true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// The core move. The ball's velocity comes from ballHitResponse (momentum between the
// measured masses, restitution 0.6, the teardown's push factor curve); the contact normal
// comes from the car's box, so a nose hit is flat and a corner hit sends the ball wide.
// Nothing here invents an upward pop or zeroes the ball's spin.
function hitBall(car, pre, sparkColor, sound) {
  const bt = ball.body.translation();
  const p = pre || { x: car.x, y: car.y, z: car.z, yaw: car.yaw, vx: car.vx, vy: car.vy, vz: car.vz };
  const n = boxContactNormal({ x: p.x, y: p.y, z: p.z, yaw: p.yaw },
    { x: preSolve.ball.x, y: preSolve.ball.y, z: preSolve.ball.z });
  const aboveRoof = (preSolve.ball.y - C.BALL_RADIUS) > p.y + C.CAR_HEIGHT / 2;
  const r = ballHitResponse({ x: p.vx, y: p.vy, z: p.vz },
    { x: preSolve.ball.vx, y: preSolve.ball.vy, z: preSolve.ball.vz }, n, { aboveRoof });
  game.dbg.lastHitTry = { car: [car.x.toFixed(2), car.y.toFixed(2), car.z.toFixed(2), car.yaw.toFixed(2)],
    vel: [car.vx.toFixed(2), car.vz.toFixed(2)], ball: [bt.x.toFixed(2), bt.z.toFixed(2)],
    n: [n.x.toFixed(2), n.y.toFixed(2), n.z.toFixed(2)], ok: !!r };
  if (!r) { game.dbg.nullResp++; return; }
  const sp = Math.hypot(r.vx, r.vy, r.vz);
  const k = sp > C.BALL_MAX_SPEED ? C.BALL_MAX_SPEED / sp : 1;
  ball.body.setLinvel({ x: r.vx * k, y: r.vy * k, z: r.vz * k }, true);
  const w = ball.body.angvel();
  ball.body.setAngvel({ x: w.x + r.spin.x, y: w.y + r.spin.y, z: w.z + r.spin.z }, true);
  hitCd = 0.05;
  const strength = Math.min(1, r.impulse / 26);
  sparks.burst(bt.x, bt.y, bt.z, sparkColor, Math.round(6 + strength * 26));
  SFX.hitSound(sound * strength);
  game.shake = Math.max(game.shake, 0.03 + strength * 0.16);
  game.lastHit = { car: Math.hypot(car.vx, car.vz), ball: sp, impulse: r.impulse };
}

function handleCollisions() {
  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const ballH = ball.collider.handle;
    if (h1 !== ballH && h2 !== ballH) return;
    game.dbg.events++;
    if (hitCd > 0) { game.dbg.cdSkips++; return; }
    const other = h1 === ballH ? h2 : h1;
    if (other === playerCollider.handle) {
      game.dbg.playerEvents++;
      hitBall(pc, preSolve.pc, 0x9fdcff, Math.min(1, pc.speed / 23));
    } else if (other === aiCollider.handle) {
      game.dbg.aiEvents++;
      hitBall(ac, preSolve.ac, 0xffb347, Math.min(1, ac.speed / 23) * 0.7);
    }
  });
}

function clampBall() {
  const v = ball.body.linvel();
  const s = Math.hypot(v.x, v.y, v.z);
  if (s > C.BALL_MAX_SPEED) {
    const k = C.BALL_MAX_SPEED / s;
    ball.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
  }
  const w = ball.body.angvel();
  const ws = Math.hypot(w.x, w.y, w.z);
  if (ws > C.BALL_MAX_SPIN) {
    const k = C.BALL_MAX_SPIN / ws;
    ball.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
  }
  const t = ball.body.translation();
  if (t.y < -2 || Math.abs(t.x) > 70 || Math.abs(t.z) > 80) {
    ball.body.setTranslation({ x: 0, y: C.BALL_RADIUS + 0.04, z: 0 }, true);
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}

function flattenHit(cap) {
  // kept for compatibility with older callers; the hit rule no longer needs a vertical cap
  const v = ball.body.linvel();
  if (v.y > cap) ball.body.setLinvel({ x: v.x, y: cap, z: v.z }, true);
}

// A car that parks in the goal is lost: the camera sits outside the net and the car fills
// the frame. After 1.3 s inside the goal box the car is put back on its own half.
function recoverFromGoal(car, body, side, dt, isPlayer) {
  if (game.phase !== 'play') { car.goalT = 0; return; }
  const t = body.translation();
  const inBox = Math.abs(t.z) > C.PITCH_HALF_L && Math.abs(t.x) < C.GOAL_HALF_W && t.y < C.GOAL_H;
  if (!inBox) { car.goalT = 0; return; }
  car.goalT = (car.goalT || 0) + dt;
  if (car.goalT < 1.3) return;
  car.goalT = 0;
  body.setTranslation({ x: 0, y: C.CAR_REST_Y, z: side * 29 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.setRotation(quatFromYaw(RAPIER, side > 0 ? Math.PI : 0), true);
  car.x = 0; car.y = C.CAR_REST_Y; car.z = side * 29;
  car.vx = car.vy = car.vz = 0; car.yaw = side > 0 ? Math.PI : 0; car.speed = 0;
  if (isPlayer) hud.flash('RECOVERED', 'go', 700);
}

function containBody(body, halfX, halfZ, yMax) {
  const t = body.translation();
  let x = t.x, y = t.y, z = t.z, hit = false;
  let nx = 0, nz = 0;
  if (Math.abs(x) > halfX) { x = Math.sign(x) * halfX; nx = Math.sign(t.x); hit = true; }
  if (Math.abs(z) > halfZ) { z = Math.sign(z) * halfZ; nz = Math.sign(t.z); hit = true; }
  if (y > yMax) { y = yMax; hit = true; }
  if (!hit) return;
  body.setTranslation({ x, y, z }, true);
  // kill only the speed into the wall: a car scraping a wall keeps sliding along it
  const v = body.linvel();
  let vx = v.x, vz = v.z;
  if (nx > 0) vx = Math.min(0, v.x);
  if (nx < 0) vx = Math.max(0, v.x);
  if (nz > 0) vz = Math.min(0, v.z);
  if (nz < 0) vz = Math.max(0, v.z);
  body.setLinvel({ x: vx, y: Math.min(v.y, 0), z: vz }, true);
}

function pickupPads(car) {
  if (game.phase !== 'play') return;
  for (const pad of pads) {
    if (!pad.active) continue;
    const r = pad.big ? 1.9 : 1.25;
    if (Math.hypot(car.x - pad.x, car.z - pad.z) < r && car.y < 2.4) {
      const amount = pad.big ? C.BIG_PAD_BOOST : C.SMALL_PAD_BOOST;
      if (car.boost < C.BOOST_MAX - 0.5) {
        car.boost = Math.min(C.BOOST_MAX, car.boost + amount);
        setPadActive(pad, false);
        pad.timer = pad.big ? C.BIG_PAD_RESPAWN : C.SMALL_PAD_RESPAWN;
        SFX.padSound(pad.big);
      }
    }
  }
}

// ── sparks for a hit or a goal ─────────────────────────────────────────────
// Round soft points, not square sprites: a square PointsMaterial at 0.34 m littered the
// frame with bright boxes (the playtester's [render] finding).
function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createSparks(scene) {
  const N = 140;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: sparkTexture(), color: 0x9fdcff, size: 0.16, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  const vel = new Float32Array(N * 3);
  let life = 0, maxLife = 1;
  return {
    burst(x, y, z, color, n = 30) {
      mat.color.setHex(color);
      const live = Math.min(N, Math.max(4, n));
      for (let i = 0; i < N; i++) {
        const on = i < live;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * Math.PI - Math.PI / 2;
        const sp = on ? 3 + Math.random() * 9 : 0;
        vel[i * 3] = Math.cos(a) * Math.cos(e) * sp;
        vel[i * 3 + 1] = Math.sin(e) * sp + 2.5;
        vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      }
      maxLife = 0.55;
      life = maxLife;
      geo.attributes.position.needsUpdate = true;
    },
    update(dt) {
      if (life <= 0) { mat.opacity = 0; return; }
      life -= dt;
      for (let i = 0; i < N; i++) {
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 14 * dt;
      }
      mat.opacity = Math.max(0, 0.9 * (life / maxLife));
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ── render loop ────────────────────────────────────────────────────────────
function loop(now) {
  // clamp both ends: the first rAF timestamp can predate the performance.now() taken
  // during boot, and a negative dt makes the exponential camera lerp explode (it flew
  // in from 20 km and the car was off screen for the first seconds)
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) || 0.016;
  last = now;
  game.fps += ((1 / Math.max(0.001, dt)) - game.fps) * 0.05;

  if (consumeStart()) { if (game.phase === 'menu' || game.phase === 'over') startMatch(); }
  if (consumeRestart()) startMatch();
  if (consumePause()) setPaused(!game.paused);
  if (consumeCam()) { game.ballCam = !game.ballCam; hud.setCamLabel(game.ballCam); }
  if (consumeJump()) pendingJump = true;

  if (!game.paused) {
    if (game.phase === 'kickoff' || game.phase === 'play' || game.phase === 'goal') {
      acc += dt;
      let n = 0;
      while (acc >= C.TICK && n < 12) { step(C.TICK); acc -= C.TICK; n++; }
      if (n >= 12) acc = 0;
    }
  }

  updateVisuals(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function updateVisuals(dt) {
  // cars
  const pv = playerBody.translation();
  pc.x = pv.x; pc.y = pv.y; pc.z = pv.z;
  const av = aiBody.translation();
  ac.x = av.x; ac.y = av.y; ac.z = av.z;

  updateCarVisual(playerVis, pc, dt, input.steer);
  updateCarVisual(aiVis, ac, dt, 0);
  updateBallVisual(ball, dt);
  // keep the ball's ring the same apparent size at any distance (phone readability)
  const camDist = camera.position.distanceTo(ball.marker.position);
  ball.marker.scale.setScalar(Math.max(0.85, Math.min(2.8, camDist * 0.045)));
  ball.glow.scale.setScalar(Math.max(2.4, Math.min(8.0, camDist * 0.11)));
  animatePads(pads, dt, performance.now() / 1000);
  sparks.update(dt);

  const bt = ball.body.translation();
  updateCamera(camera, pc, { x: bt.x, y: bt.y, z: bt.z }, dt, { ballCam: game.ballCam, shake: game.shake, goalCam: game.phase === 'goal' });
  game.shake *= Math.exp(-5 * dt);

  hud.setBoost(pc.boost);
  hud.setSpeed(pc.speed);
  hud.setClock(game.time, game.overtime);
  SFX.setEngine(pc.speed, input.throttle, pc.boosting);
}

boot().catch((e) => {
  console.error('CARBALL boot failed', e);
  const el = document.getElementById('banner');
  if (el) { el.textContent = 'BOOT FAILED'; el.className = 'banner show'; }
});
