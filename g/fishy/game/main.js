/* FISHY — main: input layer wiring, menu focus, frame loop, honest window.__game hook. */

"use strict";

var frameInput = null;
var menuFocus = 0;
var startGuard = 0;
var navDir = 0, navNext = 0;

var input = ArcadeInput.create({
  surface: "#c",
  actions: [],
  bindings: {
    primary: { keys: ["Space", "Enter"], pad: ["A"], mouse: ["left"], touch: "button" },
    secondary: { keys: ["ShiftLeft", "ShiftRight", "KeyK"], pad: ["X"], mouse: ["right"], touch: false },
    pause: { keys: ["Escape", "KeyP"], pad: ["START"], mouse: [], touch: "button" }
  },
  labels: { primary: "BURST" },
  touchButtons: ["primary"],
  promptBase: "prompts/",
  stick: "float",          // a thumb anywhere in the pond is the stick: drag to swim
  dragMove: true,          // desktop drag = swim toward the drag, same vector as the stick
  isRunning: function () { return state === "play" && !input.pause.paused; },
  onPause: function () { /* the overlay is drawn in render.js; the pond freezes in update() */ },
  onResume: function () { startGuard = 6; },
  onRefit: function () { resizeView(); },
  audio: true
});

input.audio.attach(function () { return ensureAudioCtx(); },
                   function () { startAmbient(); startMusic(); });

/* ---------- menu taps: a tap anywhere dives in; a tap on a row picks that row ---------- */
function onTap(ev) {
  var t = ev.target;
  if (t && t.closest && t.closest("#arcade-ui, [data-arcade-ui], a, button, input, select")) return;
  if (state === "menu") {
    var rows = MENU_ROWS.length ? MENU_ROWS : menuLayout();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (ev.clientX >= r.x && ev.clientX <= r.x + r.w && ev.clientY >= r.y && ev.clientY <= r.y + r.h) {
        menuFocus = i;
        startRun(r.id);
        startGuard = 12;
        return;
      }
    }
    startRun(rows[clamp(menuFocus, 0, rows.length - 1)].id);
    startGuard = 12;
    return;
  }
  if (state === "over") { startRun(mode); startGuard = 12; }
}
document.addEventListener("pointerdown", onTap, true);

/* ---------- menu focus with keys and the pad (only when a second row exists) ---------- */
function handleMenu(f) {
  var rows = MENU_ROWS.length ? MENU_ROWS : menuLayout();
  if (rows.length > 1) {
    var v = f.move.y;
    var now = performance.now();
    if (Math.abs(v) > 0.6) {
      var d = v > 0 ? 1 : -1;
      if (d !== navDir) { navDir = d; navNext = now + 340; menuFocus = clamp(menuFocus + d, 0, rows.length - 1); }
      else if (now > navNext) { navNext = now + 170; menuFocus = clamp(menuFocus + d, 0, rows.length - 1); }
    } else navDir = 0;
  } else { menuFocus = 0; }
  if (f.pressed.confirm || f.pressed.primary) {
    startRun(rows[clamp(menuFocus, 0, rows.length - 1)].id);
    startGuard = 12;
    return true;
  }
  if (f.pressed.back && rows.length > 1) menuFocus = 0;
  return false;
}

/* ---------- burst button feedback (DOM button owned by the input layer) ---------- */
var burstBtn = null, burstReadyShown = null;
function updateBurstButton() {
  if (!burstBtn) burstBtn = document.querySelector('#arcade-ui .ai-act[data-act="primary"]');
  if (!burstBtn) return;
  var ready = player.burstCD <= 0;
  if (ready !== burstReadyShown) {
    burstReadyShown = ready;
    burstBtn.style.opacity = ready ? "1" : "0.42";
    burstBtn.setAttribute("aria-label", ready ? "Burst ready" : "Burst recharging");
  }
}

/* ---------- loop ---------- */
function frame() {
  var f = input.poll();
  frameInput = f;
  var dt = f.dt || 0.016;

  if (state === "menu") {
    handleMenu(f);
  } else if (state === "play") {
    if (startGuard > 0) startGuard--;
    if (f.pressed.primary && startGuard <= 0) tryBurst();
  } else if (state === "over") {
    if (f.pressed.primary || f.pressed.confirm) { startRun(mode); startGuard = 12; }
    else if (f.pressed.back) { state = "menu"; menuFocus = 0; }
  }

  update(dt);
  draw();
  updateBurstButton();
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
loadIcons();
resizeView();
readSafeArea();
reset("pond", true);
input.pause.reset();

input.installHook({
  getState: function () { return state; },                 // menu | play | over
  getScore: function () { return Math.round(score); },
  getPlayer: function () { return { x: player.x, y: player.y, tier: player.tier, len: plen() }; },
  start: function () { startRun(mode === "deep" ? "deep" : "pond"); },
  restart: function () { startRun(mode); },
  pause: function () { input.pause.pause("input"); },
  resume: function () { input.pause.resume(); },
  ui: function () {
    if (state === "menu") {
      return MENU_ROWS.map(function (r) {
        return { name: r.label, x: r.x, y: r.y, w: r.w, h: r.h };
      });
    }
    return [];
  },
  fields: {
    tick: function () { return T; },
    speed: function () { return Math.hypot(player.vx, player.vy); },
    move: function () { return frameInput ? { x: frameInput.move.x, y: frameInput.move.y, device: frameInput.device } : null; },
    stick: function () { return { active: input.stick.active, x: input.stick.x, y: input.stick.y,
                                  mag: input.stick.mag, ox: input.stick.ox, oy: input.stick.oy, id: input.stick.id }; },
    tier: function () { return player.tier; },
    growth: function () { return clamp((player.tier - 1) / (targetTier - 1), 0, 1); },
    lives: function () { return lives; },
    stage: function () { return stage; },
    wave: function () { return waveNo; },
    pond: function () { return mode; },
    hunger: function () { return hunger; },
    target: function () { return targetTier; },
    burst: function () { return player.burstCD <= 0; },
    burstCd: function () { return player.burstCD; },
    invuln: function () { return blinkT > 0; },
    won: function () { return won; },
    newBest: function () { return newBest; },
    lastDeath: function () { return lastDeath; },
    cleared: function () { return clearedPond; },
    deepCleared: function () { return deepCleared; },
    fishCount: function () { return fishes.length; },
    edible: function () { return countEdible(); },
    threat: function () { return fishes.length - countEdible(); },
    time: function () { return runFrames / 60; },
    fishList: function () {
      return fishes.map(function (f) {
        return { x: f.x, y: f.y, len: fishLen(f.tier), tier: f.tier,
                 edible: isFood(f), hunter: !!f.homing, dir: f.dir };
      });
    }
  }
});

requestAnimationFrame(frame);
