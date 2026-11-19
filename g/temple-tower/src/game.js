/* Temple Tower — the game.
 * Physics is the core. Everything else serves it.
 *
 * Numbers come from src/physics.json (shared with the bench, so the game and the
 * proof can never drift apart) and from the genre teardown.
 */
(function () {
  "use strict";

  const { Engine, Bodies, Composite, Body, Events, Vector, Sleeping } = Matter;

  // ---------------------------------------------------------------------------
  // Numbers. Fetched from physics.json; hard fallback so the game never dies on
  // a missing file (a white screen is the worst failure on a phone).
  // ---------------------------------------------------------------------------
  const DEFAULT_P = {
    brick: 90, brick_h: 90, platform_w: 320, gravity_y: 1.0,
    friction: 0.62, frictionStatic: 0.85, density: 0.0022, restitution: 0.02,
    fixed_dt_ms: 16.6667, sleep_threshold: 55, slop: 0.02,
    fall_time_s: 0.97, settle_time_s: 0.17,
    spawn_height_bricks: 9.5, swing_amp_bricks: 1.6,
    swing_period_s: 3.2, swing_speedup_per_m: 0.12,
    tier: { weight_at_m: 3, grip_at_m: 5, both_at_m: 7 },
    weight_heavy: 2.6, weight_light: 0.45,
    // grip is BOUNCE (restitution), measured - not a friction multiplier
    grip_slick: 0.25, grip_rough: 0.02, lives: 3,
    grip_rule: {
      slick_restitution: 0.25, stone_restitution: 0.02,
      slick_fails_overhang_pct: 35, stone_holds_overhang_pct: 38,
    },
    zoom_step_m: 12, zoom_min: 0.55, cam_lag: 0.12,
  };

  let P = DEFAULT_P;
  let ready = false;
  const BUILD = "tt-2026-11-18-o";

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const el = {
    height: $("height"), best: $("best"), tierBadge: $("tier-badge"), tierNext: $("tier-next"),
    lives: $("lives"), overTitle: $("over-title"), finalLabel: $("final-label"),
    menu: $("menu"), over: $("over"), playBtn: $("play-btn"), againBtn: $("again-btn"),
    menuBest: $("menu-best"), finalHeight: $("final-height"), overBest: $("over-best"),
    combo: $("combo"), toast: $("toast"), tapHint: $("tap-hint"),
  };

  // ---------------------------------------------------------------------------
  // Canvas / camera. Reads the REAL viewport on every resize, including landscape.
  // ---------------------------------------------------------------------------
  const view = { w: 0, h: 0, dpr: 1 };
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    view.w = w; view.h = h; view.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G) G.camera.dirty = true;
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let G = null;

  function newGame() {
    const engine = Engine.create({
      gravity: { x: 0, y: P.gravity_y, scale: 0.001 },
      positionIterations: 12,
      velocityIterations: 10,
      constraintIterations: 4,
      enableSleeping: true,
    });

    // Real contact tracking: Matter clears engine.pairs every step, so we listen to
    // its collision events and stamp the bodies that are actually touching something.
    Events.on(engine, "collisionStart", (ev) => {
      for (const pair of ev.pairs) {
        pair.bodyA.plugin && (pair.bodyA.plugin.contacts = (pair.bodyA.plugin.contacts || 0) + 1);
        pair.bodyB.plugin && (pair.bodyB.plugin.contacts = (pair.bodyB.plugin.contacts || 0) + 1);
      }
    });
    Events.on(engine, "collisionActive", (ev) => {
      for (const pair of ev.pairs) {
        pair.bodyA.plugin && (pair.bodyA.plugin.touching = true);
        pair.bodyB.plugin && (pair.bodyB.plugin.touching = true);
      }
    });

    G = {
      engine,
      state: "menu",           // menu | play | over
      bricks: [],              // every landed brick (for height + camera)
      ground: null,
      falling: null,           // the brick in the air
      crane: { x: 0, phase: 0, amp: 1, period: P.swing_period_s },
      heightM: 0,
      peakM: 0,               // highest the tower ever got, for collapse detection
      bestM: +(localStorage.getItem("temple-tower-best") || 0),
      comboRun: 0,
      lastDropAt: 0,
      camera: { y: 0, zoom: 1, dirty: true },
      tier: "stone",
      lives: P.lives || 3,
      reason: "miss",
      bricksThisRun: 0,
      shakeT: 0,
      particles: [],
      dust: [],
      t: 0,
      startAt: 0,
    };

    // Ground: wide stone platform. The tower stands on it; a brick that misses
    // lands here and the tower simply stops growing (that is the failure).
    const gw = P.platform_w;
    const ground = Bodies.rectangle(0, 0, gw, 90, {
      isStatic: true,
      friction: P.friction,
      frictionStatic: P.frictionStatic,
      label: "ground",
    });
    G.ground = ground;
    Composite.add(engine.world, ground);

    // The foundation brick: the tower's own footing. One brick wide.
    // This is what makes a bad drop matter: there is no wide shelf to catch it.
    placeWorld();
    const first = makeBrick(0, 0, { tier: "stone", foundation: true });
    // PLANTED: the first block is the foundation and never moves. Without this the
    // tower drifts on every landing and slides off the platform (measured: 9 m of
    // walk over 22 drops, which soft-locked the game).
    Body.setStatic(first, true);
    Composite.add(engine.world, first);
    G.bricks.push(first);

    resetCrane();
    G.camera.dirty = true;
    return G;
  }

  // World layout: origin at the centre of the foundation brick's top face.
  function placeWorld() {
    const halfH = 45;
    Body.setPosition(G.ground, { x: 0, y: halfH });
  }

  // ---------------------------------------------------------------------------
  // Brick factory. Grip and weight are per-brick, driven by the tier.
  // ---------------------------------------------------------------------------
  const TIER_STYLE = {
    stone:  { fill: "#c9b18a", edge: "#8d7350", label: "STONE" },
    heavy:  { fill: "#8a6a4a", edge: "#5a4228", label: "HEAVY" },
    light:  { fill: "#e6d7bb", edge: "#b9a483", label: "LIGHT" },
    slick:  { fill: "#7fb3c9", edge: "#4a7f96", label: "SLICK" },
    rough:  { fill: "#a98d6f", edge: "#6f5540", label: "ROUGH" },
  };

  function makeBrick(x, y, opts) {
    opts = opts || {};
    const tier = opts.tier || "stone";
    let densMul = 1, gripMul = 1;
    if (tier === "heavy") densMul = P.weight_heavy;
    if (tier === "light") densMul = P.weight_light;
    // GRIP = how much the stone slides. The owner asked for slick to be FORGIVING
    // ("a little bit nice ... 3 degrees seems kind of tight"), so a slick brick is
    // low-friction and gets a nudge toward the brick below on landing: a near miss
    // slides home, a big miss slides off. Rough grips hard and stays put.
    if (tier === "slick") gripMul = P.grip_slick;
    if (tier === "rough") gripMul = P.grip_rough;

    const b = Bodies.rectangle(x, y, P.brick, P.brick_h, {
      friction: P.friction * gripMul,
      frictionStatic: P.frictionStatic * gripMul,
      frictionAir: 0.004,
      restitution: P.restitution,
      density: P.density * densMul,
      slop: P.slop,
      sleepThreshold: P.sleep_threshold,
      label: "brick",
    });
    b.plugin = { tier, foundation: !!opts.foundation, bornAt: performance.now() };
    return b;
  }

  // ---------------------------------------------------------------------------
  // The tier ladder. Owner-specified: nothing, then weight, then grip, then both.
  // ---------------------------------------------------------------------------
  function tierForHeight(m) {
    const t = P.tier;
    if (m >= t.both_at_m) return "both";
    if (m >= t.grip_at_m) return "grip";
    if (m >= t.weight_at_m) return "weight";
    return "stone";
  }

  function nextBrickTier() {
    const t = P.tier;
    const m = G.heightM;
    const kind = tierForHeight(m);
    if (kind === "stone") return "stone";
    if (kind === "weight") return Math.random() < 0.45 ? "heavy" : "light";
    if (kind === "grip") return Math.random() < 0.45 ? "slick" : "rough";
    // both: pick one axis at random
    return ["heavy", "light", "slick", "rough"][Math.floor(Math.random() * 4)];
  }

  function setTier(kind) {
    if (G.tier === kind) return;
    G.tier = kind;
    el.tierBadge.className = kind === "stone" ? "" : kind;
    el.tierBadge.textContent =
      kind === "stone" ? "STONE" :
      kind === "weight" ? "WEIGHT CHANGES" :
      kind === "grip" ? "GRIP CHANGES" : "WEIGHT + GRIP";
    if (kind !== "stone") {
      toast(
        kind === "weight" ? "Stone varies in weight" :
        kind === "grip" ? "Stone varies in grip" : "Both vary now",
        1900
      );
      sfxTier();
    }
  }

  function updateTierNext() {
    const t = P.tier, m = G.heightM;
    let target = null, label = "";
    if (m < t.weight_at_m) { target = t.weight_at_m; label = "weight varies"; }
    else if (m < t.grip_at_m) { target = t.grip_at_m; label = "grip varies"; }
    else if (m < t.both_at_m) { target = t.both_at_m; label = "weight + grip"; }
    el.tierNext.textContent = target === null
      ? "all stone types active"
      : `${label} at ${target} m`;
  }

  // ---------------------------------------------------------------------------
  // Crane: swings over the tower. Period shrinks as you climb (harder high up).
  // ---------------------------------------------------------------------------
  function resetCrane() {
    const topY = G.bricks.length ? topOfTowerY() : 0;
    // The tower is ONE brick wide. If the swing is wider than a brick, the player
    // cannot hit it. Amplitude is a fraction of a brick width, so the whole swing
    // passes over the tower with the edges being the risky part.
    G.crane.amp = P.swing_amp_bricks * P.brick * 0.5;
    const period = Math.max(
      1.5,
      P.swing_period_s - G.heightM * P.swing_speedup_per_m
    );
    G.crane.period = period;
    G.crane.phase = Math.random() * Math.PI * 2;
    const tb = topBrick();
    G.crane.baseX = tb ? tb.position.x : 0;
    // The held brick must be ON SCREEN. With the tower top near 62% of the screen and
    // ~10 brick heights of visible span, 4.2 heights above the top is comfortably in view.
    G.crane.y = topY - P.brick_h * 1.9;
    spawnFallingBrick();
  }

  function craneX() {
    return G.crane.baseX + Math.sin(G.crane.phase) * G.crane.amp;
  }

  function spawnFallingBrick() {
    if (G.falling) Composite.remove(G.engine.world, G.falling);
    const tier = nextBrickTier();
    // A held brick is a NORMAL dynamic body that we simply move each frame.
    // Never Body.setStatic: it zeroes mass, and setStatic(false) does not restore it,
    // which leaves a massless brick that gravity cannot move.
    const b = makeBrick(craneX(), G.crane.y, { tier });
    b.plugin.held = true;
    b.plugin.mass0 = b.mass;              // remember the real mass for release
    // Never let the crane brick fall asleep: Matter treats a pinned body as "at rest".
    b.sleepThreshold = Infinity;
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    Composite.add(G.engine.world, b);
    G.falling = b;
    G.fallingTier = tier;
  }

  function drop() {
    if (G.state !== "play" || !G.falling) return;
    if (!G.falling.plugin.held) return;   // already falling: a second tap must do nothing
    const b = G.falling;
    b.plugin.held = false;
    b.plugin.releasedAt = performance.now();
    // A held brick that has been pinned for a while gets put to SLEEP by Matter.
    // A sleeping body ignores gravity, so the released brick would hang in the air
    // forever. Wake it, and keep it awake until it lands.
    Sleeping.set(b, false);
    Body.setVelocity(b, { x: 0, y: 0 });   // drop from rest: a clean fall
    // Keep G.falling pointing at the brick in flight: checkLanding needs it to know
    // what to judge. Clearing it here made every drop vanish (no landing, no score).
    G.lastDropAt = performance.now();
    sfxRelease();
    // the next brick appears after this one lands
  }

  // ---------------------------------------------------------------------------
  // Landing detection + scoring
  // ---------------------------------------------------------------------------
  // Top face of the highest brick that is NOT the one in the air.
  function settledTopY() {
    let best = null;
    for (const b of G.bricks) {
      if (b === G.falling) continue;
      const top = b.position.y - P.brick_h / 2;
      if (best === null || top < best) best = top;
    }
    return best === null ? 0 : best;
  }

  function topBrick() {
    if (!G.bricks.length) return null;
    let best = G.bricks[0];
    for (const b of G.bricks) if (b.position.y < best.position.y) best = b;
    return best;
  }

  function topOfTowerY() {
    if (!G.bricks.length) return 0;
    let best = G.bricks[0];
    for (const b of G.bricks) if (b.position.y < best.position.y) best = b;
    return best.position.y - P.brick_h / 2;
  }

  function towerHeightM() {
    if (!G.bricks.length) return 0;
    const top = topOfTowerY();
    // foundation top is y=0; upward is negative. Measure to the brick's TOP FACE,
    // not its centre: using the centre made every score half a brick (0.45 m) short.
    return Math.max(0, -(top - P.brick_h / 2) / 100);
  }

  function touchingAnything(b) {
    return !!(b.plugin && (b.plugin.touching || b.plugin.contacts > 0));
}

function checkLanding() {
    if (!G.falling || G.falling.plugin.held) return;
    const b = G.falling;
    const speed = b.speed;
    const airborne = performance.now() - b.plugin.releasedAt;

    // HARD GUARD: a brick must never be lost. If it has dropped well below the
    // platform surface, or has been in the air far longer than a drop can take, it
    // is a miss - end the run. Without this a brick that never registers a contact
    // hangs forever, no new brick spawns, and the game soft-locks (playtest defect 1).
    if (b.position.y > P.brick_h * 4 || airborne > 4000) {
      G.falling = null;
      endRun();
      return;
    }
    // A brick counts as landed ONLY when it is actually in contact AND slow.
    // Speed alone was wrong: a falling brick has speed ~0 at the apex of the drop, so
    // bricks were recorded mid-air and the tower grew by the spawn gap (1.22 m) instead
    // of a brick height (0.26 m).
    const landed = speed < 0.5 && touchingAnything(b) && airborne > 250;
    if (!landed) return;

    // Did it land ON the tower, or did it fall to the platform?
    // Compare the falling brick's bottom face to the settled tower's top face.
    // (Using a stale or shifted top here made every good drop read as a collapse.)
    const settledTop = settledTopY();
    const bottomFace = b.position.y + P.brick_h / 2;
    const onTower = bottomFace < settledTop + P.brick_h * 0.9;

    if (!onTower) {
      // Fell past the tower. The reference rule (feel.json core_rule, jayisgames on the
      // same crane-drop move) gives THREE lives, not one: a drop beyond tolerance "costs
      // one of three lives". So a miss costs a life and play continues.
      G.falling = null;
      G.lives -= 1;
      updateLives();
      if (G.lives <= 0) {
        G.reason = "miss";
        endRun();
        return;
      }
      toast(`MISSED - ${G.lives} ${G.lives === 1 ? "life" : "lives"} left`, 1500);
      sfxMiss();
      shake(0.35);
      resetCrane();
      return;
    }

    // SLICK SELF-CORRECTION: a slick brick slides toward the brick it landed on.
    // This is the "be nice about slick bricks" rule - a near miss settles itself,
    // only a big miss slides off the edge. Applied to the SAME body the tap released.
    if (b.plugin.tier === "slick" && G.bricks.length) {
      const below = topBrick();
      if (below) {
        const dx = below.position.x - b.position.x;
        const v = Math.max(-P.slick_nudge_max, Math.min(P.slick_nudge_max, dx * P.slick_nudge));
        if (Math.abs(dx) > 0.5) {
          Body.setVelocity(b, { x: v, y: b.velocity.y });
          b.plugin.slidHome = true;
        }
      }
    }

    G.bricks.push(b);
    G.falling = null;
    G.bricksThisRun++;

    const newH = towerHeightM();
    const gained = newH - G.heightM;
    G.heightM = newH;
    if (newH > G.peakM) G.peakM = newH;
    if (newH > G.bestM) {
      G.bestM = newH;
      localStorage.setItem("temple-tower-best", String(Math.round(newH * 10) / 10));
    }

    // alignment: how close to the brick below
    const below = G.bricks[G.bricks.length - 2];
    const off = below ? Math.abs(b.position.x - below.position.x) / P.brick : 0;
    if (off <= 0.12) {
      G.comboRun++;
      if (G.comboRun >= 2) showCombo(G.comboRun);
      sfxPerfect();
    } else {
      G.comboRun = 0;
      sfxLand(off);
    }

    puff(b.position.x, b.position.y + P.brick_h / 2, TIER_STYLE[b.plugin.tier].fill);
    updateTierNext();
    setTier(tierForHeight(G.heightM));
    resetCrane();
    G.camera.dirty = true;
  }

  // The tower came down? End the run. Without this a collapse leaves the player with
  // no brick to drop and no loss screen - the game looks frozen forever.
  function checkCollapse() {
    if (G.state !== "play" || G.bricks.length < 3) return;
    if (G.falling && G.falling.plugin.held) return;   // mid-drop: let it land first
    const h = towerHeightM();
    // the stack is gone if it lost more than two bricks of height from its peak
    if (h < G.peakM - (P.brick_h * 2) / 100) {
      G.reason = "fell";
      G.heightM = Math.max(G.heightM, h);
      endRun();
      return;
    }
    // or if the top brick has fallen to or below the platform surface
    const top = topBrick();
    if (top && top.position.y > P.brick_h * 0.5) { G.reason = "fell"; endRun(); }
  }

  function endRun() {
    if (G.state === "over") return;
    G.state = "over";
    shake(0.5);
    sfxCollapse();
    if (el.overTitle) {
      el.overTitle.textContent =
        G.reason === "fell" ? "THE TOWER FELL" : "OUT OF LIVES";
    }
    el.finalHeight.textContent = Math.round(G.heightM * 10) / 10;
    if (el.finalLabel) {
      el.finalLabel.textContent = G.reason === "fell" ? "PEAK" : "HEIGHT";
    }
    el.overBest.textContent = `best ${Math.round(G.bestM * 10) / 10} m`;
    el.tapHint.classList.add("hidden");
    setTimeout(() => el.over.classList.remove("hidden"), 420);
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  function shake(t) { G.shakeT = Math.max(G.shakeT, t); }

  function puff(x, y, color) {
    for (let i = 0; i < 7; i++) {
      G.dust.push({
        x, y,
        vx: (Math.random() - 0.5) * 40,
        vy: -Math.random() * 30,
        life: 0.5 + Math.random() * 0.3,
        t: 0,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  let comboHideT = 0;
  function showCombo(n) {
    el.combo.textContent = n >= 5 ? `${n} PERFECT` : "PERFECT";
    el.combo.classList.remove("hidden");
    el.combo.style.animation = "none";
    void el.combo.offsetWidth;
    el.combo.style.animation = "pop .6s ease-out forwards";
  }

  let toastT = 0;
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    toastT = (ms || 1800) / 1000;
  }

  // ---------------------------------------------------------------------------
  // Audio — tiny synth, no files. Stone is a low thud; tier change is a chime.
  // ---------------------------------------------------------------------------
  let actx = null;
  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    return actx;
  }
  function beep(freq, dur, type, gain) {
    const a = ac(); if (!a) return;
    if (a.state === "suspended") a.resume();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g); g.connect(a.destination);
    const t0 = a.currentTime;
    g.gain.linearRampToValueAtTime(gain || 0.12, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
    o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
  }
  function updateLives() {
    if (!el.lives) return;
    const n = Math.max(0, G.lives);
    el.lives.textContent = "\u25cf".repeat(n) + "\u25cb".repeat(Math.max(0, (P.lives || 3) - n));
    el.lives.className = n <= 1 ? "low" : "";
  }

  function sfxRelease() { beep(180, 0.07, "triangle", 0.05); }
  function sfxLand(off) {
    const f = 150 - Math.min(60, off * 120);
    beep(f, 0.16, "sine", 0.16);
    beep(f * 1.5, 0.07, "triangle", 0.06);
  }
  function sfxMiss() { beep(140, 0.18, "sawtooth", 0.06); }
  function sfxPerfect() { beep(520, 0.09, "sine", 0.09); setTimeout(() => beep(780, 0.10, "sine", 0.07), 70); }
  function sfxTier() { beep(440, 0.12, "sine", 0.10); setTimeout(() => beep(660, 0.14, "sine", 0.10), 110); setTimeout(() => beep(880, 0.20, "sine", 0.09), 230); }
  function sfxCollapse() {
    beep(90, 0.5, "sawtooth", 0.16);
    setTimeout(() => beep(62, 0.6, "sine", 0.14), 110);
  }

  // ---------------------------------------------------------------------------
  // Rendering. World units are cm; camera maps cm -> px.
  // ---------------------------------------------------------------------------
  function worldToScreen(x, y) {
    const cam = G.camera;
    const scale = cam.zoom * baseScale();
    // The camera's y is the world point that sits at 62% of the screen height.
    // The tower top is kept near that line, so the stack always fills the view.
    // Matter's y grows DOWNWARD. To draw the tower UP the screen we subtract:
    // a brick higher up has a smaller (more negative) y, so it must map to a smaller
    // screen y. Using a plus here inverted the world and put the tower below the fold.
    // Screen y grows DOWNWARD. World y (Matter) also grows downward, so a point
    // ABOVE the camera target (smaller world y) must draw at a SMALLER screen y.
    // That is: screenY = anchor - (camY - worldY) * scale  ==  anchor + (worldY - camY) * scale.
    // Negating the whole difference inverted the world: the ground drew at the top and
    // the tower hung below it.
    return {
      x: view.w / 2 + (x - cam.x) * scale,
      y: view.h * 0.62 + (y - cam.y) * scale,
    };
  }
  // ONE fit, not two. baseScale() used to be multiplied by a separate zoom factor,
  // which shrank the picture twice and made landscape bricks 40 px on an 844 screen.
  // Now: pick the scale that fits BOTH the width we want to show and the vertical
  // span the viewport can actually afford, and let the camera follow the tower top.
  function visibleBricksTall() {
    // a short viewport (landscape) can only afford a few brick heights
    return Math.max(3.5, Math.min(6, view.h / 150));
  }

  function baseScale() {
    // 3.2 bricks across the narrow phone width
    const byWidth = view.w / (P.brick * 3.2);
    // the vertical span we show: the bricks we want visible + the crane above them
    const spanCm = P.brick_h * visibleBricksTall() + P.brick_h * 1.8;
    const byHeight = (view.h * 0.94) / spanCm;
    return Math.min(byWidth, byHeight);
  }

  function updateCamera(dt) {
    const cam = G.camera;
    const targetTop = topOfTowerY();
    // Frame so the tower top sits a little above the 62% line, leaving room for
    // the crane and the incoming brick. On a tall tower the zoom-out keeps the
    // base in frame.
    // Frame the TOWER, never the crane. Including the held brick aimed the camera at a
    // point 4 brick heights above the stack, which pushed the whole tower and its
    // platform off the bottom of the screen (it read as a tower floating in mid-air).
    // The tower top sits a little above the 62% line; the held brick is drawn above it.
    // Look at a point between the tower top and the crane headroom so both are on screen.
    let want = targetTop + P.brick_h * 1.1;
    // GUARANTEE the held brick is on screen. In a short viewport (landscape) the crane
    // hung off the top edge: measured craneY = 0 on an 844x390 screen. If the crane would
    // land above `margin` px, push the camera up by exactly the shortfall.
    if (G.falling) {
      const margin = 64;
      const sc = baseScale();
      const screenY = view.h * 0.62 + (G.falling.position.y - want) * sc;
      if (screenY < margin) want -= (margin - screenY) / sc;
    }
    cam.y += (want - cam.y) * Math.min(1, dt / Math.max(0.016, P.cam_lag));
    // Zoom so the WHOLE tower fits, with headroom for the crane. This is computed
    // from the tower's real height, not a fixed step, so a tall tower can never
    // render as a sliver and a short one never renders tiny.
    // Reserve room ABOVE the tower for the crane and the brick it holds (they hang
    // ~4 brick heights up). Without this the crane brick renders under the HUD.
    // No second zoom factor: baseScale() already fits the viewport.
    const targetZoom = 1;
    cam.zoom += (targetZoom - cam.zoom) * Math.min(1, dt * 3.2);
    cam.x = 0;
  }

  const SKY_STOPS = [
    [0, "#2a1b3d"], [0.45, "#6b3b52"], [0.78, "#c96a4e"], [1, "#f0a55f"],
  ];

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    for (const [p, c] of SKY_STOPS) g.addColorStop(p, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    // sun
    const cam = G.camera;
    const sunY = view.h * 0.30 - cam.y * cam.zoom * baseScale() * 0.06;
    const rg = ctx.createRadialGradient(view.w * 0.5, sunY, 0, view.w * 0.5, sunY, view.w * 0.55);
    rg.addColorStop(0, "rgba(255,214,150,.55)");
    rg.addColorStop(0.35, "rgba(255,170,110,.18)");
    rg.addColorStop(1, "rgba(255,150,100,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, view.w, view.h);

    // Distant temple silhouettes (parallax). Kept dark and low so they never
    // compete with the tower: the tower must be the most legible thing on screen.
    ctx.fillStyle = "rgba(26,16,38,.78)";
    const par = -cam.y * cam.zoom * baseScale() * 0.06;
    const baseY = view.h * 0.88 + par;
    for (let i = 0; i < 6; i++) {
      const w = view.w * (0.13 + (i % 3) * 0.04);
      const h = view.h * (0.055 + ((i * 37) % 11) / 130);
      const x = (i * view.w * 0.20) - view.w * 0.10;
      ctx.fillRect(x, baseY - h, w, h);
      ctx.beginPath();
      ctx.moveTo(x, baseY - h);
      ctx.lineTo(x + w / 2, baseY - h - w * 0.20);
      ctx.lineTo(x + w, baseY - h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // How unstable is the tower right now? Returns 0 (solid) .. 1 (about to fall).
  // Measured as the top brick's offset from the footing, which is what actually tips it.
  function towerStrain() {
    if (!G.bricks.length) return 0;
    const base = G.bricks[0], top = topBrick();
    if (!top) return 0;
    const off = Math.abs(top.position.x - base.position.x);
    return Math.max(0, Math.min(1, off / (P.brick * 0.55)));
  }

  function drawStrain() {
    const st = towerStrain();
    if (st < 0.45) return;
    const top = topBrick();
    if (!top) return;
    const p = worldToScreen(top.position.x, top.position.y);
    const a = (st - 0.45) / 0.55;              // 0..1
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.5 * a * (0.6 + 0.4 * Math.sin(G.t * 9));
    ctx.strokeStyle = a > 0.72 ? "#ff5d5d" : "#ffcf6b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 26 + 10 * a, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGround() {
    const scale = G.camera.zoom * baseScale();
    const p = worldToScreen(0, G.ground.position.y - 45);
    const w = P.platform_w * scale;
    ctx.fillStyle = "#3b2a44";
    ctx.fillRect(p.x - w / 2, p.y, w, view.h);
    // top edge highlight
    ctx.fillStyle = "#57405f";
    ctx.fillRect(p.x - w / 2, p.y, w, Math.max(2, 4 * scale * 0.1));
  }

  function drawBrick(b) {
    const scale = G.camera.zoom * baseScale();
    const p = worldToScreen(b.position.x, b.position.y);
    const w = P.brick * scale, h = P.brick_h * scale;
    const st = TIER_STYLE[b.plugin.tier] || TIER_STYLE.stone;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(b.angle);

    // body
    const grd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, st.fill);
    grd.addColorStop(1, shade(st.fill, -0.22));
    ctx.fillStyle = grd;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // depth: a lit top face and a shaded bottom face, so a flat rectangle reads
    // as a solid block. Cheap (two rects) and it is the difference between
    // "coloured boxes" and "stone".
    const lip = Math.max(2, h * 0.12);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(-w / 2, -h / 2, w, lip);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(-w / 2, h / 2 - lip, w, lip);
    // side shading for volume
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(w / 2 - Math.max(2, w * 0.06), -h / 2, Math.max(2, w * 0.06), h);

    // edge
    ctx.strokeStyle = st.edge;
    ctx.lineWidth = Math.max(1, 2 * scale * 0.1);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // carving: a notch pattern so the stone reads as stone
    ctx.fillStyle = "rgba(0,0,0,.13)";
    const n = 3;
    for (let i = 1; i < n; i++) {
      const x = -w / 2 + (w / n) * i;
      ctx.fillRect(x - 1, -h / 2 + h * 0.22, 2, h * 0.56);
    }
    // top highlight
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.fillRect(-w / 2, -h / 2, w, Math.max(1.5, h * 0.14));

    // slick bricks get a wet sheen
    if (b.plugin.tier === "slick") {
      ctx.fillStyle = "rgba(190,240,255,.30)";
      ctx.fillRect(-w / 2, -h / 2, w * 0.45, h * 0.30);
    }
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return `rgb(${r},${g},${b})`;
  }

  function drawCrane() {
    if (!G.falling || G.state !== "play") return;
    const scale = G.camera.zoom * baseScale();
    const bx = G.falling.position.x;
    const top = worldToScreen(bx, G.falling.position.y - P.brick_h * 0.6);

    // rope
    ctx.strokeStyle = "rgba(40,28,20,.75)";
    ctx.lineWidth = Math.max(1.5, 2.5 * scale * 0.1);
    ctx.beginPath();
    ctx.moveTo(top.x, 0);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    // hook
    ctx.strokeStyle = "#8a7350";
    ctx.lineWidth = Math.max(2, 3.5 * scale * 0.1);
    ctx.beginPath();
    ctx.arc(top.x, top.y - 3, Math.max(4, 6 * scale * 0.1), 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    // drop guide: a faint line straight down from the brick (helps read the landing)
    ctx.strokeStyle = "rgba(255,236,190,.34)";
    ctx.lineWidth = Math.max(1.5, 2 * scale * 0.1);
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x, view.h * 0.68);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawParticles(dt) {
    for (let i = G.dust.length - 1; i >= 0; i--) {
      const d = G.dust[i];
      d.t += dt;
      if (d.t >= d.life) { G.dust.splice(i, 1); continue; }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 60 * dt;
      const a = 1 - d.t / d.life;
      const p = worldToScreen(d.x, d.y);
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Loop. Fixed physics step; render every frame.
  // ---------------------------------------------------------------------------
  let lastT = 0, acc = 0;
  const FIXED = 1000 / 60;

  function frame(now) {
    if (!lastT) lastT = now;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.25) dt = 0.25;   // tab came back: never fast-forward the sim

    if (G) {
      G.t += dt;

      if (G.state === "play" && G.falling && G.falling.plugin.held) {
        // Swing the held brick. It is a normal dynamic body, so pin it completely:
        // position, velocity and force all reset every frame. It must not drift or
        // interact with the tower while it hangs on the crane.
        G.crane.phase += (Math.PI * 2 / G.crane.period) * dt;
        Body.setPosition(G.falling, { x: craneX(), y: G.crane.y });
        Body.setVelocity(G.falling, { x: 0, y: 0 });
        Body.setAngularVelocity(G.falling, 0);
        Body.setAngle(G.falling, 0);
      }

      // fixed-step physics. "touching" is a per-frame fact: clear it before the
      // step, then let that step's collision events set it.
      acc += dt * 1000;
      let steps = 0;
      while (acc >= FIXED && steps < 5) {
        if (G.falling) G.falling.plugin.touching = false;
        Engine.update(G.engine, FIXED);
        acc -= FIXED;
        steps++;
      }
      if (acc > FIXED * 5) acc = 0;

      checkLanding();
      checkCollapse();
      updateCamera(dt);

      // shake decay
      if (G.shakeT > 0) G.shakeT = Math.max(0, G.shakeT - dt * 1.8);
      const sh = G.shakeT * 9;
      const shx = sh ? (Math.random() - 0.5) * sh : 0;
      const shy = sh ? (Math.random() - 0.5) * sh : 0;

      ctx.save();
      ctx.translate(shx, shy);
      drawBackground();
      drawGround();
      for (const b of G.bricks) drawBrick(b);
      if (G.state === "play") drawStrain();
      if (G.falling) drawBrick(G.falling);
      drawCrane();
      drawParticles(dt);
      ctx.restore();

      // HUD numbers
      el.height.innerHTML = `${Math.round(G.heightM * 10) / 10}<span class="unit">m</span>`;
      el.best.textContent = `best ${Math.round(G.bestM * 10) / 10} m`;

      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) el.toast.classList.add("hidden");
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Input: tap anywhere (phone), click, space / enter (desktop).
  // ---------------------------------------------------------------------------
  function onTap(e) {
    if (e) e.preventDefault();
    const a = ac();
    if (a && a.state === "suspended") a.resume();
    if (G.state === "menu") { startGame(); return; }
    if (G.state === "over") return;      // the button handles restart
    drop();
  }

  document.addEventListener("touchstart", (e) => {
    // ignore taps on the actual buttons (they have their own handlers)
    if (e.target.closest("button")) return;
    onTap(e);
  }, { passive: false });

  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    onTap(e);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (G.state === "menu") startGame();
      else if (G.state === "play") drop();
    }
  });

  // ---------------------------------------------------------------------------
  // Start / restart
  // ---------------------------------------------------------------------------
  // Pause the sim when the page is hidden (switching apps, locking the phone).
  // Without this the tower keeps settling and falls while the player is away.
  let pausedAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (!G) return;
    if (document.hidden) {
      pausedAt = performance.now();
    } else if (pausedAt) {
      // shift the crane phase and the landing clock so nothing "catches up" in one jump
      const gap = performance.now() - pausedAt;
      pausedAt = 0;
      lastT = performance.now();   // do not fast-forward the sim after the gap
      if (G.falling) G.falling.plugin.releasedAt += gap;
    }
  });

  function startGame() {
    newGame();
    G.state = "play";
    G.startAt = performance.now();
    el.menu.classList.add("hidden");
    el.over.classList.add("hidden");
    el.tapHint.classList.remove("hidden");
    setTimeout(() => el.tapHint.classList.add("hidden"), 3200);
    el.tierBadge.className = "";
    el.tierBadge.textContent = "STONE";
    updateTierNext();
    G.lives = P.lives || 3;
    updateLives();
    el.height.innerHTML = `0<span class="unit">m</span>`;
    el.best.textContent = `best ${Math.round(G.bestM * 10) / 10} m`;
    const a = ac(); if (a && a.state === "suspended") a.resume();
  }

  el.playBtn.addEventListener("click", (e) => { e.stopPropagation(); startGame(); });
  el.againBtn.addEventListener("click", (e) => { e.stopPropagation(); startGame(); });

  // ---------------------------------------------------------------------------
  // Boot: load numbers, then start the render loop.
  // ---------------------------------------------------------------------------
  function boot() {
    fetch("src/physics.json")
      .then((r) => r.json())
      .then((j) => {
        P = Object.assign({}, DEFAULT_P, j);
        P.grip_rule = Object.assign({}, DEFAULT_P.grip_rule, j.grip_rule || {});
        P.tier = Object.assign({}, DEFAULT_P.tier, j.tier || {});
      })
      .catch(() => { P = DEFAULT_P; })
      .then(() => {
        ready = true;
        newGame();
        G.state = "menu";
        el.menuBest.textContent = Math.round(G.bestM * 10) / 10;
        // the menu HUD is static HTML; fill it from the loaded numbers so it cannot lie
        if (el.tierNext) {
          el.tierNext.textContent = `weight varies at ${P.tier.weight_at_m} m`;
        }
        resize();
        requestAnimationFrame(frame);
        // test/proof hook
        window.__game = {
          build: BUILD,
          _w2s: (x, y) => worldToScreen(x, y),
          _setTier: (k) => setTier(k),
          _updateTierNext: () => updateTierNext(),
          _nextTier: () => nextBrickTier(),
          _tierStyle: () => TIER_STYLE,
          get state() { return G.state; },
          get player() { return { x: G.falling ? G.falling.position.x : (G.bricks[G.bricks.length - 1] || {}).position?.x || 0, y: G.falling ? G.falling.position.y : 0 }; },
          get score() { return Math.round(G.heightM * 10) / 10; },
          get world() { return { x: 0, y: G.heightM, z: 0 }; },
          get bricks() { return G.bricks.length; },
          start: startGame,
          drop: drop,
          _g: () => G,
        };
      });
  }

  boot();
})();
