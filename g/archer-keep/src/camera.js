// Archer.Camera — 390-wide viewport over a 2600-wide world (M2)
Archer.Camera = (function(){
  const C = () => Archer.CFG;
  let x = 0, target = 0, peekT = 0;   // x = left edge of viewport in world units
  function clampX(v){ return Archer.U.clamp(v, 0, C().WORLD_W - C().W); }
  function follow(wx){                 // center on world x (auto-follow target)
    target = clampX(wx - C().W/2);
  }
  function peek(wx){                   // user jumped (minimap tap)
    x = clampX(wx - C().W/2); target = x; peekT = C().CAMERA.peekT;
  }
  function pan(dwx){                   // continuous drag while held
    x = clampX(x - dwx); target = x; peekT = C().CAMERA.peekT;
  }
  // aimAt: desired LEFT EDGE of the viewport (not a center point)
  function aimAt(edgeX){ target = clampX(edgeX); }
  // followAim: during a bow draw, bias the camera toward the aim direction (lead the shot)
  function followAim(leadX){
    x = clampX(leadX);
    target = x; peekT = C().CAMERA.peekT;
  }
  // aimBias: called every frame while drawing — shifts view toward aim angle
  function aimBias(biasX){
    if(peekT > 0) return;  // don't fight an explicit peek
    x = clampX(x + biasX);
    target = x;
  }
  function tick(dt, focusX){
    if(peekT > 0){ peekT -= dt; }
    else if(focusX !== undefined && focusX !== null){
      aimAt(focusX);
      x += (target - x) * Math.min(1, dt*3);
    } else {
      x += (target - x) * Math.min(1, dt*3);
    }
    x = clampX(x);
  }
  function jump(wx){ peek(wx); }
  function isPeeking(){ return peekT > 0; }
  function screenToWorld(sx){ return sx + x; }
  function worldToScreen(wx){ return wx - x; }
  function reset(){ x = 0; target = 0; peekT = 0; }
  return { tick, jump, pan, peek, follow, isPeeking, screenToWorld, worldToScreen, reset,
           aimAt, followAim, aimBias,
           get x(){ return x; }, set x(v){ x = clampX(v); } };
})();
