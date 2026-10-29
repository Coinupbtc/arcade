// Input: keyboard, mouse aim, touch (floating stick + three thumb buttons), Xbox pad.
// read() once per frame turns all of it into one shape. Holding an action keeps it firing.
BT.Input = {
  keys: {}, edges: {}, held: { attack: false, dash: false, spin: false },
  stick: { x: 0, y: 0, id: null, mag: 0 },
  padPrev: [], touchUsed: false, padOn: false,
  mouse: { x: 0, y: 0, active: false },
  mode: "auto",            // mouse | pad | touch — the device that last aimed. Keyboard+mouse stay one mode.

  init() {
    const map = { KeyJ: "attack", Space: "attack", KeyK: "dash", ShiftLeft: "dash", ShiftRight: "dash",
                  KeyL: "spin", KeyE: "spin", KeyP: "pause", Escape: "pause" };
    const noScroll = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

    addEventListener("keydown", (ev) => {
      if (ev.repeat) return;
      this.keys[ev.code] = true;
      const act = map[ev.code];
      if (act) { this.edges[act] = true; this.held[act] = true; }
      if (noScroll[ev.code]) ev.preventDefault();
      if (BT.UI && BT.UI.keyMenu) BT.UI.keyMenu(ev);
    });
    addEventListener("keyup", (ev) => {
      this.keys[ev.code] = false;
      const act = map[ev.code];
      if (act) this.held[act] = false;
    });
    addEventListener("blur", () => { this.keys = {}; this.held = { attack: false, dash: false, spin: false }; });

    // ---- mouse / pen: the hero faces the cursor, left button chops (hold to keep chopping)
    addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "touch") return;
      this.mouse.x = ev.clientX; this.mouse.y = ev.clientY; this.mouse.active = true; this.mode = "mouse";
    }, { passive: true });
    addEventListener("pointerdown", (ev) => {
      if (ev.pointerType === "touch") { this.touchUsed = true; this.mode = "touch"; document.body.classList.add("touch"); return; }
      const t = ev.target;
      if (t && t.closest && t.closest("button, .panel, #loading")) return;   // UI clicks are not chops
      this.mouse.x = ev.clientX; this.mouse.y = ev.clientY; this.mouse.active = true; this.mode = "mouse";
      if (ev.button === 0 && BT.State.status === "playing") { this.edges.attack = true; this.held.attack = true; }
    });
    addEventListener("pointerup", (ev) => { if (ev.pointerType !== "touch" && ev.button === 0) this.held.attack = false; });
    addEventListener("pointercancel", () => { this.held.attack = false; });

    // ---- touch: floating stick on the left, three action buttons on the right
    const zone = document.getElementById("stickzone"), pad = document.getElementById("stickpad"), nub = document.getElementById("sticknub");
    const R = 62;
    zone.addEventListener("pointerdown", (ev) => {
      if (this.stick.id !== null) return;
      this.touchUsed = true; document.body.classList.add("touch"); this.mode = "touch";
      this.stick.id = ev.pointerId; this.stick.ox = ev.clientX; this.stick.oy = ev.clientY;
      pad.style.left = ev.clientX + "px"; pad.style.top = ev.clientY + "px";
      pad.classList.add("on"); nub.style.transform = "translate(-50%,-50%)";
      zone.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    zone.addEventListener("pointermove", (ev) => {
      if (ev.pointerId !== this.stick.id) return;
      let dx = ev.clientX - this.stick.ox, dy = ev.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy), m = d > R ? R / d : 1;
      dx *= m; dy *= m;
      this.stick.mag = Math.min(1, d / R);
      this.stick.x = dx / R; this.stick.y = dy / R;    // dead zone applied in read()
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      ev.preventDefault();
    });
    const endStick = (ev) => {
      if (ev.pointerId !== this.stick.id) return;
      this.stick = { x: 0, y: 0, id: null, mag: 0 };
      pad.classList.remove("on");
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => zone.addEventListener(n, endStick));

    document.querySelectorAll("[data-act]").forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        this.touchUsed = true; document.body.classList.add("touch"); this.mode = "touch";
        this.edges[act] = true; this.held[act] = true; b.classList.add("down");
        try { b.setPointerCapture(ev.pointerId); } catch (e) {}
        if (navigator.vibrate) navigator.vibrate(8);
      });
      const up = () => { b.classList.remove("down"); this.held[act] = false; };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => b.addEventListener(n, up));
    });

    // ---- pad: show pad prompts the moment one connects
    addEventListener("gamepadconnected", () => { document.body.classList.add("pad"); this.padOn = true; });
    addEventListener("gamepaddisconnected", () => {
      const any = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some((x) => x && x.connected);
      document.body.classList.toggle("pad", any); this.padOn = any;
    });
  },

  // standard mapping: left stick / D-pad move · A chop · B dash · X / Y / RB spin · Start pause
  rumble(ms = 120, strong = 0.5, weak = 0.3) {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = Array.from(pads || []).find((x) => x && x.connected && x.vibrationActuator);
      if (p) p.vibrationActuator.playEffect("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch (e) { /* no haptics: not an error */ }
  },

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = Array.from(pads || []).find((x) => x && x.connected);
    const out = { x: 0, y: 0, press: {}, down: {}, on: !!p };
    if (this.padOn !== !!p) { this.padOn = !!p; document.body.classList.toggle("pad", !!p); }
    if (!p) return out;
    const dz = 0.18, ax = p.axes[0] || 0, ay = p.axes[1] || 0, m = Math.hypot(ax, ay);
    if (m > dz) { const k = Math.min(1, (m - dz) / 0.72) / m; out.x = ax * k; out.y = ay * k; }
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    if (b(12)) out.y = -1; if (b(13)) out.y = 1; if (b(14)) out.x = -1; if (b(15)) out.x = 1;
    [0, 1, 2, 3, 4, 5, 9, 12, 13, 14, 15].forEach((i) => {
      const on = b(i);
      if (on && !this.padPrev[i]) out.press[i] = true;
      out.down[i] = on; this.padPrev[i] = on;
    });
    if (out.x || out.y || Object.values(out.down).some(Boolean)) this.mode = "pad";
    return out;
  },

  // world-space aim from the hero to the cursor (desktop / pen). null on touch, pad, or too close.
  // wx/wy are the cursor in world px: the reticle sits there, not at the hero.
  aimDir(scene, h) {
    if (!this.mouse.active || this.mode !== "mouse") return null;
    const cam = scene.cameras.main;
    let wp;
    try { wp = cam.getWorldPoint(this.mouse.x, this.mouse.y); }
    catch (e) { wp = { x: cam.scrollX + this.mouse.x / cam.zoom, y: cam.scrollY + this.mouse.y / cam.zoom }; }
    const dx = wp.x - h.x, dy = wp.y - h.y, d = Math.hypot(dx, dy);
    if (d < 26) return null;
    return { x: dx / d, y: dy / d, dir: BT.dirOf(dx, dy), wx: wp.x, wy: wp.y };
  },

  read() {
    const k = this.keys, e = this.edges, p = this.pad(), pr = p.press, pd = p.down;
    let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    if (this.stick.id !== null && this.stick.mag > 0.14) { mx = this.stick.x; my = this.stick.y; }
    if (p.x || p.y) { mx = p.x; my = p.y; }
    const out = {
      mx, my,
      attack: e.attack || this.held.attack || pr[0] || pd[0],
      dash: e.dash || this.held.dash || pr[1] || pd[1],
      spin: e.spin || this.held.spin || pr[2] || pr[3] || pr[4] || pr[5] || pd[2] || pd[3] || pd[5],
      pause: e.pause || pr[9],
      pad: p.on, padPress: pr
    };
    if (BT.State.status !== "playing" && BT.UI && BT.UI.padMenu) {
      BT.UI.padMenu(pr, p);
      // a Start press that began the run must not also pause it on this frame
      if (BT.State.status === "playing") { out.pause = false; out.attack = out.dash = out.spin = false; }
    }
    this.edges = {};
    return out;
  }
};
