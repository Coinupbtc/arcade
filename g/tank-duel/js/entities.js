// Tank.Units — tanks (smooth barrel tracking, recoil, damage states), shell trails, debris
Tank.Units = (function(){
  let trail = [];            // shell trail points {x,y,life}
  let debris = [];           // prop debris pieces {x,y,vx,vy,rot,vr,color,life}
  let shotCount = 0, trailCount = 0;
  // smooth barrel tracking: visual angle lerps toward aim each frame
  let pBarrel = 60, eBarrel = 120;
  // damage blink: timer per tank
  let blinkP = 0, blinkE = 0;

  function update(dt, state){
    if(state){
      // barrel tracks aim (AI barrel mirrors its stored aim)
      const aiAng = state.lastShot ? 180-state.lastShot.angleDeg : 120;
      pBarrel = Tank.U.lerp(pBarrel, state.angleDeg, Math.min(1, dt*14));
      eBarrel = Tank.U.lerp(eBarrel, aiAng, Math.min(1, dt*14));
      blinkP = Math.max(0, blinkP - dt*2.4);
      blinkE = Math.max(0, blinkE - dt*2.4);
    }
    for(let i=trail.length-1;i>=0;i--){ trail[i].life-=dt; if(trail[i].life<=0) trail.splice(i,1); }
    for(let i=debris.length-1;i>=0;i--){
      const d=debris[i];
      d.vy += Tank.CFG.GRAVITY*dt; d.x+=d.vx*dt; d.y+=d.vy*dt; d.rot+=d.vr*dt;
      d.life-=dt;
      if(d.y>Tank.CFG.WORLD_H+50||d.life<=0) debris.splice(i,1);
    }
  }
  function blink(who){ if(who==='P') blinkP=1; else blinkE=1; }

  function addTrail(x,y,kind){
    trail.push({x,y,life:Tank.CFG.FX.TRAIL_LIFE,kind});
    trailCount++;
    if(trail.length>Tank.CFG.FX.TRAIL_MAX) trail.shift();
  }
  function addDebris(x,y,color,n){
    for(let i=0;i<(n||8);i++){
      debris.push({ x, y, vx:(Math.random()-0.5)*320, vy:-120-Math.random()*260,
        rot:Math.random()*6, vr:(Math.random()-0.5)*10,
        color, life:2.5, size:3+Math.random()*5 });
    }
  }

  function slowmoStart(){ Tank.FX.slowmoStart(); }
  function slowmoActive(){ return Tank.FX.slowmoActive(); }
  function slowmoUpdate(dt){ return Tank.FX.slowmoUpdate(dt); }

  // ---- v2 FX bridge (game.js calls Units.*; FX module owns the pools) ----
  let lastShakeX = 0, lastShakeY = 0;
  function addFlash(x, y, r){          // muzzle flash / small pop marker
    Tank.FX.muzzle(x, y, 1);
    if(r && r > 8) Tank.FX.shake(Math.min(3.5, r/9), 0, -1);
  }
  function addShake(mag, dx, dy){ Tank.FX.shake(mag, dx===undefined?0:dx, dy===undefined?-1:dy); }
  function shakeOffset(){ return Tank.FX.shakeOffset(); }
  function updateFX(dt, state){ Tank.Units.update(dt, state); Tank.FX.update(dt); }
  function fxStats(){ return { particles:Tank.FX.activeCount(), shake:Tank.FX.shakeState() }; }
  function notifyDamage(who, x, y, dmg){     // called by Game on tank hit
    blink(who);
    Tank.FX.dmgNum(x, y, dmg, who);
  }
  function hpFlash(who){ Tank.UI.hpFlash(who); }

  function drawTank(ctx, view, x, angleDeg, hp, isPlayer, maxHp){
    // world→screen uses view.scale; the hull is drawn a bit larger on phones so it reads
    const s = view.scale;
    const u = s * (s < 0.8 ? 1.4 : 1.0);
    const gy = Tank.Terrain.heightAt(x);
    const sx=(x-view.x)*s, sy=(gy-view.y)*s;
    const C = Tank.CFG.COLORS;
    const body = isPlayer?C.pBody:C.eBody, dark = isPlayer?C.pDark:C.eDark;
    const blink = isPlayer ? blinkP : blinkE;
    ctx.save(); ctx.translate(sx, sy);
    const g2 = Tank.Terrain.heightAt(x+20);
    ctx.rotate(Math.atan2(g2-gy, 20));
    if(blink>0.02 && Math.floor(blink*14)%2===0){ ctx.globalAlpha=0.45; }
    ctx.fillStyle=dark;
    ctx.beginPath(); ctx.roundRect(-Tank.CFG.TANK_W/2*u, -8*u, Tank.CFG.TANK_W*u, 10*u, 4*u); ctx.fill();
    ctx.fillStyle='#37474f';
    for(let i=-2;i<=2;i++) ctx.fillRect(i*8*u-1.5*u, -7*u, 3*u, 8*u);
    const a = (isPlayer?pBarrel:eBarrel)*Math.PI/180;
    const rec = Tank.FX.recoilPx()*u;
    ctx.save(); ctx.translate(0,-10*u);
    ctx.strokeStyle=dark; ctx.lineWidth=6*u; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a)*(Tank.CFG.BARREL_LEN*u-rec), -(Math.sin(a)*(Tank.CFG.BARREL_LEN*u-rec)));
    ctx.stroke();
    ctx.fillStyle=body; ctx.beginPath(); ctx.arc(0,0,Tank.CFG.TURRET_R*u,Math.PI,0); ctx.fill();
    ctx.restore();
    ctx.fillStyle=body;
    ctx.beginPath(); ctx.moveTo(-Tank.CFG.TANK_W/2*u,-8*u);
    ctx.lineTo(Tank.CFG.TANK_W/2*u,-8*u); ctx.lineTo(Tank.CFG.TANK_W/2*u-6*u,-16*u);
    ctx.lineTo(-Tank.CFG.TANK_W/2*u+6*u,-16*u); ctx.closePath(); ctx.fill();
    const hpMax = maxHp || Tank.CFG.TANK_HP;
    const hpFrac = Tank.U.clamp(hp/hpMax, 0, 1);
    const bw = 34*u, bh = 3.6*u;
    ctx.fillStyle='rgba(10,14,24,0.75)';
    ctx.fillRect(-bw/2, -28*u, bw, bh+1.5*u);
    ctx.fillStyle = hpFrac>0.5?'#66bb6a':(hpFrac>0.25?'#ffca28':'#ef5350');
    ctx.fillRect(-bw/2, -28*u, bw*hpFrac, bh);
    ctx.globalAlpha=1;
    ctx.restore();
    // damage states: smoke when hurt, fire when critical (world-space FX)
    if(hp<hpMax*0.40 && Math.random()<0.30){
      Tank.FX._fireFlame.smoke(x+(Math.random()-0.5)*16, gy-16-Math.random()*6);
    }
    if(hp<hpMax*0.15 && Math.random()<0.35){
      Tank.FX._fireFlame(x+(Math.random()-0.5)*16, gy-16-Math.random()*8);
    }
  }

  function drawShotAndTrail(ctx, view){
    const s=view.scale;
    trail.forEach(t=>{
      const def = Tank.CFG.AMMO[t.kind]||Tank.CFG.AMMO.standard;
      ctx.fillStyle=def.color; ctx.globalAlpha = Math.min(1,t.life*2)*0.7;
      ctx.beginPath(); ctx.arc((t.x-view.x)*s,(t.y-view.y)*s,2.2*s,0,7); ctx.fill();
    });
    ctx.globalAlpha=1;
    Tank.Shells.shots().forEach(sh=>{
      const def = Tank.CFG.AMMO[sh.kind];
      ctx.fillStyle=def.color;
      ctx.beginPath(); ctx.arc((sh.x-view.x)*s,(sh.y-view.y)*s,Tank.CFG.SHELL_R*s,0,7); ctx.fill();
      ctx.globalAlpha=0.35; ctx.beginPath();
      ctx.arc((sh.x-view.x)*s,(sh.y-view.y)*s,Tank.CFG.SHELL_R*2*s,0,7); ctx.fill();
      ctx.globalAlpha=1;
    });
    debris.forEach(d=>{
      ctx.save(); ctx.translate((d.x-view.x)*s,(d.y-view.y)*s); ctx.rotate(d.rot);
      ctx.fillStyle=d.color; ctx.globalAlpha=Math.min(1,d.life);
      ctx.fillRect(-d.size*s/2,-d.size*s/2,d.size*s,d.size*s); ctx.restore();
    });
    ctx.globalAlpha=1;
  }

  function clear(){ trail=[]; debris=[]; pBarrel=60; eBarrel=120; blinkP=0; blinkE=0; }
  function stats(){ return {shotCount, trailCount}; }

  return { drawTank, drawShotAndTrail, update, blink, addTrail, addDebris,
           slowmoStart, slowmoActive, slowmoUpdate, clear, stats,
           addFlash, addShake, shakeOffset, updateFX, fxStats, notifyDamage, hpFlash };
})();
