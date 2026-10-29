/*!
 * arcade-input.js 1.0.0 — the shared input layer for every game on the arcade shelf.
 * Plain <script> sets window.ArcadeInput. Module: `import './arcade-input.js'; const A = window.ArcadeInput`
 * (or `import ArcadeInput from './arcade-input.mjs'`). No dependencies, no build step.
 *
 *   var input = ArcadeInput.create({ surface: '#game', isRunning: fn, onPause: fn, onResume: fn });
 *   function frame() { var f = input.poll(); ... }
 *
 * The decisions behind this file (bugs it prevents, what it does not do) are in README.md and NOTES.md.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.ArcadeInput = api;
  else if (typeof globalThis !== "undefined") globalThis.ArcadeInput = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var doc = root ? root.document : null;

  // Standard-mapping gamepad button indexes. LS/RS are sticks, not buttons.
  var PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9,
              LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

  var BASE_ACTIONS = ["move", "primary", "secondary", "pause", "confirm", "back"];

  // Device -> action. A game only adds the actions it needs; these six are always present.
  var DEFAULT_BINDINGS = {
    move:      { keys: ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"],
                 pad: ["LS", "DPAD"], touch: "stick", mouse: [] },
    primary:   { keys: ["Space", "Enter"], pad: ["A"], mouse: ["left"], touch: "button" },
    secondary: { keys: ["ShiftLeft", "ShiftRight", "KeyK"], pad: ["X"], mouse: ["right"], touch: "button" },
    pause:     { keys: ["Escape", "KeyP"], pad: ["START"], mouse: [], touch: "button" },
    confirm:   { keys: ["Enter", "Space"], pad: ["A"], mouse: [], touch: "button" },
    back:      { keys: ["Escape"], pad: ["B"], mouse: [], touch: "button" }
  };

  var KEY_ALIAS = { esc: "Escape", escape: "Escape", space: "Space", enter: "Enter", tab: "Tab",
                    shift: "ShiftLeft", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

  // One icon per action per device. Copied from Kenney input-prompts (CC0) into ./prompts/.
  var PROMPTS = {
    keyboard: { move: "keyboard_arrows.png", primary: "keyboard_space.png", secondary: "keyboard_shift.png",
                pause: "keyboard_escape.png", confirm: "keyboard_enter.png", back: "keyboard_escape.png",
                aim: "mouse_move.png" },
    pad:      { move: "xbox_stick_l.png", primary: "xbox_button_a.png", secondary: "xbox_button_x.png",
                pause: "xbox_button_start.png", confirm: "xbox_button_a.png", back: "xbox_button_b.png" },
    touch:    { move: "touch_hand_open.png", primary: "touch_tap.png", secondary: "touch_tap.png",
                pause: "touch_tap.png", confirm: "touch_tap.png", back: "touch_tap.png" }
  };

  // ---------------------------------------------------------------- helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function nowMs() { return root && root.performance && root.performance.now ? root.performance.now() : Date.now(); }
  function el(x) { return x ? (typeof x === "string" ? doc.querySelector(x) : x) : null; }
  function on(t, type, fn, o) { if (t && t.addEventListener) t.addEventListener(type, fn, o); return function () { if (t) t.removeEventListener(type, fn, o); }; }
  function normKey(k) { var s = String(k); return KEY_ALIAS[s.toLowerCase()] || s; }
  function normPad(p) { var s = String(p).toUpperCase(); return PAD[s] !== undefined ? s : null; }
  function deadzone(x, y, dz) {
    var m = Math.sqrt(x * x + y * y);
    if (m <= dz) return { x: 0, y: 0 };
    var k = Math.min(1, (m - dz) / (1 - dz)) / m;      // rescale so the edge of the zone is 0 and full tilt is 1
    return { x: x * k, y: y * k };
  }

  // Raw game state -> the hook's four words. Honest by construction: pause wins over anything else.
  function mapState(raw, paused) {
    var s = String(raw || "");
    if (s === "menu") return "menu";
    if (s === "paused") return "paused";
    if (s === "over" || s === "win" || s === "lose" || s === "dead" || s === "gameover") return "over";
    if (paused) return "paused";                      // a live mode that is paused is NOT "play" (Grave Lantern bug)
    return "play";
  }

  function buildBindings(actions, overrides) {
    var out = {};
    BASE_ACTIONS.concat(actions || []).forEach(function (a) {
      var d = DEFAULT_BINDINGS[a] || {};
      out[a] = { keys: (d.keys || []).slice(), mouse: (d.mouse || []).slice(), pad: (d.pad || []).slice(),
                 touch: d.touch || false };
    });
    Object.keys(overrides || {}).forEach(function (a) {
      var o = overrides[a] || {};
      if (!out[a]) out[a] = { keys: [], mouse: [], pad: [], touch: false };
      if (o.keys) out[a].keys = o.keys.map(normKey);
      if (o.pad) out[a].pad = o.pad.map(normPad).filter(Boolean);
      if (o.mouse) out[a].mouse = o.mouse.slice();
      if (o.touch !== undefined) out[a].touch = o.touch;
    });
    return out;
  }

  var STYLE_ID = "arcade-input-style";
  var CSS = [
    "#arcade-ui{position:fixed;inset:0;z-index:40;pointer-events:none;touch-action:none;",
    "-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}",
    "#arcade-ui .ai-act{position:fixed;display:none;align-items:center;justify-content:center;border:0;",
    "border-radius:50%;background:radial-gradient(#3b3444,#15121c 72%);color:#f4ead6;",
    "box-shadow:0 0 0 3px rgba(244,234,214,.45),0 6px 14px rgba(0,0,0,.6);pointer-events:auto;",
    "touch-action:none;font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-align:center}",
    "#arcade-ui .ai-act.on{transform:scale(.94);background:radial-gradient(#6a5546,#241a14 72%)}",
    "#arcade-ui .ai-pause{position:fixed;display:none;align-items:center;justify-content:center;",
    "border:0;border-radius:12px;background:rgba(6,8,14,.55);color:#f4ead6;font:700 22px/1 system-ui,sans-serif;",
    "pointer-events:auto;touch-action:none;box-shadow:0 0 0 2px rgba(244,234,214,.35)}",
    "#arcade-ui .ai-stick{position:fixed;display:none;width:128px;height:128px;border-radius:50%;",
    "background:radial-gradient(rgba(30,26,38,.55),rgba(12,10,16,.35));",
    "box-shadow:0 0 0 2px rgba(244,234,214,.28);transform:translate(-50%,-50%);pointer-events:none}",
    "#arcade-ui .ai-nub{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;",
    "background:radial-gradient(#e9dcc2,#8d7f6a 75%);transform:translate(-50%,-50%);opacity:.85}",
    "#arcade-ui .ai-zone{position:fixed;display:none;left:0;bottom:0;height:78%;width:52%;",
    "pointer-events:auto;touch-action:none}",
    "[data-menu].ai-focus{outline:3px solid #ffd166;outline-offset:2px;box-shadow:0 0 18px rgba(255,209,102,.45)}"
  ].join("");

  function injectStyle() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  // ---------------------------------------------------------------- Input
  function Input(opts) {
    opts = opts || {};
    this.opts = opts;
    this.actions = BASE_ACTIONS.concat(opts.actions || []);
    this.bindings = buildBindings(opts.actions || [], opts.bindings || {});
    this.labels = opts.labels || {};
    this.surface = el(opts.surface) || (doc && doc.body) || doc;

    this.keys = {};            // physical key state by KeyboardEvent.code
    this._keyEdge = {};        // codes pressed since the last poll
    this._mouseHeld = {}; this._mouseEdge = {};
    this._touchHeld = {}; this._touchEdge = {};
    this._prevHeld = {};

    this.pointer = { x: 0, y: 0, active: false };   // surface CSS px
    this.mouseDrag = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.stick = { active: false, id: null, x: 0, y: 0, mag: 0, ox: 0, oy: 0 };
    this.stickMode = opts.stick === undefined ? "float" : opts.stick;   // float | fixed | drag | false
    this.padPrev = {}; this.padOn = false; this._padAnyDown = false;
    this.padIndex = null;

    this.device = "keyboard";     // keyboard+mouse | touch | pad
    this.aimMode = "auto";        // auto | pointer — the stale-cursor fix
    this.touchCapable = !!(root && (("ontouchstart" in root) ||
      (root.matchMedia && root.matchMedia("(pointer: coarse)").matches)));
    this._rect = { left: 0, top: 0, width: 0, height: 0 };
    this._off = [];
    this._t0 = 0;
    this._listeners = {};
    this._ui = null;

    this.pause = new Pause(this);
    this.audio = new AudioKit(this);
    this._menu = null;

    injectStyle();
    this._bindKeys();
    this._bindPointer();
    this._buildUI();
    this._bindPad();
    this._bindPauseTriggers();
    this._bindGesture();
    this._bindResize();
    this.refit();
  }

  Input.prototype.on = function (name, fn) {
    (this._listeners[name] || (this._listeners[name] = [])).push(fn);
    var self = this;
    return function () {
      var a = self._listeners[name] || [];
      var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    };
  };

  Input.prototype._emit = function (name, value) {
    (this._listeners[name] || []).slice().forEach(function (fn) {
      try { fn(value); } catch (e) { if (root.console) root.console.error("[arcade-input] " + name, e); }
    });
  };

  Input.prototype._bindResize = function () {
    var self = this, timer = 0;
    var kick = function () { clearTimeout(timer); timer = setTimeout(function () { self.refit(); }, 40); };
    this._off.push(on(root, "resize", kick));
    this._off.push(on(root, "orientationchange", function () { setTimeout(function () { self.refit(); }, 90); }));
    if (root.visualViewport) this._off.push(on(root.visualViewport, "resize", kick));
    if (root.ResizeObserver && this.surface && this.surface.nodeType === 1) {
      try {
        var ro = new root.ResizeObserver(function () { self.refit(); });
        ro.observe(this.surface);
        this._off.push(function () { ro.disconnect(); });
      } catch (e) { /* older browsers: window resize covers it */ }
    }
  };

  Input.prototype.refit = function () {
    var r = this.surface && this.surface.getBoundingClientRect ? this.surface.getBoundingClientRect() : null;
    if (!r || !r.width || !r.height) {
      var w = root.innerWidth || 1, h = root.innerHeight || 1;
      r = { left: 0, top: 0, width: w, height: h };
    }
    this._rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    if (this.opts.onRefit) { try { this.opts.onRefit(this._rect); } catch (e) {} }
    this._emit("refit", this._rect);
    return this._rect;
  };

  Input.prototype.surfaceSize = function () { return { w: this._rect.width, h: this._rect.height }; };

  Input.prototype.destroy = function () {
    this._off.forEach(function (f) { try { f(); } catch (e) {} });
    this._off = [];
    if (this._ui && this._ui.root && this._ui.root.parentNode) this._ui.root.parentNode.removeChild(this._ui.root);
    this._ui = null;
  };

  // ---------------------------------------------------------------- keyboard + mouse (one hybrid device)
  Input.prototype._bindKeys = function () {
    var self = this;
    this._off.push(on(root, "keydown", function (ev) {
      if (ev.repeat) return;
      self.keys[ev.code] = true;
      self._keyEdge[ev.code] = true;
      self._setDevice("keyboard");                    // mouse aim survives walking: aimMode is NOT changed here
      if (self._isScrollKey(ev.code)) ev.preventDefault();
    }));
    this._off.push(on(root, "keyup", function (ev) { self.keys[ev.code] = false; }));
    this._off.push(on(root, "blur", function () { self._clearHeld(); }));
  };

  Input.prototype._isScrollKey = function (code) {
    return code === "Space" || code.indexOf("Arrow") === 0 || code === "Tab";
  };

  Input.prototype._clearHeld = function () {
    this.keys = {};
    this._keyEdge = {};
    this._mouseHeld = {}; this._mouseEdge = {};
    this._touchHeld = {}; this._touchEdge = {};
    this.releaseStick();
    this.mouseDrag.active = false;
  };

  // A UI target (menu button, template button, link) is not a game action.
  function isUI(target) {
    return !!(target && target.closest &&
      target.closest("#arcade-ui, [data-arcade-ui], [data-menu], button, a, input, select"));
  }

  Input.prototype._bindPointer = function () {
    var self = this;

    this._off.push(on(root, "pointermove", function (ev) {
      if (!self.surface) return;
      var r = self.surface === doc ? { left: 0, top: 0 } : self._rect;
      self.pointer.x = ev.clientX - r.left;
      self.pointer.y = ev.clientY - r.top;
      self.pointer.active = true;
      if (ev.pointerType === "touch") {
        self._setDevice("touch");                     // touch aim is auto-aim, never the last cursor
        return;
      }
      self._setDevice("keyboard");
      self.aimMode = "pointer";                       // the mouse moved: pointer aim wins over auto-aim
      if (self.mouseDrag.active) {
        var dx = self.pointer.x - self.mouseDrag.ox, dy = self.pointer.y - self.mouseDrag.oy;
        var m = Math.sqrt(dx * dx + dy * dy);
        var R = self.opts.dragRadius || 90;
        var k = m > R ? R / m : 1;
        self.mouseDrag.x = clamp(dx * k / R, -1, 1);
        self.mouseDrag.y = clamp(dy * k / R, -1, 1);
        self.mouseDrag.mag = Math.min(1, m / R);
      }
    }, { passive: true }));

    this._off.push(on(root, "pointerdown", function (ev) {
      // The device flips on the first finger even when that finger lands on a menu button.
      if (ev.pointerType === "touch") {
        self._setDevice("touch");
        self._audioGesture();
        if (isUI(ev.target)) return;
        var rt0 = self.surface === doc ? { left: 0, top: 0 } : self._rect;
        self.pointer.x = ev.clientX - rt0.left; self.pointer.y = ev.clientY - rt0.top;
        self.pointer.active = true;
        return;
      }
      if (isUI(ev.target)) return;                    // button clicks must not also fire primary
      var r = self.surface === doc ? { left: 0, top: 0 } : self._rect;
      self.pointer.x = ev.clientX - r.left;
      self.pointer.y = ev.clientY - r.top;
      self.pointer.active = true;
      if (ev.pointerType === "touch") { self._setDevice("touch"); return; }
      self._setDevice("keyboard");
      self.aimMode = "pointer";
      var btn = ev.button === 2 ? "right" : ev.button === 0 ? "left" : ("b" + ev.button);
      self._setMouse(btn, true);
      if (ev.button === 0 && self.opts.dragMove !== false && !self.stick.active) {
        self.mouseDrag.active = true; self.mouseDrag.ox = self.pointer.x; self.mouseDrag.oy = self.pointer.y;
        self.mouseDrag.x = 0; self.mouseDrag.y = 0;
      }
      self._audioGesture();                           // a mouse press is a real gesture
    }, { passive: false }));

    this._off.push(on(root, "pointerup", function (ev) {
      if (ev.pointerType === "touch") return;
      var btn = ev.button === 2 ? "right" : ev.button === 0 ? "left" : ("b" + ev.button);
      self._setMouse(btn, false);
      if (ev.button === 0) self.mouseDrag.active = false;
    }));
    this._off.push(on(root, "pointercancel", function () { self.mouseDrag.active = false; self._mouseHeld = {}; }));

    // Right-click on the playfield is a game button on desktop; do not open the browser menu over it.
    this._off.push(on(this.surface, "contextmenu", function (ev) { if (!isUI(ev.target)) ev.preventDefault(); }));
    // touchmove must be cancelled or iOS scrolls/zooms the page under the game.
    this._off.push(on(this.surface, "touchmove", function (ev) { ev.preventDefault(); }, { passive: false }));
    this._off.push(on(this.surface, "touchstart", function () { self._audioGesture(); }, { passive: true }));
  };

  Input.prototype._setMouse = function (btn, down) {
    var was = !!this._mouseHeld[btn];
    this._mouseHeld[btn] = down;
    if (down && !was) { this._mouseEdge[btn] = true; this._audioGesture(); }
  };

  // ---------------------------------------------------------------- device value + event
  Input.prototype._setDevice = function (d) {
    if (this.device === d) return;
    this.device = d;
    if (doc && doc.body) {
      doc.body.setAttribute("data-arcade-device", d);
      doc.body.classList.toggle("arcade-touch", d === "touch");
      doc.body.classList.toggle("arcade-pad", d === "pad");
    }
    this._emit("device", d);
    this._updateUI();                                 // prompts and thumb buttons follow the device
  };

  Input.prototype.deviceName = function () { return this.device; };

  // Screen-space aim. Null when the device in use is a pad or a finger: those auto-aim.
  Input.prototype.aimPoint = function () {
    if (this.aimMode !== "pointer" || !this.pointer.active) return null;
    return { x: this.pointer.x, y: this.pointer.y };
  };

  // Map a screen point to the surface's normalised space (-1..1), for 3D unprojection or canvas drawing.
  Input.prototype.aimNormalized = function () {
    var p = this.aimPoint();
    if (!p) return null;
    return { x: (p.x / this._rect.width) * 2 - 1, y: (p.y / this._rect.height) * 2 - 1 };
  };

  // ---------------------------------------------------------------- touch: stick zone + ≥44 px buttons
  Input.prototype._safe = function (side) { return "env(safe-area-inset-" + side + ",0px)"; };

  Input.prototype._buildUI = function () {
    if (!doc || !doc.body) return;
    var wrap = doc.getElementById("arcade-ui");
    if (!wrap) {
      wrap = doc.createElement("div");
      wrap.id = "arcade-ui";
      wrap.setAttribute("data-arcade-ui", "");
      doc.body.appendChild(wrap);
    }
    var ui = { root: wrap, acts: {}, pause: null, zone: null, pad: null, nub: null };
    this._ui = ui;

    // ⏸ / ▶ button: top-right, 48×48, clear of the arcade's ◀ ARCADE pill (top-left 120×52).
    var pb = doc.createElement("button");
    pb.type = "button";
    pb.className = "ai-pause";
    pb.setAttribute("aria-label", "Pause");
    pb.setAttribute("data-arcade-ui", "");
    pb.textContent = "⏸";
    pb.style.width = "48px"; pb.style.height = "48px";
    pb.style.top = "calc(10px + " + this._safe("top") + ")";
    pb.style.right = "calc(10px + " + this._safe("right") + ")";
    var self = this;
    var pbDown = function (ev) { ev.preventDefault(); ev.stopPropagation(); self.pause.toggle(); };
    pb.addEventListener("pointerdown", pbDown);
    pb.addEventListener("click", function (ev) { ev.preventDefault(); });
    wrap.appendChild(pb);
    ui.pause = pb;

    // Action buttons: every action bound to touch as a button, primary biggest.
    var names = this.opts.touchButtons;
    if (!names) {
      names = this.actions.filter(function (a) {
        return a !== "pause" && a !== "back" && a !== "confirm" && self.bindings[a] && self.bindings[a].touch === "button";
      });
    }
    var order = ["primary"].concat(names.filter(function (n) { return n !== "primary"; }));
    var size = { primary: 78, other: 62 };
    order.forEach(function (a, i) {
      if (!self.bindings[a]) return;
      var b = doc.createElement("button");
      b.type = "button";
      b.className = "ai-act";
      b.setAttribute("data-arcade-ui", "");
      b.setAttribute("data-act", a);
      b.setAttribute("aria-label", self.labels[a] || a);
      b.textContent = (self.labels[a] || a).toUpperCase();
      var px = i === 0 ? size.primary : size.other;
      b.style.width = px + "px"; b.style.height = px + "px";
      var right = 18 + (i === 0 ? 0 : 92) + (i > 1 ? 66 * (i - 1) : 0);
      var bottom = 18 + (i === 0 ? 0 : 18 + (i > 1 ? 70 * (i - 1) : 0));
      b.style.right = "calc(" + right + "px + " + self._safe("right") + ")";
      b.style.bottom = "calc(" + bottom + "px + " + self._safe("bottom") + ")";
      b.addEventListener("pointerdown", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        self._touchHeld[a] = true; self._touchEdge[a] = true;
        self._setDevice("touch");
        b.classList.add("on");
        try { b.setPointerCapture(ev.pointerId); } catch (e) {}
        if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(8);
        self._audioGesture();
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (n) {
        b.addEventListener(n, function () { self._touchHeld[a] = false; b.classList.remove("on"); });
      });
      wrap.appendChild(b);
      ui.acts[a] = b;
    });

    // Stick / drag zone. Starts below the 52 px pill band and above the thumb buttons.
    if (this.stickMode) {
      var zone = doc.createElement("div");
      zone.className = "ai-zone";
      zone.setAttribute("data-arcade-ui", "");
      if (this.stickMode === "drag") {
        zone.style.left = "0"; zone.style.bottom = "0"; zone.style.width = "100%"; zone.style.height = "100%";
      } else {
        zone.style.height = "78%";
      }
      wrap.appendChild(zone);
      ui.zone = zone;

      var pad = doc.createElement("div");
      pad.className = "ai-stick";
      var nub = doc.createElement("div");
      nub.className = "ai-nub";
      pad.appendChild(nub);
      wrap.appendChild(pad);
      ui.pad = pad; ui.nub = nub;

      zone.addEventListener("pointerdown", function (ev) {
        if (!self._canStick()) return;
        if (self.stick.active) return;
        ev.preventDefault(); ev.stopPropagation();
        self._setDevice("touch");
        var r = self._rect;
        var px = ev.clientX - r.left, py = ev.clientY - r.top;
        self.stick.id = ev.pointerId;
        if (self.stickMode === "fixed") {
          var pr = pad.getBoundingClientRect();
          self.stick.ox = pr.left + pr.width / 2 - r.left;
          self.stick.oy = pr.top + pr.height / 2 - r.top;
        } else {
          self.stick.ox = px; self.stick.oy = py;
        }
        self.stick.active = true; self.stick.mag = 0; self.stick.x = 0; self.stick.y = 0;
        if (self.stickMode !== "fixed") {
          pad.style.left = px + "px"; pad.style.top = py + "px";
        }
        pad.style.display = "block";
        nub.style.transform = "translate(-50%,-50%)";
        try { zone.setPointerCapture(ev.pointerId); } catch (e) {}
        self._audioGesture();
      });

      zone.addEventListener("pointermove", function (ev) {
        if (!self.stick.active || ev.pointerId !== self.stick.id) return;
        ev.preventDefault();
        var r = self._rect;
        var dx = (ev.clientX - r.left) - self.stick.ox, dy = (ev.clientY - r.top) - self.stick.oy;
        var R = 62, d = Math.sqrt(dx * dx + dy * dy), m = d > R ? R / d : 1;
        dx *= m; dy *= m;
        self.stick.mag = Math.min(1, d / R);
        self.stick.x = dx / R; self.stick.y = dy / R;   // dead zone applied in poll()
        nub.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
      }, { passive: false });

      var end = function (ev) {
        if (!self.stick.active || (ev && ev.pointerId != null && ev.pointerId !== self.stick.id)) return;
        self.releaseStick();
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (n) { zone.addEventListener(n, end); });
    }
  };

  Input.prototype._canStick = function () {
    if (!this.stickMode) return false;
    return !!this.opts.isRunning && this.opts.isRunning();
  };

  Input.prototype.releaseStick = function () {
    this.stick = { active: false, id: null, x: 0, y: 0, mag: 0, ox: 0, oy: 0 };
    if (this._ui && this._ui.pad) this._ui.pad.style.display = "none";
  };

  Input.prototype._updateUI = function (frame) {
    var ui = this._ui;
    if (!ui) return;
    var live = this.opts.isRunning ? !!this.opts.isRunning() : true;
    var touchUI = this.touchCapable && this.device === "touch" && live;
    var showPause = live || this.pause.paused;
    ui.pause.style.display = showPause ? "flex" : "none";
    ui.pause.textContent = this.pause.paused ? "▶" : "⏸";
    ui.pause.setAttribute("aria-label", this.pause.paused ? "Resume" : "Pause");
    Object.keys(ui.acts).forEach(function (a) { ui.acts[a].style.display = touchUI ? "flex" : "none"; });
    if (ui.zone) ui.zone.style.display = touchUI ? "block" : "none";
    if (ui.zone && ui.zone.style.display === "none") this.releaseStick();
    if (frame && !touchUI && this.device !== "touch") this.releaseStick();
  };

  // Rectangles of the template's own controls, for window.__game.ui and the gate's ≥44 px check.
  Input.prototype.ui = function () {
    var ui = this._ui, out = [];
    if (!ui) return out;
    function add(name, node) {
      if (!node || node.style.display === "none") return;
      var r = node.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) out.push({ name: name, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    add("pause", ui.pause);
    Object.keys(ui.acts).forEach(function (a) { add(a, ui.acts[a]); });
    return out;
  };

  // ---------------------------------------------------------------- standard-mapping pad
  Input.prototype._bindPad = function () {
    var self = this;
    this._off.push(on(root, "gamepadconnected", function (ev) {
      self.padOn = true; self._padAnyDown = true;
      self._setDevice("pad");
      self.aimMode = "auto";                          // a pad player must not aim at a stale cursor
      if (ev && ev.gamepad && ev.gamepad.index != null) self.padIndex = ev.gamepad.index;
    }));
    this._off.push(on(root, "gamepaddisconnected", function () {
      var any = false;
      var list = root.navigator && root.navigator.getGamepads ? root.navigator.getGamepads() : [];
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].connected) any = true;
      self.padOn = any;
      if (!any) { self.padPrev = {}; self._setDevice(self.touchCapable ? "touch" : "keyboard"); }
    }));
  };

  Input.prototype._pollPad = function () {
    var out = { on: false, x: 0, y: 0, down: {}, press: {}, any: false };
    var list = root.navigator && root.navigator.getGamepads ? root.navigator.getGamepads() : null;
    if (!list) return out;
    var p = null;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].connected) { p = list[i]; break; }
    if (!p) { this.padOn = false; this.padPrev = {}; return out; }
    out.on = true; this.padOn = true;

    var dz = this.opts.padDeadzone || 0.18;
    var d = deadzone(p.axes[0] || 0, p.axes[1] || 0, dz);
    out.x = d.x; out.y = d.y;

    var down = function (n) {
      var b = p.buttons[n];
      return !!(b && (b.pressed || (b.value || 0) > 0.5));
    };
    // D-pad is digital: full speed, and it overrides the stick.
    var dx = (down(PAD.RIGHT) ? 1 : 0) - (down(PAD.LEFT) ? 1 : 0);
    var dy = (down(PAD.DOWN) ? 1 : 0) - (down(PAD.UP) ? 1 : 0);
    if (dx || dy) {
      var l = Math.sqrt(dx * dx + dy * dy);
      out.x = dx / l; out.y = dy / l;
    }

    for (var b = 0; b < 17; b++) {
      var on = down(b);
      out.down[b] = on;
      if (on && !this.padPrev[b]) out.press[b] = true;
      if (on) out.any = true;
      this.padPrev[b] = on;
    }
    if (out.x || out.y) out.any = true;

    if (out.any) { this._setDevice("pad"); this.aimMode = "auto"; }
    return out;
  };

  // Haptics when the browser exposes them. No pad, no error.
  Input.prototype.rumble = function (ms, strong, weak) {
    try {
      var list = root.navigator && root.navigator.getGamepads ? root.navigator.getGamepads() : [];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p && p.connected && p.vibrationActuator && p.vibrationActuator.playEffect) {
          p.vibrationActuator.playEffect("dual-rumble", { duration: ms || 120,
            strongMagnitude: strong == null ? 0.5 : strong, weakMagnitude: weak == null ? 0.3 : weak });
          return true;
        }
      }
    } catch (e) { /* no haptics is not an error */ }
    return false;
  };

  Input.prototype.padConnected = function () { return this.padOn; };

  // ---------------------------------------------------------------- one frame
  Input.prototype._navDirNow = function (pad) {
    var k = this.keys, dir = 0;
    if (k.ArrowDown || k.KeyS) dir = 1;
    else if (k.ArrowUp || k.KeyW) dir = -1;
    else if (k.ArrowRight || k.KeyD) dir = 1;
    else if (k.ArrowLeft || k.KeyA) dir = -1;
    if (!dir) {
      if (pad.down[PAD.DOWN] || pad.down[PAD.RIGHT]) dir = 1;
      else if (pad.down[PAD.UP] || pad.down[PAD.LEFT]) dir = -1;
    }
    if (!dir) {
      var ax = Math.abs(pad.x), ay = Math.abs(pad.y);
      if (ay > 0.6) dir = pad.y > 0 ? 1 : -1;
      else if (ax > 0.6) dir = pad.x > 0 ? 1 : -1;
    }
    return dir;
  };

  Input.prototype._routeNav = function (pad) {
    var dir = this._navDirNow(pad);
    var t = nowMs();
    if (dir !== this._navDir) { this._navDir = dir; this._navNext = t + 340; return dir; }
    if (dir && t >= this._navNext) { this._navNext = t + 150; return dir; }
    return 0;
  };

  Input.prototype.poll = function () {
    var t = nowMs();
    var dt = this._t0 ? Math.min(0.1, (t - this._t0) / 1000) : 0.016;
    this._t0 = t;

    var pad = this._pollPad();

    // ---- movement: thumb stick > mouse drag > pad > keys (one vector, every device)
    var mx = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
    var my = (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0) - (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0);
    if (this.stick.active && this.stick.mag > 0.12) {
      mx = this.stick.x; my = this.stick.y;
    } else if (this.mouseDrag.active && (this.mouseDrag.x || this.mouseDrag.y)) {
      mx = this.mouseDrag.x; my = this.mouseDrag.y;
    }
    if (pad.x || pad.y) { mx = pad.x; my = pad.y; }

    // ---- actions: keyboard, pad, mouse and touch all fold into the same action names
    var pressed = {}, held = {}, released = {};
    var self = this;
    this.actions.forEach(function (a) {
      var b = self.bindings[a]; if (!b) return;
      var kDown = false, kEdge = false;
      b.keys.forEach(function (code) {
        if (self.keys[code]) kDown = true;
        if (self._keyEdge[code]) kEdge = true;
      });
      var pDown = false, pEdge = false;
      b.pad.forEach(function (name) {
        if (name === "LS" || name === "DPAD") return;
        var i = PAD[name];
        if (pad.down[i]) pDown = true;
        if (pad.press[i]) pEdge = true;
      });
      if (a === "move" && (pad.x || pad.y)) pDown = true;
      var mDown = false, mEdge = false;
      b.mouse.forEach(function (btn) {
        if (self._mouseHeld[btn]) mDown = true;
        if (self._mouseEdge[btn]) mEdge = true;
      });
      var tDown = !!self._touchHeld[a], tEdge = !!self._touchEdge[a];
      held[a] = kDown || pDown || mDown || tDown;
      pressed[a] = kEdge || pEdge || mEdge || tEdge;
    });

    // ---- menu takes the action edges for this frame, and never leaks them into play.
    // This is the Bone Tide guard: the pad Start that starts a run cannot also pause it.
    var menuTook = false;
    if (this._menu && this._menu.active) {
      var nav = this._routeNav(pad);
      if (!this._navDirNow(pad)) this._menu.rearm();
      if (nav && this._menu.armed) this._menu.step(nav);
      // pad Start is "confirm" at a menu and "pause" in play: one press, one job.
      if (pressed.confirm || pressed.primary || pad.press[PAD.START]) { this._menu.press(); menuTook = true; }
      else if (pressed.back) { this._menu.back(); menuTook = true; }
      if (menuTook) {
        pressed.pause = false; pressed.primary = false; pressed.secondary = false;
        pressed.confirm = false; pressed.back = false;
      }
    }

    // ---- pause: one owner. Esc / P / pad Start / the ⏸ button. Auto-pause never resumes by itself.
    if (pressed.pause) this.pause.toggle();

    this.actions.forEach(function (a) { released[a] = !!self._prevHeld[a] && !held[a]; });

    var frame = {
      t: t, dt: dt,
      device: this.device,
      aimMode: this.aimMode,
      move: { x: mx, y: my },
      held: held, pressed: pressed, released: released,
      aim: this.aimPoint(),
      pad: { connected: pad.on, x: pad.x, y: pad.y },
      menu: !!(this._menu && this._menu.active),
      paused: this.pause.paused
    };

    this._keyEdge = {}; this._mouseEdge = {}; this._touchEdge = {};
    this._prevHeld = held;
    this._updateUI(frame);
    return frame;
  };

  Input.prototype.read = function () { return this.poll(); };

  // ---------------------------------------------------------------- menu focus (keys, stick, D-pad, touch)
  function Menu(input, cfg) {
    cfg = cfg || {};
    this.input = input;
    this.items = (cfg.items || []).slice();
    this.index = 0;
    this.active = false;
    this.onFocus = cfg.onFocus || null;
    this.onPress = cfg.onPress || null;
    this.onBack = cfg.onBack || null;
    this.dom = el(cfg.dom);
    var self = this;
    this.items.forEach(function (it, i) {
      var node = it.el || (self.dom && it.id ? self.dom.querySelector('[data-menu="' + it.id + '"]') : null);
      it.el = node || null;
      if (node) {
        node.setAttribute("data-menu", it.id || String(i));
        node._aiIndex = i;                     // one listener per node, whatever menu is open now
        node._aiMenu = self;
        if (!node._aiPress) {
          node._aiPress = function (ev) {
            ev.preventDefault();                            // do not stop propagation: the template still needs the event
            var m = node._aiMenu;
            if (m && m.active) m.press(node._aiIndex);   // a tap is the same press the pad and keys fire
          };
          node.addEventListener("pointerdown", node._aiPress);
        }
      }
    });
  }

  Menu.prototype.open = function (index) {
    this.active = true;
    this.armed = false;                                 // see rearm(): nav must start from neutral
    this.focus(index == null ? this.index : index);
    return this;
  };

  Menu.prototype.rearm = function () { this.armed = true; };

  Menu.prototype.close = function () {
    this.active = false;
    this._paint(-1);
    return this;
  };

  Menu.prototype._paint = function (prev) {
    if (prev >= 0 && this.items[prev] && this.items[prev].el) this.items[prev].el.classList.remove("ai-focus");
    var it = this.items[this.index];
    if (it && it.el) it.el.classList.add("ai-focus");
  };

  Menu.prototype.focus = function (i) {
    if (!this.items.length) return -1;
    var prev = this.index;
    var n = this.items.length;
    this.index = ((i % n) + n) % n;
    this._paint(prev);
    if (this.onFocus) this.onFocus(this.index, this.items[this.index]);
    this.input._emit("menufocus", { index: this.index, item: this.items[this.index] });
    return this.index;
  };

  Menu.prototype.step = function (n) {
    if (!this.active || !n) return this.index;
    return this.focus(this.index + (n > 0 ? 1 : -1));
  };

  Menu.prototype.press = function (i) {
    var idx = i == null ? this.index : i;
    var it = this.items[idx];
    if (!it) return false;
    if (it.el) this.focus(idx);
    if (this.onPress) this.onPress(idx, it);
    if (typeof it.action === "function") it.action(idx, it);
    this.input._emit("menupress", { index: idx, item: it });
    return true;
  };

  Menu.prototype.back = function () {
    if (this.onBack) this.onBack(this.index, this.items[this.index]);
    this.input._emit("menuback", { index: this.index });
    return true;
  };

  Menu.prototype.item = function (idOrIndex) {
    if (typeof idOrIndex === "number") return this.items[idOrIndex] || null;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].id === idOrIndex) return this.items[i];
    return null;
  };

  Input.prototype.menu = function (cfg) {
    this._menu = new Menu(this, cfg);
    return this._menu;
  };

  // ---------------------------------------------------------------- pause: one owner, auto-pause, start guard
  function Pause(input) {
    this.input = input;
    this.paused = false;
    this.auto = false;
    this.enabled = input.opts.pause !== false;
  }

  Pause.prototype.isRunning = function () {
    return this.input.opts.isRunning ? !!this.input.opts.isRunning() : true;
  };

  Pause.prototype.pause = function (why) {
    if (this.paused || !this.enabled) return false;
    if (!this.isRunning()) return false;              // never pause a menu or an ended run
    this.paused = true;
    this.auto = why === "auto";
    if (this.input.opts.onPause) { try { this.input.opts.onPause(this.auto); } catch (e) {} }
    this.input._emit("pause", { auto: this.auto });
    return true;
  };

  Pause.prototype.resume = function () {
    if (!this.paused) return false;
    this.paused = false;
    this.auto = false;
    if (this.input.opts.onResume) { try { this.input.opts.onResume(); } catch (e) {} }
    this.input._emit("resume", {});
    return true;
  };

  Pause.prototype.toggle = function () {
    return this.paused ? this.resume() : this.pause("input");
  };

  Pause.prototype.reset = function () { this.paused = false; this.auto = false; };

  Input.prototype._bindPauseTriggers = function () {
    var self = this;
    // A hidden tab and a lost window focus both stop the game. They never resume it: that is the player's call.
    this._off.push(on(doc, "visibilitychange", function () {
      if (doc.hidden) self._autoPause(); else self._t0 = nowMs();
    }));
    this._off.push(on(root, "blur", function () { self._autoPause(); }));
    this._off.push(on(root, "focus", function () { self._t0 = nowMs(); }));
    this._off.push(on(root, "pagehide", function () { self._autoPause(); }));
  };

  Input.prototype._autoPause = function () {
    // Key-up events never arrive while the page is hidden, so drop held state with the pause.
    if (this.pause.pause("auto")) { this._clearHeld(); this.releaseStick(); }
  };

  // ---------------------------------------------------------------- audio unlock (the iOS rule)
  function AudioKit(input) {
    this.input = input;
    this.ctx = null;
    this.ready = false;
    this.factory = null;
    this.onUnlock = null;
  }

  // The game hands over its own AudioContext (or a function that makes it), so the template resumes
  // the context the sounds actually play through.
  AudioKit.prototype.attach = function (factory, onUnlock) {
    this.factory = factory || null;
    this.onUnlock = onUnlock || null;
    return this;
  };

  AudioKit.prototype.unlock = function () {
    if (this.ready && this.ctx && this.ctx.state === "running") return this.ctx;
    var ctx = this.ctx;
    if (!ctx && this.factory) {
      try {
        var made = this.factory();
        ctx = made && made.ctx ? made.ctx : made;
      } catch (e) { ctx = null; }
    }
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    this.ctx = ctx;
    try { if (ctx.resume) ctx.resume(); } catch (e) {}
    try { if (root.Howler && root.Howler.ctx && root.Howler.ctx.state === "suspended") root.Howler.ctx.resume(); } catch (e) {}
    this.ready = true;
    if (this.onUnlock) { try { this.onUnlock(ctx); } catch (e) {} }
    this.input._emit("audio", ctx);
    return ctx;
  };

  Input.prototype._bindGesture = function () {
    var self = this;
    var kick = function () { self._audioGesture(); };
    this._off.push(on(root, "pointerdown", kick, { passive: true }));
    this._off.push(on(root, "keydown", kick));
    this._off.push(on(root, "touchend", kick, { passive: true }));
  };

  Input.prototype._audioGesture = function () {
    if (this.opts.audio === false) return null;
    return this.audio.unlock();
  };

  // ---------------------------------------------------------------- prompts: one icon per action per device
  Input.prototype.promptFile = function (action, deviceOverride) {
    var d = deviceOverride || this.device;
    var table = PROMPTS[d] || PROMPTS.keyboard;
    return table[action] || PROMPTS.keyboard[action] || "keyboard_space.png";
  };

  Input.prototype.prompt = function (action, deviceOverride) {
    var base = this.opts.promptBase == null ? "prompts/" : this.opts.promptBase;
    return base + this.promptFile(action, deviceOverride);
  };

  // {src, alt, device, action} — ready for an <img>, a Phaser texture or a canvas drawImage.
  Input.prototype.promptIcon = function (action, label, deviceOverride) {
    return { src: this.prompt(action, deviceOverride), action: action,
             alt: label || this.labels[action] || action,
             device: deviceOverride || this.device };
  };

  Input.prototype.promptRow = function (list, deviceOverride) {
    var self = this;
    return list.map(function (item) {
      var action = typeof item === "string" ? item : item.action;
      var label = typeof item === "string" ? (self.labels[action] || action) : (item.label || action);
      var ic = self.promptIcon(action, label, deviceOverride);
      return '<span class="ai-prompt" data-action="' + action + '"><img src="' + ic.src + '" alt="' + ic.alt +
             '"><i>' + ic.alt + '</i></span>';
    }).join("");
  };

  // ---------------------------------------------------------------- window.__game hook, honest by construction
  Input.prototype.installHook = function (spec) {
    spec = spec || {};
    var self = this;
    var api = {};
    var extras = spec.fields || {};

    Object.defineProperty(api, "state", {
      enumerable: true,
      get: function () {
        var raw = spec.getState ? spec.getState() : undefined;
        return mapMode(raw, self.pause.paused);
      }
    });
    Object.defineProperty(api, "mode", { enumerable: true, get: function () { return spec.getState ? spec.getState() : undefined; } });
    if (spec.getScore) Object.defineProperty(api, "score", { enumerable: true, get: function () { return spec.getScore(); } });
    if (spec.getPlayer) Object.defineProperty(api, "player", { enumerable: true, get: function () { return spec.getPlayer(); } });
    Object.keys(extras).forEach(function (k) {
      if (k in api) return;                                // never shadow a built-in getter
      Object.defineProperty(api, k, { enumerable: true, get: extras[k] });
    });
    Object.defineProperty(api, "device", { enumerable: true, get: function () { return self.device; } });
    Object.defineProperty(api, "aimMode", { enumerable: true, get: function () { return self.aimMode; } });
    Object.defineProperty(api, "aim", { enumerable: true, get: function () { return self.aimPoint(); } });
    Object.defineProperty(api, "paused", { enumerable: true, get: function () { return self.pause.paused; } });
    Object.defineProperty(api, "padConnected", { enumerable: true, get: function () { return self.padOn; } });
    api.ui = function () { return self.ui().concat(spec.ui ? spec.ui() : []); };
    if (spec.start) api.start = spec.start;
    if (spec.restart) api.restart = spec.restart;
    if (spec.pause) api.pause = spec.pause;
    if (spec.resume) api.resume = spec.resume;
    if (spec.ready) api.ready = spec.ready;
    api.input = self;
    if (root) root.__game = api;                        // the gate reads this, and so does the playtester
    return api;
  };

  // The four words the gate and every game share. Paused beats play; win/lose/dead all read as over.
  function mapMode(raw, paused) {
    var s = String(raw == null ? "" : raw).toLowerCase();
    if (s === "menu" || s === "title") return "menu";
    if (s === "paused") return "paused";
    if (s === "over" || s === "win" || s === "won" || s === "lose" || s === "lost" ||
        s === "dead" || s === "gameover" || s === "ended") return "over";
    if (paused) return "paused";
    return "play";
  }

  // ---------------------------------------------------------------- export
  function create(opts) { return new Input(opts || {}); }

  return {
    version: VERSION,
    create: create,
    Input: Input,
    mapState: mapState,
    mapMode: mapMode,
    PAD: PAD,
    defaults: DEFAULT_BINDINGS,
    prompts: PROMPTS
  };
});
