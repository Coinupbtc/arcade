/**
 * One input layer for Phone Blackjack: keyboard, touch (DOM buttons), and a
 * standard-mapping gamepad fold into the same action names. The hint line
 * follows whichever device was used last, so a phone never shows pad wording
 * until a pad actually sends a button.
 */
(function (global) {
  "use strict";

  var KEYMAP = {
    Enter: "primary",
    Space: "primary",
    NumpadEnter: "primary",
    KeyH: "hit",
    KeyS: "stand",
    KeyD: "double",
    KeyP: "split",
    KeyR: "reset",
    KeyM: "sound",
    Digit1: "bet5",
    Digit2: "bet10",
    Digit3: "bet25",
    ArrowLeft: "betdown",
    ArrowRight: "betup"
  };

  // Standard mapping button index → action.
  var PADMAP = {
    0: "primary",   // A
    1: "stand",     // B
    2: "double",    // X
    3: "split",     // Y
    8: "reset",     // Back
    9: "primary",   // Start
    12: "betup",    // DPad up
    13: "betdown",  // DPad down
    14: "betdown",  // DPad left
    15: "betup"     // DPad right
  };

  var device = "touch";         // touch | key | pad
  var padConnected = false;
  var handler = null;
  var prev = [];                // previous pad button states
  var listeners = [];

  function fire(action) {
    if (handler) handler(action);
  }

  function changed() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](device, padConnected); } catch (e) {}
    }
  }

  function setDevice(d) {
    if (d === device) return;
    device = d;
    changed();
  }

  function onKey(e) {
    if (e.repeat) return;
    var action = KEYMAP[e.code];
    if (!action) return;
    // Space/Enter would scroll or re-click a focused button: take the key.
    e.preventDefault();
    if (global.Sfx) global.Sfx.unlock();
    setDevice("key");
    fire(action);
  }

  function padLoop() {
    var pads = global.navigator.getGamepads ? global.navigator.getGamepads() : [];
    var pad = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    }
    if (pad) {
      for (var b = 0; b < pad.buttons.length; b++) {
        var down = !!(pad.buttons[b] && pad.buttons[b].pressed);
        if (down && !prev[b]) {
          padConnected = true;
          setDevice("pad");
          if (global.Sfx) global.Sfx.unlock();
          var action = PADMAP[b];
          if (action) fire(action);
        }
        prev[b] = down;
      }
    }
    requestAnimationFrame(padLoop);
  }

  global.Input = {
    install: function (opts) {
      handler = opts && opts.onAction;
      document.addEventListener("keydown", onKey);
      document.addEventListener("pointerdown", function (e) {
        if (global.Sfx) global.Sfx.unlock();
        setDevice(e.pointerType === "touch" || e.pointerType === "pen" ? "touch" : "key");
      }, true);
      // No page scroll or pinch while playing.
      document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
      document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
      global.addEventListener("gamepadconnected", function () {
        padConnected = true;
        setDevice("pad");
        changed();
      });
      global.addEventListener("gamepaddisconnected", function () {
        padConnected = false;
        changed();
      });
      requestAnimationFrame(padLoop);
      setDevice(window.matchMedia && window.matchMedia("(hover: none)").matches ? "touch" : "key");
    },
    onDeviceChange: function (fn) { listeners.push(fn); },
    device: function () { return device; },
    padConnected: function () { return padConnected; },
    /** The hint line for whichever device is live now. */
    hint: function (where) {
      if (device === "pad") {
        return "A Deal · B Stand · X Double · Y Split · ⟵⟶ Bet";
      }
      if (device === "key") {
        return "Enter/Space Deal · H Hit · S Stand · D Double · P Split";
      }
      return where === "betting" ? "Tap a chip, then Deal." : "Tap Hit, Stand, Double or Split.";
    }
  };
})(window);
