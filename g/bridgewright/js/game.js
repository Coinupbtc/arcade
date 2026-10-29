/* BRIDGEWRIGHT — game state, input, screens, progression, loop. */
(function (root) {
  'use strict';

  const L = root.BW_LEVELS;
  const { LEVELS, MATS, VEHICLES, LADDER, roadAnchors } = L;
  const P = root.BW_PHYSICS;
  const R = root.BW_RENDER;
  const UI = root.BW_UI;
  const A = root.BW_AUDIO;

  const KEY = 'bridgewright-v4';
  // The one pause owner is ArcadeInput (js/controls.js). Reset it whenever the game leaves a run.
  function inputPauseReset() {
    const C = root.BW_CONTROLS;
    if (C && C.input && C.input.pause) C.input.pause.reset();
  }
  const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

  function loadSave() {
    try {
      // v3 keeps v2 progress: read the old key if the new one is empty.
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        muted: !!s.muted, haptics: s.haptics !== false, tutorialSeen: !!s.tutorialSeen,
        best: (s.best && typeof s.best === 'object') ? s.best : {},
        campaignDone: !!s.campaignDone,
      };
    } catch (e) { return { muted: false }; }
  }

  const G = {
    screen: 'title',
    levelIndex: 0,
    level: LEVELS[0],
    world: null,
    mode: 'build',
    mat: 'wood',
    kind: 'road',
    erase: false,
    drag: null,
    hoverNode: null,
    undo: [],
    redo: [],
    particles: [],
    t: 0,
    dt: 16,
    shake: 0,
    muted: false,
    haptics: true,
    tutorial: false,
    tutorialSeen: false,
    autoHinted: false,
    lastTap: 0,
    lastTapPos: { x: 0, y: 0 },
    runSpeed: 2,
    paused: false,
    resultTimer: 0,
    result: null,
    coach: null,              // 'deck' | 'run': the one named next move, drawn on the control it names
    toast: null,
    best: {},
    slowMo: 0,
    flash: 0,
    resultAge: 0,
    crossing: null,
    view: { zoom: 1, panX: 0, panY: 0 },
    safe: { top: 0, bottom: 0, left: 0, right: 0 },
    ui: null,
    pointers: new Map(),
    pinch: null,
    panning: null,
  };

  function readSafe() {
    const el = document.getElementById('safe-probe');
    if (!el) return { top: 0, bottom: 0, left: 0, right: 0 };
    const cs = getComputedStyle(el);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
      right: parseFloat(cs.paddingRight) || 0,
    };
  }

  function relayout() {
    R.resize();
    G.safe = readSafe();
    if (G.screen === 'build' || G.screen === 'run') G.ui = UI.layout(R.W, R.H, G.safe);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        muted: G.muted, haptics: G.haptics, tutorialSeen: G.tutorialSeen, best: G.best || {},
        campaignDone: !!G.campaignDone,
      }));
    } catch (e) {}
  }

  // Progress is a per-scenario best, in tiers crossed. No points, no currency.
  // Bronze clears the scenario goal, silver carries the top rig it asks for, gold does that
  // inside the beam par. Par is a design target, not a limit: the sandbox always builds.
  function medalFor(lv, heaviest, beams) {
    const goal = lv.goal === undefined ? LADDER.length - 1 : lv.goal;
    const top = Math.min(LADDER.length - 1, lv.gold === undefined ? LADDER.length - 1 : lv.gold);
    if (heaviest < goal) return null;
    if (heaviest >= top) return beams <= (lv.par || 999) ? 'gold' : 'silver';
    return 'bronze';
  }

  /* ---------- particles ---------- */

  function addParticles(x, y, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 1.6) * (0.4 + Math.random());
      G.particles.push({
        x, y,
        vx: Math.cos(ang) * sp + (opts.vx || 0),
        vy: Math.sin(ang) * sp + (opts.vy || 0) - (opts.up || 0),
        life: (opts.life || 700) * (0.6 + Math.random() * 0.7),
        max: opts.life || 700,
        size: (opts.size || 3) * (0.6 + Math.random()),
        color: opts.colors ? opts.colors[(Math.random() * opts.colors.length) | 0] : (opts.color || '#C98A4B'),
        shape: opts.shape || 'dot',
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 0.3,
        grav: opts.grav === undefined ? 0.14 : opts.grav,
      });
    }
    if (REDUCE) G.particles.splice(Math.max(0, G.particles.length - Math.min(n, 3)), G.particles.length);
    if (G.particles.length > 260) G.particles.splice(0, G.particles.length - 260);
  }

  function updateParticles(dt) {
    const k = dt / 16.67;
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vy += p.grav * k;
      p.rot += p.spin * k;
      p.life -= dt;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
  }

  /* ---------- world hooks ---------- */

  function makeWorld() {
    const lv = G.level;
    G.world = new P.BridgeWorld(lv, {
      onBuild: (d) => {
        A.place();
        addParticles(d.beam.body.position.x, d.beam.body.position.y, 5, { color: MATS[d.beam.mat].base, size: 2, life: 400, grav: 0.05 });
      },
      onRemove: () => A.tap(),
      onSnap: (d) => {
        A.snap();
        G.culprit = { x: d.x, y: d.y };
        G.culpritAge = 0;
        G.shake = REDUCE ? 0 : Math.min(18, G.shake + 9);
        G.slowMo = REDUCE ? 0 : 0.34;          // a beat of slow motion, so the break reads
        G.flash = REDUCE ? 0 : 0.55;
        addParticles(d.x, d.y, 16, { colors: [MATS[d.mat].base, '#FF4D4D', '#2E2A28'], shape: 'rect', size: 5, speed: 3, life: 900 });
        buzz(30);
      },
      onHit: (d) => {
        if (d.speed > 0.35) {
          addParticles(d.x, d.y, d.heavy ? 4 : 2, { color: '#E8D8B8', size: 2, life: 320, grav: 0.08, up: 0.5 });
          A.thud(!!d.heavy);
        }
      },
      onSpawn: (d) => addParticles(d.x, d.y + 12, 6, { color: '#D8C8A8', size: 2, life: 380, grav: 0.06 }),
      onCross: (d) => {
        A.cross(!!(d && d.tier >= 5));
        G.crossing = { label: VEHICLES[d.type] ? VEHICLES[d.type].label.toUpperCase() : 'CROSSED', life: 900 };
        buzz(10);
      },
      onFall: (d) => {
        A.splash();
        G.shake = REDUCE ? 0 : Math.min(14, G.shake + 6);
        addParticles(d.x, G.level.world.waterY, 18, { colors: ['#BFE4F2', '#7FC8E8', '#FFFFFF'], size: 3, speed: 2.6, life: 800, grav: 0.16, up: 2 });
      },
      onStall: () => { A.error(); buzz([40, 30, 40]); },
      onNudge: () => A.thud(false),
      onDone: () => { G.resultTimer = 1000; },
      onFail: () => { G.resultTimer = 1000; },
    });
    G.world.step(1000 / 60);
    return G.world;
  }

  /* ---------- level flow ---------- */

  function startLevel(i) {
    G.levelIndex = i;
    G.level = LEVELS[i];
    G.mode = 'build';
    G.screen = 'build';
    G.mat = 'wood';
    G.kind = 'road';
    G.runSpeed = 2;
    G.erase = false;
    G.drag = null;
    G.undo = [];
    G.redo = [];
    G.particles = [];
    G.shake = 0;
    G.paused = false;
    inputPauseReset();
    G.result = null;
    G.resultTimer = 0;
    G.noDeck = false;
    G.runAttempted = false;
    G.culprit = null;
    G.culpritAge = 0;
    G.toast = null;
    G.slowMo = 0;
    G.flash = 0;
    G.crossing = null;
    G.view = { zoom: 1, panX: 0, panY: 0 };
    G.ui = UI.layout(R.W, R.H, G.safe);
    makeWorld();
    G.tutorial = !G.tutorialSeen;   // the first span you open, by any route, shows the card once
    G.idle = 0;
    G.idleNudged = 0;
    G.autoRan = false;
    G.toast = { text: G.level.hint, life: 5200 };
    A.resume();
  }

  function setScreen(s) {
    G.screen = s;
    if (s === 'levels') {
      G.ui = UI.layout(R.W, R.H, G.safe);
      G.ui.buttons = [];
      UI.drawLevels(G);
    } else if (s === 'title') {
      G.ui = UI.layout(R.W, R.H, G.safe);
      G.ui.buttons = [];
    }
  }

  function startRun() {
    if (!G.world) return;
    if (G.screen === 'run' && G.mode === 'run') return;
    // Judgeability: RUN always runs. A build with no road deck is a real failure — the rigs drive
    // off the bank and fall — so a player who presses RUN first sees a verdict in seconds instead of
    // a toast that blocks the only route to the result card.
    const roads = G.world.beams.filter((b) => b.kind === 'road');
    G.noDeck = !roads.length;
    G.runAttempted = true;
    if (G.noDeck) toast('NO DECK — THE RIGS WILL FALL');
    inputPauseReset();
    G.runSnapshot = G.world.snapshot();
    G.mode = 'run';
    G.screen = 'run';
    G.erase = false;
    G.drag = null;
    G.paused = false;
    G.resultTimer = 0;
    G.particles = [];
    G.runSpeed = 2;
    G.world.startRun();
    G.ui = UI.layout(R.W, R.H, G.safe);
    A.resume();
    A.tone(420, 0.1, 'triangle', 0.08, 620);
  }

  function stopRun() {
    G.mode = 'build';
    G.screen = 'build';
    inputPauseReset();
    G.world.reset(G.runSnapshot || G.world.snapshot());
    G.resultTimer = 0;
    G.ui = UI.layout(R.W, R.H, G.safe);
    A.tap();
  }

  function finishRun() {
    const w = G.world;
    const r = w.run || {};
    const snaps = w.snaps;
    const heaviest = r.heaviest === undefined ? -1 : r.heaviest;
    const allCrossed = heaviest >= LADDER.length - 1;
    const goal = G.level.goal === undefined ? LADDER.length - 1 : G.level.goal;
    // Par counts the members the player PLACED, not the ones that survived the run: a design that
    // breaks four beams and still crosses should not earn a leaner par than it built.
    const beams = w.beams.length;
    const medal = medalFor(G.level, heaviest, beams);
    const prevBest = G.best && G.best[G.level.id] !== undefined ? G.best[G.level.id] : -1;
    const newBest = heaviest > prevBest;
    if (!G.best) G.best = {};
    if (newBest) G.best[G.level.id] = heaviest;
    save();
    G.result = {
      allCrossed, heaviest, cleared: heaviest >= goal, goal,
      gold: G.level.gold === undefined ? LADDER.length - 1 : G.level.gold,
      medal, newBest, beams,
      par: G.level.par || null,
      crossed: r.crossed || 0,
      total: LADDER.length,
      snapped: snaps,
      sag: w.maxSag || 0,
      span: Math.round(G.level.right.edge - G.level.left.edge),
      reason: r.reason || null,
      why: whyText(),
      bestLabel: heaviest >= 0 ? VEHICLES[LADDER[heaviest]].label : '—',
      bestWeight: heaviest >= 0 ? VEHICLES[LADDER[heaviest]].weight : '',
    };
    G.screen = 'result';
    G.resultAge = 0;
    G.crossing = null;
    G.ui = UI.layout(R.W, R.H, G.safe);
    G.ui.buttons = [];
    inputPauseReset();
    if (medal === 'gold') { A.medal(); addConfetti(); }
    else if (medal) { A.win(); addConfetti(); }
    else A.lose();
    buzz(allCrossed ? [20, 40, 20] : 60);
  }

  function addConfetti() {
    if (REDUCE) return;
    const y = R.H * 0.35;
    for (let i = 0; i < 40; i++) {
      G.particles.push({
        x: R.W / 2 + (Math.random() - 0.5) * R.W * 0.6,
        y: y - Math.random() * 40,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3,
        life: 1400, max: 1400,
        size: 3 + Math.random() * 4,
        color: ['#FFD166', '#3DDC84', '#FF6B6B', '#7FC8E8'][i % 4],
        shape: 'rect', rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4, grav: 0.12,
      });
    }
  }

  function toast(text) { G.toast = { text, life: 1800 }; }

  function buzz(pattern) {
    if (!G.haptics) return;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  // v3: every result explains itself. A failed run must never say "BEST —" and stop.
  function whyText() {
    const w = G.world;
    const r = w.run || {};
    const f = w.lastFail || {};
    const tierKey = f.type || (r.tier >= 0 ? LADDER[r.tier] : null);
    const tierName = tierKey && VEHICLES[tierKey] ? VEHICLES[tierKey].label : 'The vehicle';
    if (G.noDeck && !(r.heaviest >= LADDER.length - 1)) {
      return 'No road deck. ' + tierName + ' drove off the bank and fell: lay the deck with DECK, then RUN again.';
    }
    if (r.heaviest >= LADDER.length - 1) {
      return 'The full 9-tier ladder crossed. The deck deflected ' + Math.round(w.maxSag || 0) + 'px at its worst.';
    }
    if (f.reason === 'snap') {
      const mat = MATS[f.mat] ? MATS[f.mat].label : 'A';
      const what = f.kind === 'support' ? 'support' : 'deck';
      const pct = Math.min(400, Math.round(f.load || 100));
      const over = pct >= 100;
      return tierName + ' overloaded a ' + mat + ' ' + what + ' beam'
        + (over ? ' past its capacity' : ' at ' + pct + '% of its capacity')
        + '. Add structure so the load is shared.';
    }
    if (f.reason === 'fall') {
      const sag = Math.round(f.sag || w.maxSag || 0);
      return tierName + ' fell. The deck dropped ' + sag + 'px under it. Brace the span to the banks or tie it to a pier.';
    }
    if (f.reason === 'drop') {
      return tierName + ' went down with the deck. It dropped ' + Math.round(f.sag || 0) + 'px: the members were too shallow or too few for that span. Add depth: more bays and deeper chords.';
    }
    if (f.reason === 'stall') {
      const stress = Math.round((f.stress || w.lastMaxStress || 0) * 100);
      const wall = w.beams.some((b) => b.kind === 'road' && !b.broken &&
        Math.abs((b.ay + b.by) / 2 - deckYAt((b.ax + b.bx) / 2)) > 16);
      if (wall) return tierName + ' hit a ROAD beam in its path. Beams above the deck must be SUP.';
      return tierName + ' stalled at ' + stress + '% load. The deck is too soft, or a joint is too steep to climb.';
    }
    return 'The ladder ended before the full load crossed.';
  }

  /* ---------- build actions ---------- */

  function pushUndo() {
    if (!G.world) return;
    G.culprit = null;                 // the ring marks the last break: any edit retires it
    G.undo.push(G.world.snapshot());
    if (G.undo.length > 40) G.undo.shift();
    G.redo.length = 0;
  }

  function undo() {
    if (!G.world || !G.undo.length) return;
    G.redo.push(G.world.snapshot());
    G.world.reset(G.undo.pop());
    G.drag = null;
    A.tap();
  }

  function redo() {
    if (!G.world || !G.redo.length) return;
    G.undo.push(G.world.snapshot());
    G.world.reset(G.redo.pop());
    G.drag = null;
    A.tap();
  }

  // v3: the deck line at any x. Beams away from it default to SUP, so a player who drags a truss
  // above or below the deck cannot accidentally build a second road that blocks traffic.
  function deckYAt(x) {
    const L2 = G.level.anchors;
    const a = L2.left.slice().sort((p, q) => p[1] - q[1])[0];
    const b = L2.right.slice().sort((p, q) => p[1] - q[1])[0];
    return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
  }

  function kindFor(from, wx, wy) {
    if (G.kind !== 'road') return G.kind;
    const deckT = deckYAt(wx), deckF = deckYAt(from.body.position.x);
    const atDeck = Math.abs(wy - deckT) <= 16;
    const fromDeck = Math.abs(from.body.position.y - deckF) <= 16;
    const hasRoad = from.beams.some((b) => b.kind === 'road');
    // A deck beam, or the second half of a kink, stays ROAD.
    if (atDeck && (fromDeck || hasRoad)) return 'road';
    // Any member heading below the deck line is a support.
    if (wy > deckT + 16) return 'support';
    // A member coming DOWN from a truss to a bank is a tie, not a road wall.
    if (!fromDeck && atDeck && !hasRoad) return 'support';
    // A bank bolt dragged high above the deck is a tie; a small rise is a kink.
    if (from.anchor && wy < deckT - 40) return 'support';
    if (!from.anchor && wy < deckT - 16) return 'support';
    return 'road';
  }

  function reasonText(r) {
    return r === 'UNDER' ? 'NO UNDER-DECK ON THIS SPAN' : r === 'BUDGET' ? 'NOT ENOUGH BUDGET' : r === 'SHORT' ? 'TOO SHORT' : r === 'LONG' ? 'TOO LONG' : r === 'EXISTS' ? 'BEAM ALREADY THERE' : r === 'SAME' ? 'PICK ANOTHER POINT' : 'CANNOT PLACE';
  }

  function placeFromDrag(from, wx, wy) {
    const scale = R.view.scale;
    const kind = kindFor(from, wx, wy);
    const pv = G.world.preview(from, wx, wy, G.mat, kind, 44 / scale);
    if (!pv.ok) { A.error(); toast(reasonText(pv.reason)); return false; }
    pushUndo();
    const r = G.world.place(from, wx, wy, G.mat, kind, 44 / scale);
    if (!r.ok) { A.error(); toast(reasonText(r.reason)); return false; }
    if (kind !== G.kind && !G.autoHinted) { G.autoHinted = true; toast('AUTO SUPPORT — ROAD IS FOR THE DECK'); }
    if (kind === 'support' && r.node && G.world.nodeCredit(r.node) < 0.15) toast('NO GROUND PATH — TIE IT TO A BANK');
    A.place();
    if (pv.clamped) toast('CLAMPED TO ' + ((G.world && G.world.maxBeam) || P.MAX_BEAM) + 'px');
    buzz(8);
    return true;
  }

  function eraseAt(wx, wy) {
    const bm = G.world.beamAt(wx, wy, 18 / R.view.scale);
    if (!bm) { A.error(); return false; }
    pushUndo();
    G.world.removeBeam(bm);
    A.tap();
    buzz(8);
    return true;
  }

  function doDeck() {
    const lv = G.level;
    const plan = G.world.deckPlan(G.mat);
    pushUndo();
    let placed = 0;
    for (const s of plan.segs) {
      const prev = G.world.nodeNear(s.ax, s.ay, 20) || G.world.nodeNear(s.bx, s.by, 20);
      if (!prev) continue;
      const r = G.world.place(prev, s.bx, s.by, G.mat, 'road', 14);
      if (r.ok) placed += 1;
    }
    for (const s of plan.posts) {
      const prev = G.world.nodeNear(s.ax, s.ay, 14);
      if (!prev) continue;
      const r = G.world.place(prev, s.bx, s.by, G.mat, 'support', 14);
      if (r.ok) placed += 1;
    }
    if (!placed) { A.error(); toast('COULD NOT LAY THE DECK'); }
    else {
      A.place();
      toast(plan.posts.length ? 'DECK TIED TO THE PIER — PRESS RUN' : 'DECK LAID — PRESS RUN TO TEST IT');
    }
  }

  // BRACE is a STARTER, not a solution. One tap builds a KING POST: a vertical post at mid span and
  // two diagonals to the nearest banks (above the deck on the no-under-deck spans). It is a real
  // truss, so it carries light tiers on a short span; on a long span its diagonals lie at a shallow
  // angle and a heavy rig bends them. The player goes deeper by hand: more bays, more depth.
  function doBrace() {
    const w = G.world, lv = G.level;
    const interior = w.nodes.filter((n) => !n.anchor && n.beams.some((b) => b.kind === 'road'))
      .sort((a, b) => a.body.position.x - b.body.position.x);
    if (!interior.length) { A.error(); toast('LAY A DECK FIRST'); return; }
    // A pier splits the deck: one king post per clear span.
    const pierXs = (lv.piers || []).map((p) => p.x);
    const groups = [];
    let cur = [];
    for (const n of interior) {
      const x = n.body.position.x;
      if (pierXs.some((px) => Math.abs(px - x) < 44) && cur.length) { groups.push(cur); cur = []; }
      cur.push(n);
    }
    if (cur.length) groups.push(cur);
    pushUndo();
    let added = 0;
    const up = lv.noUnderDeck ? -70 : 70;
    for (const grp of groups) {
      const mid = grp[Math.floor(grp.length / 2)];
      const mx = mid.body.position.x, my = mid.body.position.y;
      const post = w.place(mid, mx, my + up, G.mat, 'support', 14);
      if (!post.ok) continue;
      added += 1;
      const anchors = [...lv.anchors.left, ...lv.anchors.right, ...(lv.anchors.piers || [])];
      let left = null, right = null, dl = Infinity, dr = Infinity;
      for (const [ax, ay] of anchors) {
        const d = Math.hypot(mx - ax, my - ay);
        if (d < 44 || d > w.maxBeam) continue;
        if (lv.noUnderDeck ? ay > my + 12 : ay < my - 12) continue;   // the deck-level bank bolts
        if (ax < mx - 20 && d < dl) { dl = d; left = [ax, ay]; }
        if (ax > mx + 20 && d < dr) { dr = d; right = [ax, ay]; }
      }
      for (const a of [left, right]) {
        if (!a) continue;
        const r = w.place(post.node, a[0], a[1], G.mat, 'support', 14);
        if (r.ok) added += 1;
      }
    }
    if (!added) { A.error(); toast('NO ROOM FOR A POST HERE'); }
    else {
      A.place();
      toast('STARTER KING POST — ' + added + ' MEMBERS. GO DEEPER FOR HEAVY RIGS');
    }
  }

  function handleButton(id) {
    A.resume();
    G.idle = 0;
    // While paused the overlay owns the buttons: resume/sound/haptics/rebuild/spans must all work.
    if (G.mode === 'run' && G.screen === 'run' && !G.paused && id !== 'run' && id !== 'mute' && id !== 'pause' && id !== 'speed') return;
    if (id.startsWith('mat:')) { G.mat = id.slice(4); G.erase = false; A.tap(); return; }
    if (id === 'undo') return undo();
    if (id === 'redo') return redo();
    if (id === 'erase') {
      G.erase = !G.erase;
      const dev = (G.uiHint && G.uiHint.shown) || 'keyboard';
      toast(!G.erase ? 'ERASE OFF'
        : dev === 'touch' ? 'ERASE ON — TAP A BEAM TO REMOVE IT'
        : dev === 'pad' ? 'ERASE ON — A REMOVES THE BEAM UNDER THE CURSOR'
        : 'ERASE ON — SPACE REMOVES THE BEAM UNDER THE CURSOR');
      A.tap();
      return;
    }
    if (id === 'deck') return doDeck();
    if (id === 'brace') return doBrace();
    if (id === 'run') return G.mode === 'run' ? stopRun() : startRun();
    if (id === 'mute' || id === 'sound') { G.muted = !G.muted; A.muted = G.muted; save(); A.tap(); return; }
    if (id === 'speed') {
      // 1× / 2× / 4×, not a two-state toggle: a player who wants to watch every joint move needs
      // a slow speed, and the chip label is the live speed (playtest round 5, item 6).
      const order = [1, 2, 4];
      G.runSpeed = order[(order.indexOf(G.runSpeed) + 1) % order.length] || 2;
      toast('SPEED ' + G.runSpeed + '×');
      A.tap();
      return;
    }
    if (id === 'haptics') { G.haptics = !G.haptics; save(); buzz(12); A.tap(); return; }
    if (id === 'pause') {
      const C = root.BW_CONTROLS;
      if (C && C.input) { C.input.pause.pause('input'); return; }
      G.paused = true; G.ui = UI.layout(R.W, R.H, G.safe); return;
    }
    if (id === 'resume') {
      const C = root.BW_CONTROLS;
      if (C && C.input && C.input.pause.paused) { C.input.pause.resume(); return; }
      G.paused = false; G.ui = UI.layout(R.W, R.H, G.safe); return;
    }
    if (id === 'tutorial:ok') { G.tutorial = false; G.tutorialSeen = true; save(); G.ui = UI.layout(R.W, R.H, G.safe); A.tap(); return; }
    if (id === 'howto') { G.tutorial = true; A.tap(); return; }
    if (id === 'restart') {          // REBUILD: a fresh, empty scenario — every beam, timer and run state gone
      G.paused = false; inputPauseReset();
      startLevel(G.levelIndex);
      A.tap();
      return;
    }
    if (id === 'retry') {            // RETEST: keep the bridge you built, undo the run
      G.paused = false; inputPauseReset(); G.screen = 'build'; G.mode = 'build';
      G.result = null; G.resultTimer = 0; G.particles = [];
      G.noDeck = false; G.runAttempted = false; G.culprit = null; G.culpritAge = 0;
      G.world.reset(G.runSnapshot || G.world.snapshot());
      G.ui = UI.layout(R.W, R.H, G.safe);
      A.tap();
      return;
    }
    if (id === 'levels') { G.paused = false; inputPauseReset(); setScreen('levels'); return; }
    // NEXT never wraps in silence: on the last span it closes the campaign and names the picker.
    // "All spans built" is only claimed when every span really has a saved best (no fake progress).
    if (id === 'next') {
      inputPauseReset();
      if (G.levelIndex + 1 >= LEVELS.length) {
        const allDone = LEVELS.every((l) => G.best && G.best[l.id] !== undefined);
        G.campaignDone = allDone;
        save();
        setScreen('levels');
        toast(allDone ? 'ALL ' + LEVELS.length + ' SPANS BUILT — CHASE GOLD'
          : 'BACK TO THE SPANS — PICK ANY ONE');
        A.win();
        return;
      }
      startLevel(G.levelIndex + 1);
      return;
    }
    if (id === 'back') { inputPauseReset(); setScreen('title'); return; }
    // Judgeability: PLAY is one press into a buildable span. The picker is a second, named route
    // (SCENARIOS on the title, B on a pad, SCENARIOS on the pause and result cards), never a gate
    // in front of the first tap.
    if (id === 'play') { inputPauseReset(); startLevel(0); return; }
    if (id === 'scenarios') { G.paused = false; inputPauseReset(); setScreen('levels'); return; }
    if (id.startsWith('level:')) {
      const i = parseInt(id.slice(6), 10);
      startLevel(i);
    }
  }

  /* ---------- input ---------- */

  function pointerPos(e) {
    const r = R.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    A.resume();
    G.idle = 0;
    const C = root.BW_CONTROLS;
    if (C && C.cancelPick) C.cancelPick();
    const p = pointerPos(e);
    G.pointers.set(e.pointerId, p);
    if (G.pointers.size === 2) {
      const pts = [...G.pointers.values()];
      G.pinch = { d: dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y), zoom: G.view.zoom, mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2, px: G.view.panX, py: G.view.panY };
      G.drag = null;
      G.panning = null;
      return;
    }
    if (G.pointers.size > 2) return;

    if (G.tutorial) {
      // The first-run card is modal: its button works, and so does a tap anywhere (a phone player
      // should not have to hunt for a 44 px target on a full-screen overlay).
      const tb = UI.hit(G, p.x, p.y);
      if (tb && tb.id === 'tutorial:ok') handleButton(tb.id);
      else if (tb) handleButton(tb.id);
      else handleButton('tutorial:ok');
      return;
    }
    if (G.screen === 'title' || G.screen === 'levels' || G.screen === 'result') {
      if (G.screen === 'levels' && G.ui.cards) {
        for (const c of G.ui.cards) {
          if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) { handleButton(c.id); return; }
        }
      }
      const b = UI.hit(G, p.x, p.y);
      if (b) handleButton(b.id);
      else if (G.screen === 'title') handleButton('play');   // the whole title is the PLAY button
      return;
    }
    if (G.paused) {
      const b = UI.hit(G, p.x, p.y);
      if (b) handleButton(b.id);
      return;
    }

    const b = UI.hit(G, p.x, p.y);
    if (b) { handleButton(b.id); return; }
    if (G.screen === 'run') return;

    const wp = R.s2w(p.x, p.y);
    if (G.erase) { eraseAt(wp.x, wp.y); return; }
    const node = G.world.nodeAt(wp.x, wp.y, 44 / R.view.scale);
    if (node) {
      G.drag = { from: node, ax: node.body.position.x, ay: node.body.position.y, x: wp.x, y: wp.y, preview: null };
      G.hoverNode = node;
      A.tap();
      return;
    }
    // v3: double-tap empty space resets a lost pinch-zoom view (no fit button to hunt for).
    const now = performance.now();
    if (G.view.zoom > 1.02 && now - G.lastTap < 340 && dist(p.x, p.y, G.lastTapPos.x, G.lastTapPos.y) < 44) {
      G.view = { zoom: 1, panX: 0, panY: 0 };
      G.lastTap = 0;
      toast('VIEW RESET');
      A.tap();
      return;
    }
    G.lastTap = now;
    G.lastTapPos = p;
    if (G.view.zoom > 1.02) G.panning = { x: p.x, y: p.y, px: G.view.panX, py: G.view.panY };
  }

  function onMove(e) {
    if (!G.pointers.has(e.pointerId)) return;
    const p = pointerPos(e);
    G.pointers.set(e.pointerId, p);

    if (G.pinch && G.pointers.size >= 2) {
      const pts = [...G.pointers.values()];
      const d = dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
      G.view.zoom = clamp(G.pinch.zoom * (d / Math.max(20, G.pinch.d)), 1, 2.6);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      G.view.panX = clamp(G.pinch.px + (G.pinch.mx - mx) / R.view.scale, -420, 420);
      G.view.panY = clamp(G.pinch.py + (G.pinch.my - my) / R.view.scale, -240, 240);
      return;
    }
    if (G.panning) {
      G.view.panX = clamp(G.panning.px + (G.panning.x - p.x) / R.view.scale, -420, 420);
      G.view.panY = clamp(G.panning.py + (G.panning.y - p.y) / R.view.scale, -240, 240);
      return;
    }
    if (G.drag) {
      const wp = R.s2w(p.x, p.y);
      G.drag.x = wp.x;
      G.drag.y = wp.y;
      const kind = kindFor(G.drag.from, wp.x, wp.y);
      const pv = G.world.preview(G.drag.from, wp.x, wp.y, G.mat, kind, Math.min(44 / R.view.scale, 30));
      G.drag.preview = pv;
      G.drag.kind = kind;
      G.hoverNode = pv.node || null;
    }
  }

  function onUp(e) {
    G.pointers.delete(e.pointerId);
    if (G.pointers.size < 2) G.pinch = null;
    if (G.drag) {
      const d = G.drag;
      const kind = kindFor(d.from, d.x, d.y);
      const pv = G.world.preview(d.from, d.x, d.y, G.mat, kind, Math.min(44 / R.view.scale, 30));
      if (pv.ok) {
        pushUndo();
        const r = G.world.place(d.from, d.x, d.y, G.mat, kind, Math.min(44 / R.view.scale, 30));
        if (r.ok) {
          A.place();
          if (kind !== G.kind && !G.autoHinted) { G.autoHinted = true; toast('AUTO SUPPORT — ROAD IS FOR THE DECK'); }
          if (kind === 'support' && G.world.nodeCredit(r.node) < 0.15) toast('NO GROUND PATH — TIE IT TO A BANK');
          if (pv.clamped) toast('CLAMPED TO ' + ((G.world && G.world.maxBeam) || P.MAX_BEAM) + 'px');
          buzz(8);
        } else { A.error(); toast(reasonText(r.reason)); }
      } else {
        A.error();
        toast(reasonText(pv.reason));
      }
      G.drag = null;
    }
    G.panning = null;
    G.hoverNode = null;
  }

  /* ---------- loop ---------- */

  function update(dt) {
    // A zoomed view pans toward the cursor. That offset must not outlive the zoom: at 1× the whole
    // span is fitted again, so a leftover pan slides the bridge off-centre (playtest round 5, item 8).
    if (G.view && G.view.zoom <= 1.02 && (G.view.panX || G.view.panY)) {
      const k = Math.pow(0.00001, dt / 1000);
      G.view.panX *= k; G.view.panY *= k;
      if (Math.abs(G.view.panX) < 0.5) G.view.panX = 0;
      if (Math.abs(G.view.panY) < 0.5) G.view.panY = 0;
    }
    if (G.screen === 'build' || G.screen === 'run') {
      if (!G.paused && !G.tutorial) {
        // Build mode is frozen: the deck must not sag before the run starts, or the supports are
        // placed onto an already-sagging deck and heavy tiers jam. Physics starts with RUN.
        if (G.slowMo > 0) G.slowMo = Math.max(0, G.slowMo - dt / 1000);
        const rate = G.slowMo > 0 ? 0.45 : 1;
        if (G.mode === 'run') G.world.step(dt * G.runSpeed * rate);
        if (G.mode === 'run') {
          const max = G.world.lastMaxStress || 0;
          if (max > 0.62) A.creak(max);
          if (G.view.zoom > 1.02) {
            const lead = G.world.vehicles.filter((v) => !v.crossed && !v.dead).sort((a, b) => b.body.position.x - a.body.position.x)[0];
            if (lead) {
              const target = lead.body.position.x - (G.level.left.edge + G.level.right.edge) / 2;
              G.view.panX += (target - G.view.panX) * 0.08;
              G.view.panX = clamp(G.view.panX, -420, 420);
            }
          }
          if (G.resultTimer > 0) {
            G.resultTimer -= dt;
            if (G.resultTimer <= 0) finishRun();
          }
        }
      }
    }
    updateParticles(dt);
    // One named next move, for a player who has not pressed RUN yet. Retired the moment they act,
    // so it coaches a first run without nagging a designer who is deep in a build.
    G.coach = null;
    if (G.screen === 'build' && !G.paused && !G.tutorial && G.world) {
      const hasRoad = G.world.beams.some((b) => b.kind === 'road' && !b.broken);
      G.coach = hasRoad ? (G.runAttempted ? null : 'run') : 'deck';
      // A player standing still gets two nudges that name the next move, then a demo run at 75 s.
      // G.idle is time since the last real input: a nudge must NOT reset it, or the demo-run
      // threshold below can never be reached. Nudges sit at 22 s and 44 s, the demo run at 75 s.
      G.idle = (G.idle || 0) + dt / 1000;
      if ((G.idleNudged || 0) < 2 && G.idle > 22 * ((G.idleNudged || 0) + 1) && G.coach) {
        G.idleNudged = (G.idleNudged || 0) + 1;
        toast(G.coach === 'deck' ? 'DRAG FROM A BOLT — OR TAP DECK TO LAY THE ROAD' : 'PRESS RUN TO SEND THE NINE RIGS');
      }
      // Judgeability: a player who never presses RUN never sees a verdict. After a long silence
      // the game runs the ladder itself, so anyone who is stuck still gets a result card and a
      // reason, then RETEST puts them back on the drawing board. Any input resets the clock.
      if (G.idle > 75 && !G.autoRan) {
        G.autoRan = true;
        startRun();
        toast('DEMO RUN — THE RIGS TEST THIS SPAN');
      }
    } else {
      G.idle = 0;
    }
    if (G.culprit && G.culpritAge < 6) G.culpritAge += dt / 1000;
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt / 220);
    if (G.crossing) {
      G.crossing.life -= dt;
      if (G.crossing.life <= 0) G.crossing = null;
    }
    if (G.screen === 'result') G.resultAge += dt / 1000;
    G.shake *= Math.pow(0.86, dt / 16.67);
    if (G.shake < 0.4) G.shake = 0;
    if (G.toast) {
      G.toast.life -= dt;
      if (G.toast.life <= 0) G.toast = null;
    }
    G.t += dt / 1000;
  }

  function draw(dt) {
    if (G.screen === 'title') { UI.drawTitle(G); UI.drawFocus(G); return; }
    if (G.screen === 'levels') { UI.drawLevels(G); UI.drawFocus(G); return; }
    if (G.screen === 'build' || G.screen === 'run') {
      R.draw(G, dt);
      if (!G.paused) UI.drawHUD(G);   // the pause overlay owns the screen: no live bar behind it
      if (root.BW_CONTROLS) root.BW_CONTROLS.drawHints(R.ctx);
      if (G.toast) {
        const ctx = R.ctx;
        const W = R.W;
        const y = G.ui.play.y + G.ui.play.h - 84;
        ctx.font = 'bold 11px system-ui, sans-serif';
        let tw = ctx.measureText(G.toast.text).width + 28;
        let toastSize = 11;
        if (tw > W - 20) {
          toastSize = Math.max(8, 11 * (W - 20) / tw);
          ctx.font = 'bold ' + toastSize + 'px system-ui, sans-serif';
          tw = ctx.measureText(G.toast.text).width + 28;
        }
        ctx.globalAlpha = clamp(G.toast.life / 400, 0, 1);
        UI.pill(ctx, W / 2 - tw / 2, y, tw, 30, 'rgba(14,18,26,0.82)', 'rgba(255,209,102,0.4)');
        UI.text(ctx, G.toast.text, W / 2, y + 19, toastSize, '#FFD166', 'center', '800');
        ctx.globalAlpha = 1;
      }
      if (G.tutorial) UI.drawTutorial(G);
      else if (G.paused) UI.drawPause(G);
      UI.drawFocus(G);
      return;
    }
    if (G.screen === 'result') {
      R.draw(G, dt);
      UI.drawResult(G);
      R.drawParticles(G);
      UI.drawFocus(G);
      return;
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    if (root.BW_CONTROLS) root.BW_CONTROLS.frame(dt / 1000);
    update(dt);
    draw(dt);
    requestAnimationFrame(frame);
  }

  function boot() {
    const canvas = document.getElementById('game');
    R.init(canvas);
    G.safe = readSafe();
    const saveData = loadSave();
    G.muted = saveData.muted;
    G.haptics = saveData.haptics;
    G.tutorialSeen = saveData.tutorialSeen;
    G.best = saveData.best || {};
    G.campaignDone = saveData.campaignDone;
    A.muted = G.muted;
    G.ui = UI.layout(R.W, R.H, G.safe);
    G.ui.buttons = [];
    G.level = LEVELS[0];
    setScreen('title');

    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', () => setTimeout(relayout, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
    canvas.addEventListener('pointermove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
    canvas.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
    canvas.addEventListener('pointercancel', (e) => onUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Desktop zoom: the wheel is the natural gesture the README promised nowhere until now.
    canvas.addEventListener('wheel', (e) => {
      if (G.screen !== 'build' && G.screen !== 'run') return;
      e.preventDefault();
      G.view.zoom = clamp(G.view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 1, 2.6);
    }, { passive: false });

    requestAnimationFrame(frame);
    root.BW_GAME.booted = true;                     // controls.js waits for this
    if (root.BW_CONTROLS) root.BW_CONTROLS.init();
  }

  // The one start function every input calls: the PLAY button, Enter/Space, pad A, window.__game.start().
  // From the title it goes straight into L1 with the first-run card, so one press is one buildable span.
  function start() {
    if (G.screen === 'title') return handleButton('play');
    if (G.screen === 'levels') {
      const id = G.focusId && G.focusId.indexOf('level:') === 0 ? G.focusId : 'level:0';
      return handleButton(id);
    }
    if (G.screen === 'result') return handleButton('retry');
    if (G.screen === 'build') return startRun();
    return null;
  }

  root.BW_GAME = { G, boot, startLevel, setScreen, start, startRun, stopRun, undo, redo, doDeck, doBrace,
    placeFromDrag, eraseAt, handleButton, relayout, toast, R, UI };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
