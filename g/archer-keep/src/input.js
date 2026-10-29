// Archer.Input — drag aim + hold-draw release-fire; minimap tap = camera jump; two-finger drag = pan.
Archer.Input = (function(){
  const C = () => Archer.CFG;
  let cv = null, game = null;
  let pressing = false, startX = 0, startY = 0, curX = 0, curY = 0, drawT = 0;
  let aimRefX = 0, aimRefY = 0, nockT = 0;
  let panLastX = null, multiTouch = false;
  // M9: pointer-id tracking, so two fingers really pan with modern PointerEvents. The old code
  // only looked at e.touches, which is undefined on pointer events — the pan never fired.
  let pointers = {}, pressId = undefined;
  function scr(e){ return { x: e.clientX, y: e.clientY }; }
  function countPointers(){ return Object.keys(pointers).length; }
  function avgX(){
    const ks = Object.keys(pointers); if(!ks.length) return 0;
    const r = cv.getBoundingClientRect();
    const sc = (Archer.CFG && Archer.CFG.viewScale) ? Archer.CFG.viewScale() : (C().W / r.width);
    let s = 0; for(const k of ks) s += (pointers[k].x - r.left) / sc;
    return s / ks.length;
  }
  // aim: default 45deg up-right; drag sets angle vector from release point relative to archer
  let aimAngle = -45;
  // M11: the raw drag angle, plus the ballistic target the bow has locked onto. aimAngle is the
  // SOLVED angle, so the aim guide, the archer's bow and the arrow all read the same number.
  let rawAim = -45, aimLocked = null;
  // Arcade QA (2026-10-24): keyboard and pad draw through the same charge meter the finger fills.
  let extDraw = false, aimT = 0, lastDrawPct = 25;

  function init(canvas, gameRef){
    cv = canvas; game = gameRef;
    const unlock = () => Archer.Audio.unlock();
    if(window.PointerEvent){
      cv.addEventListener('pointerdown', down);
      cv.addEventListener('pointermove', move);
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', cancel);
    } else {
      cv.addEventListener('touchstart', tStart, {passive:false});
      cv.addEventListener('touchmove', tMove, {passive:false});
      cv.addEventListener('touchend', up);
    }
    cv.addEventListener('touchstart', e => { e.preventDefault(); unlock(); }, {passive:false});
    document.addEventListener('pointerdown', unlock, {once:false});
  }
  function pt(e){
    if(e.touches && e.touches.length) return { x:e.touches[0].clientX, y:e.touches[0].clientY };
    return { x:e.clientX, y:e.clientY };
  }
  function canvasXY(p){
    const r = cv.getBoundingClientRect();
    // M7: map css px -> design px via the live view scale (portrait = 1:1, landscape scales)
    const sc = (Archer.CFG && Archer.CFG.viewScale) ? Archer.CFG.viewScale() : (C().W / r.width);
    return { x: (p.x - r.left) / sc, y: (p.y - r.top) / sc };
  }
  function down(e){
    if(game.State && game.State.status !== 'playing') return;
    if(game.State && game.State.roundState === 'incoming') return;
    if(e.pointerId !== undefined){ pointers[e.pointerId] = scr(e); }
    // Two fingers = pan the field. Never aim or fire on a pan gesture.
    if(countPointers() >= 2){
      multiTouch = true; pressing = false; panLastX = avgX();
      e.preventDefault && e.preventDefault();
      return;
    }
    const p = canvasXY(pt(e));
    // minimap tap → camera jump (no aim)
    if(Archer.Minimap){
      const wx = Archer.Minimap.tap(p.x, p.y);
      if(wx !== null){ Archer.Camera.jump(wx); return; }
    }
    pressing = true; pressId = e.pointerId; startX = p.x; startY = p.y; curX = p.x; curY = p.y; drawT = 0;
    // capture the archer's screen position AT PRESS — camera drift during the hold
    // must not rotate the aim under the player's finger
    aimRefX = C().CASTLE.x - (Archer.Camera ? Archer.Camera.x : 0);
    aimRefY = C().CASTLE.baseY + C().ARCHER.yOff;
    updateAim();
    e.preventDefault && e.preventDefault();
  }
  function move(e){
    if(e.pointerId !== undefined && pointers[e.pointerId]) pointers[e.pointerId] = scr(e);
    // two-finger horizontal drag = camera pan (pointer events AND the legacy touch fallback)
    if(countPointers() >= 2 || (e.touches && e.touches.length >= 2) || multiTouch){
      multiTouch = true;
      const ax = avgX();
      if(panLastX !== null) Archer.Camera.pan(ax - panLastX);
      panLastX = ax;
      pressing = false;
      e.preventDefault && e.preventDefault();
      return;
    }
    if(!pressing){ panLastX = null; return; }
    const p = canvasXY(pt(e));
    curX = p.x; curY = p.y;
    updateAim();
    e.preventDefault && e.preventDefault();
  }
  function updateAim(){
    // M7 AIM OVERHAUL: aim = direction of the DRAG DELTA (slingshot), not the absolute vector
    // from the archer. In landscape the archer sits far left; absolute vectors were always near-flat
    // (owner: "can't aim at far enemies"). Now: press anywhere, drag the direction you want to shoot.
    let dx = curX - startX, dy = curY - startY;
    if(dx*dx + dy*dy < 200) { dx = 100; dy = -100; } // tap (no drag): keep last aim
    let ang = Math.atan2(dy, dx) * 180/Math.PI;
    rawAim = Archer.U.clamp(ang, C().AIM.minAngle, C().AIM.maxAngle);
    applyAssist();
  }
  // The bow solves the drop when the drag points at a body (Archer.Aim). Run again every frame:
  // the draw is rising, so the solved angle changes with range.
  // M12: keyboard and pad get the same solve. Before this only a mouse drag or a finger locked,
  // so key/pad players aimed blind against the drop (playtest item 5).
  function applyAssist(force){
    aimAngle = rawAim; aimLocked = null;
    if((force || pressing || extDraw || aimT > 0) && window.Archer && Archer.Aim && Archer.Aim.assist){
      const r = Archer.Aim.assist(rawAim, drawPct());
      if(r){
        aimAngle = Archer.U.clamp(r.angle, C().AIM.minAngle, C().AIM.maxAngle);
        aimLocked = r.target || null;
      }
    }
  }
  // Called by the game on release so the last solved angle (not the previous frame's) is fired.
  function refreshAim(){ applyAssist(true); return aimAngle; }
  function aimLock(){ return aimLocked; }
  function up(e){
    if(e && e.pointerId !== undefined) delete pointers[e.pointerId];
    const wasPan = multiTouch;
    if(countPointers() === 0){ panLastX = null; multiTouch = false; }
    if(wasPan || !pressing) return;
    if(e && e.pointerId !== undefined && pressId !== undefined && e.pointerId !== pressId) return;
    pressing = false; pressId = undefined;
    if(game.State && game.State.status === 'playing' && game.State.roundState !== 'incoming'){
      game.releaseFire();
    }
  }
  function cancel(e){
    if(e && e.pointerId !== undefined) delete pointers[e.pointerId];
    pressing = false; panLastX = null; multiTouch = false; pressId = undefined;
  }
  function tStart(e){ down(e); }
  function tMove(e){ move(e); }
  function startNock(){ nockT = C().AIM.nockTime; }   // called by game after a successful fire

  // ---- keyboard / pad drive -------------------------------------------------
  function nudgeAim(delta){                         // degrees; positive aims lower on screen
    rawAim = Archer.U.clamp(rawAim + delta, C().AIM.minAngle, C().AIM.maxAngle);
    applyAssist(true);                              // the guide shows the shot that will land
    aimT = 1.6;                                     // keep the aim guide on screen a moment
  }
  function setExternalDraw(on){ extDraw = !!on; if(on) aimT = 1.6; }
  function externalDraw(){ return extDraw; }
  function showingAim(){ return aimT > 0; }

  // per-frame draw charge while pressing
  function tick(dt){
    if(nockT > 0) nockT -= dt;             // can't draw until previous arrow nocked
    if(aimT > 0) aimT -= dt;
    if((pressing || extDraw) && nockT <= 0) drawT = Math.min(1.15, drawT + dt / C().ARCHER.drawTime);
    if(pressing || extDraw || aimT > 0) applyAssist();   // power rose: re-solve the drop so the guide stays true
    if(drawT > 0) lastDrawPct = drawPct();
  }
  function drawPct(){
    const over = drawT > 1 ? 1 + (drawT-1)*0.15 : drawT;   // slight overdraw bonus
    return Math.round(Archer.U.lerp(C().AIM.drawMin, C().AIM.drawMax, Math.min(1.15, over)));
  }
  function canFire(){ return nockT <= 0; }
  function nockLeft(){ return Math.max(0, nockT); }
  function isPressing(){ return pressing || extDraw; }
  function getAim(){ return aimAngle; }
  function info(){ return { pressing: pressing || extDraw, aimAngle, drawT: +drawT.toFixed(2),
                            drawPct: drawPct(), external: extDraw, device: Archer.Controls ? Archer.Controls.getDevice() : 'touch' }; }
  function resetDraw(){ drawT = 0; }
  function idleDrawPct(){ return lastDrawPct; }

  return { init, tick, drawPct, canFire, isPressing, getAim, info, resetDraw, startNock, aimLock,
           refreshAim, nudgeAim, setExternalDraw, externalDraw, showingAim, idleDrawPct, nockLeft };
})();
