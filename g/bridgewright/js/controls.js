/* BRIDGEWRIGHT — input layer (ArcadeInput): keyboard, mouse, touch, gamepad, menu focus,
 * pause owner, window.__game hook and device prompts. Game logic stays in game.js. */
(function (root) {
  'use strict';

  const AI = root.ArcadeInput;
  const api = root.BW_GAME;
  if (!AI || !api) return;
  const G = api.G;
  const A = root.BW_AUDIO;
  const R = api.R;
  const UI = root.BW_UI;

  const GRID = 20;
  const STEP = 20;              // one key/D-pad press moves the cursor one grid cell
  const STICK_RATE = 250;       // px per second from the left stick
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  let input = null;
  let menu = null;
  let picked = null;            // the from-node of a keyboard/pad beam
  let lastSig = '';
  let lastLevel = -1;
  let padUsedAt = -1e9;         // when the pad last delivered a real press or stick push (boot: never)
  const padRepeat = { left: 0, right: 0, up: 0, down: 0 };   // D-pad hold repeat deadlines
  const icons = {};

  /* ---------- device prompts: Kenney CC0 icons, copied into ./prompts/ ---------- */

  function icon(name) {
    if (!icons[name]) {
      const img = new Image();
      img.src = 'prompts/' + name + '.png';
      icons[name] = img;
    }
    return icons[name];
  }

  // The one thing this game changes about the template: it always builds a primary thumb button,
  // and a bridge builder's verb is a drag on the playfield. A 78 px button there would cover the
  // RUN bar, so the template's action button is removed (the game draws its own ≥44 px bar).
  function dropThumbButtons() {
    const ui = input && input._ui;
    if (!ui || !ui.acts) return;
    for (const k of Object.keys(ui.acts)) {
      const b = ui.acts[k];
      if (b && b.parentNode) b.parentNode.removeChild(b);
      delete ui.acts[k];
    }
  }

  // Prompts follow the device that is really in use. A pad only owns the prompts after it has
  // sent a real press: a paired controller that nobody touched (or the test's fake pad, which is
  // connected on every viewport) must not put "A TO PLAY" on a phone's title screen — that was
  // playtest round 4, item 4.
  function hintDevice() {
    if (!input) return 'keyboard';
    if (performance.now() - padUsedAt < 8000) return 'pad';
    if (input.touchCapable) return 'touch';
    return input.device === 'touch' ? 'touch' : 'keyboard';
  }

  function hintsFor(device, running) {
    if (device === 'touch') {
      return running
        ? [['touch_tap', 'TAP STOP'], ['touch_tap', 'TAP ⏸ TO PAUSE']]
        : [['touch_hand_open', 'DRAG TO BUILD'], ['touch_tap', 'DECK'], ['touch_tap', 'RUN'], ['touch_tap', '⏸']];
    }
    if (device === 'pad') {
      return running
        ? [['xbox_rt', 'STOP'], ['xbox_button_start', 'PAUSE']]
        : [['xbox_stick_l', 'MOVE'], ['xbox_button_a', 'BUILD'], ['xbox_button_y', 'DECK'],
           ['xbox_button_x', 'BRACE'], ['xbox_rt', 'RUN'], ['xbox_button_back', 'MAT'],
           ['xbox_button_start', 'PAUSE']];
    }
    return running
      ? [['keyboard_enter', 'STOP'], ['keyboard_escape', 'PAUSE']]
      : [['mouse_left', 'DRAG'], ['keyboard_arrows', 'CURSOR'], ['keyboard_space', 'BUILD'],
         ['keyboard_enter', 'RUN'], ['keyboard_escape', 'PAUSE']];
  }

  // One row of icon + word pills, centred at the bottom of the play area. Never over the HUD bar.
  function drawHints(ctx) {
    if (!input || !G.ui || !G.ui.play || G.paused || G.tutorial) return;
    if (G.screen !== 'build' && G.screen !== 'run') return;
    const items = hintsFor(hintDevice(), G.screen === 'run');
    const play = G.ui.play;
    const y = play.y + play.h - 26;
    const maxW = play.w - 16;
    let total = 0;
    const widths = [];
    ctx.font = '800 9px system-ui, sans-serif';
    for (const it of items) {
      const w = 20 + ctx.measureText(it[1]).width + 12;
      widths.push(w); total += w + 5;
    }
    let start = play.x + (play.w - (total - 5)) / 2;
    if (total - 5 > maxW) { start = play.x + 8; total = maxW; }
    for (let i = 0; i < items.length; i++) {
      const w = widths[i];
      if (start + w > play.x + play.w - 6) break;
      UI.pill(ctx, start, y, w, 20, 'rgba(14,18,26,0.62)', 'rgba(255,255,255,0.10)');
      const img = icon(items[i][0]);
      try { if (img.complete && img.naturalWidth) ctx.drawImage(img, start + 4, y + 2, 16, 16); } catch (e) {}
      ctx.fillStyle = '#E8EEF8';
      ctx.textAlign = 'left';
      ctx.fillText(items[i][1], start + 23, y + 14);
      start += w + 5;
    }
  }

  /* ---------- hook fields ---------- */

  const T = () => (G.world && G.world.run ? G.world.run : null);

  function stateWord() {
    if (G.screen === 'title') return 'menu';
    if (G.screen === 'result') return 'over';
    return G.screen;                       // levels | build | run — all "play" to the hook
  }

  function scoreValue() {
    const r = T();
    return r && typeof r.heaviest === 'number' ? Math.max(0, r.heaviest + (r.heaviest >= 0 ? 1 : 0)) : 0;
  }

  function playerPos() {
    if (!G.world) return { x: 0, y: 0 };
    if (G.world.vehicles && G.world.vehicles.length) {
      const v = G.world.vehicles.filter((q) => !q.dead).sort((a, b) => b.body.position.x - a.body.position.x)[0]
        || G.world.vehicles[0];
      if (v) return { x: Math.round(v.body.position.x), y: Math.round(v.body.position.y) };
    }
    if (G.cursor) return { x: Math.round(G.cursor.x), y: Math.round(G.cursor.y) };
    return { x: 0, y: 0 };
  }

  function uiRects() {
    const out = [];
    if (!G.ui) return out;
    const push = (b, name) => {
      if (!b || b.w < 1 || b.h < 1) return;
      out.push({ name: name || b.id || 'button', x: b.x, y: b.y, w: b.w, h: b.h });
    };
    for (const b of (G.ui.buttons || [])) push(b);
    for (const c of (G.ui.cards || [])) push(c, c.id || 'card');
    return out;
  }

  /* ---------- cursor (keyboard + pad) ---------- */

  function homeCursor() {
    const lv = G.level;
    const ax = lv.anchors.left.slice().sort((a, b) => (Math.abs(a[0] - lv.left.edge) + Math.abs(a[1] - lv.left.top)) -
      (Math.abs(b[0] - lv.left.edge) + Math.abs(b[1] - lv.left.top)))[0];
    G.cursor = { x: Math.round(ax[0] / GRID) * GRID, y: Math.round(ax[1] / GRID) * GRID };
    picked = null;
    G.kbDrag = null;
  }

  function snapCursor() {
    // Jump to the nearest bolt anywhere on the bridge: a pad player should never have to nudge
    // a free cursor onto a 7 px joint.
    let n = null, best = Infinity;
    if (G.world) {
      for (const q of G.world.nodes) {
        const d = Math.hypot(q.body.position.x - G.cursor.x, q.body.position.y - G.cursor.y);
        if (d < best) { best = d; n = q; }
      }
    }
    if (n) {
      G.cursor = { x: Math.round(n.body.position.x), y: Math.round(n.body.position.y) };
      api.toast('BOLT PICKED');
      A.tap();
      return;
    }
    G.cursor = { x: Math.round(G.cursor.x / GRID) * GRID, y: Math.round(G.cursor.y / GRID) * GRID };
    api.toast('CURSOR SNAPPED TO GRID');
  }

  function pickOrPlace() {
    if (!G.world) return;
    const wx = Math.round(G.cursor.x / GRID) * GRID;
    const wy = Math.round(G.cursor.y / GRID) * GRID;
    // ERASE is a real mode on every input. It used to be honoured only by the pointer handler, so
    // E and LT toggled a flag and Space/A still picked a bolt (playtest round 4, item 1, worst).
    if (G.erase) {
      const gone = api.eraseAt(G.cursor.x, G.cursor.y);
      if (gone) { picked = null; G.kbDrag = null; api.toast('BEAM ERASED — ERASE STAYS ON'); }
      else api.toast('NO BEAM UNDER THE CURSOR');
      return;
    }
    if (!picked) {
      const n = G.world.nodeAt(wx, wy, 46);
      if (!n) { A.error(); api.toast('MOVE THE CURSOR ONTO A BOLT, THEN PRESS BUILD'); return; }
      picked = n;
      A.tap();
      G.kbDrag = { from: n, ax: n.body.position.x, ay: n.body.position.y, x: wx, y: wy, preview: null };
      api.toast('BUILDING FROM BOLT — MOVE, THEN BUILD AGAIN');
      return;
    }
    const ok = api.placeFromDrag(picked, wx, wy, 34);
    if (ok) { picked = null; G.kbDrag = null; }
  }

  function cancelPick() {
    if (picked) { picked = null; G.kbDrag = null; A.tap(); api.toast('BUILD CANCELLED'); }
  }

  /* ---------- menu focus: canvas screens are pad/keyboard navigable ---------- */

  function menuItems() {
    if (G.tutorial) return [{ id: 'tutorial:ok' }];
    if (G.paused) return ['resume', 'restart', 'levels', 'sound', 'haptics', 'howto'].map((id) => ({ id }));
    if (G.screen === 'title') return [{ id: 'play' }, { id: 'scenarios' }];
    if (G.screen === 'levels') {
      const out = (G.ui.cards || []).map((c) => ({ id: c.id }));
      out.push({ id: 'back' });
      return out;
    }
    if (G.screen === 'result') return ['retry', 'next', 'levels'].map((id) => ({ id }));
    return [];
  }

  function backForScreen() {
    if (G.paused) return api.handleButton('resume');
    if (G.tutorial) return api.handleButton('tutorial:ok');
    if (G.screen === 'result') return api.handleButton('levels');
    if (G.screen === 'levels') return api.handleButton('back');
    if (G.screen === 'build' || G.screen === 'run') return api.handleButton('levels');
  }

  function syncMenu(force) {
    const sig = [G.screen, G.paused, G.tutorial, (G.ui && G.ui.cards ? G.ui.cards.length : 0)].join('|');
    if (!force && sig === lastSig) return;
    lastSig = sig;
    const items = menuItems();
    menu.items = items;
    if (items.length) {
      if (!menu.active) menu.open(0);
      else menu.focus(Math.min(menu.index, items.length - 1));
      G.focusId = items[menu.index] ? items[menu.index].id : null;
    } else {
      menu.close();
      G.focusId = null;
    }
  }

  /* ---------- one frame ---------- */

  function frame(dt) {
    if (!input) return;
    const screenBefore = G.screen;
    const tutorialBefore = G.tutorial;
    const f = input.poll();
    // A press the canvas menu consumed belongs to the menu, never to the playfield. The template
    // clears confirm/primary for the menu but leaves the game's own bindings standing — Enter is
    // bound to both `run` and `primary`, Space to both `pick` and `primary`. Without this guard,
    // Enter on a scenario card opened the level AND started RUN on the empty bridge, and Space/A on
    // the how-to card picked the nearest bolt (playtest round 5, items 1 and 4). The screen or the
    // tutorial changing during poll() is proof that the menu did the work this frame.
    if (G.screen !== screenBefore || (tutorialBefore && !G.tutorial)) {
      syncMenu(true);
      return;
    }
    if (f.pad && f.pad.any) padUsedAt = performance.now();
    if (G.levelIndex !== lastLevel) { lastLevel = G.levelIndex; homeCursor(); }
    const live = (G.screen === 'build' || G.screen === 'run') && !G.paused && !G.tutorial;
    const build = G.screen === 'build' && live;

    // tutorial: any build/confirm press dismisses it
    if (G.tutorial && (f.pressed.pick || f.pressed.confirm || f.pressed.primary)) {
      api.handleButton('tutorial:ok');
      syncMenu(true);
      return;
    }

    if (build) {
      // Cursor move: one press = one grid cell. The template mirrors the D-pad onto the analog
      // axes too, so the analog path must be skipped while a D-pad direction is still DOWN, not
      // only on its edge frame — a 200 ms hold used to move 70 px (playtest round 4, item 3).
      // A held D-pad repeats at 120 ms, which keeps a long move fast without losing one-cell nudges.
      const padD = (f.pad && f.pad.down) || {};
      const padDir = { left: !!padD[14], right: !!padD[15], up: !!padD[12], down: !!padD[13] };
      const padDirHeld = padDir.left || padDir.right || padDir.up || padDir.down;
      const edgeMove = f.pressed.left || f.pressed.right || f.pressed.up || f.pressed.down;
      if (!edgeMove && !padDirHeld && f.pad.connected && (Math.abs(f.pad.x) > 0.24 || Math.abs(f.pad.y) > 0.24)) {
        G.cursor.x = clamp(G.cursor.x + f.pad.x * STICK_RATE * dt, -200, 1200);
        G.cursor.y = clamp(G.cursor.y + f.pad.y * STICK_RATE * dt, -100, 780);
      }
      const nowMs = performance.now();
      if (f.pressed.left) { G.cursor.x -= STEP; padRepeat.left = nowMs + 380; }
      if (f.pressed.right) { G.cursor.x += STEP; padRepeat.right = nowMs + 380; }
      if (f.pressed.up) { G.cursor.y -= STEP; padRepeat.up = nowMs + 380; }
      if (f.pressed.down) { G.cursor.y += STEP; padRepeat.down = nowMs + 380; }
      for (const d of ['left', 'right', 'up', 'down']) {
        if (!padDir[d]) { padRepeat[d] = 0; continue; }
        if (padRepeat[d] && nowMs >= padRepeat[d]) {
          if (d === 'left') G.cursor.x -= STEP;
          else if (d === 'right') G.cursor.x += STEP;
          else if (d === 'up') G.cursor.y -= STEP;
          else G.cursor.y += STEP;
          padRepeat[d] = nowMs + 120;
        }
      }
      G.cursor.x = clamp(G.cursor.x, -200, 1200);
      G.cursor.y = clamp(G.cursor.y, -100, 780);

      if (f.pressed.pick) pickOrPlace();
      if (f.pressed.snap) snapCursor();
      if (f.pressed.undo) api.handleButton('undo');
      if (f.pressed.redo) api.handleButton('redo');
      if (f.pressed.deck) api.handleButton('deck');
      if (f.pressed.brace) api.handleButton('brace');
      if (f.pressed.erase) {
        api.handleButton('erase');
        api.toast(!G.erase ? 'ERASE OFF'
          : input.device === 'touch' ? 'ERASE ON — TAP A BEAM'
          : input.device === 'pad' ? 'ERASE ON — A REMOVES THE BEAM UNDER THE CURSOR'
          : 'ERASE ON — SPACE REMOVES THE BEAM UNDER THE CURSOR');
      }
      if (f.pressed.mat1) api.handleButton('mat:wood');
      if (f.pressed.mat2) api.handleButton('mat:steel');
      if (f.pressed.mat3) api.handleButton('mat:carbon');
      if (f.pressed.matcycle) {
        const order = ['wood', 'steel', 'carbon'];
        const next = order[(order.indexOf(G.mat) + 1) % order.length];
        api.handleButton('mat:' + next);
        api.toast('MATERIAL ' + next.toUpperCase());
      }
      if (f.pressed.zoomin) G.view.zoom = clamp(G.view.zoom * 1.15, 1, 2.6);
      if (f.pressed.zoomout) G.view.zoom = clamp(G.view.zoom / 1.15, 1, 2.6);
      // Escape is both pause and back in the template: only B (a pad press) leaves the build.
      if (f.pressed.back && f.device === 'pad') { if (picked) cancelPick(); else api.handleButton('levels'); }

      // keep the cursor on screen when zoomed in
      if (G.view.zoom > 1.02) {
        const lv = G.level;
        const target = G.cursor.x - (lv.left.edge + lv.right.edge) / 2;
        G.view.panX += (clamp(target, -420, 420) - G.view.panX) * 0.12;
        const ty = G.cursor.y - (lv.left.top + lv.right.top) / 2;
        G.view.panY += (clamp(ty, -240, 240) - G.view.panY) * 0.12;
      }

      if (G.kbDrag) {
        const pv = G.world.preview(picked, Math.round(G.cursor.x / GRID) * GRID, Math.round(G.cursor.y / GRID) * GRID,
          G.mat, G.kind, 34);
        G.kbDrag.x = Math.round(G.cursor.x / GRID) * GRID;
        G.kbDrag.y = Math.round(G.cursor.y / GRID) * GRID;
        G.kbDrag.preview = pv;
      }
      G.showCursor = input.device !== 'touch';
    } else {
      G.showCursor = false;
      if (picked) cancelPick();
    }

    // RUN / STOP: Enter/R on the keyboard, RT on the pad
    if ((G.screen === 'build' || G.screen === 'run') && !G.paused && !G.tutorial && f.pressed.run) {
      api.handleButton('run');
    }

    // On a verdict, R is a retest: the fastest route from a loss back to the drawing board.
    // Enter is left to the menu (it also counts as confirm), so it cannot fire twice.
    if (G.screen === 'result' && f.pressed.run && !f.pressed.confirm) api.handleButton('retry');

    // B on the pad leaves a run; Escape stays the pause key.
    if (live && f.pressed.back && f.device === 'pad' && G.screen === 'run') api.handleButton('levels');

    syncMenu(false);
    G.uiHint = { device: input.device, pad: input.padConnected(), shown: hintDevice() };
  }

  /* ---------- boot ---------- */

  function init() {
    if (input) return;
    input = AI.create({
      surface: '#game',
      actions: ['left', 'right', 'up', 'down', 'pick', 'run', 'brace', 'deck', 'undo', 'redo',
                'erase', 'snap', 'zoomin', 'zoomout', 'mat1', 'mat2', 'mat3', 'matcycle'],
      bindings: {
        left:   { keys: ['ArrowLeft', 'KeyA'], pad: ['LEFT'] },
        right:  { keys: ['ArrowRight', 'KeyD'], pad: ['RIGHT'] },
        up:     { keys: ['ArrowUp', 'KeyW'], pad: ['UP'] },
        down:   { keys: ['ArrowDown', 'KeyS'], pad: ['DOWN'] },
        pick:   { keys: ['Space'], pad: ['A'], mouse: [] },
        run:    { keys: ['Enter', 'KeyR'], pad: ['RT'], mouse: [] },
        brace:  { keys: ['KeyG'], pad: ['X'], mouse: [] },
        deck:   { keys: ['KeyF'], pad: ['Y'], mouse: [] },
        undo:   { keys: ['KeyZ', 'Backspace'], pad: ['LB'], mouse: [] },
        redo:   { keys: ['KeyY'], pad: ['RB'], mouse: [] },
        erase:  { keys: ['KeyE'], pad: ['LT'], mouse: [] },
        snap:   { keys: ['Home', 'KeyH'], pad: ['RS'], mouse: [] },   // LS/DPAD are stick pseudo-names: never button edges
        zoomin: { keys: ['Equal', 'NumpadAdd'], pad: [], mouse: [] },
        zoomout: { keys: ['Minus', 'NumpadSubtract'], pad: [], mouse: [] },
        mat1:   { keys: ['Digit1'], pad: [], mouse: [] },
        mat2:   { keys: ['Digit2'], pad: [], mouse: [] },
        mat3:   { keys: ['Digit3'], pad: [], mouse: [] },
        matcycle: { keys: [], pad: ['BACK'], mouse: [] },   // a pad has no material row: cycle it
        primary: { keys: ['Space', 'Enter'], pad: ['A'], mouse: [] }    // menus only: a canvas click must build, not RUN
      },
      labels: { primary: 'BUILD', secondary: 'BRACE', pause: 'PAUSE' },
      touchButtons: [],
      stick: false,                 // the playfield is the drag surface: no thumb stick, no touch zone
      dragMove: false,              // a mouse drag builds a beam; it must not also pan the camera
      promptBase: 'prompts/',
      isRunning: () => (G.screen === 'build' || G.screen === 'run') && !G.paused && !G.tutorial,
      onPause: () => { G.paused = true; api.relayout(); },
      onResume: () => { G.paused = false; api.relayout(); },
      onRefit: () => api.relayout()
    });

    input.audio.attach(() => { A.resume(); return A.ctx; });
    dropThumbButtons();
    input.on('device', () => { syncMenu(true); });

    menu = input.menu({
      items: [],
      onFocus: (i, it) => { G.focusId = it.id; },
      onPress: (i, it) => { api.handleButton(it.id); syncMenu(true); },
      onBack: () => backForScreen()
    });

    G.cursor = { x: 0, y: 0 };
    G.showCursor = false;
    G.focusId = null;
    G.kbDrag = null;
    homeCursor();

    input.installHook({
      getState: stateWord,
      getScore: scoreValue,
      getPlayer: playerPos,
      start: () => api.start(),
      restart: () => api.handleButton('retry'),
      pause: () => input.pause.pause('input'),
      resume: () => input.pause.resume(),
      fields: {
        screen: () => G.screen,
        levelIndex: () => G.levelIndex,
        campaignDone: () => !!G.campaignDone,
        eraseMode: () => !!G.erase,
        padPrompts: () => hintDevice(),
        running: () => G.mode,
        beamCount: () => (G.world ? G.world.beams.length : 0),
        tiersCrossed: () => { const r = T(); return r && r.heaviest >= 0 ? r.heaviest + 1 : 0; },
        runSpeed: () => G.runSpeed,
        mat: () => G.mat,
        view: () => ({ zoom: G.view.zoom, panX: G.view.panX, panY: G.view.panY }),
        cursor: () => ({ x: Math.round(G.cursor ? G.cursor.x : 0), y: Math.round(G.cursor ? G.cursor.y : 0) }),
        picked: () => !!picked,
        hint: () => G.uiHint || null,
        focusId: () => G.focusId || null,
        hasSave: () => !!G.tutorialSeen,
        cam: () => ({ scale: R.view.scale, ox: R.view.ox, oy: R.view.oy, w: R.W, h: R.H, zoom: R.view.zoom }),
        goal: () => G.level && G.level.goal !== undefined ? G.level.goal : 8,
        level: () => (G.level ? {
          id: G.level.id, name: G.level.name, left: G.level.left, right: G.level.right,
          piers: G.level.piers || [], noUnderDeck: !!G.level.noUnderDeck,
          goal: G.level.goal, gold: G.level.gold, par: G.level.par,
          maxBeam: G.world ? G.world.maxBeam : 300,
        } : null),
        // Every joint on the bridge, so a probe (or the playthrough bot) can build on real bolts
        // instead of guessing fractions of the viewport.
        joints: () => (G.world ? G.world.nodes.map((n) => ({
          x: Math.round(n.body.position.x * 10) / 10, y: Math.round(n.body.position.y * 10) / 10,
          anchor: !!n.anchor,
        })) : []),
        par: () => (G.level && G.level.par) || 0,
        best: () => (G.best && G.level && G.best[G.level.id] !== undefined) ? G.best[G.level.id] : -1,
        medal: () => (G.result ? G.result.medal : null),
        verdict: () => (G.result ? G.result.why : null),
        noDeck: () => !!G.noDeck,
        toastText: () => (G.toast ? G.toast.text : null),
        // Every deck-level joint with no ground path: the reading behind the red rings and the
        // "NO GROUND PATH" toast. A probe can prove the toast never lies about a tied bridge.
        untied: () => (G.world ? G.world.nodes.filter((n) => !n.anchor && n.beams.some((b) => b.kind === 'road') && G.world.nodeCredit(n) < 0.15).length : 0),
        runAttempted: () => !!G.runAttempted,
        coach: () => G.coach || null,
        idleSeconds: () => Math.round((G.idle || 0) * 10) / 10,
        demoRun: () => !!G.autoRan,
        culprit: () => (G.culprit ? { x: Math.round(G.culprit.x), y: Math.round(G.culprit.y) } : null)
      },
      ui: uiRects
    });

    syncMenu(true);
  }

  const module_export = { init, frame, drawHints, homeCursor, syncMenu, cancelPick, pickOrPlace, hintDevice,
    get input() { return input; } };
  root.BW_CONTROLS = module_export;
  if (root.BW_GAME && root.BW_GAME.booted) init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
