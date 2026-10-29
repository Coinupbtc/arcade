/* GLOAMKEEP — input layer.
 *
 * One owner for every device. Built on the arcade-input template (copied from
 * ~/Documents/projects/arcade-input): keyboard + mouse, touch and a standard pad fold into the same
 * action names, with one pause owner, auto-pause, audio unlock and the honest window.__game hook.
 *
 * This game's verbs are SPATIAL, so the template covers the global layer (pause, pad, keys, hook,
 * prompts) and this file keeps two game-specific jobs:
 *   1. pointer taps on the canvas -> GK.Input.handleTap (tower shop, sheet, map tile).
 *   2. a tile cursor moved by W A S D / arrows / left stick / D-pad, confirmed with Space / Enter / A,
 *      so a desktop player never needs the mouse to build.
 */
window.GK = window.GK || {};

(function () {
  let api = null;                 // the ArcadeInput instance
  let menu = null;                // the focus controller (api.menu() CREATES a new menu, so keep ours)
  let device = 'keyboard';

  const CURSOR_RATE = 0.15;       // seconds per tile while a direction is held (was 0.12: ~8 tiles/s overshot)
  const CURSOR_DELAY = 0.28;      // a held direction waits this long before repeating (10-26 tester: overshoot)
  let cursorT = 0;
  let cursorHeld = false;         // a direction is being held (repeat after CURSOR_DELAY)
  let down = null;

  // ---- spatial taps (canvas) ------------------------------------------------
  function handleTap(x, y) {
    const L = GK.UI.layout();
    const S = GK.Game.S();
    GK.Audio.unlock();

    if (S.status === 'menu') {
      if (GK.UI.inRect(x, y, L.hit.start)) GK.Game.startRun();
      return;
    }
    if (S.status === 'over' || S.status === 'win') {
      if (GK.UI.inRect(x, y, L.hit.retry)) GK.Game.startRun();
      return;
    }
    if (S.paused) {
      if (GK.UI.inRect(x, y, L.hit.resume)) GK.Input.togglePause();
      else if (GK.UI.inRect(x, y, L.hit.mute)) GK.Game.toggleMute();
      return;
    }
    if (GK.UI.inRect(x, y, L.hit.speed)) { GK.Game.toggleSpeed(); return; }
    if (GK.UI.inRect(x, y, L.hit.pause)) { GK.Input.togglePause(); return; }

    if (!S.selected) {
      for (const r of L.hit.shop) {
        if (GK.UI.inRect(x, y, r)) { GK.Game.setBuild(r.type); return; }
      }
      // the 5th slot is contextual: SEND in prep, FLARE in a wave
      if (GK.UI.inRect(x, y, L.hit.send)) {
        if (S.status === 'prep') GK.Game.sendEarly();
        else GK.Game.flare();
        return;
      }
    }

    const p = L.hit.panel;
    if (p.a && GK.UI.inRect(x, y, p.a)) { GK.Game.setFireMode('a'); return; }
    if (p.b && GK.UI.inRect(x, y, p.b)) { GK.Game.setFireMode('b'); return; }
    if (p.tgt && GK.UI.inRect(x, y, p.tgt)) { GK.Game.cycleTarget(); return; }
    if (p.upg && GK.UI.inRect(x, y, p.upg)) { GK.Game.upgradeSelected(); return; }
    if (p.sell && GK.UI.inRect(x, y, p.sell)) { GK.Game.sellSelected(); return; }
    if (p.close && GK.UI.inRect(x, y, p.close)) { GK.Game.clearSelection(); return; }
    // the sheet body swallows taps: only the buttons, x, another tower or the map edge close it
    if (S.selected && L.panelRect && GK.UI.inRect(x, y, L.panelRect)) return;

    // world: one tap path for build and snap-select. Touch gets a 2-tile tolerance: on a landscape
    // phone a tile is ~17 CSS px, so a thumb miss on the 2-wide causeway used to build nothing.
    const lx = (x - L.wx) / L.scale;
    const ly = (y - L.wy) / L.scale;
    if (lx >= 0 && lx < GK.CFG.W && ly >= 0 && ly < GK.CFG.H) {
      const tol = device === 'touch' ? 2 : 0;
      const used = GK.Game.tapWorld(lx, ly, tol);
      const c = used ? used.c : Math.floor(lx / GK.CFG.TILE);
      const r = used ? used.r : Math.floor(ly / GK.CFG.TILE);
      GK.Game.setCursorTile(c, r);
      return;
    }
    GK.Game.clearSelection();
  }

  function bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      // the device in hand is the device that touched: a phone that reports no coarse pointer
      // (some emulators) still gets touch hints from its first real tap, not pad/keyboard ones
      if (e.pointerType === 'touch') GK.UI.setDevice('touch');
      else if (e.pointerType === 'mouse') GK.UI.setDevice('keyboard');
      if (e.button !== 0 && e.pointerType === 'mouse') return;   // RMB / MMB must not become a tap
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      GK.Audio.unlock();
    }, { passive: false });

    canvas.addEventListener('pointerup', e => {
      e.preventDefault();
      if (!down || e.pointerId !== down.id) return;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (dist < 16 && dt < 700) handleTap(e.clientX, e.clientY);
    }, { passive: false });

    canvas.addEventListener('pointercancel', () => { down = null; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // mouse: right-click cancels what is armed (build mode / tower sheet). Nothing is sold by RMB.
    canvas.addEventListener('pointerdown', e => {
      if (e.button === 2) { e.preventDefault(); GK.Game.cancelAction(); }
    }, { passive: false });

    // desktop: the pointer also places the tile cursor, so aim and keys agree
    canvas.addEventListener('pointermove', e => {
      const L = GK.UI.layout();
      const lx = (e.clientX - L.wx) / L.scale;
      const ly = (e.clientY - L.wy) / L.scale;
      if (lx < 0 || ly < 0 || lx >= GK.CFG.W || ly >= GK.CFG.H) return;
      GK.Game.setCursorTile(Math.floor(lx / GK.CFG.TILE), Math.floor(ly / GK.CFG.TILE));
    }, { passive: true });
  }

  // ---- the frame contract ---------------------------------------------------
  /** called once per frame by GK.Game; returns the template's frame record */
  function poll() {
    // The press that starts or restarts a run belongs to the menu, not to the run. Captured before
    // api.poll(): the menu closes inside it, so Space/Enter would otherwise also fire the game's
    // wave verb in the same frame (Space on the title sent wave 1 before the prep had begun).
    const menuWasActive = !!(menu && menu.active);
    const f = api.poll();
    device = f.device;
    const S = GK.Game.S();
    if (menuWasActive) return f;

    if (S && (S.status === 'prep' || S.status === 'wave') && !S.paused) {
      // tile cursor: one step per held direction (keys, stick, D-pad)
      const mx = Math.abs(f.move.x) > 0.35 ? Math.sign(f.move.x) : 0;
      const my = Math.abs(f.move.y) > 0.35 ? Math.sign(f.move.y) : 0;
      if (mx || my) {
        const fresh = cursorT >= CURSOR_RATE && !cursorHeld;
        cursorT += f.dt;
        if (cursorT >= CURSOR_RATE) {
          cursorT = fresh ? -CURSOR_DELAY : 0;   // the first step is instant; repeats start after a pause
          cursorHeld = true;
          if (mx) GK.Game.stepCursor(mx, 0);
          else if (my) GK.Game.stepCursor(0, my);
        }
      } else {
        cursorHeld = false;
        cursorT = CURSOR_RATE; // a fresh press moves at once (then waits CURSOR_DELAY above)
      }

      if (f.pressed.flare) GK.Game.spaceAction();
      if (f.pressed.primary) GK.Game.cursorAction();
      if (f.pressed.cancel) GK.Game.cancelAction();
      if (f.pressed.secondary) GK.Game.toggleFireMode();
      if (f.pressed.upgrade) GK.Game.upgradeSelected();
      if (f.pressed.sell) GK.Game.sellSelected();
      if (f.pressed.target) GK.Game.cycleTarget();
      if (f.pressed.modeA) GK.Game.setFireMode('a');
      if (f.pressed.modeB) GK.Game.setFireMode('b');
      if (f.pressed.speed) GK.Game.toggleSpeed();
      if (f.pressed.build1) GK.Game.setBuild('lantern');
      if (f.pressed.build2) GK.Game.setBuild('brazier');
      if (f.pressed.build3) GK.Game.setBuild('chill');
      if (f.pressed.build4) GK.Game.setBuild('arc');
      // pad-only build path: LT / RT walk the shop, A places at the cursor
      if (f.pressed.buildPrev) GK.Game.cycleBuild(-1);
      if (f.pressed.buildNext) GK.Game.cycleBuild(1);
    }
    return f;
  }

  function togglePause() {
    if (!api) return;
    api.pause.toggle();
    GK.Audio.unlock();
  }

  function isRunning() {
    const S = GK.Game.S();
    return !!S && (S.status === 'prep' || S.status === 'wave');
  }

  // ---- boot -----------------------------------------------------------------
  function start(canvas) {
    api = window.ArcadeInput.create({
      surface: canvas,
      isRunning,
      onPause: () => { const S = GK.Game.S(); if (S) S.paused = true; },
      onResume: () => { const S = GK.Game.S(); if (S) S.paused = false; },
      onRefit: () => GK.Game.resize(),
      promptBase: 'prompts/',
      labels: { primary: 'BUILD', secondary: 'MODE' },
      stick: false,            // tower defence: fingers tap tiles, they do not drive a stick
      dragMove: false,         // a drag must not drag the cursor off the tapped tile
      touchButtons: [],
      audio: true,
      // Enter inspects / builds at the cursor. Space is the wave verb (SEND in prep, FLARE in a
      // wave) so it can never be swallowed by a tower sheet the cursor happens to sit on.
      bindings: {
        primary: { keys: ['Enter'], pad: ['A'], mouse: [] }
      },
      actions: ['build1', 'build2', 'build3', 'build4', 'buildNext', 'buildPrev', 'upgrade', 'sell',
                'target', 'speed', 'modeA', 'modeB', 'cancel', 'flare']
    });

    // extra verb bindings, declared once (the template's table is action name -> keys/pad/mouse)
    const b = api.bindings;
    const set = (name, keys, pad) => {
      if (!b[name]) b[name] = { keys: [], pad: [], mouse: [], touch: null };
      b[name].keys = keys || [];
      b[name].pad = pad || [];
      b[name].mouse = [];
      b[name].touch = null;
    };
    set('build1', ['Digit1'], []);
    set('build2', ['Digit2'], []);
    set('build3', ['Digit3'], []);
    set('build4', ['Digit4'], []);
    set('upgrade', ['KeyE'], ['Y']);
    set('sell', ['KeyR'], []);       // selling is a sheet action on the pad, never an accidental B press
    set('target', ['KeyT'], ['LB']);
    set('speed', ['KeyF'], ['BACK']); // 1x / 2x. BACK rather than RB: RB is the flare bumper now
    set('flare', ['Space'], ['RB']);  // the keep lantern: SEND in prep, FLARE in a wave
    set('modeA', ['KeyQ'], []);
    set('modeB', ['KeyZ'], []);
    set('cancel', ['Backspace'], ['B']);
    // the pad has no pointer, so RT / LT pick the tower. No key equivalent: 1-4 already do it.
    set('buildNext', [], ['RT']);
    set('buildPrev', [], ['LT']);
    b.secondary.keys = ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX'];
    b.secondary.pad = ['X'];
    b.secondary.mouse = [];

    // the template's own round action button would double up with this game's painted shop
    const act = api._ui && api._ui.acts && api._ui.acts.primary;
    if (act) act.style.display = 'none';

    api.audio.attach(() => GK.Audio.ctx());

    // canvas menu: one focusable item, driven by keys / pad / touch (items are objects, not strings)
    menu = api.menu({
      items: [{ id: 'start', action: () => {
        const S = GK.Game.S();
        if (S.status === 'menu' || S.status === 'over' || S.status === 'win') GK.Game.startRun();
      } }]
    });
    api.on('device', d => { GK.UI.setDevice(d); });
    // a phone has no keyboard: show touch hints from the first frame, not after the first tap.
    // Three signals, because one is not reliable in every emulator: coarse pointer, touch points,
    // or a phone user agent.
    const coarse = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                   (navigator.maxTouchPoints || 0) > 0 ||
                   /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
    if (api.touchCapable && coarse) {
      GK.UI.setDevice('touch');
    }

    bindCanvas(canvas);

    api.installHook({
      getState: () => GK.Game.S().status,
      getScore: () => GK.Game.S().kills,
      getPlayer: () => GK.Game.cursorWorld(),
      start: () => GK.Game.startRun(),
      fields: {
        wave: () => GK.Game.S().wave,
        gold: () => GK.Game.S().gold,
        lives: () => GK.Game.S().lives,
        buildMode: () => GK.Game.S().buildMode,
        towers: () => GK.Towers.list().length,
        selectedLevel: () => (GK.Game.S().selected ? GK.Game.S().selected.level : 0),
        fireMode: () => (GK.Game.S().selected ? GK.Game.S().selected.fireMode : ''),
        cursorC: () => GK.Game.S().cursorC,
        cursorR: () => GK.Game.S().cursorR,
        enemies: () => GK.Enemies.count(),
        speed: () => GK.Game.S().speed,
        flareCd: () => GK.Game.S().flareCd,
        flareReady: () => GK.Game.S().status === 'wave' && GK.Game.S().flareCd <= 0,
        streak: () => GK.Game.S().streak,
        heat: () => GK.Game.S().heat,
        flareCdMax: () => GK.CFG.FLARE.cd,
        coach: () => GK.Game.S().coach,
        bestStreak: () => GK.Game.S().bestStreak,
        bestLight: () => GK.Game.S().bestLight,
        grade: () => GK.Game.grade(),
        maxLevel: () => GK.CFG.MAX_LEVEL,
        marked: () => GK.Enemies.list().filter(e => !e.dead && e.markT > 0).length,
      }
    });

    syncMenu();
  }

  /** menu focus follows the run state: only the title and the end screens have a button */
  function syncMenu() {
    if (!api || !menu) return;
    const S = GK.Game.S();
    const on = S.status === 'menu' || S.status === 'over' || S.status === 'win';
    if (on && !menu.active) menu.open();
    if (!on && menu.active) menu.close();
  }

  GK.Input = {
    start, poll, handleTap, togglePause, syncMenu,
    device: () => device,
    frame: () => api
  };
})();
