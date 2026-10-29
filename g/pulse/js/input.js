// One lane-press stream from keyboard, touch/mouse and a standard-mapping gamepad.
//
// This follows the shelf template (arcade-input) and keeps the rules it proved:
// one pause owner, `paused` never reports as `play`, pad edges are consumed once,
// auto-pause on a hidden tab or a blur, audio unlocked inside the first real
// gesture, and device-aware prompts. The verb model is different on purpose:
// arcade-input's move/primary/secondary actions cannot express four lanes held or
// tapped at the same time, which is the whole input of a rhythm game. So this copy
// replaces the verbs with lane edges (press/release) and hands them to the game.

export const LANES = 4;

const KEY_LANE = {
  d: 0, f: 1, j: 2, k: 3,
  arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3,
};

// Standard mapping button indexes. Face buttons and the D-pad both address a lane,
// so a pad-only player never needs a mouse or a second hand.
const PAD_LANE = {
  0: 0,  // A
  1: 1,  // B
  2: 2,  // X
  3: 3,  // Y
  14: 0, // D-pad left
  13: 1, // D-pad down
  12: 2, // D-pad up
  15: 3, // D-pad right
};
const PAD_START = 9;
const PAD_BACK = 8;
const PAD_UP = 12;
const PAD_DOWN = 13;
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

