// Tank.Phys — ballistics: fixed-step integration, honest preview, aim solver
Tank.Phys = (function(){
  const G = Tank.CFG.GRAVITY;
  const STEP = 1/120;              // fixed physics step; the preview uses the same one

  // one physics sub-step
  function step1(sh, wind){
    const windA = wind * Tank.CFG.WIND_MAX;
    sh.vx += windA * STEP / (sh.mass||1);
    sh.vy += G * STEP;
    sh.x += sh.vx * STEP;
    sh.y += sh.vy * STEP;
    return sh;
  }

  // advance a shell by dt using fixed sub-steps so flight matches the preview
  function stepShot(sh, dt, wind){
    const n = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / n;
    const windA = wind * Tank.CFG.WIND_MAX;
    for(let i=0;i<n;i++){
      sh.vx += windA * h / (sh.mass||1);
      sh.vy += G * h;
      sh.x += sh.vx * h;
      sh.y += sh.vy * h;
    }
    return sh;
  }

  function muzzleVel(powerPct){
    return 190 + (powerPct/100)*300;   // 250..490 world units/s: the whole slider is usable
  }

  // dotted trajectory preview. Same fixed step as the real shell, so it cannot lie.
  // samples: one point every 6 steps = 0.05 s. 60 samples = 3 s of flight.
  function ballisticPreview(x0, y0, angleDeg, powerPct, wind, samples, dir, terrain, mass){
    const a = angleDeg*Math.PI/180, d = dir===undefined?1:dir;
    const v0 = muzzleVel(powerPct);
    const sh = { x:x0 + Math.cos(a)*30*d, y:y0 - Math.sin(a)*30,
                 vx:Math.cos(a)*v0*d, vy:-Math.sin(a)*v0, mass:mass||1 };
    const pts = [];
    const total = (samples||60)*6;
    for(let i=0;i<total;i++){
      step1(sh, wind);
      if((i+1)%6===0) pts.push({x:sh.x, y:sh.y});
      if(terrain && terrain.propHitAt && terrain.propHitAt(sh.x, sh.y)) break;
    }
    return pts;
  }

  // simulate a full shot against the terrain; returns {x,y,t} at ground contact
  function simShot(x0, y0, angleDeg, powerPct, wind, terrain, dir, mass){
    const a = angleDeg*Math.PI/180, d = dir===undefined?1:dir;
    const v0 = muzzleVel(powerPct);
    const sh = { x:x0 + Math.cos(a)*30*d, y:y0 - Math.sin(a)*30,
                 vx:Math.cos(a)*v0*d, vy:-Math.sin(a)*v0, mass:mass||1 };
    let t = 0;
    for(let i=0;i<900;i++){
      step1(sh, wind);
      t += STEP;
      if(sh.y >= terrain.heightAt(sh.x) || sh.y > Tank.CFG.WORLD_H) return {x:sh.x, y:sh.y, t};
      if(terrain.propHitAt && terrain.propHitAt(sh.x, sh.y)) return {x:sh.x, y:sh.y, t, prop:true};
    }
    return {x:sh.x, y:sh.y, t};
  }

  // aim solver: coarse sweep, then a local refine. Used by the AI and by test bots.
  function solve(fromX, fromY, targetX, wind, terrain, opts){
    opts = opts || {};
    const aMin = opts.aMin!==undefined?opts.aMin:12;
    const aMax = opts.aMax!==undefined?opts.aMax:82;
    const pMin = opts.pMin!==undefined?opts.pMin:18;
    const pMax = opts.pMax!==undefined?opts.pMax:100;
    let best = {err:1e9, angleDeg:45, powerPct:60, landX:0, t:0};
    const dir = opts.dir===undefined?1:opts.dir;
    const mass = opts.mass||1;
    function test(ang, pow){
      const r = simShot(fromX, fromY, ang, pow, wind, terrain, dir, mass);
      const e = Math.abs(r.x - targetX);
      if(e < best.err) best = {err:e, angleDeg:ang, powerPct:pow, landX:r.x, t:r.t};
    }
    for(let ang=aMin; ang<=aMax; ang+=4) for(let pow=pMin; pow<=pMax; pow+=10) test(ang, pow);
    const a0 = best.angleDeg, p0 = best.powerPct;
    for(let da=-4; da<=4; da+=0.5) for(let dp=-9; dp<=9; dp+=1.5) test(a0+da, p0+dp);
    return best;
  }

  function belowGround(x, y, terrain){
    return y >= terrain.heightAt(x);
  }

  return { stepShot, step1, ballisticPreview, muzzleVel, belowGround, simShot, solve, G, STEP };
})();
