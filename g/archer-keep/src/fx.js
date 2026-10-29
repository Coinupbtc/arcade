// Archer.FX — pooled particles, damage numbers, coin pops, screen shake, hit-stop (M2)
Archer.FX = (function(){
  const C = () => Archer.CFG;
  const P_MAX = 260;
  const P = new Array(P_MAX);
  for(let i=0;i<P_MAX;i++) P[i] = { on:false, kind:0, x:0,y:0,vx:0,vy:0,life:0,max:1,r:1,grav:0,color:'#fff' };
  // kinds: 0 spark 1 smoke 2 debris 3 fire 4 frost 5 coin 6 blood/red 7 flash
  const DN = new Array(12); for(let i=0;i<12;i++) DN[i] = { on:false, x:0,y:0,t:0,txt:'',color:'#fff',big:false };
  let shT = 0, shDur = 0.001, shMag = 0;
  let hitStopT = 0;

  function pSpawn(kind, x, y, vx, vy, life, r, color, grav){
    for(let i=0;i<P_MAX;i++){ const p=P[i]; if(!p.on){
      p.on=true; p.kind=kind; p.x=x; p.y=y; p.vx=vx; p.vy=vy; p.life=life; p.max=life; p.r=r; p.color=color||'#fff'; p.grav=grav||0; return p; } }
    return null;
  }
  function shake(mag){
    shMag = Math.max(shMag, mag); shDur = 0.16 + Math.min(0.25, mag*0.03); shT = shDur;
  }
  function hitStop(){ hitStopT = C().FX.HIT_STOP; }
  function hitStopScale(){ return hitStopT > 0 ? 0.06 : 1; }

  // public effects (world coords)
  function hit(x, y, color, big){
    for(let i=0;i<(big?9:5);i++)
      pSpawn(0, x, y, (Math.random()-0.5)*140, -Math.random()*90, 0.25+Math.random()*0.2, 1.6+Math.random()*1.4, color||'#fff', 300);
    hitStop();
  }
  function dmgNum(x, y, txt, color, big){
    let slot = DN.find(d=>!d.on) || DN[0];
    slot.on=true; slot.x=x; slot.y=y; slot.t=0; slot.color=color||'#fff'; slot.big=!!big;
    slot.txt = txt;
  }
  function damageNum(x, y, dmg, color, big){
    // M7: pass-through for composite labels (e.g. '43 HEAD!') — numbers keep the old behavior
    if(typeof dmg === 'string'){ dmgNum(x, y, dmg, color || '#ff5252', big !== false); return; }
    dmgNum(x, y, String(Math.round(dmg)) + (dmg>=40?'!':''), dmg>=40 ? '#ffd54f' : (color||'#fff'), dmg>=40 || !!big);
  }
  function explosion(x, y){
    Archer.Audio.play('explode');
    for(let i=0;i<14;i++)
      pSpawn(3, x, y, (Math.random()-0.5)*200, -Math.random()*160, 0.3+Math.random()*0.3, 3+Math.random()*3, i%3?'#ff8a65':'#ffd54f', 120);
    for(let i=0;i<6;i++)
      pSpawn(1, x, y, (Math.random()-0.5)*60, -30-Math.random()*50, 0.6+Math.random()*0.5, 4+Math.random()*3, 'rgba(70,70,70,0.5)', -20);
    shake(4);
  }
  function puff(x, y, color){ pSpawn(1, x, y, (Math.random()-0.5)*20, -20, 0.4, 2.4, color||'rgba(255,158,66,0.8)', -10); }
  function coinPop(x, y, n){
    dmgNum(x, y, '+'+n, '#ffd54f', false);
    for(let i=0;i<4;i++)
      pSpawn(5, x, y, (Math.random()-0.5)*80, -60-Math.random()*60, 0.5, 2.2, '#ffd54f', 260);
  }
  function blood(x, y){ for(let i=0;i<5;i++) pSpawn(6, x, y, (Math.random()-0.5)*120, -Math.random()*80, 0.4, 1.8, '#c0392b', 320); }
  function frost(x, y){ for(let i=0;i<6;i++) pSpawn(4, x, y, (Math.random()-0.5)*90, -Math.random()*70, 0.5, 2, '#bfefff', 160); }
  function stickDust(x, y){ for(let i=0;i<3;i++) pSpawn(1, x, y, (Math.random()-0.5)*30, -14, 0.3, 1.6, 'rgba(122,106,79,0.7)', 40); }
  function gateHit(x, y){
    Archer.Audio.play('gateHit');
    for(let i=0;i<8;i++) pSpawn(2, x, y, (Math.random()-0.5)*140, -Math.random()*120, 0.5, 2.2, '#8b5e34', 360);
    shake(2.4);
  }
  function trail(x, y, kind){
    const col = kind==='fire' ? 'rgba(255,179,71,0.6)'
      : kind==='frost' ? 'rgba(191,239,255,0.6)'
      : kind==='magic' ? 'rgba(206,147,216,0.6)'
      : 'rgba(232,220,192,0.35)';
    pSpawn(7, x, y, 0, 0, 0.22, 1.6, col, 0);
  }

  function update(dt){
    hitStopT = Math.max(0, hitStopT - dt);
    if(shT>0){ shT -= dt; if(shT<=0) shMag = 0; }
    for(const p of P){ if(!p.on) continue;
      p.life -= dt; if(p.life<=0){ p.on=false; continue; }
      p.vy += p.grav*dt; p.x += p.vx*dt; p.y += p.vy*dt;
    }
    for(const d of DN){ if(!d.on) continue; d.t += dt; if(d.t > 0.85) d.on=false; }
  }
  function shakeOffset(){
    if(shT<=0) return {x:0,y:0};
    const k = shT/shDur;
    return { x:(Math.random()*2-1)*shMag*k, y:(Math.random()*2-1)*shMag*k*0.6 };
  }
  function drawOver(ctx){
    const cam = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    for(const p of P){ if(!p.on) continue;
      const px = p.x - cam;
      if(px < -10 || px > C().W+10) continue;
      const a = Math.max(0, p.life/p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if(p.kind===5){ ctx.beginPath(); ctx.arc(px, p.y, p.r, 0, 7); ctx.fill();
        ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.fillRect(px-0.6, p.y-0.6, 1.2, 1.2); }
      else ctx.fillRect(px-p.r/2, p.y-p.r/2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for(const d of DN){ if(!d.on) continue;
      const px = d.x - cam;
      if(px < -30 || px > C().W+30) continue;
      const t = d.t/0.85, dy = -18*Archer.U.ease(Math.min(1,t*1.6));
      ctx.globalAlpha = 1 - Math.max(0, t-0.55)/0.45;
      ctx.font = (d.big?'900 15px':'800 11px') + ' -apple-system,sans-serif';
      ctx.fillStyle = d.color;
      ctx.strokeStyle = 'rgba(10,14,24,0.8)'; ctx.lineWidth = 2.5;
      ctx.strokeText(d.txt, px, d.y+dy); ctx.fillText(d.txt, px, d.y+dy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function clear(){ for(const p of P) p.on=false; for(const d of DN) d.on=false; shT=0; shMag=0; hitStopT=0; }
  function activeCount(){ return P.filter(p=>p.on).length; }

  return { hit, damageNum, explosion, puff, coinPop, blood, frost, stickDust, gateHit,
           trail, shake, shakeOffset, hitStop, hitStopScale, update, drawOver, clear, activeCount };
})();