export function createInput(hooks) {
  const surface = hooks.surface;
  let device = detectDevice();
  let padIndex = -1;
  let prevPad = [];
  let prevAxes = [0, 0];

  // ------------------------------------------------------------------ device
  function detectDevice() {
    const touch = navigator.maxTouchPoints > 0;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const phoneUA = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
    if (touch && (coarse || phoneUA)) return 'touch';
    return 'keyboard';
  }

  function setDevice(next, why) {
    if (!next || next === device) return;
    device = next;
    document.body.classList.remove('dev-touch', 'dev-keyboard', 'dev-pad');
    document.body.classList.add('dev-' + device);
    hooks.deviceChanged(device, why);
  }

  document.body.classList.add('dev-' + device);

  // A pad that is already connected (or connects later) switches the prompts.
  function scanPad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p && p.connected) return { pad: p, index: i };
    }
    return null;
  }

  window.addEventListener('gamepadconnected', (e) => {
    padIndex = e.gamepad ? e.gamepad.index : 0;
    prevPad = [];
    // Do not take the prompts over on plug-in: a pad that is merely connected must
    // not relabel a phone's lanes A B X Y. The first real button press does that.
  });
  window.addEventListener('gamepaddisconnected', () => {
    padIndex = -1;
    prevPad = [];
    setDevice(detectDevice(), 'pad-disconnected');
  });

  // ------------------------------------------------------------------ keyboard
  window.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    if (e.repeat) return;
    setDevice('keyboard', 'key');
    hooks.audioUnlock();

    if (key === 'escape' || key === 'p') {
      e.preventDefault();
      hooks.pauseToggle();
      return;
    }
    const mode = hooks.getMode();
    if (mode === 'menu' || mode === 'results' || mode === 'paused') {
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        hooks.menuConfirm();
        return;
      }
      if (key === 'arrowup' || key === 'w') { e.preventDefault(); hooks.menuMove(-1); return; }
      if (key === 'arrowdown' || key === 's') { e.preventDefault(); hooks.menuMove(1); return; }
      // Left/right adjusts the focused setting (SPEED, OFFSET) and otherwise walks
      // the focus. Without this, a keyboard-only player could never change either.
      if (key === 'arrowleft' || key === 'a') { e.preventDefault(); hooks.menuLeft(); return; }
      if (key === 'arrowright' || key === 'd') { e.preventDefault(); hooks.menuRight(); return; }
    }
    const lane = KEY_LANE[key];
    if (lane === undefined) return;
    e.preventDefault();
    if (mode !== 'play') return;
    hooks.laneDown(lane, 'key');
  });

  window.addEventListener('keyup', (e) => {
    const lane = KEY_LANE[(e.key || '').toLowerCase()];
    if (lane === undefined) return;
    hooks.laneUp(lane, 'key');
  });

  // ------------------------------------------------------------------ pointer
  function laneAt(clientX) {
    const r = surface.getBoundingClientRect();
    const x = clientX - r.left;
    return Math.max(0, Math.min(LANES - 1, Math.floor((x / r.width) * LANES)));
  }

  const pointerLane = new Map();

  surface.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hooks.audioUnlock();
    setDevice(e.pointerType === 'touch' ? 'touch' : (device === 'pad' ? 'pad' : 'keyboard'), 'pointer');
    if (hooks.getMode() !== 'play') return;
    const lane = laneAt(e.clientX);
    pointerLane.set(e.pointerId, lane);
    try { surface.setPointerCapture(e.pointerId); } catch (_) { /* not capturable */ }
    hooks.laneDown(lane, 'p' + e.pointerId);
  }, { passive: false });

  function endPointer(e) {
    const lane = pointerLane.get(e.pointerId);
    if (lane === undefined) return;
    pointerLane.delete(e.pointerId);
    hooks.laneUp(lane, 'p' + e.pointerId);
  }
  surface.addEventListener('pointerup', endPointer);
  surface.addEventListener('pointercancel', endPointer);

  // No scroll, no zoom, no long-press menu while playing.
  const block = (e) => { if (e.cancelable) e.preventDefault(); };
  surface.addEventListener('touchmove', block, { passive: false });
  surface.addEventListener('gesturestart', block, { passive: false });
  surface.addEventListener('contextmenu', block);

  // ------------------------------------------------------------------ gamepad
  // Poll on a timer, not on requestAnimationFrame: a frame can be dropped to
  // 15 fps on a loaded machine, and then a 60 ms button release falls between two
  // frames and the press is never seen as a new edge. A 10 ms timer samples the
  // release every time, and lane latency stays at or under one frame.
  let padTimer = 0;
  function pollPad() {
    const found = scanPad();
    if (!found) { prevPad = []; return; }
    if (padIndex !== found.index) { padIndex = found.index; prevPad = []; setDevice('pad', 'pad-first-frame'); }
    const pad = found.pad;
    const mode = hooks.getMode();
    const buttons = pad.buttons || [];
    const down = (i) => !!(buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5));

    const edge = (i) => down(i) && !prevPad[i];

    // The first press is what makes this a pad session (prompts and lane labels).
    if (buttons.some((b, i) => b && (b.pressed || b.value > 0.5) && !prevPad[i])) {
      setDevice('pad', 'pad-press');
    }

    // Start is one job per press: pause in play, resume when paused, and start the
    // chosen track at the menu (the shelf promises Start does that).
    if (edge(PAD_START)) {
      hooks.audioUnlock();
      if (mode === 'menu') hooks.menuConfirm();
      else hooks.pauseToggle();
    }
    if (edge(PAD_BACK)) hooks.menuBack();

    if (mode === 'menu' || mode === 'results' || mode === 'paused') {
      // B is the second lane in play, so it is free to mean "back" on every menu:
      // pause -> track list, results -> track list, menu -> nothing left to leave.
      if (edge(1)) hooks.menuBack();
      if (edge(PAD_UP)) hooks.menuMove(-1);
      if (edge(PAD_DOWN)) hooks.menuMove(1);
      if (edge(0)) hooks.menuConfirm();          // A confirms the highlighted item
      if (edge(PAD_LEFT)) hooks.menuLeft();      // ◀ on a setting changes it, else walks focus
      if (edge(PAD_RIGHT)) hooks.menuRight();
      const ay = pad.axes[1] || 0;
      if (ay > 0.55 && prevAxes[1] <= 0.55) hooks.menuMove(1);
      if (ay < -0.55 && prevAxes[1] >= -0.55) hooks.menuMove(-1);
      const ax = pad.axes[0] || 0;
      if (ax > 0.55 && prevAxes[0] <= 0.55) hooks.menuRight();
      if (ax < -0.55 && prevAxes[0] >= -0.55) hooks.menuLeft();
    } else if (mode === 'play') {
      for (const idx of Object.keys(PAD_LANE)) {
        const i = Number(idx);
        const lane = PAD_LANE[i];
        const on = down(i);
        if (on && !prevPad[i]) hooks.laneDown(lane, 'pad' + i);
        if (!on && prevPad[i]) hooks.laneUp(lane, 'pad' + i);
      }
    }

    prevPad = buttons.map((b) => !!(b && (b.pressed || b.value > 0.5)));
    prevAxes = [(pad.axes[0] || 0), (pad.axes[1] || 0)];
  }
  padTimer = setInterval(pollPad, 10);

  // ------------------------------------------------------------------ auto-pause
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hooks.autoPause('hidden');
  });
  window.addEventListener('blur', () => hooks.autoPause('blur'));

  // iOS also fires pagehide; a pause is cheaper than a lost run.
  window.addEventListener('pagehide', () => hooks.autoPause('pagehide'));

  // ------------------------------------------------------------------ refit
  let refitTimer = 0;
  function refitSoon() {
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => hooks.refit(), 60);
  }
  window.addEventListener('resize', refitSoon);
  window.addEventListener('orientationchange', () => setTimeout(refitSoon, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refitSoon);

  return {
    get device() { return device; },
    setDevice,
    laneAt,
    stop() { clearInterval(padTimer); },
  };
}
