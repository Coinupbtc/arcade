// Tank.AI — opponent: solver aim, spotter walk-in, wind, per-stage accuracy
Tank.AI = (function(){
  let cfg = Tank.CFG.STAGES[0];
  let errAngle = 10, errPower = 12;
  let lastLandX = null, lastShotNo = -1;
  let stunned = false;

  function reset(stage){
    cfg = stage || Tank.CFG.STAGES[0];
    errAngle = cfg.err0;
    errPower = cfg.err0 * 1.3;
    lastLandX = null; lastShotNo = -1; stunned = false;
  }

  function stun(){ stunned = true; }

  // remember where the AI's own shot landed (spotter correction next turn)
  function observeLanding(landX){
    if(typeof landX === 'number') lastLandX = landX;
  }

  function aim(state, terrain, mass){
    const me = state.eX, targetX = state.pX;
    const my = terrain.heightAt(me) - 26;
    // spotter: aim off by the observed miss so the next round walks in
    let aimX = targetX;
    if(lastLandX !== null){
      const miss = lastLandX - targetX;
      if(Math.abs(miss) < 420) aimX = targetX - miss * Tank.CFG.AI.walkIn;
    }
    const sol = Tank.Phys.solve(me, my, aimX, state.wind, terrain,
      {aMin:14, aMax:82, pMin:20, pMax:100, dir:-1, mass:mass||1});   // the AI fires leftward
    // error shrinks every shot; a player EMP scrambles this shot badly
    const eMul = stunned ? Tank.CFG.AI.stunErrMul : 1;
    const ea = (Math.random()*2-1) * errAngle * eMul;
    const ep = (Math.random()*2-1) * errAngle * 1.3 * eMul;
    errAngle = Math.max(cfg.errMin, errAngle * cfg.errShrink);
    if(stunned) stunned = false;
    return {
      angleDeg: Tank.U.clamp(sol.angleDeg + ea, 8, 88),
      powerPct: Tank.U.clamp(sol.powerPct + ep, Tank.CFG.POWER_MIN, Tank.CFG.POWER_MAX),
      solveErr: Math.round(sol.err),
    };
  }

  // pick a shell: the AI spends its good rounds when it is confident
  function pickAmmo(state){
    const p = state.ammoE || {};
    const r = Math.random();
    if(p.emp > 0 && errAngle < 3.2 && r < 0.5) return 'emp';
    if(p.cluster > 0 && errAngle < 3.6 && r < 0.45) return 'cluster';
    if(p.heavy > 0 && errAngle < 6 && r < 0.6) return 'heavy';
    if(p.drill > 0 && errAngle < 5 && r < 0.35) return 'drill';
    return 'standard';
  }

  function info(){ return {errAngle:Math.round(errAngle*10)/10, stunned, lastLandX}; }

  return { reset, aim, pickAmmo, stun, observeLanding, info };
})();
