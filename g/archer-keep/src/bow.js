// Archer.Bow — arrow physics, kinds, draw/release, enemy shots, magic bolts,
// BOW TIERS: weak → hunting → strong → compound → crossbow, single/double/triple shot (M2)
Archer.Bow = (function(){
  const C = () => Archer.CFG;
  let arrows = [], unlocked = { broadhead:true }, sel = 'broadhead', nextId = 1;

  // Bow tiers: dmgMul / drawSpeed (reload) / shots / spread
  const BOWS = [
    { id:'weak',     name:'WEAK BOW',    dmgMul: 0.8, drawSpd: 1.0,  shots: 1, spread: 0 },
    { id:'hunting',  name:'HUNTING BOW', dmgMul: 1.0, drawSpd: 1.0,  shots: 1, spread: 0 },
    { id:'strong',   name:'STRONG BOW',  dmgMul: 1.3, drawSpd: 1.15, shots: 1, spread: 0 },
    { id:'compound', name:'COMPOUND',    dmgMul: 1.5, drawSpd: 1.3,  shots: 2, spread: 3.5 },
    { id:'crossbow', name:'CROSSBOW',    dmgMul: 1.9, drawSpd: 0.72, shots: 1, spread: 0, pierceBonus: 1 },
  ];
  let bowIdx = 1; // start with hunting bow (the old default)
  // M11 (2026-10-25): the shop sold "Heavy Draw — +12% arrow speed & range" but nothing applied it
  // (`game.js` called a missing `Bow.upgradeDraw`). The upgrade is real now; speed feeds range.
  let drawTier = 0;

  function state(){ return { arrows, bow: BOWS[bowIdx], sel }; }
  function reset(seed){
    arrows = []; unlocked = { broadhead:true }; sel = 'broadhead';
    bowIdx = 1; drawTier = 0;
  }
  function upgradeDraw(){ if(drawTier < 3){ drawTier++; return true; } return false; }
  function speedMul(){ return 1 + drawTier * 0.12; }
  function drawTierN(){ return drawTier; }
  function bowDef(){ return BOWS[bowIdx]; }
  function bowIndex(){ return bowIdx; }
  function setBow(i){ bowIdx = Archer.U.clamp(i, 0, BOWS.length-1); }
  function upgradeBow(){ if(bowIdx < BOWS.length-1){ bowIdx++; return true; } return false; }

  function unlock(kind){ unlocked[kind] = true; }
  function isUnlocked(kind){ return !!unlocked[kind]; }
  function select(kind){ if(unlocked[kind]) sel = kind; }

  // fire from archer position with current aim (world coords); handles multi-shot
  // returns { shots, ids } — ids of the arrows fired (for shot tracking)
  function fire(aimAngle, drawPct, fromX, fromY, chargeFx){
    const def = C().ARROWS[sel];
    const bow = BOWS[bowIdx];
    const base = (C().AIM.speedMin + (C().AIM.speedMax-C().AIM.speedMin)*(drawPct/100)) * def.speed * speedMul();
    const a0 = aimAngle*Math.PI/180;
    const ids = [];
    for(let s=0; s<bow.shots; s++){
      const a = a0 + (bow.spread ? (s - (bow.shots-1)/2) * bow.spread * Math.PI/180 : 0);
      const id = nextId++;
      ids.push(id);
      arrows.push({ id, x: fromX, y: fromY, vx: Math.cos(a)*base, vy: Math.sin(a)*base,
        kind: sel, life: 0, pierceLeft: (def.pierce||0) + (bow.pierceBonus||0), dmgMul: bow.dmgMul });
    }
    Archer.Audio.play('shoot');
    if(chargeFx) chargeFx();
    return { shots: bow.shots, ids };
  }

  // enemy arrows: lob toward the archer from range
  function enemyArrow(x, y, dmg){
    const dx = (C().CASTLE.x) - x, dy = (C().CASTLE.baseY - 220) - y;
    const d = Math.hypot(dx,dy) || 1, s = 300;
    arrows.push({ x, y, vx: dx/d*s, vy: dy/d*s - 90, kind:'enemy', dmg, life: 0, pierceLeft: 0 });
  }
  // shaman magic: purple bolt
  function magicBolt(x, y, dmg){
    const dx = (C().CASTLE.x) - x, dy = (C().CASTLE.baseY - 220) - y;
    const d = Math.hypot(dx,dy) || 1, s = 260;
    arrows.push({ x, y, vx: dx/d*s, vy: dy/d*s - 60, kind:'magic', dmg, life: 0, pierceLeft: 0 });
  }

  function update(dt, api){
    // api: { enemies, hitEnemy(i, arrow), hitArcher(n), groundY(x), puff, trail, stick }
    for(let i=arrows.length-1;i>=0;i--){
      const a = arrows[i];
      a.life += dt;
      a.vy += C().GRAVITY*dt*(a.kind==='enemy'?0.8:(a.kind==='magic'?0.5:0.75));
      a.x += a.vx*dt; a.y += a.vy*dt;
      if(((a.life*90)|0)%2===0) api.trail && api.trail(a.x, a.y, a.kind);
      let dead = false;
      if(a.kind !== 'enemy' && a.kind !== 'magic'){
        const list = api.enemies.all();
        for(let j=list.length-1;j>=0;j--){
          const e = list[j], d = e.def;
          // BUGFIX 2026-10-16: e.y for flyers is ALREADY altitude-adjusted (enemies.js sets
          // e.y = LANE.y - e.alt). Subtracting e.alt again put the dragon hitbox ~119px
          // above the drawn body — arrows hit empty sky and the headshot zone was pure sky.
          const eyTop = e.y - d.h;
          const eyBot = e.y + (d.flies ? 0 : 2);
          if(a.x > e.x-d.w/2-2 && a.x < e.x+d.w/2+2 && a.y > eyTop-2 && a.y < eyBot){
            const eff = api.hitEnemy(j, a);
            // ARROW STICKS: if the enemy survived, embed the arrow in it
            if(e.hp > 0 && a.pierceLeft <= 0){
              if(!e.stuck) e.stuck = [];
              if(e.stuck.length < 6) e.stuck.push({ ox: a.x - e.x, oy: a.y - (e.y - d.h/2), kind: a.kind, ang: Math.atan2(a.vy, a.vx) });
            }
            if(a.pierceLeft > 0){ a.pierceLeft--; } else { dead = true; }
            break;
          }
        }
      } else {
        if(a.x < C().CASTLE.x + 34){
          if(a.y > C().CASTLE.baseY - C().CASTLE.towerH - 30 && a.y < C().CASTLE.baseY){
            api.hitArcher(a.dmg);
          }
          dead = true;
        }
      }
      const gy = api.groundY ? api.groundY(a.x) : C().LANE.y;
      if(a.y >= gy && a.kind!=='bombArc'){
        dead = true; api.stick && api.stick(a.x, gy);
        // report impact of a tracked player shot (landing marker + slowmo)
        if(api.arrowImpact) api.arrowImpact(a.id, a.x, a.y);
      }
      if(a.x > C().WORLD_W+30 || a.x < -30 || a.y > C().H+30 || a.life > 6){
        dead = true;
        if(api.arrowImpact) api.arrowImpact(a.id, a.x, Math.min(a.y, C().LANE.y));
      }
      if(dead) arrows.splice(i,1);
    }
  }

  function draw(ctx){
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    for(const a of arrows){
      const px = a.x - cam;
      if(px < -20 || px > C().W+20) continue;
      const ang = Math.atan2(a.vy, a.vx);
      ctx.save(); ctx.translate(px, a.y); ctx.rotate(ang);
      if(a.kind === 'magic'){
        ctx.fillStyle = '#ce93d8';
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(206,147,216,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 0); ctx.stroke();
      } else {
        const col = a.kind==='enemy' ? '#5d4037' : (a.kind==='magic' ? '#ce93d8' : C().ARROWS[a.kind].color);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -2.4); ctx.lineTo(4, 2.4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-5, -2); ctx.moveTo(-8, 0); ctx.lineTo(-5, 2); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function fireRaw(x, y, vx, vy, kind){
    arrows.push({ x, y, vx, vy, kind, life: 0, pierceLeft: 0 });
  }

  function activeCount(){ return arrows.length; }
  function debugList(){ return arrows.map(a=>({id:a.id,x:Math.round(a.x),y:Math.round(a.y),vx:Math.round(a.vx),vy:Math.round(a.vy),k:a.kind})); }
  function clearArrows(){ arrows = []; }

  return { fire, fireRaw, enemyArrow, magicBolt, update, draw, state, reset, unlock, isUnlocked, select,
           bowDef, bowIndex, setBow, upgradeBow, upgradeDraw, speedMul, drawTierN, BOWS, activeCount,
           clearArrows, debugList };
})();
