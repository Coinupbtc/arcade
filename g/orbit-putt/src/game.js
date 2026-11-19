/* Orbit Putt — game state, input verbs, panels, HUD. */
(function () {
  "use strict";
  var C = window.OP_C, P = window.OP_P, R = window.OP_R, A = window.OP_A;
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d", { alpha: false });
  var $ = function (id) { return document.getElementById(id); };

  var G = {
    mode: "menu",          // menu | play | paused | card | over
    time: 0,
    hole: 0,
    world: null,
    results: [],
    total: 0,
    aim: { active: false, mode: "pull", dx: 0, dy: -1, power: 0, pull: { x: 0, y: 0 }, mag: 0, dots: null },
    particles: [],
    shake: 0,
    hitstop: 0,
    cupPulse: 0,
    pending: null,         // {kind, t} delayed transition
    msg: "",
    msgT: 0,
    ghostT: 0,
    putts: 0,
    bestRound: null,
    lastShotAt: 0
  };
  window.OP_G = G;

  // ---------------------------------------------------------------- persistence
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function bestHole(i) { var v = parseInt(lsGet("orbitputt.best.h" + i, ""), 10); return isNaN(v) ? null : v; }
  function setBestHole(i, strokes) {
    var b = bestHole(i);
    if (b == null || strokes < b) { lsSet("orbitputt.best.h" + i, String(strokes)); return true; }
    return false;
  }
  G.bestRound = (function () { var v = parseInt(lsGet("orbitputt.bestRound", ""), 10); return isNaN(v) ? null : v; })();

  // ---------------------------------------------------------------- panels
  function show(id) {
    ["title", "how", "pause", "card", "over"].forEach(function (n) {
      var el = $(n); if (el) el.classList.toggle("on", n === id);
    });
    document.body.classList.toggle("panel-open", !!id);
  }
  function hidePanels() { show(null); }

  // ---------------------------------------------------------------- round flow
  function startRound() {
    G.results = []; G.total = 0; G.hole = 0; G.putts = 0;
    loadHole(0);
    G.mode = "play";
    hidePanels();
    input.pause.reset();
    syncHud();
    A.play("ui", { gain: 0.5 });
  }

  function loadHole(i) {
    G.hole = i;
    G.world = P.createWorld(i);
    G.aim.active = false; G.aim.power = 0; G.aim.dots = null;
    G.particles.length = 0; G.shake = 0; G.hitstop = 0; G.cupPulse = 0;
    G.pending = null;
    G.ghostT = i === 0 ? 5 : 0;
    G.msg = C.HOLES[i].teach || ""; G.msgT = 5.2;
    G.mode = "play";
    syncHud();
  }

  function holeStars(strokes, par) { return strokes < par ? 3 : strokes === par ? 2 : 1; }

  function sinkHole() {
    var w = G.world, h = C.HOLES[G.hole];
    var strokes = w.strokes;
    var stars = holeStars(strokes, h.par);
    var rec = setBestHole(G.hole, strokes);
    G.results[G.hole] = { strokes: strokes, par: h.par, stars: stars, best: bestHole(G.hole), record: rec };
    G.total += strokes;
    G.cupPulse = 1;
    A.play("sink", { gain: 0.85 });
    for (var i = 0; i < 46; i++) {
      var a = Math.random() * 6.2832, sp = 40 + Math.random() * 260;
      G.particles.push({ x: h.cup[0], y: h.cup[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.7, max: 1.2, size: 2 + Math.random() * 3,
        col: i % 3 === 0 ? C.PAL.ice : i % 3 === 1 ? C.PAL.violet : "#ffffff", kind: "spark", a: 0.9 });
    }
    G.mode = "card";
    document.body.classList.remove("playing");
    setTimeout(function () { if (G.mode === "card") { fillCard(); show("card"); } }, 700);
    syncHud();
  }

  function fillCard() {
    var rec = G.results[G.hole], h = C.HOLES[G.hole];
    $("cardHole").textContent = "HOLE " + (G.hole + 1) + " · " + h.name;
    $("cardScore").textContent = rec.strokes + (rec.strokes === 1 ? " STROKE" : " STROKES") + " · PAR " + rec.par;
    var vs = rec.strokes - rec.par;
    $("cardVs").textContent = vs === 0 ? "ON PAR" : vs < 0 ? (vs === -1 ? "BIRDIE" : vs === -2 ? "EAGLE" : Math.abs(vs) + " UNDER PAR") : (vs === 1 ? "ONE OVER" : vs + " OVER");
    $("cardStars").textContent = "★".repeat(rec.stars) + "☆".repeat(3 - rec.stars);
    $("cardBest").textContent = rec.best != null ? "BEST HERE: " + rec.best : "";
    $("cardNext").textContent = G.hole >= C.HOLES.length - 1 ? "SEE RESULT" : "NEXT HOLE";
    A.play("card", { gain: 0.7 });
  }

  function nextHole() {
    if (G.mode !== "card") return;
    A.play("ui", { gain: 0.5 });
    if (G.hole >= C.HOLES.length - 1) { endRound(); return; }
    loadHole(G.hole + 1);
    hidePanels();
  }

  function endRound() {
    var par = C.HOLES.reduce(function (s, h) { return s + h.par; }, 0);
    var vs = G.total - par;
    var stars = G.results.reduce(function (s, r) { return s + (r ? r.stars : 0); }, 0);
    var best = G.bestRound;
    if (best == null || G.total < best) { best = G.total; G.bestRound = best; lsSet("orbitputt.bestRound", String(best)); $("overNew").classList.add("on"); }
    else $("overNew").classList.remove("on");
    $("overScore").textContent = G.total;
    $("overPar").textContent = (vs === 0 ? "LEVEL WITH PAR" : vs < 0 ? Math.abs(vs) + " UNDER PAR" : vs + " OVER PAR") + "  ·  PAR " + par;
    $("overStars").textContent = "★".repeat(stars) + "☆".repeat(18 - stars) + "   " + stars + "/18";
    $("overBest").textContent = "BEST ROUND: " + best;
    var rows = "";
    for (var i = 0; i < C.HOLES.length; i++) {
      var r = G.results[i];
      rows += '<div class="orow"><span>' + (i + 1) + ". " + C.HOLES[i].name + "</span><b>" +
        (r ? r.strokes + " / " + r.par : "-") + "</b></div>";
    }
    $("overRows").innerHTML = rows;
    G.mode = "over";
    show("over");
    A.play("card", { gain: 0.8 });
  }

  function penalty(n, why) {
    var w = G.world;
    w.strokes += n;
    P.respawn(w);
    G.aim.active = false;
    G.msg = why; G.msgT = 2.4;
    syncHud();
  }

  // ---------------------------------------------------------------- juice
  function shake(px) { G.shake = Math.min(6, Math.max(G.shake, px)); }
  function hitstop(s) { G.hitstop = Math.max(G.hitstop, s); }
  function burst(x, y, n, cols, speed, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832, sp = speed * (0.25 + Math.random());
      G.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.55, max: 0.8, size: 1.6 + Math.random() * 2.6,
        col: cols[(Math.random() * cols.length) | 0], kind: kind || "spark", a: 0.95 });
    }
  }

  // ---------------------------------------------------------------- input
  var aimDir = { x: 0, y: -1 };
  var dragging = false, charging = false, charge = 0;

  var input = window.ArcadeInput.create({
    surface: "#game",
    isRunning: function () { return G.mode === "play"; },
    onPause: function () {
      if (G.mode !== "play") return;
      G.mode = "paused";
      G.aim.active = false; charging = false; dragging = false; charge = 0;
      show("pause");
    },
    onResume: function () {
      if (G.mode !== "paused") return;
      G.mode = "play";
      hidePanels();
    },
    onRefit: function () { R.fit(canvas); layout(); },
    promptBase: "prompts/",
    labels: { primary: "PUTT" },
    touchButtons: [],
    stick: "float"
  });
  window.__input = input;
  // Phone-first: a touch-capable browser starts in touch mode, so the drag pad and the
  // touch wording are on screen before the first finger lands.
  if (input.touchCapable && input.deviceName() !== "touch") { try { input._setDevice("touch"); } catch (e) {} }

  input.audio.attach(function () { return A.make(); }, function () { A.unlock(); });

  // A visible drag pad for the phone (and the proof's stick finder). It sits inside the
  // template's own stick zone, so a touch on it starts the same stick as a touch anywhere.
  var pad = document.createElement("div");
  pad.id = "aimstick";
  pad.setAttribute("aria-hidden", "true");
  pad.innerHTML = "<span></span>";
  var zoneEl = document.querySelector("#arcade-ui .ai-zone");
  if (zoneEl) zoneEl.appendChild(pad); else document.body.appendChild(pad);

  // ---------------------------------------------------------------- aim + fire
  function computeAim(f, dt) {
    var w = G.world;
    if (!w || w.phase !== "aim" || G.mode !== "play") { G.aim.active = false; return; }

    var st = input.stick;
    if (st.active && st.mag > 0.02) {
      if (!dragging) { dragging = true; charging = false; charge = 0; }
      var px = st.x, py = st.y, m = Math.hypot(px, py) || 1;
      var mag = Math.min(1, st.mag / 0.75);
      G.aim.active = true; G.aim.mode = "pull"; G.aim.power = mag;
      G.aim.dx = -px / m; G.aim.dy = -py / m;          // launch is opposite the pull
      G.aim.pull = { x: (px / m) * mag * C.PHYS.MAX_PULL, y: (py / m) * mag * C.PHYS.MAX_PULL };
      G.aim.mag = mag * C.PHYS.MAX_PULL;
      aimDir.x = G.aim.dx; aimDir.y = G.aim.dy;
      G.aim.dots = P.previewPath(w, G.aim.dx, G.aim.dy, G.aim.power, 0.6);
      return;
    }
    if (dragging) {
      // finger lifted: fire with the aim captured on the last frame
      dragging = false;
      fire(G.aim.dx, G.aim.dy, G.aim.power);
      G.aim.active = false;
      return;
    }

    if (f.held.primary) {
      if (!charging) { charging = true; charge = 0; }
      charge = Math.min(1, charge + dt / C.PHYS.CHARGE_TIME);
      if (Math.hypot(f.move.x, f.move.y) > 0.28) {
        var mm = Math.hypot(f.move.x, f.move.y);
        aimDir.x = f.move.x / mm; aimDir.y = f.move.y / mm;
      }
      G.aim.active = true; G.aim.mode = "charge"; G.aim.power = charge;
      G.aim.dx = aimDir.x; G.aim.dy = aimDir.y; G.aim.pull = { x: 0, y: 0 };
      G.aim.dots = P.previewPath(w, aimDir.x, aimDir.y, charge, 0.6);
      return;
    }
    if (charging) {
      charging = false;
      fire(aimDir.x, aimDir.y, charge);
      charge = 0;
      G.aim.active = false;
      return;
    }

    // idle: a faint default arrow so the first screen is never a puzzle
    if (Math.hypot(f.move.x, f.move.y) > 0.28) {
      var m2 = Math.hypot(f.move.x, f.move.y);
      aimDir.x = f.move.x / m2; aimDir.y = f.move.y / m2;
      G.aim.active = true; G.aim.mode = "charge"; G.aim.power = 0;
      G.aim.dx = aimDir.x; G.aim.dy = aimDir.y; G.aim.pull = { x: 0, y: 0 }; G.aim.dots = null;
    } else if (G.aim.active && G.aim.mode === "charge") {
      G.aim.active = false;
    }
  }

  function fire(dx, dy, power) {
    var w = G.world;
    if (!w || w.phase !== "aim" || G.mode !== "play") return;
    if (power < 0.05) return;
    P.putt(w, dx, dy, power);
    G.putts++;
    A.play("putt", { gain: 0.55 + power * 0.35, rate: 0.92 + power * 0.22 });
    shake(1.2 + power * 2.2);
    hitstop(0.03);
    burst(w.lastRest.x, w.lastRest.y, 8, [C.PAL.ice, "#ffffff"], 60 + power * 90);
    G.aim.dots = null;
    G.ghostT = 0;
    G.squash = 0.45; G.squashAng = Math.atan2(dy, dx);
    syncHud();
  }

  // ---------------------------------------------------------------- events
  function handleEvents() {
    var w = G.world, evs = w.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === "bounce") {
        var k = Math.min(1, (e.power || 200) / 900);
        G.squash = Math.min(0.6, 0.2 + k * 0.45);
        G.squashAng = Math.atan2(G.world.ball.vy, G.world.ball.vx);
        shake(1.5 + k * 3);
        hitstop(0.04);
        burst(e.x, e.y, 7 + (k * 9 | 0), [C.PAL.bone, C.PAL.ice, C.PAL.gold], 50 + k * 170);
        A.play("bounce", { gain: 0.25 + k * 0.5, rate: 0.85 + k * 0.5 });
        input.rumble(18 + k * 30, 0.4, 0.25);
      } else if (e.type === "sink") {
        hitstop(0.08); shake(6);
        sinkHole();
      } else if (e.type === "lip") {
        A.play("lip", { gain: 0.7, rate: 1 });
        shake(2.4); burst(e.x, e.y, 10, [C.PAL.violet, C.PAL.bone], 120);
        G.msg = "TOO FAST — IT LIPPED OUT"; G.msgT = 2.2;
      } else if (e.type === "lost") {
        A.play("lost", { gain: 0.85 });
        shake(5);
        burst(e.x, e.y, 26, [C.PAL.violet, "#ffffff"], 220, "dot");
        G.pending = { kind: "lost", t: 0.85 };
      } else if (e.type === "out") {
        A.play("lost", { gain: 0.6, rate: 1.35 });
        G.pending = { kind: "out", t: 0.8 };
      } else if (e.type === "rest") {
        G.aim.active = false;
      }
    }
    evs.length = 0;
  }

  // ---------------------------------------------------------------- HUD
  function fmtVs(v) { return v === 0 ? "E" : v > 0 ? "+" + v : String(v); }
  function syncHud() {
    var w = G.world;
    if (!w) return;
    var h = C.HOLES[G.hole];
    $("hHole").textContent = "HOLE " + (G.hole + 1) + "/" + C.HOLES.length;
    $("hPar").textContent = "PAR " + h.par;
    $("hStrokes").textContent = String(w.strokes);
    var played = G.results.filter(Boolean);
    var parSoFar = played.reduce(function (s, r) { return s + r.par; }, 0);
    $("hTotal").textContent = fmtVs(G.total - parSoFar);
    $("hTotal").className = (G.total - parSoFar) < 0 ? "good" : (G.total - parSoFar) > 0 ? "bad" : "";
    $("hName").textContent = h.name;
  }

  var TOUCH_CAPABLE = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;
  function wantPad() {
    var d = input.deviceName();
    if (d === "pad") return false;
    return d === "touch" || TOUCH_CAPABLE;
  }
  function layout() {
    var v = R.view;
    document.body.classList.toggle("landscape", v.landscape);
    document.body.classList.toggle("portrait", !v.landscape);
    var padEl = $("aimstick");
    var z = document.querySelector("#arcade-ui .ai-zone");
    if (z && padEl && padEl.parentElement !== z) z.appendChild(padEl);
    if (padEl) padEl.style.display = G.mode === "play" && wantPad() ? "block" : "none";
  }

  // ---------------------------------------------------------------- hint copy per device
  function hintText() {
    var d = input.deviceName();
    if (d === "touch") return '<img src="prompts/touch_hand_open.png" alt=""><i>DRAG BACK FROM THE BALL</i><img src="prompts/touch_tap.png" alt=""><i>RELEASE TO PUTT</i>';
    if (d === "pad") return '<img src="prompts/xbox_stick_l.png" alt=""><i>AIM</i><img src="prompts/xbox_button_a.png" alt=""><i>HOLD · RELEASE TO PUTT</i>';
    return '<img src="prompts/keyboard_arrows.png" alt=""><i>AIM</i><img src="prompts/keyboard_space.png" alt=""><i>HOLD · RELEASE TO PUTT</i><img src="prompts/keyboard_escape.png" alt=""><i>PAUSE</i>';
  }
  function refreshHint() { $("hint").innerHTML = hintText(); }

  // ---------------------------------------------------------------- frame
  var last = 0;
  var lastPlaying = null, lastHud = null;
  function frame(now) {
    requestAnimationFrame(frame);
    var isPlaying = G.mode === "play";
    if (isPlaying !== lastPlaying) { lastPlaying = isPlaying; document.body.classList.toggle("playing", isPlaying); }
    var hudOn = G.mode === "play" || G.mode === "paused" || G.mode === "card";
    if (hudOn !== lastHud) { lastHud = hudOn; $("hud").style.visibility = hudOn ? "visible" : "hidden"; }
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    G.time += dt;

    var f = input.poll();

    // ---- menus answer every device: Enter/Space/A confirm, Esc/B back
    if (G.time > (G.blockUntil || 0)) {
      var confirm = f.pressed.confirm || f.pressed.primary;
      if ($("how").classList.contains("on")) {
        if (confirm || f.pressed.back) { A.play("ui", { gain: 0.5 }); show("title"); }
      } else if (G.mode === "menu" && confirm) {
        startRound(); G.blockUntil = G.time + 0.3;
      } else if (G.mode === "card" && confirm) {
        nextHole(); G.blockUntil = G.time + 0.3;
      } else if (G.mode === "over" && confirm) {
        startRound(); G.blockUntil = G.time + 0.3;
      } else if (G.mode === "paused" && confirm) {
        input.pause.resume(); G.blockUntil = G.time + 0.3;
      }
    }

    if (G.mode === "play") {
      computeAim(f, dt);
      if (G.hitstop > 0) {
        G.hitstop -= dt;
      } else if (G.world && G.world.phase === "moving") {
        P.step(G.world, dt);
        handleEvents();
      } else if (G.world) {
        handleEvents();
      }
      if (G.pending) {
        G.pending.t -= dt;
        if (G.pending.t <= 0) {
          var kind = G.pending.kind; G.pending = null;
          if (kind === "lost") penalty(2, "LOST TO THE BLACK HOLE · +2");
          else penalty(1, "OUT OF THE FIELD · +1");
        }
      }
      if (G.msgT > 0) G.msgT -= dt;
      if (G.ghostT > 0) G.ghostT -= dt;
      if (G.world && G.world.phase === "moving") {
        // keep the HUD honest while the ball rolls
        $("hStrokes").textContent = String(G.world.strokes);
      }
    }

    // particles
    for (var i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.965; p.vy *= 0.965;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
    G.shake = Math.max(0, G.shake - dt * 26);
    G.squash = Math.max(0, (G.squash || 0) - dt * 3.2);
    G.cupPulse = Math.max(0, G.cupPulse - dt * 1.6);

    // title: a scripted demo arc on hole 1
    if (G.mode === "menu") demoWorld(dt);

    R.draw(ctx, G);
    drawOverlayText();
    if (G.mode === "play") {
      var wp = wantPad();
      if (pad && (pad.style.display === "block") !== wp) pad.style.display = wp ? "block" : "none";
    } else if (pad && pad.style.display !== "none") {
      pad.style.display = "none";
    }
  }

  var demo = null;
  function demoWorld(dt) {
    if (!G.world || G.demoFor !== 0) { G.world = P.createWorld(0); G.demoFor = 0; demo = null; }
    var w = G.world, h = C.HOLES[0];
    if (!demo) demo = { t: 0 };
    demo.t += dt;
    var T = 5.2, u = (demo.t % T) / T;
    if (u < 0.55) {
      var k = u / 0.55;
      // a lazy arc from the tee, bending around the planet into the cup
      var mx = 300, my = 700;
      var x = (1 - k) * (1 - k) * h.ball[0] + 2 * (1 - k) * k * mx + k * k * h.cup[0];
      var y = (1 - k) * (1 - k) * h.ball[1] + 2 * (1 - k) * k * my + k * k * h.cup[1];
      w.ball.x = x; w.ball.y = y;
      w.phase = "moving";
      w.trail.push({ x: x, y: y, s: 700 * (1 - k) + 80 });
      if (w.trail.length > 70) w.trail.shift();
      if (k > 0.96) { G.cupPulse = 1; }
    } else {
      w.phase = "aim"; w.trail.length = 0;
      w.ball.x = h.ball[0]; w.ball.y = h.ball[1];
    }
  }

  function drawOverlayText() {
    if (G.mode !== "play" && G.mode !== "paused") return;
    if (G.msgT > 0 && G.msg) {
      var a = Math.min(1, G.msgT / 0.6);
      ctx.save();
      ctx.globalAlpha = a * 0.92;
      ctx.font = "600 " + Math.round(Math.max(11, Math.min(16, R.view.w / 26))) + "px system-ui,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(4,7,15,0.55)";
      var tw = ctx.measureText(G.msg).width + 26;
      var y = R.view.landscape ? 42 : 96;
      ctx.fillRect(R.view.w / 2 - tw / 2, y - 13, tw, 26);
      ctx.fillStyle = C.PAL.bone;
      ctx.fillText(G.msg, R.view.w / 2, y);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- wire panels
  $("play").addEventListener("click", function () { startRound(); });
  $("howbtn").addEventListener("click", function () { A.play("ui", { gain: 0.5 }); show("how"); });
  $("howback").addEventListener("click", function () { A.play("ui", { gain: 0.5 }); show("title"); });
  $("resume").addEventListener("click", function () { input.pause.resume(); });
  $("quit").addEventListener("click", function () {
    A.play("ui", { gain: 0.5 });
    G.mode = "menu"; G.world = P.createWorld(0); G.demoFor = 0; demo = null;
    input.pause.reset(); show("title"); syncHud();
  });
  $("cardNext").addEventListener("click", function () { nextHole(); });
  $("again").addEventListener("click", function () { startRound(); });
  $("totitle").addEventListener("click", function () {
    A.play("ui", { gain: 0.5 });
    G.mode = "menu"; G.world = P.createWorld(0); G.demoFor = 0; demo = null;
    input.pause.reset(); show("title");
  });
  $("reset").addEventListener("click", function () {
    if (G.mode !== "play" || !G.world || G.world.phase !== "aim") return;
    G.world.strokes += 1;
    P.respawn(G.world);
    G.msg = "RE-PUTT FROM THE LAST SPOT · +1"; G.msgT = 2;
    A.play("ui", { gain: 0.5 });
    syncHud();
  });
  var muteBtn = $("mute");
  A.initMuted();
  function paintMute() { muteBtn.textContent = A.muted ? "🔇" : "🔊"; muteBtn.setAttribute("aria-label", A.muted ? "Unmute" : "Mute"); }
  muteBtn.addEventListener("click", function () { A.setMuted(!A.muted); paintMute(); A.play("ui", { gain: 0.5 }); });
  paintMute();

  input.on("device", function () { refreshHint(); layout(); });

  // ---------------------------------------------------------------- hook
  input.installHook({
    getState: function () {
      if (G.mode === "paused") return "paused";
      if (G.mode === "menu") return "menu";
      if (G.mode === "over") return "over";
      return "play";
    },
    getScore: function () { return G.total; },
    getPlayer: function () {
      var w = G.world; if (!w) return null;
      if (G.aim && G.aim.active && G.aim.mode === "pull") {
        return { x: w.lastRest.x + G.aim.pull.x, y: w.lastRest.y + G.aim.pull.y };
      }
      return { x: w.ball.x, y: w.ball.y };
    },
    start: function () { startRound(); },
    fields: {
      hole: function () { return G.hole + 1; },
      holes: function () { return C.HOLES.length; },
      par: function () { return C.HOLES[G.hole].par; },
      strokes: function () { return G.world ? G.world.strokes : 0; },
      phase: function () { return G.world ? G.world.phase : "aim"; },
      power: function () { return G.aim.power; },
      speed: function () { return G.world ? Math.hypot(G.world.ball.vx, G.world.ball.vy) : 0; },
      putts: function () { return G.putts; },
      bestRound: function () { return G.bestRound; },
      stars: function () { return G.results.reduce(function (s, r) { return s + (r ? r.stars : 0); }, 0); },
      device: function () { return input.deviceName(); },
      muted: function () { return A.muted; },
      card: function () { return G.mode === "card"; }
    }
  });

  // ---------------------------------------------------------------- boot
  R.fit(canvas);
  layout();
  refreshHint();
  if (G.bestRound != null) $("titleBest").textContent = "BEST ROUND: " + G.bestRound + " STROKES";
  G.world = P.createWorld(0);
  G.demoFor = 0;
  syncHud();
  show("title");

  window.addEventListener("resize", function () { R.fit(canvas); layout(); });
  window.addEventListener("orientationchange", function () { setTimeout(function () { R.fit(canvas); layout(); }, 120); });

  var qs = new URLSearchParams(location.search);
  if (qs.get("autostart") === "1") startRound();

  requestAnimationFrame(frame);
})();
