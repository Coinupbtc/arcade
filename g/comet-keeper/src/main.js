// Boot, resize, one loop. arcade-input owns keys, pad, touch actions, pause, audio unlock and the hook.
(function () {
  var cv = document.getElementById("cv");
  var ctx = cv.getContext("2d");
  var W = 0, H = 0;
  CK.DPR = 1;

  function resize() {
    CK.DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    cv.width = Math.round(W * CK.DPR);
    cv.height = Math.round(H * CK.DPR);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
    document.documentElement.style.setProperty("--s", Math.min(W, H) + "px");
    CK.Geom(W, H);
    CK.Draw.build(W, H);
  }

  // One pointer sensor for the game's own aiming verb: the moon's angle from the world.
  // (arcade-input models relative sticks; this game's verb is an absolute angle, so it reads a point.)
  var ptr = { x: 0, y: 0, active: false, t: -99, id: null, down: false };
  function stamp(e) {
    var r = cv.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
    ptr.active = true; ptr.t = performance.now() / 1000;
  }
  cv.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") { ptr.id = e.pointerId; }
    ptr.down = true;
    stamp(e);
    if (e.pointerType === "touch") e.preventDefault();
  }, { passive: false });
  cv.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch" && ptr.id !== null && e.pointerId !== ptr.id) return;
    stamp(e);
    if (e.pointerType === "touch") e.preventDefault();
  }, { passive: false });
  window.addEventListener("pointerup", function (e) { if (e.pointerId === ptr.id) ptr.id = null; ptr.down = false; });
  window.addEventListener("pointercancel", function () { ptr.id = null; ptr.down = false; });

  var input = ArcadeInput.create({
    surface: "#cv",
    actions: ["left", "right"],
    bindings: {
      left: { keys: ["ArrowLeft", "KeyA"] },
      right: { keys: ["ArrowRight", "KeyD"] }
    },
    labels: { primary: "PULSE", left: "TURN", right: "TURN" },
    touchButtons: ["primary"],
    stick: false,
    isRunning: function () { return CK.G.mode === "play"; },
    onPause: function () {
      if (CK.G.mode !== "play") return;
      CK.G.mode = "paused";
      CK.Audio.music(false);
      CK.UI.showPause();
    },
    onResume: function () {
      if (CK.G.mode !== "paused") return;
      CK.G.mode = "play";
      CK.UI.hidePanels();
      CK.Audio.music(true);
    },
    onRefit: resize,
    promptBase: "prompts/"
  });

  input.on("audio", function (c) {
    CK.Audio.init(c);
    if (CK.G.mode === "play") CK.Audio.music(true);
  });

  CK.input = input;

  CK.hintText = function () {
    var d = input.device;
    if (d === "touch") return "DRAG ANYWHERE TO ORBIT";
    if (d === "pad") return "STICK ORBITS \u00b7 A PULSES";
    return "ARROWS TURN \u00b7 SPACE PULSES";
  };

  CK.start = function () {
    if (CK.G.mode === "play") return;
    input.pause.reset();
    CK.newRun();
    CK.G.mode = "play";
    CK.UI.hidePanels();
    CK.startWave(1);
    CK.UI.syncHUD();
    CK.Audio.music(true);
    CK.Audio.play("wave");
    CK.UI.banner("WAVE 1", CK.hintText());
  };

  CK.toTitle = function () {
    CK.G.mode = "menu";
    input.pause.reset();
    CK.Audio.music(false);
    CK.newRun();
    CK.UI.showTitle();
  };

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 120); });

  CK.G.best = CK.loadBest();
  CK.UI.init(input);
  CK.newRun();
  CK.UI.showTitle();
  CK.UI.syncHUD();

  input.installHook({
    getState: function () { return CK.G.mode === "upgrade" ? "paused" : CK.G.mode; },
    getScore: function () { return CK.G.score; },
    getPlayer: function () { var p = CK.moonPos(0); return { x: p.x, y: p.y }; },
    start: function () { CK.start(); },
    restart: function () { CK.start(); },
    fields: {
      wave: function () { return CK.G.wave; },
      cracks: function () { return CK.G.cracks; },
      best: function () { return CK.G.best; },
      comets: function () { return CK.G.comets.length; },
      telegraphs: function () { return CK.G.tele.length; },
      pulseReady: function () { return CK.pulseReady(); },
      moonAngle: function () { return CK.G.moons.length ? CK.G.moons[0].a : 0; },
      deflects: function () { return CK.G.stats.deflects; },
      chains: function () { return CK.G.stats.chains; },
      waveT: function () { return CK.G.waveT; },
      offers: function () { return CK.G.offers.map(function (o) { return o.id; }); },
      mode: function () { return CK.G.mode; }
    }
  });

  var last = performance.now();
  function frame(now) {
    var real = Math.min(0.05, (now - last) / 1000);
    last = now;
    var G = CK.G;
    var f = input.poll();
    if (G.mode === "play") {
      if (f.pressed.primary) CK.firePulse();
      if (G.hitstop > 0) G.hitstop = Math.max(0, G.hitstop - real);
      else CK.update(real, f, ptr);
      CK.UI.syncHUD();
    }
    CK.Draw.frame(ctx, W, H, real);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
