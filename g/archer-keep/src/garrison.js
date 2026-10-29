// Archer.Garrison — friendly soldier slots: buy slots (max 3) + buy soldiers to fill them.
// Types: archer (on wall), wizard, knight, shield guard — mixed traits. Bought in shop only.
Archer.Garrison = (function(){
  const C = () => Archer.CFG;
  // roster: array of {type, hp, maxHp, cd, ...} — length limited by slots
  let slots = 1, roster = [], respawnQueue = [];
  const TYPES = {
    archer:  { name:'Archer',       hp: 45, dmg: 14, range: 720, cd: 1.6, spd: 0, w: 18, h: 32, body:'#4a86c9', dark:'#2e5a8f',
               desc:'Shoots arrows from the wall' },
    wizard:  { name:'Wizard',       hp: 35, dmg: 22, range: 640, cd: 3.4, spd: 0, w: 18, h: 34, body:'#8e5ac8', dark:'#4a2a78',
               desc:'Magic bolt, slow but strong', magic: true },
    knight:  { name:'Knight',       hp: 80, dmg: 16, range: 26,  cd: 1.1, spd: 58, w: 20, h: 36, body:'#c0c8d4', dark:'#7a8698',
               desc:'Sallies out and duels on the lane' },
    guard:   { name:'Shield Guard', hp: 110, dmg: 8, range: 22,  cd: 1.4, spd: 0, w: 22, h: 38, body:'#8d99ae', dark:'#5a6474',
               desc:'Tanky wall defender, blocks climbers', guard: true },
  };

  function reset(){ slots = 1; roster = []; respawnQueue = []; }
  function getSlots(){ return slots; }
  function buySlot(){ if(slots < 3){ slots++; return true; } return false; }
  function rosterFree(){ return roster.length + respawnQueue.length < slots; }
  function countType(t){ return roster.filter(r=>r.type===t).length + respawnQueue.filter(r=>r.type===t).length; }

  function buySoldier(type){
    if(!TYPES[type]) return false;
    if(!rosterFree()) return false;
    const def = TYPES[type];
    const gateX = C().CASTLE.x + 40;
    const r = { type, def, hp: def.hp, maxHp: def.hp, cd: 0, x: gateX, y: 0,
                mode: 'wall', bob: Math.random()*6.28, sallied: false };
    if(type === 'knight') { r.mode = 'guard'; r.y = C().LANE.y; }  // knights guard in front of castle
    roster.push(r);
    return true;
  }
  function all(){ return roster; }
  function alive(){ return roster.length; }
  function defOf(t){ return TYPES[t]; }

  function damageUnit(i, amt){ const r = roster[i]; if(r) r.hp -= amt; }

  function musterRound(){
    // soldiers respawn fresh each wave
    for(const r of roster){ r.hp = r.maxHp; r.cd = 0; }
  }

  function update(dt, api){
    // api: { enemiesAll(), damageEnemy(i, amt), spawnWallArrow(x,y,dmg,magic), damageArcherGuard(n),
    //        puff, castleX, gateY }
    for(let i=roster.length-1;i>=0;i--){
      const r = roster[i], d = r.def;
      r.bob += dt*8;
      r.cd -= dt;
      if(r.type === 'knight') r.y = C().LANE.y;   // M7: lane is live (rotation-safe)
      if(r.hp <= 0){
        api.puff && api.puff(api.castleX+34, api.gateY-160, 'rgba(200,210,220,0.8)');
        roster.splice(i,1);
        continue;
      }
      if(r.mode === 'wall' || r.type === 'archer' || r.type === 'wizard'){
        // wall station: shoot at nearest enemy in range
        let best = -1, bd = 1e9;
        const es = api.enemiesAll();
        for(let j=0;j<es.length;j++){
          const e = es[j];
          if(e.def.boss && es.length > 1 && d.dmg < 20) continue;
          const dx = e.x - api.castleX;
          if(dx > 0 && dx < d.range && dx < bd){ bd = dx; best = j; }
        }
        if(best >= 0 && r.cd <= 0){
          r.cd = d.cd;
          api.spawnWallArrow(api.castleX + 34, api.gateY - 160, d.dmg, !!d.magic);
        }
        if(d.guard){
          // shield guard: absorbs climber damage
          api.damageArcherGuard(2.2*dt);
        }
      } else if(r.type === 'knight' && (r.mode === 'sallied' || r.mode === 'guard')){
        // GUARD mode: hold post in front of the castle, attack enemies that come close.
        // SALLIED mode: march forward and duel like the enemy does.
        const guardX = api.castleX + 90;   // guard post: 90 out the gate
        let best = -1, bd = 1e9;
        const es = api.enemiesAll();
        for(let j=0;j<es.length;j++){
          const e = es[j];
          if(e.def.flies) continue;
          const dx = Math.abs(e.x - r.x);
          if(dx < bd){ bd = dx; best = j; }
        }
        if(best >= 0 && bd < (r.mode==='sallied' ? 2000 : 260)){
          // engage: walk to melee range and swing
          const e = es[best];
          const dir = e.x > r.x ? 1 : -1;
          if(bd > 16) r.x += dir * d.spd * dt;
          r.cd = r.cd - dt;
          if(bd <= 24 && r.cd <= 0){
            r.cd = 1.1;
            api.damageEnemy(best, d.dmg);
            api.puff && api.puff(e.x, e.y - e.def.h/2, 'rgba(200,210,220,0.8)');
          }
        } else if(r.mode === 'guard'){
          // no threat: return to guard post
          if(Math.abs(r.x - guardX) > 6) r.x += (guardX > r.x ? 1 : -1) * d.spd * dt;
        } else {
          r.x += d.spd*dt;   // sallied with no enemies: march forward toward orc keep
        }
      }
    }
  }

  // draw: wall units on the tower platform + sallied knights ON THE LANE
  function draw(ctx){
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    const Cfg = C();
    let wallIdx = 0;
    roster.forEach((r)=>{
      if(r.type === 'knight' && (r.mode === 'sallied' || r.mode === 'guard')){
        // knights live on the lane: guarding the gate or marching out
        drawLaneKnight(ctx, r, r.x - cam, Cfg.LANE.y);
      } else if(r.mode !== 'wall'){
        const px = Cfg.CASTLE.x - cam - 20 + (wallIdx++)*14, py = Cfg.CASTLE.baseY + Cfg.ARCHER.yOff;
        if(px < -30 || px > Cfg.W+30) return;
        drawSoldier(ctx, r, px, py, wallIdx);
      } else {
        const px = Cfg.CASTLE.x - cam - 20 + (wallIdx++)*14, py = Cfg.CASTLE.baseY + Cfg.ARCHER.yOff;
        if(px < -30 || px > Cfg.W+30) return;
        drawSoldier(ctx, r, px, py, wallIdx);
      }
    });
  }
  // sallied knight on the lane — bigger, detailed, blue tabard + shield, marching legs
  function drawLaneKnight(ctx, r, x, y){
    const d = r.def;
    if(x < -40 || x > C().W + 40) return;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, C().LANE.y+3, d.w*0.5, 3, 0, 0, 7); ctx.fill();
    const step = Math.sin(r.bob*1.2)*3.2;
    // armored legs
    ctx.strokeStyle = '#78909c'; ctx.lineWidth = 2.8; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-2, y-10); ctx.lineTo(x-4+step, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2, y-10); ctx.lineTo(x+4-step, y); ctx.stroke();
    // plate body + blue tabard with emblem
    ctx.fillStyle = '#90a4ae'; ctx.fillRect(x-d.w/2, y-d.h+6, d.w, d.h-16);
    ctx.fillStyle = '#4a86c9'; ctx.fillRect(x-d.w/2+2, y-d.h+6, d.w-4, d.h-20);
    ctx.fillStyle = '#2e5a8f'; ctx.fillRect(x-d.w/2+2, y-d.h+6, d.w-4, 4);
    // emblem cross on tabard
    ctx.fillStyle = '#e8eefc';
    ctx.fillRect(x-1.2, y-d.h+12, 2.4, 8); ctx.fillRect(x-4, y-d.h+14.5, 8, 2.4);
    // belt
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x-d.w/2+2, y-8, d.w-4, 2.2);
    // sword arm + blade
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x+d.w/2-1, y-d.h+14); ctx.lineTo(x+d.w/2+4, y-d.h+1); ctx.stroke();
    ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x+d.w/2-2, y-d.h+11); ctx.lineTo(x+d.w/2+1, y-d.h+13); ctx.stroke();
    // shield with cross
    ctx.fillStyle = '#cfd8dc';
    ctx.beginPath();
    ctx.moveTo(x-d.w/2-5, y-d.h+8); ctx.lineTo(x-d.w/2+2, y-d.h+8);
    ctx.lineTo(x-d.w/2+2, y-d.h+19); ctx.lineTo(x-d.w/2-1.5, y-d.h+22); ctx.lineTo(x-d.w/2-5, y-d.h+19);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x-d.w/2-1.5, y-d.h+9.5); ctx.lineTo(x-d.w/2-1.5, y-d.h+20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-d.w/2-4.5, y-d.h+13); ctx.lineTo(x-d.w/2+1, y-d.h+13); ctx.stroke();
    // head + great helm with plume
    ctx.fillStyle = '#e0b089'; ctx.beginPath(); ctx.arc(x, y-d.h+2, 5.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.arc(x, y-d.h+1, 5.8, Math.PI*0.95, Math.PI*0.05); ctx.fill();
    ctx.fillRect(x-5.8, y-d.h+1, 11.6, 3.2);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y-d.h-4); ctx.quadraticCurveTo(x+3.5, y-d.h-9, x-0.5, y-d.h-11); ctx.stroke();
    // hp bar
    const bw = d.w+4;
    ctx.fillStyle='rgba(10,14,24,0.7)'; ctx.fillRect(x-bw/2, y-d.h-9, bw, 3);
    ctx.fillStyle= '#64b5f6';
    ctx.fillRect(x-bw/2, y-d.h-9, bw*Math.max(0,r.hp/r.maxHp), 3);
    ctx.restore();
  }
  function drawSoldier(ctx, r, x, y, idx){
    const d = r.def;
    ctx.save();
    // legs
    ctx.strokeStyle = d.dark; ctx.lineWidth = 2.4; ctx.lineCap='round';
    const step = Math.sin(r.bob)*1.5;
    ctx.beginPath(); ctx.moveTo(x-2, y-8); ctx.lineTo(x-3+step, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2, y-8); ctx.lineTo(x+3-step, y); ctx.stroke();
    // body
    ctx.fillStyle = d.body; ctx.fillRect(x-6, y-20, 12, 14);
    ctx.fillStyle = d.dark; ctx.fillRect(x-6, y-20, 12, 3);
    if(d.magic){
      // wizard hat + staff
      ctx.fillStyle = d.body; ctx.beginPath();
      ctx.moveTo(x-5, y-26); ctx.lineTo(x, y-36); ctx.lineTo(x+5, y-26); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ce93d8'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x+6, y-18); ctx.lineTo(x+8, y-30); ctx.stroke();
      ctx.fillStyle = '#e1bee7'; ctx.beginPath(); ctx.arc(x+8, y-31, 2, 0, 7); ctx.fill();
    } else if(d.guard){
      // big shield
      ctx.fillStyle = '#b0bec5';
      ctx.beginPath(); ctx.moveTo(x-8, y-20); ctx.lineTo(x-2, y-20); ctx.lineTo(x-2, y-8); ctx.lineTo(x-5, y-5); ctx.lineTo(x-8, y-8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.arc(x, y-25, 4.6, Math.PI, 0); ctx.fill();
    } else {
      // archer: bow + feathered cap
      ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(x+5, y-14, 6, -1.1, 1.1); ctx.stroke();
      ctx.fillStyle = d.dark; ctx.fillRect(x-5, y-27, 10, 2.6);
      ctx.fillStyle = '#e53935'; ctx.fillRect(x+1, y-29, 2.4, 2);
    }
    // hp pip
    ctx.fillStyle = 'rgba(10,14,24,0.6)'; ctx.fillRect(x-6, y-38, 12, 2);
    ctx.fillStyle = '#81c784'; ctx.fillRect(x-6, y-38, 12*Math.max(0,r.hp/r.maxHp), 2);
    ctx.restore();
  }

  return { reset, buySlot, buySoldier, rosterFree, all, alive, defOf, countType, getSlots,
           update, draw, damageUnit, musterRound, TYPES };
})();
