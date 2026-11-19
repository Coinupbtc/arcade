// CARBALL — keyboard and touch input. One state object the game loop reads.

export const input = {
  throttle: 0, steer: 0, boost: false, slide: false,
  jumpQueued: false, camQueued: false, pauseQueued: false, startQueued: false, restartQueued: false,
};

const keys = new Set();
let touchBoost = false;

export function consumeJump() { const j = input.jumpQueued; input.jumpQueued = false; return j; }
export function consumeCam() { const c = input.camQueued; input.camQueued = false; return c; }
export function consumePause() { const p = input.pauseQueued; input.pauseQueued = false; return p; }
export function consumeStart() { const s = input.startQueued; input.startQueued = false; return s; }
export function consumeRestart() { const r = input.restartQueued; input.restartQueued = false; return r; }

function refreshKeys() {
  const up = keys.has('KeyW') || keys.has('ArrowUp');
  const down = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  input.throttle = (up ? 1 : 0) + (down ? -1 : 0);
  input.steer = (right ? 1 : 0) + (left ? -1 : 0);
  input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchBoost;
  input.slide = keys.has('ControlLeft') || keys.has('ControlRight');
}

export function bindInput(onFirstGesture) {
  const gesture = () => { if (onFirstGesture) onFirstGesture(); };

  window.addEventListener('keydown', (e) => {
    gesture();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    refreshKeys();
    if (e.code === 'Space') input.jumpQueued = true;
    if (e.code === 'KeyC') input.camQueued = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pauseQueued = true;
    if (e.code === 'Enter') input.startQueued = true;
    if (e.code === 'KeyR') input.restartQueued = true;
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); refreshKeys(); });
  window.addEventListener('blur', () => { keys.clear(); refreshKeys(); input.boost = false; });

  // ── touch joystick ──────────────────────────────────────────────────────
  const stick = document.getElementById('stick');
  const knob = document.getElementById('stick-knob');
  let stickId = null;
  let cx = 0, cy = 0;
  const R = 52;

  function setStick(px, py) {
    let dx = px - cx, dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.steer = Math.max(-1, Math.min(1, dx / R * 1.15));
    input.throttle = Math.max(-1, Math.min(1, -dy / R * 1.15));
  }
  function releaseStick() {
    stickId = null;
    input.steer = 0; input.throttle = 0;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    if (stick) stick.classList.remove('active');
  }
  if (stick) {
    stick.addEventListener('pointerdown', (e) => {
      gesture();
      e.preventDefault();
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      stickId = e.pointerId;
      stick.classList.add('active');
      stick.setPointerCapture(e.pointerId);
      setStick(e.clientX, e.clientY);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      setStick(e.clientX, e.clientY);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      stick.addEventListener(ev, (e) => { if (e.pointerId === stickId) releaseStick(); });
    }
  }

  // ── buttons ─────────────────────────────────────────────────────────────
  function holdButton(id, on, off) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      gesture();
      e.preventDefault();
      el.classList.add('down');
      el.setPointerCapture(e.pointerId);
      on();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(ev, () => { el.classList.remove('down'); if (off) off(); });
    }
  }
  holdButton('btn-boost', () => { touchBoost = true; input.boost = true; }, () => { touchBoost = false; input.boost = false; });
  holdButton('btn-jump', () => { input.jumpQueued = true; }, null);
  holdButton('btn-cam', () => { input.camQueued = true; }, null);

  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
