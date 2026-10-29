/* Grave Lantern — input, loop, wiring. Touch, mouse, keyboard and a standard-mapping gamepad
   all feed the same DOM-free sim through one input vector, so every device plays the same game. */
(function () {
  'use strict';

  var cv = document.getElementById('game');
  var sim = window.GraveSim;
  var R = window.GraveRender;
  var A = window.GraveAudio;

  var state = sim.createState(20261023);
  var stick = { active: false, x: 0, y: 0, dx: 0, dy: 0, id: null };
  var keys = {};
  var dashQueued = false;
  var hoverCard = -1, selCard = 0, levelupT = 0;
  var lastT = performance.now();
  var booted = false;
  var timeScale = 1, hitstop = 0;
  var lastPointer = { x: -999, y: -999 };
  var muted = localStorage.getItem('grave-lantern-muted') === '1';

  // gamepad state: edge-triggered buttons so one press is one action, plus a repeat clock for menus
  var pad = { connected: false, gp: null, prev: [], repeat: 0, nx: 0, ny: 0 };

  function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  }
  var hint = { device: isTouchDevice() ? 'touch' : 'keyboard' };

  state.best = parseInt(localStorage.getItem('grave-lantern-best') || '0', 10) || 0;

  R.init(cv);

  function resize() {
    R.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 60); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  R.load().then(function () {
    booted = true;
    resize();
    if (new URLSearchParams(location.search).get('autostart') === '1') startRun();
  });

  /* ---------- run control ---------- */
  function startRun(skipSeed) {
    if (!skipSeed) state.seed = (Date.now() % 100000) + 7;   // fresh seed per run; the first press is random too
    sim.startRun(state);
    R.reset(state);
    hoverCard = -1; selCard = 0;
    stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0;
    keys = {};
    pausedFrom = 'run';
    lastT = performance.now();
    A.unlock();
    A.startCrypt();
    if (state.mode !== 'run') state.mode = 'run';
  }

  function toMenu() {
    state.mode = 'menu';
    stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0;
    A.stopAllMusic();
  }

  // A pause can happen while the level-up menu is open (choose, then get interrupted). It
  // remembers what it interrupted, so resuming returns to the card choice instead of dropping it.
  var pausedFrom = 'run';
  function pauseGame() {
    if (state.mode === 'run' || state.mode === 'levelup') {
      pausedFrom = state.mode;
      state.mode = 'paused';
      releaseStick();
    }
  }
  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = pausedFrom || 'run';
    if (state.mode !== 'levelup') lastT = performance.now();
  }
  function togglePause() {
    if (state.mode === 'paused') resumeGame();
    else pauseGame();
  }

  function pickCardById(id) {
    if (state.mode !== 'levelup') return;
    if (sim.chooseUpgrade(state, id)) { A.play('coin'); hoverCard = -1; selCard = 0; levelupT = 0; }
  }
  function pickSelectedCard() {
    if (state.mode !== 'levelup' || !state.choices.length) return;
    var c = state.choices[Math.max(0, Math.min(selCard, state.choices.length - 1))];
    if (c) pickCardById(c.id);
  }

  /* ---------- pointer / touch ---------- */
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function releaseStick() {
    stick.active = false; stick.id = null; stick.dx = 0; stick.dy = 0;
  }

  function primaryDown(e) {
    e.preventDefault();
    A.unlock();
    // the hint row follows the device actually being used; a connected pad keeps its own prompts
    if (!pad.connected) hint.device = (e.pointerType === 'mouse') ? 'keyboard' : 'touch';
    var p = pos(e), hit = R.hitTest(p.x, p.y, state);

    if (hit === 'mute') {
      muted = !muted;
      A.setMuted(muted);
      localStorage.setItem('grave-lantern-muted', muted ? '1' : '0');
      return;
    }
    if (state.mode === 'menu') { startRun(); return; }       // tap anywhere to descend
    if (hit === 'start') { startRun(); return; }
    if (hit === 'restart') { startRun(); return; }
    if (hit === 'pause') { pauseGame(); return; }
    if (hit === 'resume') { resumeGame(); return; }
    if (hit === 'abandon') { toMenu(); return; }
    if (hit && hit.indexOf('card:') === 0) { pickCardById(hit.slice(5)); return; }
    if (hit === 'dash') { dashQueued = true; return; }

    if ((state.mode === 'run' || state.mode === 'levelup') && !stick.active) {
      stick.active = true; stick.id = e.pointerId;
      stick.x = p.x; stick.y = p.y; stick.dx = 0; stick.dy = 0;
      stick.tap = true; stick.t0 = performance.now();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (state.mode === 'run' && stick.active) {
      // second finger (or a mouse click while dragging): dash without letting go of the move thumb
      dashQueued = true;
    }
  }

  cv.addEventListener('pointerdown', primaryDown, { passive: false });

  cv.addEventListener('pointermove', function (e) {
    lastPointer = pos(e);
    if (!stick.active || e.pointerId !== stick.id) return;
    e.preventDefault();
    var p = pos(e);
    stick.dx = p.x - stick.x;
    stick.dy = p.y - stick.y;
    if (Math.abs(stick.dx) > 12 || Math.abs(stick.dy) > 12) stick.tap = false;
  }, { passive: false });

  function up(e) {
    if (!stick.active || (e.pointerId != null && e.pointerId !== stick.id)) return;
    // a quick tap that never dragged is a dash: on a mouse it is a click, on a phone a finger tap
    var quick = stick.tap && (performance.now() - stick.t0) < 400;
    releaseStick();
    if (quick && state.mode === 'run') dashQueued = true;
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', up);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  // iOS: pointer events exist since 13, but a raw touchmove still scrolls/zooms the page if it is not cancelled.
  window.addEventListener('touchmove', function (e) {
    if (state.mode === 'run' || stick.active) e.preventDefault();
  }, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- keyboard ---------- */
  var KEYMAP = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1]
  };

  function navCards(step) {
    if (state.mode !== 'levelup' || !state.choices.length) return;
    selCard = (selCard + step + state.choices.length) % state.choices.length;
    hoverCard = selCard;
  }

  window.addEventListener('keydown', function (e) {
    A.unlock();
    hint.device = 'keyboard';

    if (KEYMAP[e.code]) {
      keys[e.code] = true;
      e.preventDefault();
      if (state.mode === 'levelup') navCards(KEYMAP[e.code][0] || KEYMAP[e.code][1]);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.mode === 'menu' || state.mode === 'win' || state.mode === 'lose') startRun();
      else if (state.mode === 'paused') togglePause();
      else if (state.mode === 'levelup') pickSelectedCard();
      else dashQueued = true;
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (state.mode === 'menu' || state.mode === 'win' || state.mode === 'lose') startRun();
      else if (state.mode === 'paused') togglePause();
      else if (state.mode === 'levelup') pickSelectedCard();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (state.mode === 'run' || state.mode === 'paused' || state.mode === 'levelup') togglePause();
      return;
    }
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      if (state.mode === 'levelup') {
        e.preventDefault();
        var i = parseInt(e.code.slice(5), 10) - 1;
        var c = state.choices[i];
        if (c) pickCardById(c.id);
      }
    }
  });
  window.addEventListener('keyup', function (e) {
    if (KEYMAP[e.code]) keys[e.code] = false;
  });

  /* ---------- gamepad (standard mapping) ---------- */
  var GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9,
             LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

  window.addEventListener('gamepadconnected', function (e) {
    pad.connected = true; pad.gp = e.gamepad; pad.prev = [];
    hint.device = 'pad';
  });
  window.addEventListener('gamepaddisconnected', function () {
    pad.connected = false; pad.gp = null; pad.prev = [];
    if (hint.device === 'pad') hint.device = isTouchDevice() ? 'touch' : 'keyboard';
  });

  function padDown(gp, i) {
    var b = gp.buttons[i];
    if (!b) return false;
    return b.pressed || (b.value || 0) > 0.5;
  }

  function pollPad(dt) {
    var list = navigator.getGamepads ? navigator.getGamepads() : null;
    var gp = null;
    if (list) for (var i = 0; i < list.length; i++) if (list[i]) { gp = list[i]; break; }
    if (!gp) { pad.connected = false; pad.nx = 0; pad.ny = 0; return; }
    if (!pad.connected) { pad.connected = true; pad.prev = []; hint.device = 'pad'; }
    pad.gp = gp;

    // axes: left stick, dead zone 0.22, squared response for fine control
    var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    var axl = Math.sqrt(ax * ax + ay * ay);
    if (axl > 1) { ax /= axl; ay /= axl; axl = 1; }
    pad.nx = axl < 0.22 ? 0 : ax * axl;
    pad.ny = axl < 0.22 ? 0 : ay * axl;

    // DPad moves too (digital, full speed)
    var dxp = (padDown(gp, GP.LEFT) ? -1 : 0) + (padDown(gp, GP.RIGHT) ? 1 : 0);
    var dyp = (padDown(gp, GP.UP) ? -1 : 0) + (padDown(gp, GP.DOWN) ? 1 : 0);
    if (dxp || dyp) {
      var dl = Math.sqrt(dxp * dxp + dyp * dyp);
      pad.nx = dxp / dl; pad.ny = dyp / dl;
    }

    var was = pad.prev, now = [];
    for (var b = 0; b < 17; b++) now[b] = padDown(gp, b);
    var hit = function (code) { return now[code] && !was[code]; };

    if (hit(GP.A)) {
      if (state.mode === 'menu' || state.mode === 'win' || state.mode === 'lose') startRun();
      else if (state.mode === 'levelup') pickSelectedCard();
      else if (state.mode === 'paused') togglePause();
      else dashQueued = true;
    }
    if (hit(GP.START)) {
      if (state.mode === 'menu' || state.mode === 'win' || state.mode === 'lose') startRun();
      else togglePause();
    }
    // (togglePause handles run, levelup and paused)
    // B backs out. From the card menu it pauses the run (you cannot skip an upgrade, but you
    // must never be stuck), and from pause it quits to the menu.
    if (hit(GP.B)) {
      if (state.mode === 'paused') toMenu();
      else if (state.mode === 'levelup') pauseGame();
    }
    if (state.mode === 'levelup') {
      pad.repeat -= dt;
      var step = 0;
      if (hit(GP.RIGHT) || hit(GP.DOWN)) step = 1;
      else if (hit(GP.LEFT) || hit(GP.UP)) step = -1;
      else if (pad.repeat <= 0 && (Math.abs(pad.nx) > 0.55 || Math.abs(pad.ny) > 0.55)) {
        step = (pad.nx > 0.55 || pad.ny > 0.55) ? 1 : -1;
        pad.repeat = 0.28;
      }
      if (step) navCards(step);
    }
    pad.prev = now;
  }
  /* ---------- auto-pause (visibilitychange + blur) ---------- */
  function autoPause() {
    pauseGame();
    releaseStick();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) autoPause();
  });
  window.addEventListener('blur', autoPause);
  window.addEventListener('focus', function () { lastT = performance.now(); });

  /* ---------- loop ---------- */
  function drainEvents() {
    var ev = state.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      R.handleEvent(e, state);
      switch (e.type) {
        case 'swing': A.play('swing', 70); break;
        case 'hit': A.play('bonehit', 90); break;
        case 'death': A.play('bonedeath', 120); break;
        case 'spawn': A.play('spawn', 220); break;
        case 'bolt': A.play('bolt', 140); break;
        case 'windup': A.play('spawn', 260); break;
        case 'lunge': A.play('dodge', 150); break;
        case 'dashhit': A.play('bonehit', 90); break;
        case 'bosswind': A.play('bolt', 450); break;
        case 'bosscharge': A.play('dodge', 200); break;
        case 'hurt':
          A.play('hurt', 200);
          if (navigator.vibrate) navigator.vibrate(35);
          break;
        case 'coin': A.play('coin', 70); break;
        case 'potion': A.play('potion', 200); break;
        case 'dash': A.play('dodge', 120); break;
        case 'upgrade': A.play('coin'); break;
        case 'boss': A.startBoss(); break;
        case 'win': A.end(true); saveBest(); break;
        case 'lose': A.end(false); saveBest(); break;
      }
      // A hit-stop on every landing swing froze the whole sim ~2x/s (the "screen jerking" report).
      // Impact reads through shake, hit flash and damage numbers. Boss death keeps its freeze.
      if (e.type === 'death' && e.kind === 'boss') hitstop = 0.12;
    }
    state.events.length = 0;
  }

  function saveBest() {
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem('grave-lantern-best', String(state.best));
    }
  }

  function frame(now) {
    if (state.mode === 'levelup' && (!state.choices || !state.choices.length)) state.mode = 'run';
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    pollPad(dt);

    // one input vector for every device: thumb stick > pad stick/DPad > keys
    var ix = 0, iy = 0;
    // A held direction still walks the knight while the three cards are up. Round 2 tried making
    // keys and the pad menu-only here; a movement probe then stalled whenever a level-up opened
    // mid-step, and on a phone a rooted knight in a wave is dead. Movement wins over menu purity.
    if (stick.active) {
      var mag = Math.sqrt(stick.dx * stick.dx + stick.dy * stick.dy);
      if (mag > 10) {
        var m = Math.min(mag, 62) / 62;
        ix = stick.dx / mag * m;
        iy = stick.dy / mag * m;
      }
    } else if (pad.connected && (pad.nx || pad.ny)) {
      ix = pad.nx; iy = pad.ny;
    } else {
      for (var k in KEYMAP) if (keys[k]) { ix += KEYMAP[k][0]; iy += KEYMAP[k][1]; }
      var kl = Math.sqrt(ix * ix + iy * iy);
      if (kl > 1) { ix /= kl; iy /= kl; }
    }

    var input = { x: ix, y: iy, dash: dashQueued };
    dashQueued = false;

    if (hitstop > 0) { hitstop -= dt; timeScale = 0.35; }
    else timeScale = 1;

    if (state.mode === 'run' || state.mode === 'levelup') sim.update(state, dt * timeScale, input);
    else if (state.mode === 'win' || state.mode === 'lose') sim.update(state, dt, input);

    // level-up: pad / keyboard selection, mouse hover.
    // If the player does nothing for 10 s the highlighted card is taken, so an interrupted
    // run can never sit in the menu forever.
    if (state.mode === 'levelup') {
      levelupT += dt;
      if (levelupT > 4.5) { pickSelectedCard(); }
    } else levelupT = 0;

    if (state.mode === 'levelup') {
      if (selCard > state.choices.length - 1) selCard = 0;
      hoverCard = selCard;
      var hx = lastPointer.x, hy = lastPointer.y;
      var cards = R.uiRects.cards || [];
      if (now - pointerAt < 2500) {
        for (var c = 0; c < cards.length; c++) {
          var cc = cards[c];
          if (hx >= cc.x && hx <= cc.x + cc.w && hy >= cc.y && hy <= cc.y + cc.h) { hoverCard = c; break; }
        }
      }
    }

    drainEvents();
    R.draw(state, { stick: stick, hoverCard: hoverCard, muted: muted, hint: hint, levelupT: levelupT }, dt);

    requestAnimationFrame(frame);
  }

  var pointerAt = -1e9;
  window.addEventListener('pointermove', function (e) {
    lastPointer = pos(e);
    pointerAt = performance.now();
    if (e.pointerType === 'mouse') hint.device = 'keyboard';
  });

  requestAnimationFrame(function (t) { lastT = t; frame(t); });

  /* ---------- proof API ---------- */
  function uiList() {
    var out = [];
    var ur = R.uiRects || {};
    function add(name, r) { if (r && r.w >= 44 && r.h >= 44) out.push({ name: name, x: r.x, y: r.y, w: r.w, h: r.h }); }
    if (state.mode === 'run' || state.mode === 'levelup' || state.mode === 'paused') {
      add('pause', ur.pause);
      add('mute', ur.mute);
      if (ur.dash) add('dash', { x: ur.dash.x, y: ur.dash.y, w: ur.dash.w, h: ur.dash.h });
    }
    if (state.mode === 'menu' || state.mode === 'win' || state.mode === 'lose') add('start', ur.primary);
    if (state.mode === 'paused') {
      (ur.buttons || []).forEach(function (b) { add(b.act, b); });
    }
    return out;
  }

  window.__game = {
    get state() {
      var m = state.mode;
      if (m === 'menu') return 'menu';
      if (m === 'paused') return 'paused';
      if (m === 'win' || m === 'lose') return 'over';
      return 'play';
    },
    get mode() { return state.mode; },
    get player() { return { x: state.player.x, y: state.player.y }; },
    get score() { return state.score; },
    get enemies() { return state.enemies.length; },
    get wave() { return state.wave; },
    get hp() { return state.hp; },
    get dashCd() { return state.player.dashCd; },
    get level() { return state.level; },
    get maxHp() { return state.maxHp; },
    get boss() { return state.boss ? { x: state.boss.x, y: state.boss.y, hp: state.boss.hp } : null; },
    get upgrades() { return state.upgrades; },
    get choices() { return (state.choices || []).map(function (c) { return c.id; }); },
    get hint() { return hint.device; },
    get padConnected() { return pad.connected; },
    get padAxes() { return { x: pad.nx, y: pad.ny, connected: pad.connected }; },
    get input() { return { x: state.input.x, y: state.input.y, stick: stick.active, mode: state.mode }; },
    get ui() { return uiList(); },
    start: startRun,
    restart: startRun,
    pause: togglePause,
    menu: toMenu,
    sim: sim,
    stateObj: state,
    ready: function () { return booted; }
  };
})();

