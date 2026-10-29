// Archer.Aim — ballistic aim assist for DRAG aiming (touch and mouse).
//
// Why this exists (M11, 2026-10-25):
// The archer stands 226 design units above the lane, so the launch angle that hits a body is NOT
// the line of sight to it. A player drags at the orc (about +20 deg down), gravity drops the shot,
// and the correct angle for a nearby body is ~0 or ~-86 deg. The tester dragged straight at the
// horde, fired 11 full-power arrows and killed nothing, then could not judge the game.
//
// The assist: if the drag points at a body (within TOL_DEG of the line of sight), the bow solves
// the ballistic angle that passes through that body and LEADS its walk. The guide reads the solved
// angle, so what the screen shows is exactly what the arrow does. Outside the cone the raw drag
// angle is used, so a deliberate lob still works.
Archer.Aim = (function(){
  const C = () => Archer.CFG;
  const TOL_DEG = 20;      // how far off the line of sight a drag may be and still lock
  const MAX_LEAD_T = 1.6;  // s; a lobbed shot at max range takes ~1.3 s
  let lock = null;

  function launchPoint(){
    const Cfg = C();
    return { x: Cfg.CASTLE.x, y: Cfg.CASTLE.baseY + Cfg.ARCHER.yOff };
  }
  // Launch speed for a draw %, the selected arrow and the Heavy Draw upgrades. Must match Bow.fire.
  function speedFor(drawPct){
    const Cfg = C();
    const sel = (Archer.Bow && Archer.Bow.state) ? Archer.Bow.state().sel : 'broadhead';
    const def = Cfg.ARROWS[sel] || Cfg.ARROWS.broadhead;
    const mul = (Archer.Bow && Archer.Bow.speedMul) ? Archer.Bow.speedMul() : 1;
    return (Cfg.AIM.speedMin + (Cfg.AIM.speedMax - Cfg.AIM.speedMin) * (drawPct / 100)) * def.speed * mul;
  }
  // Launch angles (deg, screen convention: +down) that put the arrow through a point at (dx, D),
  // where D = target y - launch y. Returns [] when the point is out of range.
  function solve(dx, D, v){
    const g = C().GRAVITY * 0.75;
    if(!(dx > 8) || !(v > 20)) return [];
    const k = g * dx * dx / (2 * v * v);
    const disc = dx * dx - 4 * k * (k - D);
    if(disc < 0) return [];
    const s = Math.sqrt(disc);
    const out = [];
    [(-dx + s) / (2 * k), (-dx - s) / (2 * k)].forEach(function(u){
      if(isFinite(u)){
        const deg = Math.atan(u) * 180 / Math.PI;
        if(deg >= C().AIM.minAngle && deg <= C().AIM.maxAngle) out.push(deg);
      }
    });
    return out;
  }
  function walkSpeed(e){
    const Cfg = C();
    const RC = Cfg.ROUND;
    if(!e.def) return 0;
    const r = (Archer.Game && Archer.Game.State && Archer.Game.State.round) || 1;
    let spd = e.def.spd * RC.spdMul(r);
    if(e.slow > 0) spd *= 0.45;
    return spd;
  }
  // Pick the enemy whose line of sight is closest to the drag, then solve for it (with one lead
  // correction pass). Returns { angle, target } or null.
  function assist(rawAngle, drawPct){
    lock = null;
    if(!Archer.Enemies || !Archer.Enemies.all) return null;
    const Cfg = C(), L = launchPoint(), v = speedFor(drawPct);
    const list = Archer.Enemies.all();
    let best = null;
    for(let i = 0; i < list.length; i++){
      const e = list[i];
      if(!e || !e.def) continue;
      const dx0 = e.x - L.x;
      if(dx0 < 30) continue;                                  // behind or on the keep
      const bodyY = e.y - e.def.h * 0.5;                      // body centre (flies: e.y is the belly)
      const los = Math.atan2(bodyY - L.y, dx0) * 180 / Math.PI;  // line of sight, + = down
      const err = Math.abs(los - rawAngle);
      if(err > TOL_DEG) continue;
      if(best && err >= best.err) continue;
      best = { err: err, e: e };
    }
    if(!best) return null;

    const e = best.e;
    const bodyY = e.y - e.def.h * 0.5;
    const spd = walkSpeed(e);
    let sols = solve(e.x - L.x, bodyY - L.y, v);
    if(!sols.length) return null;
    // Lead the walk: solve once, learn the flight time, solve again at the future position.
    const pick = function(dx){
      const s = solve(dx, bodyY - L.y, v);
      if(!s.length) return null;
      let bestA = s[0], bestE = Math.abs(s[0] - rawAngle);
      for(let j = 1; j < s.length; j++){
        const err2 = Math.abs(s[j] - rawAngle);
        if(err2 < bestE){ bestA = s[j]; bestE = err2; }
      }
      return bestA;
    };
    let ang = pick(e.x - L.x);
    if(ang === null) return null;
    const t = Math.min(MAX_LEAD_T, (e.x - L.x) / Math.max(60, v * Math.cos(ang * Math.PI / 180)));
    const leadX = e.x - spd * t;
    const ang2 = pick(leadX - L.x);
    if(ang2 !== null) ang = ang2;
    lock = e;
    return { angle: ang, target: e };
  }
  function getLock(){ return lock; }
  return { assist: assist, getLock: getLock, solve: solve, speedFor: speedFor, TOL_DEG: TOL_DEG };
})();
