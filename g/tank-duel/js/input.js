// Tank.Input — one input layer for keyboard+mouse, touch and a standard-mapping pad.
// It publishes actions to Tank.Game; it never owns game state.
Tank.Input = (function(){
  let cv = null, game = null;
  let keys = {};                 // held keyboard codes
  let dragging = false, lastX = 0, lastY = 0, firstDragDone = false;
  let device = 'keyboard';       // keyboard | touch | pad
  let padPrev = {};              // previous pad button states
  let padSeen = false;
  let axisMove = {x:0, y:0};     // pad stick, polled each frame
  const ANG_RATE = 44;           // degrees per second with a key / stick held
  const POW_RATE = 52;           // power % per second
  const DPS_PER_PX = 0.35;       // pointer drag: degrees per px
  const PPS_PER_PX = 0.55;       // pointer drag: power % per px
  const PAD_A = 0, PAD_B = 1, PAD_X = 2, PAD_Y = 3, PAD_BACK = 8, PAD_START = 9;
  const PAD_UP = 12, PAD_DOWN = 13, PAD_LEFT = 14, PAD_RIGHT = 15;

  function init(canvas, gameRef){
    cv = canvas; game = gameRef;
    if(window.PointerEvent){
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
    } else {
      cv.addEventListener('touchstart', tStart, {passive:false});
      cv.addEventListener('touchmove', tMove, {passive:false});
      cv.addEventListener('touchend', up);
      cv.addEventListener('mousedown', down);
      cv.addEventListener('mousemove', move);
      cv.addEventListener('mouseup', up);
    }
    // page must never scroll or zoom while playing
    cv.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
    document.addEventListener('touchmove', e=>{ if(e.cancelable) e.preventDefault(); }, {passive:false});
    document.addEventListener('gesturestart', e=>e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', e=>{ keys[e.code] = false; });
    window.addEventListener('blur', ()=>{ keys = {}; });
    // A connected pad does not change the prompts: only pad INPUT does.
    window.addEventListener('gamepadconnected', ()=>{ padSeen = true; });
    window.addEventListener('gamepaddisconnected', ()=>{ padSeen = false; setDevice('keyboard'); });
    // first real gesture: unlock the audio context (the iOS rule)
    const unlock = ()=>{ try{ Tank.FX.unlockAudio(); }catch(e){} };
    window.addEventListener('pointerdown', unlock, {once:true});
    window.addEventListener('touchstart', unlock, {once:true});
    window.addEventListener('keydown', unlock, {once:true});
    if(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) device = 'touch';
  }

  function setDevice(d){
    if(d === device) return;
    device = d;
    if(game && game.onDevice) game.onDevice(d);
  }
  function deviceNow(){ return device; }

  // ---------------------------------------------------------------- keyboard
  function onKeyDown(e){
    if(e.repeat) return;
    keys[e.code] = true;
    if(e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    if(e.code === 'Escape' || e.code === 'KeyP'){ game.togglePause(); return; }
    if(e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter'){ game.confirmPrimary(); return; }
    if(e.code === 'KeyB' || e.code === 'Backspace'){ game.backAction(); return; }
    if(e.code === 'KeyQ'){ game.cycleAmmo(-1); return; }
    if(e.code === 'KeyE'){ game.cycleAmmo(1); return; }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if(digit){ game.selectAmmoByIndex(+digit[1]-1); return; }
    if(game.stateName() === 'menu' || game.stateName() === 'over'){
      if(e.code === 'ArrowLeft' || e.code === 'KeyA') game.menuStep(-1);
      if(e.code === 'ArrowRight' || e.code === 'KeyD') game.menuStep(1);
    }
    setDevice('keyboard');
  }

  // ---------------------------------------------------------------- pointer (mouse + touch)
  function pt(e){
    if(e.touches && e.touches.length) return {x:e.touches[0].clientX, y:e.touches[0].clientY};
    return {x:e.clientX, y:e.clientY};
  }
  function down(e){
    if(e.pointerType === 'touch' || e.type === 'touchstart') setDevice('touch'); else setDevice('keyboard');
    if(game.stateName() !== 'play' || !game.canAim()) return;
    dragging = true; const p = pt(e); lastX=p.x; lastY=p.y;
    if(!firstDragDone){ firstDragDone=true; game.firstDrag(); }
  }
  function move(e){
    if(!dragging) return;
    const p = pt(e);
    const dx = p.x-lastX, dy = p.y-lastY;
    lastX=p.x; lastY=p.y;
    game.adjustAim(dx*DPS_PER_PX, -dy*PPS_PER_PX);
    if(e.cancelable) e.preventDefault();
  }
  function tStart(e){ e.preventDefault(); down(e); }
  function tMove(e){ move(e); }
  function up(){ dragging=false; }

  // ---------------------------------------------------------------- gamepad (polled each frame)
  function readPad(){
    let pad = null;
    try{
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      for(let i=0;i<list.length;i++){ if(list[i]){ pad = list[i]; break; } }
    }catch(e){ pad = null; }
    if(!pad || pad.mapping !== 'standard') { axisMove.x = 0; axisMove.y = 0; return; }
    padSeen = true;
    const ax = pad.axes.length>=2 ? pad.axes : [0,0];
    let x = Math.abs(ax[0])>0.18 ? ax[0] : 0;
    let y = Math.abs(ax[1])>0.18 ? ax[1] : 0;
    const b = n => !!(pad.buttons[n] && pad.buttons[n].pressed);
    if(b(PAD_LEFT)) x = -1;
    if(b(PAD_RIGHT)) x = 1;
    if(b(PAD_UP)) y = -1;
    if(b(PAD_DOWN)) y = 1;
    axisMove.x = x; axisMove.y = y;

    const cur = {A:b(PAD_A), B:b(PAD_B), X:b(PAD_X), Y:b(PAD_Y),
                 START:b(PAD_START), BACK:b(PAD_BACK),
                 UP:b(PAD_UP), DOWN:b(PAD_DOWN), LEFT:b(PAD_LEFT), RIGHT:b(PAD_RIGHT)};
    const edge = k => cur[k] && !padPrev[k];
    if(edge('START')) game.togglePause();
    // B is labelled "Back" on the menu card, so it must do what Back does.
    if(edge('BACK') || edge('B')) game.backAction();
    if(edge('A')) game.confirmPrimary();
    if(edge('X')) game.cycleAmmo(1);
    if(edge('Y')) game.cycleAmmo(-1);
    const inMenu = game.stateName()==='menu' || game.stateName()==='over';
    if(inMenu){
      if((cur.LEFT && !padPrev.LEFT) || (x < -0.6 && !padPrev.LX) || (cur.UP && !padPrev.UP)) game.menuStep(-1);
      if((cur.RIGHT && !padPrev.RIGHT) || (x > 0.6 && !padPrev.LX) || (cur.DOWN && !padPrev.DOWN)) game.menuStep(1);
    }
    padPrev = cur; padPrev.LX = Math.abs(x) > 0.6; padPrev.UP = cur.UP; padPrev.DOWN = cur.DOWN;
    padPrev.LEFT = cur.LEFT; padPrev.RIGHT = cur.RIGHT;
    if(x !== 0 || y !== 0 || edge('A') || edge('X')) setDevice('pad');
  }

  // called once per frame by the game loop: returns continuous aim deltas
  function tick(dt){
    readPad();
    let dA = axisMove.x * ANG_RATE * dt;
    let dP = -axisMove.y * POW_RATE * dt;
    if(game.stateName() === 'play'){
      if(keys['ArrowLeft'] || keys['KeyA']) dA -= ANG_RATE*dt;
      if(keys['ArrowRight'] || keys['KeyD']) dA += ANG_RATE*dt;
      if(keys['ArrowUp'] || keys['KeyW']) dP += POW_RATE*dt;
      if(keys['ArrowDown'] || keys['KeyS']) dP -= POW_RATE*dt;
    }
    return {dAngle:dA, dPower:dP, device, pad:padSeen};
  }

  function info(){ return {dragging, firstDragDone, device, padSeen}; }
  function resetDrag(){ firstDragDone = false; }

  return { init, tick, info, resetDrag, deviceNow };
})();
