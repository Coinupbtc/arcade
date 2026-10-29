// Tank.Terrain — heightmap hills, craters, destructible props, sky/sun drawing
Tank.Terrain = (function(){
  const W = Tank.CFG.WORLD_W, H = Tank.CFG.WORLD_H;
  const STEP = 4;                       // heightmap resolution (world px)
  let hts = null;                       // Float32Array heights (y of ground surface)
  let props = [], scorches = [];
  let rng = Math.random;
  const GROUND_BASE = 620;              // world y where hills roughly sit

  let ridge = null;
  function generate(seed, opts){
    opts = opts || {};
    rng = Tank.U.RNG(seed>>>0);
    hts = new Float32Array(Math.ceil(W/STEP)+2);
    // layered sine hills + noise
    const p1 = 2+rng()*3, p2 = 5+rng()*6, p3 = 11+rng()*9;
    const a1 = 90+rng()*70, a2 = 34+rng()*26, a3 = 10+rng()*12;
    const ph1 = rng()*6.28, ph2 = rng()*6.28, ph3 = rng()*6.28;
    for(let i=0;i<hts.length;i++){
      const x = i*STEP;
      const t = x/W*Math.PI*2;
      hts[i] = GROUND_BASE
        + Math.sin(t*p1+ph1)*a1 + Math.sin(t*p2+ph2)*a2 + Math.sin(t*p3+ph3)*a3
        + (rng()-0.5)*6;
    }
    // optional mid-map ridge: the "hull down" stages need a hill between the tanks
    ridge = null;
    if(opts.ridge > 0){
      const cx = W*(0.42 + rng()*0.16);
      const halfW = 110 + rng()*40;
      for(let i=0;i<hts.length;i++){
        const x = i*STEP, d = Math.abs(x-cx);
        if(d < halfW) hts[i] -= opts.ridge * Math.cos(d/halfW*Math.PI/2) * (0.85 + rng()*0.3);
      }
      ridge = { x:cx, h:opts.ridge, w:halfW*2 };
    }
    scorches = [];
    props = spawnProps();
    // Launch lanes. The layered sines could leave a 76-200 px hill 40 px in front of a
    // muzzle: every shot under ~70° exploded beside its own tank (playtest 2026-10-27:
    // "spawn is walled in ... angle is effectively a forced choice"). Carve the ground
    // down in front of each tank for 190 px so mid angles have a clear way out.
    clearLane(Math.round(W * 0.18 / STEP), 1);
    clearLane(Math.round(W * 0.82 / STEP), -1);
  }

  // hts stores the ground's y: smaller y is higher ground. Keep the lane at or below
  // the tank's own plateau for 190 px, then let the hills resume.
  function clearLane(i0, dir){
    if(!hts || i0 < 0 || i0 >= hts.length) return;
    const g0 = hts[i0];
    for(let d=0; d<=190; d+=STEP){
      const i = i0 + dir*Math.round(d/STEP);
      if(i < 0 || i >= hts.length) break;
      const lowest = g0 - 6 + d*0.12;
      if(hts[i] < lowest) hts[i] = lowest;
    }
  }

  function spawnProps(){
    const out = [];
    const defs = Tank.CFG.PROP;
    const kinds = ['building','tree','rock','building','tree','rock','building','tree','rock'];
    const pX = W*0.18, eX = W*0.82;
    const blocked = (x)=>{
      if(Math.abs(x - pX) < 150 || Math.abs(x - eX) < 150) return true;
      if(ridge && Math.abs(x - ridge.x) < ridge.w*0.5 + 60) return true;
      for(let i=0;i<out.length;i++) if(Math.abs(out[i].x - x) < 105) return true;
      return false;
    };
    for(let k=0;k<Tank.CFG.PROPS_N;k++){
      const kind = kinds[k%kinds.length];
      const d = defs[kind];
      let x = 0, tries = 0;
      do { x = Math.round(60 + rng()*(W-120)); tries++; } while(blocked(x) && tries < 40);
      if(blocked(x)) continue;                       // no room on this map: skip the prop
      out.push({ kind, x, hp:d.hp, maxHp:d.hp, w:d.w, h:d.h,
                 alive:true, fallT:0, vy:0, yOff:0, rot:0, seed:rng()*100 });
    }
    return out;
  }

  function heightAt(x){
    if(!hts) return GROUND_BASE;
    const i = Tank.U.clamp(x/STEP, 0, hts.length-2);
    const i0 = Math.floor(i), f = i-i0;
    return Tank.U.lerp(hts[i0], hts[i0+1], f);
  }

  // crater: lower terrain in radius r around (cx), also damage props
  function carve(cx, r){
    const i0 = Math.max(0, Math.floor((cx-r)/STEP));
    const i1 = Math.min(hts.length-1, Math.ceil((cx+r)/STEP));
    for(let i=i0;i<=i1;i++){
      const x = i*STEP;
      const d = Math.abs(x-cx);
      if(d<r){
        const depth = Math.cos(d/r*Math.PI/2)*(r*0.55);
        hts[i] = Math.min(H-40, hts[i]+depth);   // y grows downward → deeper crater
        // smooth rim slightly
      }
    }
    props.forEach(p=>{
      if(!p.alive) return;
      const d = Math.abs(p.x-cx);
      if(d < r+p.w/2) damageProp(p, 30*(1-d/(r+p.w))+8);
    });
  }

  // buildings are hard cover: a shell that reaches one stops there
  function propHitAt(x, y){
    for(let i=0;i<props.length;i++){
      const p = props[i];
      if(!p.alive || p.kind !== 'building') continue;
      const gy = heightAt(p.x);
      if(y >= gy - p.h && y <= gy + 6 && Math.abs(x - p.x) <= p.w/2) return p;
    }
    return null;
  }

  function damageProp(p, dmg){
    if(!p.alive) return;
    p.hp -= dmg;
    if(p.hp<=0){ p.alive=false; p.fallT=0; p.vy=0; }
  }

  // destroyed props fall/crumble toward ground
  function updateProps(dt){
    props.forEach(p=>{
      if(p.alive || p.fallT===null) return;
      p.fallT += dt;
      // crumble: sink slightly + rotate, resolves in ~0.6s (drawProps does the visual)
      if(p.fallT>0.6){ p.fallT = null; }
    });
  }

  function anyPropAlive(){ return props.some(p=>p.alive); }

  // ---- drawing ----
  let skyG = null, skyKey = '';
  function sky(ctx, view, t){
    const key = view.w + 'x' + view.h;
    if(key !== skyKey){
      skyKey = key;
      skyG = ctx.createLinearGradient(0,0,0,view.h);
      skyG.addColorStop(0, Tank.CFG.COLORS.sky1);
      skyG.addColorStop(1, Tank.CFG.COLORS.sky2);
    }
    ctx.fillStyle = skyG; ctx.fillRect(0,0,view.w,view.h);
    // sun slowly moving across sky
    const sx = view.w*(0.2+0.6*((t/120)%1)), sy = view.h*0.16;
    ctx.save();
    ctx.globalAlpha=0.9; ctx.fillStyle=Tank.CFG.COLORS.sun;
    ctx.beginPath(); ctx.arc(sx,sy,18,0,7); ctx.fill();
    ctx.globalAlpha=0.15; ctx.beginPath(); ctx.arc(sx,sy,30,0,7); ctx.fill();
    ctx.restore();
  }

  function drawHills(ctx, view){
    // world→screen via view {x,y,scale,w,h}
    const s=view.scale, ox=-view.x*s, oy=-view.y*s;
    // back ridge (parallax-ish, drawn cheaper)
    ctx.fillStyle = Tank.CFG.COLORS.hillBack;
    ctx.beginPath();
    ctx.moveTo(0, view.h);
    for(let sxp=0; sxp<=view.w; sxp+=16){
      const wx = view.x+sxp/s;
      const wy = heightAt(wx*1.06+40)-110;
      ctx.lineTo(sxp, (wy-view.y)*s);
    }
    ctx.lineTo(view.w, view.h); ctx.closePath(); ctx.fill();
    // main hill fill
    ctx.fillStyle = Tank.CFG.COLORS.hill;
    ctx.beginPath();
    ctx.moveTo(0, view.h);
    for(let sxp=0; sxp<=view.w; sxp+=6){
      const wx = view.x+sxp/s;
      const wy = heightAt(wx);
      ctx.lineTo(sxp, (wy-view.y)*s);
    }
    ctx.lineTo(view.w, view.h); ctx.closePath(); ctx.fill();
    // dirt band under surface
    ctx.fillStyle = Tank.CFG.COLORS.dirt;
    ctx.beginPath();
    ctx.moveTo(0, view.h);
    for(let sxp=0; sxp<=view.w; sxp+=6){
      const wx = view.x+sxp/s;
      const wy = heightAt(wx)+14;
      ctx.lineTo(sxp, (wy-view.y)*s);
    }
    ctx.lineTo(view.w, view.h); ctx.closePath(); ctx.fill();
  }

  function drawProps(ctx, view){
    const s=view.scale;
    props.forEach(p=>{
      const sx=(p.x-view.x)*s;
      if(sx<-80||sx>view.w+80) return;
      const gy = heightAt(p.x);
      const sy=(gy-view.y)*s;
      ctx.save(); ctx.translate(sx, sy);
      if(!p.alive && p.fallT!==null && p.fallT<0.6){
        const t=p.fallT/0.6; ctx.translate(0, t*t*26); ctx.rotate((p.seed%1-0.5)*t*0.6);
        ctx.globalAlpha=1-t*0.5;
      } else if(!p.alive){ ctx.restore(); return; }
      const w=p.w*s, h=p.h*s;
      if(p.kind==='building'){
        ctx.fillStyle='#90a4ae'; ctx.fillRect(-w/2,-h,w,h);
        ctx.fillStyle='#607d8b'; ctx.fillRect(-w/2,-h,w,6*s);
        ctx.fillStyle='#263238';
        for(let r=0;r<4;r++) for(let c=0;c<3;c++)
          ctx.fillRect(-w/2+6*s+c*(w-12*s)/3, -h+12*s+r*(h-20*s)/4, 7*s, 8*s);
        if(p.hp<p.maxHp*0.5){ ctx.fillStyle='rgba(30,30,30,.5)'; ctx.fillRect(-w/2,-h,w,h); }
      } else if(p.kind==='tree'){
        ctx.fillStyle='#6d4c41'; ctx.fillRect(-3*s,-h*0.4,6*s,h*0.4);
        ctx.fillStyle='#2e7d32'; ctx.beginPath();
        ctx.arc(0,-h*0.55,h*0.32,0,7); ctx.arc(-h*0.2,-h*0.4,h*0.24,0,7);
        ctx.arc(h*0.2,-h*0.4,h*0.24,0,7); ctx.fill();
        if(p.hp<p.maxHp*0.5){ ctx.fillStyle='#1b5e20'; ctx.beginPath();
          ctx.arc(0,-h*0.55,h*0.32,0,Math.PI); ctx.fill(); }
      } else { // rock
        ctx.fillStyle='#78909c'; ctx.beginPath();
        ctx.moveTo(-w/2,0); ctx.lineTo(-w*0.3,-h); ctx.lineTo(w*0.25,-h*0.8);
        ctx.lineTo(w/2,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#546e7a'; ctx.fillRect(-w/2,0,w,3*s);
      }
      ctx.restore();
    });
  }

  function addScorch(x, r){ scorches.push({x, r, t:0}); if(scorches.length>40) scorches.shift(); }
  function drawScorch(ctx, view){
    const s=view.scale;
    scorches.forEach(sc=>{
      const sx=(sc.x-view.x)*s;
      const sy=(heightAt(sc.x)-view.y)*s;
      ctx.fillStyle=Tank.CFG.COLORS.scorch;
      ctx.beginPath(); ctx.ellipse(sx, sy, sc.r*s, sc.r*0.3*s, 0, 0, Math.PI); ctx.fill();
      // v2: darker crater rim ring for readably scorched pops
      ctx.strokeStyle='rgba(15,12,9,0.6)'; ctx.lineWidth=Math.max(1.2, 2.4*s);
      ctx.beginPath(); ctx.ellipse(sx, sy, sc.r*s, sc.r*0.3*s, 0, 0, Math.PI); ctx.stroke();
    });
  }

  function draw(ctx, view, t){
    sky(ctx, view, t);
    drawHills(ctx, view);
    drawGrassTufts(ctx, view);
    drawScorch(ctx, view);
    drawProps(ctx, view);
  }

  // deterministic grass tufts + dirt speckles (seeded from x) so terrain isn't barren
  function drawGrassTufts(ctx, view){
    const s=view.scale, x0=Math.floor(view.x/32)*32;
    ctx.strokeStyle='rgba(58,110,52,0.85)'; ctx.lineWidth=Math.max(1.2, 1.6*s);
    for(let wx=x0; wx<view.x+view.w/s+32; wx+=32){
      const gy=heightAt(wx);
      const sx=(wx-view.x)*s, sy=(gy-view.y)*s;
      if(sy<-10||sy>view.h+10) continue;
      const h=(6+((wx*7)%9))*s;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx-2*s, sy-h);
      ctx.moveTo(sx+3*s, sy); ctx.lineTo(sx+4*s, sy-h*0.8);
      ctx.moveTo(sx+6*s, sy); ctx.lineTo(sx+5*s, sy-h*0.6);
      ctx.stroke();
    }
  }

  return { generate, heightAt, carve, damageProp, updateProps, propHitAt, props:()=>props,
           ridge:()=>ridge, addScorch, draw, GROUND_BASE };
})();
