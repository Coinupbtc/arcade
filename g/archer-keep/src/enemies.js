// Archer.Enemies — orcs & goblins: melee + ranged + flying, boss, damage states (M2)
Archer.Enemies = (function(){
  const C = () => Archer.CFG;
  let list = [], rng = Math.random, round = 1, spawnLeft = 0, spawnGap = 1, spawnT = 0,
      weights = null, onClear = null, boss = null, combo = 0, comboT = 0, onKill = null;

  function startRound(r, seed, cb){
    round = r; rng = Archer.U.RNG(((seed||0) + r*7919)>>>0); onClear = cb;
    const RC = C().ROUND;
    if(r % RC.bossEvery === 0){
      boss = makeBoss(r);
      list = [boss]; spawnLeft = 0;
      Archer.Audio.play('bossIn');
    } else {
      boss = null;
      spawnLeft = RC.count(r) + Math.floor(rng()*3);
      spawnGap = RC.gap(r); spawnT = 0.6;
      weights = RC.weights(r);
    }
  }
  // M9 (2026-10-25): warbands enter just past the right edge of the home view, so the player
  // SEES them march in. The old SPAWN_X (2270) left the first 20-30 s of every wave as an empty
  // lane — the tester had nothing to judge. The orc keep stays as the landmark on the minimap.
  function spawnXFor(r){ return C().CASTLE.x + 660 + Math.min(80, (r-1)*12); }
  function makeBoss(r){
    const def = C().ENEMIES.warlord;
    // M9: the first warlord (wave 5) was 1476 HP and reached the gate in 10 s — a wall for a
    // stranger. Bosses now start at ~740 HP and ramp at ~8% per boss cycle on top of the wave curve.
    const hpMul = C().ROUND.hpMul(r) * (0.5 + 0.08*(r/5-1));
    return { type:'warlord', def, x: spawnXFor(r)-25, y: C().LANE.y,
      hp: def.hp*hpMul, maxHp: def.hp*hpMul, slow:0, burn:0, burnT:0, phase:'walk',
      atkT: 0, weakT: def.weak.every, weakOpen: 0, telegraphT: 0, bob: 0 };
  }
  function pickType(){
    let total = 0; for(const k in weights) total += weights[k];
    let r = rng()*total;
    for(const k in weights){ r -= weights[k]; if(r<=0) return k; }
    return 'goblin';
  }
  function spawnOne(){
    const k = pickType(), def = C().ENEMIES[k];
    const RC = C().ROUND;
    const e = { type:k, def, x: spawnXFor(round) + rng()*50, y: C().LANE.y,
      hp: def.hp*RC.hpMul(round), maxHp: def.hp*RC.hpMul(round),
      slow:0, burn:0, burnT:0, atkT: 1+rng(), bob: rng()*6.28, wobble: rng()*6.28 };
    if(def.flies){
      e.alt = 90 + rng()*50;         // cruise altitude
      e.diveT = def.diveEvery || 7;  // time to next wall dive
      e.mode = 'cruise';
    }
    list.push(e);
  }

  function update(dt, api){
    // api: {archerPos, castleHp(), damageCastle(n,src), damageArcher(n), spawnArrowFrom(x,y),
    //        gatePos, shake(n), coins(mul), puff, explosion, moatX, knightApi}
    const Cfg = C(), RC = Cfg.ROUND;
    if(spawnLeft > 0){
      spawnT -= dt;
      if(spawnT<=0){ spawnOne(); spawnLeft--; spawnT = spawnGap*(0.8+rng()*0.4); }
    }
    comboT = Math.max(0, comboT - dt); if(comboT<=0 && combo>0) combo = 0;
    const slowMoat = (api.moatX !== undefined);
    for(let i=list.length-1;i>=0;i--){
      const e = list[i]; const d = e.def;
      e.bob += dt*(d.fast? 13 : 9);
      if(!d.flies) e.y = Cfg.LANE.y;   // M7: lane is live (rotation-safe)
      // burn dot
      if(e.burnT > 0){ e.burnT -= dt; e.hp -= e.burn*dt; if(((e.bob*7)|0)%3===0) api.puff && api.puff(e.x, e.y-altOf(e)-d.h-6, '#ff9e42'); }
      // slow decay
      if(e.slow > 0) e.slow -= dt;
      let spd = d.spd * RC.spdMul(round) * (e.slow>0 ? 0.45 : 1);
      // moat: last 90px before gate slower
      if(slowMoat && api.moatX>0 && e.x > api.moatX) spd *= 0.5;

      if(d.flies){
        // ===== FLYING (dragon): cruise toward castle, periodic fire dives =====
        e.x -= spd*dt;
        e.diveT -= dt;
        const castleX = Cfg.CASTLE.x;
        if(e.mode === 'cruise'){
          e.y = Cfg.LANE.y - e.alt - Math.sin(e.bob*0.5)*8;
          if(e.x < castleX + 260 && e.diveT <= 0){
            e.mode = 'dive';   // swoop at the wall
          }
        } else if(e.mode === 'dive'){
          // arc down to the wall, breathe fire, climb back
          e.y += 190*dt;
          if(e.y >= Cfg.LANE.y - 60){
            api.damageCastle(d.bombDmg*RC.hpMul(1), 'dragon');
            api.explosion && api.explosion(e.x, e.y);
            Archer.World.gateShake(4); Archer.Audio.play('explode');
            e.mode = 'climb'; e.diveT = d.diveEvery*(0.8+rng()*0.4);
          }
        } else if(e.mode === 'climb'){
          e.y -= 120*dt;
          if(e.y <= Cfg.LANE.y - e.alt) e.mode = 'cruise';
        }
        // dragon announces itself: roar on its first appearance each wave + on dive windup
        if(!e.roared){ e.roared = true; Archer.Audio.play('roar'); Archer.FX.shake(1.5); }
        if(e.mode === 'dive' && !e.diveRoared){ e.diveRoared = true; Archer.Audio.play('roar'); }
        if(e.x < Cfg.CASTLE.x - 200 && e.mode !== 'climb'){
          // overshot: turn around and come back
          e.x = Cfg.CASTLE.x - 200; e.mode = 'climb'; e.diveT = 1.5;
        }
      } else if(d.climbs){
        if(e.x <= Cfg.CASTLE.x + 26){
          e.phase = 'climb'; e.climbY = (e.climbY||0) - 42*dt;
          api.damageArcher(d.meleeDps*dt*RC.hpMul(1));
          if(e.climbY < -150){ api.damageArcher(0.1); api.kill(i,false); continue; }
        } else e.x -= spd*dt;
      } else if(d.boss){
        // warlord: walk, slam castle with telegraph; weak point opens after slam
        if(e.x <= Cfg.CASTLE.x + 40 + d.w/2){
          e.weakT -= dt;
          if(e.telegraphT > 0){
            e.telegraphT -= dt;
            if(e.telegraphT <= 0){
              api.damageCastle(d.gateDps*1.2, 'slam'); Archer.World.gateShake(5); api.shake(5);
              Archer.Audio.play('gateHit'); e.weakOpen = d.weak.dur;
            }
          } else {
            if(e.weakT <= 0){ e.telegraphT = 0.8; e.weakT = d.weak.every; }
          }
          if(e.weakOpen > 0) e.weakOpen -= dt;
        } else {
          e.weakT -= dt;
          e.x -= spd*dt;
          if(e.weakOpen > 0) e.weakOpen -= dt;
        }
      } else if(d.shoots){
        // ranged: stop at range and fire at the WALL (targetsCastle) or the archer
        const dist = e.x - api.archerPos.x;
        if(dist < d.atkRange){
          e.phase = 'shoot';
          e.atkT -= dt;
          if(e.atkT<=0){
            e.atkT = d.atkCd;
            const dmg = d.atkDmg*RC.hpMul(1);
            if(d.magic) api.spawnMagicFrom(e.x, e.y-d.h, dmg);
            else api.spawnArrowFrom(e.x, e.y-d.h, dmg);
            // long-range shooters also chip the CASTLE wall directly
            if(d.targetsCastle && dist < d.atkRange*0.8) api.damageCastle(d.atkDmg*0.4*RC.hpMul(1), 'volley');
          }
          // ranged units still creep forward slowly while shooting
          if(dist > d.atkRange*0.55) e.x -= spd*0.3*dt;
        } else e.x -= spd*dt;
      } else if(d.gateDps){
        // siege unit (troll): chew the gate slowly
        if(e.x <= Cfg.CASTLE.x + 30 + d.w/2){
          e.phase = 'hit';
          api.damageCastle(d.gateDps*dt, 'ram');
          if(((e.bob*5)|0)%4===0){ Archer.World.gateShake(2.2); Archer.Audio.play('gateHit'); }
        } else e.x -= spd*dt;
      } else {
        // melee (goblin/screecher/brute/warg): reach gate, chew it — or fight knights
        const near = e.x <= Cfg.CASTLE.x + 30 + d.w/2;
        if(near){
          e.phase = 'chew';
          // M12: waves 1-2 chew at 55% so a stranger can learn the bow before the gate matters.
          const chew = (RC.chewMul ? RC.chewMul(round) : 1);
          api.damageCastle((d.meleeDps||3)*dt*0.6*RC.hpMul(1)*chew, 'chew');
          if(((e.bob*5)|0)%5===0) Archer.World.gateShake(0.8);
        } else {
          e.x -= spd*dt;
        }
      }
      // melee enemies hurt any friendly (garrison sallied knights / knights module) within reach
      if((d.melee || d.boss) && api.damageKnights){
        api.damageKnights(e.x, (d.meleeDps||4)*dt*RC.hpMul(1));
      }
      if(e.hp <= 0){
        const mul = 1 + Math.min(Cfg.COMBO.max, combo*Cfg.COMBO.coinMul);
        api.kill(i, true, mul);
        continue;
      }
    }
    if(spawnLeft<=0 && list.length===0 && onClear){ const f=onClear; onClear=null; f(); }
  }
  function altOf(e){ return e.def.flies ? 0 : 0; }

  function kill(idx, paid, mul){
    const e = list[idx]; if(!e) return;
    list.splice(idx,1);
    if(paid){
      combo++; comboT = 4;
      const coins = Math.round(e.def.coin * (mul||1) * C().ROUND.hpMul(round)*0.5 + e.def.coin);
      if(onKill) onKill(e, coins);
      Archer.Audio.play('coin');
    }
  }

  function damage(e, amt, kind){
    const armor = e.def.armor || 0;
    const mult = kind && kind.armorMul !== undefined ? kind.armorMul : 1;
    const eff = amt * (1 - armor*(1 - Math.min(1,mult)));
    e.hp -= eff;
    return eff;
  }
  function applyBurn(e, dps, dur){ e.burn = Math.max(e.burn||0, dps); e.burnT = Math.max(e.burnT||0, dur); }
  function applySlow(e, mul, dur){ e.slow = Math.max(e.slow||0, dur); }

  function alive(){ return list.length; }
  function remaining(){ return list.length + Math.max(0, spawnLeft); }
  function all(){ return list; }
  function bossRef(){ return boss && list.includes(boss) ? boss : null; }
  function reset(){ list = []; spawnLeft = 0; boss = null; onClear = null; combo = 0; }
  // Test/QA only: empty the wave through the REAL death path (kill → onKill → onClear → shop).
  function forceClear(){ spawnLeft = 0; for(const e of list) e.hp = 0; }
  function setOnKill(cb){ onKill = cb; }

  // ---- draw ----
  function draw(ctx){
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    for(const e of list) drawEnemy(ctx, e, cam);
  }
  function drawEnemy(ctx, e, cam){
    const d = e.def, bob = Math.sin(e.bob)*1.5;
    const x = e.x - cam, y = e.y + (d.flies?0:bob);
    if(x < -60 || x > C().W + 60) return;
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, C().LANE.y+3, d.w*0.5, 3, 0, 0, 7); ctx.fill();
    if(d.flies){
      drawDragon(ctx, e, x, y);
    } else if(d.boss){
      drawWarlord(ctx, e, x, y);
    } else {
      drawHumanoid(ctx, e, x, y);
    }
    // status pips
    if(e.slow>0){ ctx.fillStyle='rgba(150,220,255,0.8)'; ctx.beginPath(); ctx.arc(x-d.w/2-6, y-d.h-4, 2, 0, 7); ctx.fill(); }
    if(e.burnT>0){ ctx.fillStyle='#ff9e42'; ctx.beginPath(); ctx.arc(x+d.w/2+5, y-d.h-4, 2.2, 0, 7); ctx.fill(); }
    // STUCK ARROWS: embedded shafts with fletching, offset from hit point
    if(e.stuck && e.stuck.length){
      for(const s of e.stuck){
        const col = s.kind==='fire' ? '#ffb347' : s.kind==='frost' ? '#bfefff' : '#e8dcc0';
        const sxp = x + s.ox, syp = y - d.h/2 + s.oy;
        ctx.save(); ctx.translate(sxp, syp); ctx.rotate(s.ang);
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(1, 0); ctx.stroke();
        // fletching
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-6.5, -2); ctx.moveTo(-9, 0); ctx.lineTo(-6.5, 2); ctx.stroke();
        ctx.restore();
      }
    }
    // hp bar (non-boss)
    if(!d.boss){
      const bw = d.w+4;
      ctx.fillStyle='rgba(10,14,24,0.7)'; ctx.fillRect(x-bw/2, y-(d.flies? e.y-e.y: 0)-d.h-9, bw, 3);
      ctx.fillStyle= e.burnT>0 ? '#ff9e42' : '#e53935';
      ctx.fillRect(x-bw/2, y-d.h-9, bw*Math.max(0,e.hp/e.maxHp), 3);
    }
    ctx.restore();
  }

  // goblin / orc bodies: chunky 2-tone silhouettes with attribute hints
  function drawHumanoid(ctx, e, x, y){
    const d = e.def, dark = d.dark, body = d.body;
    // legs
    ctx.strokeStyle = dark; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    const step = Math.sin(e.bob*1.2)*3;
    ctx.beginPath(); ctx.moveTo(x-2, y-10); ctx.lineTo(x-4+step, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2, y-10); ctx.lineTo(x+4-step, y); ctx.stroke();
    // body (M7: rim-lit gradient + crisp outline for readability at landscape zoom-out)
    const bg = ctx.createLinearGradient(x-d.w/2, 0, x+d.w/2, 0);
    bg.addColorStop(0, dark); bg.addColorStop(0.45, body); bg.addColorStop(1, dark);
    ctx.fillStyle = bg; ctx.fillRect(x-d.w/2, y-d.h+6, d.w, d.h-18);
    ctx.strokeStyle = 'rgba(10,14,24,0.85)'; ctx.lineWidth = 1.6;
    ctx.strokeRect(x-d.w/2, y-d.h+6, d.w, d.h-18);
    ctx.fillStyle = dark; ctx.fillRect(x-d.w/2, y-d.h+6, d.w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x-d.w/2+1.5, y-d.h+7, 1.6, d.h-20);
    // head + ears (radial shade so heads pop — headshot target)
    const hg = ctx.createRadialGradient(x-1.5, y-d.h, 1, x, y-d.h+2, 6.5);
    hg.addColorStop(0, body); hg.addColorStop(1, dark);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y-d.h+2, 5.8, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,24,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    // pointy goblin/orc ears
    ctx.beginPath(); ctx.moveTo(x-4, y-d.h+1); ctx.lineTo(x-9, y-d.h-4); ctx.lineTo(x-3, y-d.h-2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+4, y-d.h+1); ctx.lineTo(x+9, y-d.h-4); ctx.lineTo(x+3, y-d.h-2); ctx.closePath(); ctx.fill();
    // eyes (glow — readable at distance, telegraphs the headshot zone)
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(x-3, y-d.h+1, 2, 1.6); ctx.fillRect(x+1, y-d.h+1, 2, 1.6);
    ctx.fillStyle = 'rgba(255,213,79,0.25)';
    ctx.beginPath(); ctx.arc(x-2, y-d.h+1.8, 2.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x+2, y-d.h+1.8, 2.6, 0, 7); ctx.fill();
    // attribute kit:
    if(d.melee){ // weapon: club / axe
      ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x+d.w/2, y-d.h+12); ctx.lineTo(x+d.w/2+7, y-d.h+4); ctx.stroke();
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(x+d.w/2+5, y-d.h+2, 5, 5);
    }
    if(d.shoots){ // bow or staff
      if(d.magic){
        ctx.strokeStyle = '#9575cd'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x+d.w/2+2, y-d.h+16); ctx.lineTo(x+d.w/2+2, y-d.h-2); ctx.stroke();
        ctx.fillStyle = '#ce93d8'; ctx.beginPath(); ctx.arc(x+d.w/2+2, y-d.h-4, 2.6+Math.sin(e.bob*2)*0.8, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(x+d.w/2+2, y-d.h+8, 6, -1.2, 1.2); ctx.stroke();
      }
    }
    if(d.armor >= 0.35){ // shoulder plate for tanks
      ctx.fillStyle = '#b0bec5'; ctx.fillRect(x-d.w/2-3, y-d.h+6, d.w+6, 5);
      ctx.strokeStyle='#78909c'; ctx.strokeRect(x-d.w/2-3, y-d.h+6, d.w+6, 5);
    }
    if(d.gateDps){ // siege: big hammer
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x+d.w/2-2, y-d.h+16); ctx.lineTo(x+d.w/2+9, y-d.h-2); ctx.stroke();
      ctx.fillStyle = '#78909c'; ctx.fillRect(x+d.w/2+5, y-d.h-10, 9, 9);
    }
    // screecher: open jaw
    if(d.fast && d.melee && e.type==='screech'){
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(x-2, y-d.h+5); ctx.lineTo(x+4, y-d.h+8); ctx.lineTo(x-2, y-d.h+8); ctx.closePath(); ctx.fill();
    }
  }

  function drawWarlord(ctx, e, x, y){
    const d = e.def;
    ctx.fillStyle = d.dark; ctx.fillRect(x-d.w/2, y-d.h-4, d.w, d.h);
    ctx.fillStyle = d.body; ctx.fillRect(x-d.w/2+3, y-d.h-1, d.w-6, d.h-6);
    // horned helm
    ctx.fillStyle = d.dark; ctx.fillRect(x-10, y-d.h-16, 20, 14);
    ctx.strokeStyle = '#e8eefc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x-8, y-d.h-14); ctx.lineTo(x-13, y-d.h-20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+8, y-d.h-14); ctx.lineTo(x+13, y-d.h-20); ctx.stroke();
    ctx.fillStyle = '#ff5252'; ctx.fillRect(x-6, y-d.h-11, 4, 3); ctx.fillRect(x+2, y-d.h-11, 4, 3);
    // arms + huge axe
    const raise = e.telegraphT>0 ? -Math.sin((0.8-e.telegraphT)/0.8*Math.PI)*14 : 0;
    ctx.fillStyle = d.body; ctx.fillRect(x-d.w/2-8, y-d.h+6+raise, 9, 26); ctx.fillRect(x+d.w/2-1, y-d.h+6+raise, 9, 26);
    ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x+d.w/2+6, y-d.h+30+raise); ctx.lineTo(x+d.w/2+10, y-d.h+2+raise); ctx.stroke();
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath(); ctx.moveTo(x+d.w/2+4, y-d.h+2+raise); ctx.lineTo(x+d.w/2+18, y-d.h-2+raise); ctx.lineTo(x+d.w/2+4, y-d.h-8+raise); ctx.closePath(); ctx.fill();
    // cape
    ctx.fillStyle = 'rgba(93,32,22,0.8)';
    ctx.beginPath(); ctx.moveTo(x-d.w/2+2, y-d.h+4); ctx.lineTo(x-d.w/2-10+Math.sin(e.bob)*2, y-8); ctx.lineTo(x-d.w/2+2, y-6); ctx.closePath(); ctx.fill();
    if(e.weakOpen > 0){
      ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(x, y-d.h+10, 5+Math.sin(e.bob*3)*1.5, 0, 7); ctx.fill();
      ctx.strokeStyle='rgba(255,213,79,0.6)'; ctx.beginPath(); ctx.arc(x, y-d.h+10, 9+Math.sin(e.bob*3)*2, 0, 7); ctx.stroke();
    }
    if(e.telegraphT > 0){
      ctx.strokeStyle = 'rgba(255,80,60,0.9)'; ctx.lineWidth=2;
      ctx.strokeRect(x-d.w/2-10, y-d.h-18, d.w+20, d.h+20);
    }
  }

  function drawDragon(ctx, e, x, y){
    const d = e.def, fl = Math.sin(e.bob*1.4)*4;
    // wings
    ctx.fillStyle = 'rgba(120,20,20,0.85)';
    ctx.beginPath(); ctx.moveTo(x-6, y-d.h/2); ctx.quadraticCurveTo(x-22, y-d.h/2-14-fl, x-30, y-d.h/2+2); ctx.lineTo(x-8, y-d.h/2+4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+6, y-d.h/2); ctx.quadraticCurveTo(x+22, y-d.h/2-14-fl, x+30, y-d.h/2+2); ctx.lineTo(x+8, y-d.h/2+4); ctx.closePath(); ctx.fill();
    // body + tail
    ctx.fillStyle = d.body;
    ctx.beginPath(); ctx.ellipse(x, y-d.h/2, d.w*0.36, d.h*0.32, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = d.body; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x+d.w*0.3, y-d.h/2); ctx.quadraticCurveTo(x+d.w*0.55, y-d.h/2+6+fl, x+d.w*0.68, y-d.h/2-2); ctx.stroke();
    // head + jaw + eye
    ctx.fillStyle = d.body;
    ctx.beginPath(); ctx.arc(x-d.w*0.34, y-d.h/2-3, 6, 0, 7); ctx.fill();
    ctx.fillStyle = d.dark;
    ctx.beginPath(); ctx.moveTo(x-d.w*0.34-4, y-d.h/2-1); ctx.lineTo(x-d.w*0.34-9, y-d.h/2+3); ctx.lineTo(x-d.w*0.34-3, y-d.h/2+3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(x-d.w*0.36, y-d.h/2-6, 2.4, 2);
    if(e.mode === 'dive'){ // fire breath while diving
      ctx.fillStyle = 'rgba(255,140,60,0.75)';
      ctx.beginPath(); ctx.moveTo(x-d.w*0.4, y-d.h/2);
      ctx.quadraticCurveTo(x-d.w*0.6, y+4, x-d.w*0.75, y+10); ctx.lineTo(x-d.w*0.45, y+2); ctx.closePath(); ctx.fill();
    }
  }

  function drawBossBar(ctx){
    const b = bossRef(); if(!b) return;
    const W = C().W;
    ctx.fillStyle='rgba(10,14,24,0.75)'; ctx.fillRect(W/2-110, 128, 220, 12);
    ctx.fillStyle='#c0392b'; ctx.fillRect(W/2-108, 130, 216*Math.max(0,b.hp/b.maxHp), 8);
    ctx.fillStyle='#fff'; ctx.font='800 9px -apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText(b.def.name, W/2, 124); ctx.textAlign='left';
  }

  return { startRound, update, draw, drawBossBar, damage, applyBurn, applySlow,
           alive, remaining, all, bossRef, reset, setOnKill, kill, forceClear };
})();
