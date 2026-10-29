/* ZOMBIE BREACH — boot: renderer, scene, the shared input layer, and the hook the gate reads. */
import * as THREE from 'three';
import { CFG } from './config.js';
import { buildWorld } from './world.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

window.__THREE__ = THREE.REVISION;    // the gate reads the runtime revision

function fail(msg) {
  window.__errs = window.__errs || [];
  window.__errs.push(String(msg));
  const d = document.getElementById('fatal');
  if (d) { d.style.display = 'block'; d.textContent = 'ZOMBIE BREACH failed to start: ' + msg; }
}

let renderer, scene, camera, input, game, ui, sfx;

try {
  const root = document.getElementById('game-root');
  let quality = 1;                    // render scale; drops if the GPU falls behind

  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(renderRatio(quality));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('aria-label', 'Zombie Breach playfield');
  root.appendChild(renderer.domElement);
  window.__renderer = renderer;      // diagnostics only (no gameplay reads it)

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(CFG.fov, window.innerWidth / window.innerHeight, 0.08, 240);
  camera.position.set(0, CFG.camUp, 2);
  buildWorld(scene);

  sfx = new Sfx();

  input = window.ArcadeInput.create({
    surface: renderer.domElement,
    promptBase: 'prompts/',
    labels: { primary: 'FIRE', secondary: 'JUMP', reload: 'RELOAD', pause: 'PAUSE' },
    actions: ['reload'],
    touchButtons: ['primary', 'secondary', 'reload'],
    stick: 'float',
    dragMove: false,
    isRunning: function () { return game && game.state === 'play'; },
    onPause: function () { if (game) game.pauseGame(); },
    onResume: function () { if (game) game.onResumed(); },
    onRefit: function () { resize(); },
    bindings: {
      primary: { keys: ['Space', 'Enter'], pad: ['A'], mouse: ['left'], touch: 'button' },
      secondary: { keys: ['ShiftLeft', 'ShiftRight', 'KeyK'], pad: ['X'], mouse: ['right'], touch: 'button' },
      reload: { keys: ['KeyR'], pad: ['Y'], touch: 'button' }
    }
  });

  /* A phone has no keyboard: start in touch mode so the first menu already shows touch hints,
     not SHIFT / Q / E. The first real touch or key still switches it normally. */
  if (input.touchCapable) input.device = 'touch';

  ui = new UI(input, null);
  game = new Game(scene, camera, input, ui, sfx);
  ui.game = game;
  ui.init();
  window.__gameRef = game;

  /* ---------- desktop mouse look: relative deltas, edge-turn, opt-in pointer lock ---------- */
  const canvas = renderer.domElement;
  const lockBtn = document.getElementById('btn-lock');
  const mouse = { x: 0, y: 0, seen: false };
  let lastX = null, lastY = null;

  function pointerLocked() { return document.pointerLockElement === canvas; }

  function setLockUI() {
    const locked = pointerLocked();
    if (lockBtn) {
      lockBtn.textContent = locked ? '🔒 LOCKED' : '🖱 LOCK';
      lockBtn.classList.toggle('on', locked);
      lockBtn.setAttribute('aria-label', locked ? 'Mouse locked; Esc releases' : 'Lock the mouse for free look');
    }
    document.body.dataset.lock = locked ? 'on' : 'off';
  }

  function toggleLock() {
    if (!game || game.state !== 'play') { lastX = null; return; }
    const req = function () {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (e) { /* a browser without pointer lock keeps the relative path */ }
    };
    if (pointerLocked()) { try { document.exitPointerLock(); } catch (e) {} return; }
    req();
    // A lock request can be refused once (focus or activation lost); one quiet retry is the difference
    // between "the chip did nothing" and a mouse player who can turn. Harmless if the first one landed.
    setTimeout(function () {
      if (game && game.state === 'play' && !pointerLocked()) req();
    }, 250);
  }

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
    if (!game || game.state !== 'play' || input.device === 'touch' || input.device === 'pad') {
      lastX = e.clientX; lastY = e.clientY; return;
    }
    let dx, dy;
    if (pointerLocked()) {
      dx = e.movementX || 0; dy = e.movementY || 0;      // unbounded: the cursor cannot hit an edge
    } else {
      if (lastX == null) { lastX = e.clientX; lastY = e.clientY; return; }
      dx = e.clientX - lastX; dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    }
    if (Math.abs(dx) > 180 || Math.abs(dy) > 180) return;      // a jump, not a look
    game.lookBy(dx, dy, CFG.mouseSens);
  }, { passive: true });

  /* Edge-turn: the cursor stops at the window edge but the player's intent does not. Resting the
     pointer against a side keeps turning, so a mouse player can turn a full circle either way. */
  function edgeTurn(dt) {
    if (!game || game.state !== 'play' || input.device !== 'keyboard') return;
    if (pointerLocked() || !mouse.seen) return;
    const band = Math.max(26, window.innerWidth * CFG.edgeBand);
    const right = mouse.x > window.innerWidth - band;
    const left = mouse.x < band;
    if (!right && !left) return;
    const depth = right ? (mouse.x - (window.innerWidth - band)) / band : (band - mouse.x) / band;
    const rate = CFG.edgeTurnRate * (0.35 + 0.65 * Math.min(1, depth));
    game.turnBy((left ? 1 : -1) * rate * dt);
  }

  document.addEventListener('pointerlockchange', setLockUI);
  document.addEventListener('pointerlockerror', setLockUI);
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyL' && game && game.state === 'play') toggleLock();
  });
  if (lockBtn) {
    lockBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); toggleLock(); });
    lockBtn.addEventListener('click', function (e) { e.preventDefault(); });
  }
  setLockUI();

  /* ---------- touch look: drag anywhere on the right half ---------- */
  const lookZone = document.getElementById('look-zone');
  let lookId = null, lx = 0, ly = 0;
  lookZone.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || game.state !== 'play') return;
    lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { lookZone.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  lookZone.addEventListener('pointermove', function (e) {
    if (e.pointerId !== lookId) return;
    game.lookBy(e.clientX - lx, e.clientY - ly, CFG.touchLookSens);
    lx = e.clientX; ly = e.clientY;
    e.preventDefault();
  }, { passive: false });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) {
    lookZone.addEventListener(n, function () { lookId = null; });
  });
  input.on('device', function (d) {
    lookZone.style.display = d === 'touch' ? 'block' : 'none';
    lastX = null; lastY = null;
    document.body.dataset.dev = d;
    if (d !== 'keyboard' && pointerLocked()) { try { document.exitPointerLock(); } catch (e) {} }
  });
  document.body.dataset.dev = input.device;
  lookZone.style.display = input.device === 'touch' ? 'block' : 'none';

  /* ---------- audio: the first real gesture opens the context (iOS rule) ---------- */
  ['pointerdown', 'touchstart', 'keydown', 'gamepadconnected'].forEach(function (t) {
    window.addEventListener(t, function () { sfx.unlock(); }, { once: true, capture: true });
  });

  function renderRatio(scale) {
    const dpr = window.devicePixelRatio || 1;
    // MSAA is off (it costs ~2x here); supersample 1.25x on 1x displays instead, which is cheaper.
    return Math.min(dpr, CFG.dprMax) * (dpr < 1.5 ? 1.5 : 1) * scale;
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(renderRatio(quality));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  /* ---------- hook: one honest state, the same start the button calls ---------- */
  input.installHook({
    getState: function () { return game.state; },
    getScore: function () { return game.score; },
    getPlayer: function () { return { x: game.player.x, y: game.player.z }; },
    start: function () { game.startRun(); },
    restart: function () { game.startRun(); },
    fields: {
      wave: function () { return game.wave; },
      hp: function () { return Math.round(game.hp); },
      mag: function () { return game.mag; },
      reserve: function () { return game.reserve; },
      ammo: function () { return game.mag + game.reserve; },
      kills: function () { return game.kills; },
      alive: function () { return game.aliveCount(); },
      waveTotal: function () { return game.waveTotal; },
      reloading: function () { return game.reloading; },
      best: function () { return game.best; },
      yaw: function () { return game.player.yaw; },
      pitch: function () { return game.player.pitch; },
      chain: function () { return Math.round(game.chain * 10) / 10; },
      chainBest: function () { return Math.round(game.chainBest * 10) / 10; },
      dmg: function () { return Math.round(game.dmg * 100) / 100; },
      supplies: function () { return game.supplies.length; },
      supplyKind: function () { const n = game.nearestSupply(); return n ? n.kind : ''; },
      supplyDist: function () { const n = game.nearestSupply(); return n ? Math.round(n.d * 100) / 100 : 0; },
      supplyBearing: function () { return Math.round(game.supplyBearing() * 1000) / 1000; },
      powerDist: function () { const n = game.supplyOf('power'); return n ? Math.round(n.d * 100) / 100 : 0; },
      powerBearing: function () { return Math.round(game.supplyBearingOf('power') * 1000) / 1000; },
      supplyTaken: function () { return game.supplyTaken; },
      spitters: function () { return game.zombies.filter(function (z) { return z.type === 'spitter' && z.state !== 'dying'; }).length; },
      spitAt: function () { return game.spits.length; },
      pierce: function () { return game.chain >= CFG.pierceAt; },
      wardens: function () { return game.zombies.filter(function (z) { return z.type === 'warden' && z.state !== 'dying'; }).length; },
      bestWave: function () { return game.bestWave; },
      behind: function () { return game.threatInfo().behind; },
      near: function () { return game.threatInfo().near; },
      shove: function () { return game.lastShove; },
      airborne: function () { return !game.player.grounded; },
      jumpCd: function () { return Math.round(game.jumpCd * 100) / 100; },
      mouseLock: function () { return pointerLocked(); },
      lockSupported: function () { return typeof document.body.requestPointerLock === 'function'; }
    }
  });

  /* ---------- first screen + loop ---------- */
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  game.state = 'menu';
  ui.showMenu(game);
  window.__healthy = true;

  let last = performance.now();
  let qAcc = 0, qN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const f = input.poll();
    // Never leave the cursor trapped: a lock that outlives play hides the pointer the pause menu needs.
    if (game.state !== 'play' && pointerLocked()) { try { document.exitPointerLock(); } catch (e) {} }
    edgeTurn(dt);
    game.update(dt, f);
    sfx.bedFor(game.state, game.wave, game.hp);
    renderer.render(scene, camera);

    qAcc += dt; qN++;
    if (qN >= 120) {
      const avg = qAcc / qN;
      qAcc = 0; qN = 0;
      if (avg > 0.027 && quality > 0.7) { quality = Math.max(0.7, quality - 0.1); resize(); }
      else if (avg < 0.0155 && quality < 1) { quality = Math.min(1, quality + 0.05); resize(); }
    }
  }
  requestAnimationFrame(frame);

  window.addEventListener('error', function (e) {
    window.__errs = window.__errs || [];
    window.__errs.push(String(e.message));
  });
} catch (err) {
  fail(err && err.stack || err);
}
