// Archer.Knights — friendly medieval units that sally out of your keep (M2)
Archer.Knights = (function(){
  const C = () => Archer.CFG;
  let list = [], rng = Math.random, level = 0, spawnedThisRound = false;

  function setLevel(n){ level = Math.min(C().SALLY.maxLevel, n); }
  function getLevel(){ return level; }

  function reset(){ list = []; spawnedThisRound = false; }

  // Round start: knights muster at the gate, ready to sally on demand.
  function musterRound(){
    if(level <= 0) return;
    spawnedThisRound = false;
  }

  // SALLY: send knights + healer out of the gate
  function sally(){
    if(level <= 0) return false;
    if(spawnedThisRound) return false;
    const S = C().SALLY, A = C().ALLIES;
    const gateX = C().CASTLE.x + 40;
    for(let i=0;i<S.countPerLevel*level;i++){
      list.push({ type:'knight', def: A.knight, x: gateX - i*16, y: C().LANE.y,
        hp: A.knight.hp, maxHp: A.knight.hp, bob: Math.random()*6.28, atkT: 0, mode:'march' });
    }
    list.push({ type:'healer', def: A.healer, x: gateX - 24, y: C().LANE.y,
      hp: A.healer.hp, maxHp: A.healer.hp, bob: Math.random()*6.28, mode:'march' });
    spawnedThisRound = true;
    Archer.Audio.play('win');
    return true;
  }
  function canSally(){ return level > 0 && !spawnedThisRound; }

  function update(dt, api){
    // api: { enemiesAll(), damageEnemy(i, amt), healCastle(n), healArcher(n), puff, homeX }
    if(level <= 0) return;
    for(let i=list.length-1;i>=0;i--){
      const k = list[i]; const d = k.def;
      k.bob += dt*10;
      k.y = C().LANE.y;   // M7: lane is live (rotation-safe)
      if(k.type === 'healer'){
        // healer follows the front, heals castle+archer, then retreats home
        let front = 0;
        for(const o of list) if(o.type==='knight') front = Math.max(front, o.x);
        const targetX = Math.max(C().CASTLE.x + 60, front - 30);
        if(k.x < targetX) k.x += d.spd*dt;
        k.atkT = (k.atkT||0) - dt;
        if(k.atkT <= 0 && k.x > C().CASTLE.x + 30){
          k.atkT = 3.0;
          api.healCastle(d.heal); api.healArcher(d.heal);
          api.puff && api.puff(k.x, k.y - d.h - 6, 'rgba(160,255,180,0.9)');
        }
      } else {
        // knight: march toward nearest enemy and duel it
        let best = -1, bd = 1e9;
        const es = api.enemiesAll();
        for(let j=0;j<es.length;j++){
          const e = es[j];
          if(e.def.flies) continue;               // can't duel flyers
          if(e.def.boss && es.length > 1) continue; // don't dogpile boss alone
          const dx = Math.abs(e.x - k.x);
          if(dx < bd){ bd = dx; best = j; }
        }
        if(best >= 0 && bd < 420){
          const e = es[best];
          const dir = e.x > k.x ? 1 : -1;
          if(bd > 14) k.x += dir * d.spd * dt;
          k.atkT = (k.atkT||0) - dt;
          if(bd <= 22 && k.atkT <= 0){
            k.atkT = 1.0;
            api.damageEnemy(best, d.dmg, k);
          }
        } else {
          // no enemies near: advance toward orc keep
          if(k.x < C().WORLD_W - 500) k.x += d.spd*dt;
        }
      }
      if(k.hp <= 0){
        api.puff && api.puff(k.x, k.y - d.h, 'rgba(74,134,201,0.8)');
        list.splice(i,1);
      }
    }
  }

  function alive(){ return list.length; }
  function all(){ return list; }
  function damageAlly(i, amt){ const k = list[i]; if(k){ k.hp -= amt; } }
  function damageAt(k, amt){ if(list.includes(k)) k.hp -= amt; }

  function draw(ctx){
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    for(const k of list) drawKnight(ctx, k, cam);
  }
  function drawKnight(ctx, k, cam){
    const d = k.def, x = k.x - cam, y = k.y + Math.sin(k.bob)*1.2;
    if(x < -40 || x > C().W + 40) return;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, C().LANE.y+3, d.w*0.5, 3, 0, 0, 7); ctx.fill();
    // legs (armored)
    ctx.strokeStyle = '#78909c'; ctx.lineWidth = 2.6; ctx.lineCap='round';
    const step = Math.sin(k.bob*1.2)*3;
    ctx.beginPath(); ctx.moveTo(x-2, y-10); ctx.lineTo(x-4+step, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2, y-10); ctx.lineTo(x+4-step, y); ctx.stroke();
    // plate body + tabard
    ctx.fillStyle = d.dark; ctx.fillRect(x-d.w/2, y-d.h+6, d.w, d.h-16);
    ctx.fillStyle = d.body; ctx.fillRect(x-d.w/2+2, y-d.h+6, d.w-4, d.h-20);
    // belt
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x-d.w/2+2, y-8, d.w-4, 2);
    if(k.type === 'healer'){
      // healer robe + satchel
      ctx.fillStyle = d.body; ctx.fillRect(x-d.w/2, y-d.h+6, d.w, d.h-14);
      ctx.fillStyle = '#8bc34a'; ctx.fillRect(x-3, y-d.h+12, 6, 6);
    } else {
      // sword + shield
      ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x+d.w/2-1, y-d.h+14); ctx.lineTo(x+d.w/2-1, y-d.h+2); ctx.stroke();
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x+d.w/2-3, y-d.h+10); ctx.lineTo(x+d.w/2+1, y-d.h+10); ctx.stroke();
      // shield with cross
      ctx.fillStyle = '#e8eefc';
      ctx.beginPath();
      ctx.moveTo(x-d.w/2-4, y-d.h+8); ctx.lineTo(x-d.w/2+2, y-d.h+8);
      ctx.lineTo(x-d.w/2+2, y-d.h+18); ctx.lineTo(x-d.w/2-1, y-d.h+21); ctx.lineTo(x-d.w/2-4, y-d.h+18);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x-d.w/2-1, y-d.h+9); ctx.lineTo(x-d.w/2-1, y-d.h+19); ctx.stroke();
    }
    // head + helmet with plume
    ctx.fillStyle = '#e0b089'; ctx.beginPath(); ctx.arc(x, y-d.h+2, 5.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.arc(x, y-d.h+1, 5.8, Math.PI*0.95, Math.PI*0.05); ctx.fill();
    ctx.fillRect(x-5.8, y-d.h+1, 11.6, 3);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y-d.h-4); ctx.quadraticCurveTo(x+3, y-d.h-9, x-1, y-d.h-11); ctx.stroke();
    // hp bar
    const bw = d.w+4;
    ctx.fillStyle='rgba(10,14,24,0.7)'; ctx.fillRect(x-bw/2, y-d.h-9, bw, 3);
    ctx.fillStyle= k.type==='healer' ? '#66bb6a' : '#4a86c9';
    ctx.fillRect(x-bw/2, y-d.h-9, bw*Math.max(0,k.hp/k.maxHp), 3);
    ctx.restore();
  }

  return { setLevel, getLevel, sally, canSally, musterRound, update, draw,
           alive, all, damageAlly, damageAt, reset };
})();
