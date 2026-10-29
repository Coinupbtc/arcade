// Archer.Cauldron — boiling cauldron on the wall: fills slowly, dumps on wall attackers (M2)
// Liquids upgrade in tiers: water → oil → tar → lava (damage + refill speed via shop).
Archer.Cauldron = (function(){
  const C = () => Archer.CFG;
  // tier: 0 not built, 1 water, 2 oil, 3 tar, 4 lava
  const TIERS = [
    null,
    { name:'WATER',      dmg: 10, fillRate: 3.2, color:'#7fd4f0', steam:'#cfeeff' },
    { name:'BOILING OIL',dmg: 18, fillRate: 2.8, color:'#e8c25a', steam:'rgba(255,220,140,0.9)' },
    { name:'TAR',        dmg: 26, fillRate: 2.4, color:'#3a3a3a', steam:'rgba(90,90,90,0.7)' },
    { name:'LAVA',       dmg: 40, fillRate: 2.0, color:'#ff5a2a', steam:'rgba(255,140,60,0.9)' },
  ];
  let tier = 0, charge = 0, max = 100, dumpFx = 0, dumpX = 0;
  let dmgMul = 1, fillMul = 1;   // shop multipliers (Heated Vat / Bigger Vat)

  function reset(){ tier = 0; charge = 0; dmgMul = 1; fillMul = 1; dumpFx = 0; }
  function setTier(n){ tier = Math.max(tier, n); charge = 0; }
  function getTier(){ return tier; }
  function level(){ return charge / max; }
  function isBuilt(){ return tier > 0; }

  function upgrade(id){
    if(id === 'cauldron'){
      // first build → tier 1 (water); each further purchase bumps tier up to 4
      if(tier === 0){ tier = 1; charge = 0; return true; }
      if(tier < 4){ tier++; charge = 0; return true; }
      return false;
    }
    if(id === 'vatHeat'){ dmgMul += 0.35; return true; }
    if(id === 'vatBig'){ fillMul += 0.3; return true; }
    return false;
  }

  function update(dt, api){
    if(tier <= 0) return;
    const T = TIERS[tier];
    charge = Math.min(max, charge + T.fillRate * fillMul * dt);
    if(dumpFx > 0) dumpFx -= dt;
  }

  // Called by Enemies when a unit is chewing/hitting at the wall.
  // Dumps automatically when 50%+ charged and an enemy is near the wall; consumes all charge.
  function tryDump(enemies){
    if(tier <= 0 || charge < max * (C().CAULDRON ? C().CAULDRON.minCharge : 0.6)) return 0;
    const T = TIERS[tier];
    const R = C().CAULDRON ? C().CAULDRON.dumpRadius : 70;
    // find enemies near the wall (dump radius from the gate)
    let hit = 0;
    for(const e of enemies){
      if(e.def.flies) continue;
      if(e.x <= C().CASTLE.x + 30 + R){
        Archer.Enemies.damage(e, T.dmg * dmgMul, { armorMul: 1.4 });
        if(e.hp <= 0){ /* killed via hp check next tick */ }
        hit++;
        dumpX = e.x;
      }
    }
    if(hit > 0){
      charge = 0;
      dumpFx = 0.8;
      Archer.Audio.play('burn');
      return T.dmg * dmgMul;
    }
    return 0;
  }

  // test hooks
  function testFill(n){ charge = Math.min(max, n); }
  function forceDump(){ const n = tryDump(Archer.Enemies.all()); return n; }

  function draw(ctx){
    // cauldron sits on the wall walk next to the archer platform
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    const Cfg = C();
    const px = Cfg.CASTLE.x - cam + 34, py = Cfg.CASTLE.baseY - 150;
    if(px < -40 || px > Cfg.W + 40) return;
    ctx.save();
    // pot
    ctx.fillStyle = '#37474f';
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI); ctx.fill();
    ctx.fillRect(px-11, py-3, 22, 4);
    // liquid surface when built
    if(tier > 0){
      const T = TIERS[tier];
      const lv = charge/max;
      ctx.fillStyle = T.color;
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.ellipse(px, py-3, 8.5, 2.5 + lv*1.5, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      // bubbling when full
      if(lv >= 0.99 || dumpFx > 0){
        ctx.fillStyle = T.steam || 'rgba(255,255,255,0.6)';
        for(let i=0;i<3;i++){
          const bx = px + Math.sin(Date.now()/300 + i*2)*4;
          ctx.beginPath(); ctx.arc(bx, py-8-((Date.now()/200+i*7)%10), 1.5, 0, 7); ctx.fill();
        }
      }
      // pour effect
      if(dumpFx > 0){
        ctx.strokeStyle = T.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(px+6, py); ctx.quadraticCurveTo(px+16, py+20, px+10, py+46); ctx.stroke();
      }
    }
    // legs
    ctx.strokeStyle = '#26343b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px-6, py+9); ctx.lineTo(px-8, py+16); ctx.moveTo(px+6, py+9); ctx.lineTo(px+8, py+16); ctx.stroke();
    // label
    if(tier > 0){
      ctx.fillStyle = 'rgba(232,238,252,0.6)'; ctx.font='700 6px -apple-system,sans-serif'; ctx.textAlign='center';
      ctx.fillText(TIERS[tier].name, px, py+24); ctx.textAlign='left';
    }
    ctx.restore();
  }

  return { update, tryDump, draw, upgrade, setTier, getTier, isBuilt, level, reset, testFill, forceDump };
})();
