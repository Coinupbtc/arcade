// Archer.Controls — one input layer for keyboard+mouse, touch and a standard-mapping pad.
// Built on the shelf's proven layer (vendor/arcade-input.js, arcade-input 1.0.0), adapted:
//   * stick:false and touchButtons:[] — Archer Keep's verb is a drag-draw-release bow, so the whole
//     playfield stays a drag surface. The template's floating stick would eat the first finger.
//   * mouse primary is NOT bound here: the game's own pointer path (src/input.js) owns mouse + touch
//     aiming, so a mouse drag cannot fire twice.
//   * keyboard and pad fold into the same actions: move = aim elevation (Y) + camera pan (X),
//     primary = hold to draw / release to loose, secondary = SALLY, ammoNext/Prev cycle arrows.
Archer.Controls = (function(){
  let ai = null, menu = null, device = 'keyboard';
  const PAN_SPEED = 520;    // design units / s
  const AIM_RATE = 42;      // degrees / s

  function aiReady(){ return typeof window.ArcadeInput !== 'undefined'; }

  function create(){
    if(!aiReady()) { return null; }
    ai = window.ArcadeInput.create({
      surface: '#cv',
      stick: false,
      touchButtons: false,        // the bow is a drag-hold-release gesture; SALLY is a DOM button
      isRunning: function(){ const st = Archer.Game.State; return !!st && st.status === 'playing'; },
      onPause: function(){ Archer.Game.setPaused(true); },
      onResume: function(){ Archer.Game.setPaused(false); },
      onRefit: function(){ if(Archer.Game.resize) Archer.Game.resize(); paintHint(this.device); },
      promptBase: 'assets/ui/prompts/',
      labels: { primary: 'DRAW', secondary: 'SALLY', pause: 'PAUSE' },
      actions: ['ammoNext', 'ammoPrev'],
      bindings: {
        move:      { keys: ['KeyA','KeyD','ArrowLeft','ArrowRight','KeyW','KeyS','ArrowUp','ArrowDown'],
                     pad: ['LS','DPAD'], touch: false },
        primary:   { keys: ['Space','Enter'], pad: ['A'], mouse: [], touch: false },
        secondary: { keys: ['KeyF'], pad: ['X'], mouse: [], touch: false },
        // M12: the arcade README and this game's control card both said "Start / B pauses". B did
        // nothing in play (the playtester measured it). B is back/leave at a menu and pause in
        // play; the input layer clears the pause edge when a menu takes the press.
        pause:     { keys: ['Escape','KeyP'], pad: ['START','B'], mouse: [] },
        confirm:   { keys: ['Enter','Space'], pad: ['A'], mouse: [] },
        back:      { keys: ['Escape'], pad: ['B'], mouse: [] },
        ammoNext:  { keys: ['KeyE','KeyR'], pad: ['Y','RB'], mouse: [] },
        ammoPrev:  { keys: ['KeyQ'], pad: ['LB'], mouse: [] }
      }
    });
    // The game's own WebAudio context is the one the sounds play through; unlock it on a gesture.
    ai.audio.attach(function(){ return Archer.Audio.ctx(); });
    ai.on('device', function(d){ device = d; paintHint(d); if(Archer.Game.refreshCoach) Archer.Game.refreshCoach(d); });
    // Hints should name the device the player is holding before the first touch, not a keyboard.
    if (ai.touchCapable) ai._setDevice('touch');
    installHook();
    paintHint(ai.device);
    return ai;
  }

  // ---- the honest window.__game hook -----------------------------------------------------------------
  function installHook(){
    ai.installHook({
      getState: function(){ return Archer.Game.rawState(); },
      getScore: function(){ const st = Archer.Game.State; return st ? (st.runCoins|0) : 0; },
      getPlayer: function(){ return { x: Math.round(Archer.Camera.x), y: Math.round(-Archer.Input.getAim()) }; },
      start: function(){ Archer.Game.start(); },
      restart: function(){ Archer.Game.start(); },
      fields: {
        round:        function(){ const st = Archer.Game.State; return st ? st.round : null; },
        roundState:   function(){ const st = Archer.Game.State; return st ? st.roundState : null; },
        aimAngle:     function(){ return Math.round(Archer.Input.getAim()); },
        aimElev:      function(){ return Math.round(-Archer.Input.getAim()); },
        aimLock:      function(){ return (Archer.Input.aimLock && Archer.Input.aimLock()) ? 1 : 0; },
        drawTier:     function(){ return (Archer.Bow.drawTierN ? Archer.Bow.drawTierN() : 0); },
        drawPct:      function(){ return Archer.Input.drawPct(); },
        shots:        function(){ return Archer.Game.shotsFired(); },
        arrows:       function(){ return Archer.Bow.activeCount(); },
        enemies:      function(){ return Archer.Enemies.alive(); },
        allyCount:    function(){ return Archer.Knights.alive(); },
        garrison:     function(){ return Archer.Garrison.all().length; },
        sallyReady:   function(){ return Archer.Knights.canSally(); },
        castleHp:     function(){ const st = Archer.Game.State; return st ? Math.round(st.castleHp) : 0; },
        archerHp:     function(){ const st = Archer.Game.State; return st ? Math.round(st.archerHp) : 0; },
        ammo:         function(){ return Archer.Game.selectedArrow(); },
        coins:        function(){ const st = Archer.Game.State; return st ? st.coins : 0; },
        runCoins:     function(){ const st = Archer.Game.State; return st ? st.runCoins : 0; },
        enemiesLeft:  function(){ return Archer.Enemies.remaining(); },
        wavesHeld:    function(){ const st = Archer.Game.State; return st ? st.wavesHeld : 0; },
        bestWave:     function(){ const st = Archer.Game.State; return st ? st.bestWave : 0; },
        runT:         function(){ const st = Archer.Game.State; return st ? Math.round(st.runT) : 0; },
        lastShotPower:function(){ return Archer.Game.lastShotPower(); },
        debug:        function(){ return Archer.Game.debugAPI(); },
        // Design-space framing, so a test can prove the fight line is clear of the DOM strip.
        framebox:     function(){
          const el = document.getElementById('hud-bottom');
          const r = el ? el.getBoundingClientRect() : null;
          const sc = (Archer.CFG.viewScale && Archer.CFG.viewScale()) || 1;
          return { groundY: Math.round(Archer.CFG.LANE.y),
                   hudTop: r ? Math.round(r.top / sc) : 0,
                   archerX: Math.round(Archer.CFG.CASTLE.x - Archer.Camera.x),
                   archerY: Math.round(Archer.CFG.CASTLE.baseY + Archer.CFG.ARCHER.yOff),
                   w: Math.round(Archer.CFG.W), h: Math.round(Archer.CFG.H) };
        },
        // The closest body still in front of the keep, in design screen units. Probes need a live
        // list (the "nearest of four" class of bug: a stale target makes the second shot miss).
        nearest:      function(){
          let best = null, bx = 1e9;
          for(const e of Archer.Enemies.all()){
            if(!e.def) continue;
            const d = e.x - Archer.CFG.CASTLE.x;
            if(d >= -20 && d < bx){ bx = d; best = e; }
          }
          if(!best) return null;
          const cam = Archer.Camera.x;
          return { x: Math.round(best.x - cam), y: Math.round(best.y - best.def.h*0.5),
                   dx: Math.round(best.x - Archer.CFG.CASTLE.x), type: best.type };
        }
      },
      ui: domUI
    });
  }

  // Rects of the game's own DOM controls, so the gate can measure every visible target.
  function domUI(){
    const out = [];
    function add(name, node){
      if(!node) return;
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      if(r.width < 1 || r.height < 1 || cs.display === 'none' || cs.visibility === 'hidden') return;
      out.push({ name: name, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    add('sally', document.getElementById('btn-sally'));
    add('resume', document.getElementById('pause-resume'));
    document.querySelectorAll('#arrow-row .ammo-chip').forEach(function(c){ add('ammo', c); });
    document.querySelectorAll('#shop .shop-card, #shop .sp-type, #shop-continue').forEach(function(c){ add('shop', c); });
    return out;
  }

  // ---- one frame -------------------------------------------------------------------------------------
  function poll(){ return ai ? ai.poll() : null; }

  // Apply a poll frame to the game: camera pan, aim elevation, draw/loose, sally, ammo.
  function drive(f, dt){
    if(!f) return;
    const st = Archer.Game.State;
    if(!st) return;
    // Between waves the shop owns the screen. Esc/P/Start or Enter/A moves on (one press, one job).
    if(st.status === 'shop'){
      if(f.pressed.pause || f.pressed.confirm) Archer.Game.nextRound();
      return;
    }
    if(st.status !== 'playing') return;
    const inp = Archer.Input;

    if(f.move){
      if(f.move.x) Archer.Camera.pan(-f.move.x * PAN_SPEED * dt);
      if(f.move.y) inp.nudgeAim(f.move.y * AIM_RATE * dt);
    }

    if(f.held.primary) inp.setExternalDraw(true);
    else if(f.released.primary || inp.externalDraw()){
      const wasDrawing = inp.externalDraw();
      inp.setExternalDraw(false);
      if(wasDrawing || f.released.primary) Archer.Game.releaseFire();
    }

    if(f.pressed.secondary) Archer.Game.sally();
    if(f.pressed.ammoNext) Archer.Game.cycleArrow(1);
    if(f.pressed.ammoPrev) Archer.Game.cycleArrow(-1);
  }

  // ---- menus -----------------------------------------------------------------------------------------
  function openStartMenu(){
    menu = ai.menu({ items: [{ id: 'play', action: function(){ Archer.Game.start(); } }], dom: '#menu' });
    menu.open(0);
  }
  function openRetryMenu(){
    menu = ai.menu({ items: [{ id: 'retry', action: function(){ Archer.Game.start(); } }], dom: '#verdict', pressOn: 'click' });
    menu.open(0);
  }
  function closeMenu(){ if(menu){ menu.close(); menu = null; } }

  // ---- device-aware hint row (Kenney CC0 prompts) -----------------------------------------------------
  const HINTS = {
    touch: [['touch_hand_open.png','DRAG: AIM'], ['touch_tap.png','HOLD: DRAW'], ['touch_tap.png','2-FINGER: PAN']],
    pad:   [['xbox_stick_l.png','AIM / PAN'], ['xbox_button_a.png','HOLD: DRAW'], ['xbox_button_x.png','SALLY'], ['xbox_button_start.png','PAUSE']],
    keyboard: [['mouse_move.png','DRAG: AIM'], ['keyboard_space.png','HOLD: DRAW'], ['keyboard_arrows.png','AIM / PAN'], ['keyboard_escape.png','PAUSE']]
  };
  // The shop is a menu, so it names the device's own menu controls — a pad player must not be stuck.
  const SHOP_HINTS = {
    touch:    'Tap a card to buy · tap NEXT WAVE',
    pad:      'DPad / LS: pick · A: buy · B: leave · Start: next wave',
    keyboard: 'Arrows: pick · Enter: buy · Esc: next wave'
  };
  function paintHint(d){
    device = d || (ai && ai.device) || 'keyboard';
    const rows = HINTS[device] || HINTS.keyboard;
    const html = rows.map(function(r){
      return '<span class="ai-prompt"><img src="assets/ui/prompts/' + r[0] + '" alt="">' +
             '<i>' + r[1] + '</i></span>';
    }).join('');
    ['hint-row', 'menu-hints'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) el.innerHTML = html;
    });
    const sh = document.getElementById('shop-hint');
    if(sh) sh.textContent = SHOP_HINTS[device] || SHOP_HINTS.keyboard;
    document.body.setAttribute('data-device', device);
  }

  return { create: create, poll: poll, drive: drive, openStartMenu: openStartMenu,
           openRetryMenu: openRetryMenu, closeMenu: closeMenu, paintHint: paintHint,
           getDevice: function(){ return device; }, get raw(){ return ai; } };
})();
