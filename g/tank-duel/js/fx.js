// Tank.FX — v2 juice pass: multi-stage explosions, pooled particles,
// damage numbers, screenshake, hit-stop, audio. All pools, no per-frame allocs.
// API: FX.explosion(x,y,kind,opts) FX.dmgNum(x,y,dmg,who) FX.update(dt) FX.drawUnder/FX.drawOver(ctx,view)
Tank.FX = (function(){
  'use strict';
  const CFG = Tank.CFG;
  const TAU = Math.PI*2;

  // ---------- particle pool (fixed array) ----------
  const P_MAX = 240;
  const P = new Array(P_MAX);
  for(let i=0;i<P_MAX;i++){ P[i] = {on:false,x:0,y:0,vx:0,vy:0,life:0,max:1,kind:0,
    r:1,rot:0,vr:0,grav:0,seed:0}; }
  let pCount = 0;

  // kinds: 0 fire 1 smoke 2 debris 3 spark 4 shock 5 coreflash 6 dirt 7 ember
  function pInit(p,kind,x,y,vx,vy,life,r){
    p.on=true; p.kind=kind; p.x=x; p.y=y; p.vx=vx; p.vy=vy;
    p.life=life; p.max=life; p.r=r; p.rot=Math.random()*TAU;
    p.vr=(Math.random()-0.5)*12; p.grav=0; p.seed=Math.random()*TAU;
    pCount++;
    return p;
  }
  function pSpawn(kind,x,y,vx,vy,life,r){
    // first pass: any dead slot; second: steal from low-priority kinds (smoke/debris)
    for(let i=0;i<P_MAX;i++){ if(!P[i].on) return pInit(P[i],kind,x,y,vx,vy,life,r); }
    for(let i=0;i<P_MAX;i++){ const q=P[i]; if(q.kind===1||q.kind===2) return pInit(q,kind,x,y,vx,vy,life,r); }
    return null; // pool exhausted — drop silently
  }

  // ---------- damage numbers ----------
  const D_MAX = 8;
  const DN = new Array(D_MAX);
  for(let i=0;i<D_MAX;i++){ DN[i] = {on:false,x:0,y:0,t:0,dmg:0,who:'E',crit:false}; }
  function dmgNum(x,y,dmg,who){
    let slot = null;
    for(let i=0;i<D_MAX;i++){ if(!DN[i].on){ slot=DN[i]; break; } }
    if(!slot) slot = DN[0]; // overwrite oldest-ish
    slot.on=true; slot.x=x; slot.y=y; slot.t=0;
    slot.dmg=Math.round(dmg); slot.who=who||'E';
    slot.crit = slot.dmg>=40;
  }

  // ---------- screenshake: directional, impact-scaled ----------
  let shT=0, shDur=0.001, shMag=0, shX=0, shY=0, shDirX=0, shDirY=0;
  function shake(mag, dx, dy){
    // mag 0..14 world-ish; (dx,dy) unit direction the camera KICKS TOWARD (away from blast when caller negates)
    const m = Math.max(shMag*(shT>0?shT/shDur:0), mag);   // stronger shake wins, no reset juggling
    shMag=m; shDur = 0.18 + Math.min(0.30, mag*0.035);    // bigger blast = longer
    shT = shDur;
    const l = Math.hypot(dx,dy)||1; shDirX=dx/l; shDirY=dy/l;
  }
  function shakeOffset(){
    if(shT<=0){ shX=0; shY=0; return Z2; }
    const u = shT/shDur;                       // 1 -> 0
    const k = u*u*(3-2*u);                     // smooth ease — snappy start, soft landing
    const jx = (Math.random()-0.5)*2*shMag*0.7;
    const jy = (Math.random()-0.5)*2*shMag*0.7;
    shX = shDirX*shMag*k + jx*k;
    shY = shDirY*shMag*k + jy*k;
    return Z2;
  }
  const Z2 = {x:0,y:0}; // filled by shakeOffset above

  // ---------- hit-stop ----------
  let hsT = 0;
  function hitStop(s){ hsT = Math.max(hsT, s||0.075); }
  function hitStopScale(){ return hsT>0 ? 0.06 : 1; }   // near-freeze while active

  // ---------- kill-cam slow-mo (punchier: deeper scale, punch-in handled by Game camera) ----------
  let smT = 0;
  function slowmoStart(){ smT = CFG.SLOWMO_TIME; }
  function slowmoActive(){ return smT > 0; }
  function slowmoUpdate(dt){          // returns time scale this frame
    smT = Math.max(0, smT - dt);
    const u = smT / CFG.SLOWMO_TIME;  // 1 -> 0
    // ease back up to full speed near the end
    return CFG.SLOWMO_SCALE + (1-CFG.SLOWMO_SCALE) * (1 - u*u*(3-2*u));
  }

  // ---------- damage-state flames (called by Units.drawTank for hurt tanks) ----------
  function _fireFlame(x, y){
    if(Math.random() < 0.5) pSpawn(0, x, y, (Math.random()-0.5)*18, -40-Math.random()*35, 0.35+Math.random()*0.25, 3+Math.random()*3);
    else pSpawn(1, x, y-2, (Math.random()-0.5)*14, -22-Math.random()*20, 0.8+Math.random()*0.6, 3+Math.random()*3);
  }
  _fireFlame.smoke = function(x, y){   // damage smoke puff (hp<40%)
    pSpawn(1, x, y, (Math.random()-0.5)*12, -18-Math.random()*16, 0.9+Math.random()*0.7, 3+Math.random()*3.5);
  };

  // ---------- audio (WebAudio synth, lazily created on first fire) ----------
  let AC = null;
  function ac(){
    if(!AC){
      try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ AC=null; }
    }
    if(AC && AC.state==='suspended'){ try{ AC.resume(); }catch(e){} }
    return AC;
  }
  function noiseBuf(ctx, dur){
    const n = Math.floor(ctx.sampleRate*dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last=0;
    for(let i=0;i<n;i++){ const w=Math.random()*2-1; last=(last+0.94*w)/1.94; d[i]=last*3.0; }
    return b;
  }
  let nbThump=null, nbWhistle=null;
  function sfxThump(vol, dist01){
    const c=ac(); if(!c) return;
    const t0=c.currentTime;
    const src=c.createBufferSource(); src.buffer=nbThump||(nbThump=noiseBuf(c,0.5));
    const lp=c.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.setValueAtTime(900,t0); lp.frequency.exponentialRampToValueAtTime(90,t0+0.4);
    const g=c.createGain();
    const v=(vol||1)*(0.9-0.55*(dist01||0));
    g.gain.setValueAtTime(Math.max(0.001,v),t0);
    g.gain.exponentialRampToValueAtTime(0.001,t0+0.45);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0+0.5);
    // sub thump body
    const o=c.createOscillator(), og=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(110,t0); o.frequency.exponentialRampToValueAtTime(38,t0+0.28);
    og.gain.setValueAtTime(Math.max(0.001,v*0.9),t0); og.gain.exponentialRampToValueAtTime(0.001,t0+0.3);
    o.connect(og); og.connect(c.destination); o.start(t0); o.stop(t0+0.32);
  }
  function sfxWhistle(dur, vol){
    const c=ac(); if(!c) return;
    const t0=c.currentTime;
    const o=c.createOscillator(), g=c.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(1650,t0);
    o.frequency.exponentialRampToValueAtTime(560,t0+dur);
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(vol||0.05,t0+dur*0.55);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
  }
  function sfxZap(){ // EMP
    const c=ac(); if(!c) return;
    const t0=c.currentTime;
    const o=c.createOscillator(), g=c.createGain();
    o.type='square';
    o.frequency.setValueAtTime(1400,t0);
    for(let i=1;i<=6;i++) o.frequency.setValueAtTime(i%2?300:1300, t0+i*0.045);
    g.gain.setValueAtTime(0.07,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.3);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+0.32);
  }
  function sfxPop(){ // cluster bomblet
    const c=ac(); if(!c) return;
    const t0=c.currentTime;
    const src=c.createBufferSource(); src.buffer=nbThump||(nbThump=noiseBuf(c,0.5));
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=700;
    const g=c.createGain();
    g.gain.setValueAtTime(0.28,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.18);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0+0.2);
  }
  function sfxFire(){ // cannon report on fire
    const c=ac(); if(!c) return;
    const t0=c.currentTime;
    const src=c.createBufferSource(); src.buffer=nbThump||(nbThump=noiseBuf(c,0.5));
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1200;
    const g=c.createGain();
    g.gain.setValueAtTime(0.33,t0); g.gain.exponentialRampToValueAtTime(0.001,t0+0.16);
    src.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0+0.18);
    const o=c.createOscillator(), og=c.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(180,t0); o.frequency.exponentialRampToValueAtTime(60,t0+0.12);
    og.gain.setValueAtTime(0.25,t0); og.gain.exponentialRampToValueAtTime(0.001,t0+0.14);
    o.connect(og); og.connect(c.destination); o.start(t0); o.stop(t0+0.16);
  }

  // ---------- muzzle flash + barrel recoil ----------
  const MUZZLE_MAX = 6;
  const MZ = new Array(MUZZLE_MAX);
  for(let i=0;i<MUZZLE_MAX;i++){ MZ[i]={on:false,x:0,y:0,t:0,dir:1}; }
  let recoil = 0;               // 0..1 decays; barrel drawn shorter by recoil*7
  function muzzle(x,y,dir){
    for(let i=0;i<MUZZLE_MAX;i++){ if(!MZ[i].on){ MZ[i].on=true; MZ[i].x=x; MZ[i].y=y; MZ[i].t=0; MZ[i].dir=dir; break; } }
    recoil = 1;
    // v2: muzzle spark puffs so firing reads at phone zoom (FX counter >0 during flight)
    for(let i=0;i<4;i++){
      const a = (dir>0?0:Math.PI) + (Math.random()-0.5)*0.9;
      const sp = 90+Math.random()*130;
      pSpawn(3, x, y, Math.cos(a)*sp, Math.sin(a)*sp-40, 0.22+Math.random()*0.18, 1.6+Math.random()*1.4);
    }
    pSpawn(5, x, y, 0, 0, 0.08, 10);   // tiny core pop
    sfxFire();
  }
  function recoilPx(){ return recoil*7; }

  // ---------- explosion (the main event) ----------
  // opts: {dirAway:{x,y} kick direction for shake, quiet:bool, bomblet:bool}
  function explosion(x,y,kind,opts){
    opts = opts||{};
    const def = CFG.AMMO[kind]||CFG.AMMO.standard;
    const R = def.r;
    const bomblet = !!opts.bomblet;
    const mag = bomblet ? 3.2 : Math.min(13, 2.5 + R/7);
    const da = opts.dirAway||{x:0,y:-1};

    if(bomblet){
      // rapid mini-pop: small core, few sparks, tight ring
      pSpawn(5,x,y,0,0,0.10,20);
      pSpawn(4,x,y,0,0,0.22,26);
      for(let i=0;i<6;i++){ const a=Math.random()*TAU, sp=60+Math.random()*160;
        pSpawn(0,x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.28+Math.random()*0.2,3+Math.random()*3); }
      for(let i=0;i<4;i++){ const a=-Math.PI/2+(Math.random()-0.5)*1.2, sp=90+Math.random()*160;
        pSpawn(2,x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.9,2.5+Math.random()*3); }
      shake(mag, da.x, da.y);
      sfxPop();
      return;
    }

    // 1. white core flash (instant, 0.13s) — bigger for camera scale ~0.5
    pSpawn(5,x,y,0,0,0.13,R*0.62);
    // 2. fireball: radial fire puffs (fast expansion via per-kind growth)
    const nFire = Math.min(18, 9+(R/12)|0);
    for(let i=0;i<nFire;i++){
      const a=(i/nFire)*TAU + Math.random()*0.4, sp=(30+Math.random()*120)*(R/46);
      pSpawn(0,x,y,Math.cos(a)*sp,Math.sin(a)*sp - 20,0.38+Math.random()*0.32,6+Math.random()*7);
    }
    // fire column punch upward
    for(let i=0;i<6;i++){
      pSpawn(0,x,y,(Math.random()-0.5)*70,-90-Math.random()*160,0.42+Math.random()*0.25,7+Math.random()*6);
    }
    // 3. shockwave ring — longer life so the ring reads at phone zoom
    pSpawn(4,x,y,0,0,0.42,R*0.62);
    // 4. smoke ring (slower, lingers)
    const nSm = Math.min(14, 6+(R/16)|0);
    for(let i=0;i<nSm;i++){
      const a=(i/nSm)*TAU+Math.random()*0.5, sp=26+Math.random()*55;
      pSpawn(1,x,y-4,Math.cos(a)*sp,Math.sin(a)*sp*0.55-16,1.1+Math.random()*1.0,7+Math.random()*7);
    }
    // 5. dirt/debris fountain — up and outward (bigger chunks for phone zoom)
    const nDirt = Math.min(16, 9+(R/10)|0);
    for(let i=0;i<nDirt;i++){
      const a=-Math.PI/2+(Math.random()-0.5)*1.5, sp=140+Math.random()*300;
      pSpawn(6,x,y,Math.cos(a)*sp*(0.4+Math.random()*0.6),Math.sin(a)*sp,1.0+Math.random()*0.5,3.5+Math.random()*5.5);
    }
    // 6. sparks (bright streaks)
    for(let i=0;i<10;i++){
      const a=Math.random()*TAU, sp=180+Math.random()*340;
      pSpawn(3,x,y,Math.cos(a)*sp,Math.sin(a)*sp-60,0.28+Math.random()*0.32,2.0+Math.random()*1.8);
    }
    // 7. embers rising
    for(let i=0;i<7;i++){
      const a=-Math.PI/2+(Math.random()-0.5)*2.4, sp=40+Math.random()*120;
      pSpawn(7,x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.7+Math.random()*0.7,1.8+Math.random()*1.4);
    }
    // 8. flash kick: brief additive sky flash via a second big core at low alpha
    pSpawn(5,x,y,0,0,0.07,R*0.95);
    shake(mag, da.x, da.y);
    hitStop(def.dmg>=40 ? 0.085 : 0.05);
    const dist01 = 0; // caller can extend; fine at 0
    sfxThump(1, dist01);
  }

  // shell whistle: call at fire time with estimated flight seconds (cfg-less, synth only)
  function whistle(dur){ if(dur && dur>0.25 && dur<4) sfxWhistle(dur, 0.045); }

  // EMP special: electric arc ring + blue flash
  function empBlast(x,y,R){
    pSpawn(5,x,y,0,0,0.12,R*0.5);
    pSpawn(4,x,y,0,0,0.42,R*0.62);
    for(let i=0;i<10;i++){ const a=(i/10)*TAU;
      const sp=140+Math.random()*120;
      pSpawn(3,x,y,Math.cos(a)*sp,Math.sin(a)*sp,0.3+Math.random()*0.25,2+Math.random()*1.5); }
    for(let i=0;i<8;i++){ const a=(i/8)*TAU+0.3;
      pSpawn(0,x,y,Math.cos(a)*70,Math.sin(a)*70,0.3,4); }
    shake(9,0,-1);
    sfxZap();
  }

  // Drill: dirt jet on burrow entry
  function dirtJet(x,y){
    for(let i=0;i<12;i++){
      const a=-Math.PI/2+(Math.random()-0.5)*0.9, sp=180+Math.random()*260;
      pSpawn(6,x,y,Math.cos(a)*sp*0.5,Math.sin(a)*sp,0.8+Math.random()*0.5,2.5+Math.random()*4);
    }
    pSpawn(4,x,y,0,0,0.2,20);
    shake(3.5,0,-1);
  }

  // ---------- update ----------
  function update(dt){
    if(shT>0) shT=Math.max(0,shT-dt);
    if(hsT>0) hsT=Math.max(0,hsT-dt);
    if(recoil>0) recoil=Math.max(0,recoil-dt*5);
    for(let i=0;i<MUZZLE_MAX;i++){ const m=MZ[i]; if(m.on){ m.t+=dt; if(m.t>0.12) m.on=false; } }
    for(let i=0;i<P_MAX;i++){
      const p=P[i]; if(!p.on) continue;
      p.life-=dt;
      if(p.life<=0){ p.on=false; pCount--; continue; }
      switch(p.kind){
        case 0: // fire — buoyant, slows, shrinks
          p.vx*=(1-2.4*dt); p.vy=p.vy*(1-2.4*dt)-70*dt;
          p.x+=p.vx*dt; p.y+=p.vy*dt;
          p.r+=26*dt; break;
        case 1: // smoke — drifts up, grows
          p.vx*=(1-1.1*dt); p.vy-=34*dt;
          p.x+=p.vx*dt+Math.sin(p.life*3+p.seed)*12*dt; p.y+=p.vy*dt;
          p.r+=16*dt; break;
        case 2: case 6: // debris/dirt — gravity
          p.grav=1; p.vy+=CFG.GRAVITY*1.05*dt; p.vx*=(1-0.6*dt);
          p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt;
          if(p.y>Tank.Terrain.heightAt(p.x)){ p.y=Tank.Terrain.heightAt(p.x); p.vx*=0.4; p.vy*=-0.28; }
          break;
        case 3: // spark — fast decay streak
          p.vy+=CFG.GRAVITY*0.45*dt; p.vx*=(1-1.6*dt);
          p.x+=p.vx*dt; p.y+=p.vy*dt; break;
        case 4: // shockwave — pure radius growth
          p.r+=620*dt; break;
        case 5: // core flash — quick growth then out
          p.r+=90*dt; break;
        case 7: // ember — float up, flicker
          p.vx*=(1-1.2*dt); p.vy-=50*dt;
          p.x+=p.vx*dt+Math.sin(p.life*7+p.seed)*16*dt; p.y+=p.vy*dt;
          p.r+=3*dt; break;
      }
    }
    for(let i=0;i<D_MAX;i++){ const d=DN[i]; if(d.on){ d.t+=dt; if(d.t>1.1) d.on=false; } }
  }

  // ---------- draw ----------
  // under tanks: shockwave rings, core flashes, scorch-adjacent ground FX
  function drawUnder(ctx,view){
    const s=view.scale, ox=-view.x*s, oy=-view.y*s;
    for(let i=0;i<P_MAX;i++){
      const p=P[i]; if(!p.on) continue;
      if(p.kind!==4 && p.kind!==5) continue;
      const u=p.life/p.max;
      const sx=p.x*s+ox, sy=p.y*s+oy;
      if(p.kind===4){ // shockwave: expanding thin ring, additive
        ctx.save(); ctx.globalCompositeOperation='lighter';
        ctx.strokeStyle='rgba(255,236,190,'+(u*0.85)+')';
        ctx.lineWidth=Math.max(1.2, 5*s*u+1);
        ctx.beginPath(); ctx.arc(sx,sy,p.r*s,0,TAU); ctx.stroke();
        ctx.strokeStyle='rgba(255,255,255,'+(u*0.5)+')';
        ctx.lineWidth=Math.max(1, 2.4*s*u);
        ctx.beginPath(); ctx.arc(sx,sy,p.r*s*0.92,0,TAU); ctx.stroke();
        ctx.restore();
      } else { // core flash: white hot blob, additive
        ctx.save(); ctx.globalCompositeOperation='lighter';
        const g=ctx.createRadialGradient(sx,sy,0,sx,sy,Math.max(1,p.r*s));
        g.addColorStop(0,'rgba(255,255,255,'+(0.95*u)+')');
        g.addColorStop(0.5,'rgba(255,240,200,'+(0.75*u)+')');
        g.addColorStop(1,'rgba(255,200,120,0)');
        ctx.fillStyle=g;
        ctx.beginPath(); ctx.arc(sx,sy,Math.max(1,p.r*s),0,TAU); ctx.fill();
        ctx.restore();
      }
    }
  }
  // over tanks: fire, smoke, debris, dirt, sparks, embers + damage numbers + muzzle
  function drawOver(ctx,view){
    const s=view.scale, ox=-view.x*s, oy=-view.y*s;
    for(let i=0;i<P_MAX;i++){
      const p=P[i]; if(!p.on) continue;
      if(p.kind===4||p.kind===5) continue;
      const u=p.life/p.max;
      const sx=p.x*s+ox, sy=p.y*s+oy;
      switch(p.kind){
        case 0: { // fire — additive orange->yellow
          ctx.save(); ctx.globalCompositeOperation='lighter';
          const rr=Math.max(0.5,p.r*s);
          const g=ctx.createRadialGradient(sx,sy,0,sx,sy,rr);
          const hot = u>0.6;
          g.addColorStop(0, hot?'rgba(255,245,200,'+(0.9*u)+')':'rgba(255,190,90,'+(0.85*u)+')');
          g.addColorStop(0.6,'rgba(255,120,40,'+(0.6*u)+')');
          g.addColorStop(1,'rgba(200,60,20,0)');
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sx,sy,rr,0,TAU); ctx.fill();
          ctx.restore(); break;
        }
        case 1: { // smoke
          ctx.fillStyle='rgba(88,84,80,'+(0.42*u)+')';
          ctx.beginPath(); ctx.arc(sx,sy,Math.max(0.5,p.r*s),0,TAU); ctx.fill(); break;
        }
        case 2: case 6: { // debris / dirt chunks
          ctx.save(); ctx.translate(sx,sy); ctx.rotate(p.rot);
          ctx.globalAlpha=Math.min(1,u*1.6);
          ctx.fillStyle = p.kind===6?'#5d4429':'#7a5a3a';
          ctx.fillRect(-p.r*s/2,-p.r*s/2,p.r*s,p.r*s);
          ctx.restore(); break;
        }
        case 3: { // spark — streak along velocity
          ctx.save(); ctx.globalCompositeOperation='lighter';
          ctx.strokeStyle='rgba(255,235,150,'+(u)+')';
          ctx.lineWidth=Math.max(1,1.6*s);
          ctx.beginPath(); ctx.moveTo(sx,sy);
          ctx.lineTo(sx-p.vx*0.03*s, sy-p.vy*0.03*s); ctx.stroke();
          ctx.restore(); break;
        }
        case 7: { // ember
          ctx.save(); ctx.globalCompositeOperation='lighter';
          const fl = 0.6+0.4*Math.sin(p.life*20+p.seed);
          ctx.fillStyle='rgba(255,160,60,'+(u*fl)+')';
          ctx.beginPath(); ctx.arc(sx,sy,Math.max(0.5,p.r*s),0,TAU); ctx.fill();
          ctx.restore(); break;
        }
      }
    }
    // damage numbers
    ctx.textAlign='center';
    for(let i=0;i<D_MAX;i++){
      const d=DN[i]; if(!d.on) continue;
      const t=d.t, u=1-t/1.1;
      const rise = 34*(1-Math.pow(1-Math.min(1,t/0.9),3));  // ease-out rise
      const sx=d.x*s+ox, sy=(d.y-rise)*s+oy;
      const a = t<0.85 ? 1 : (1-t)/0.25;
      ctx.save();
      ctx.globalAlpha=Math.max(0,Math.min(1,a));
      ctx.font='800 '+Math.max(11, (d.crit?17:14)*(d.t<0.12?1.25-d.t*2:1))+'px -apple-system,system-ui,sans-serif';
      ctx.fillStyle = d.crit?'#ffd54f':'#ffffff';
      ctx.strokeStyle='rgba(10,14,24,0.9)'; ctx.lineWidth=3;
      const txt = '-'+d.dmg + (d.crit?'!':'');
      ctx.strokeText(txt,sx,sy); ctx.fillText(txt,sx,sy);
      ctx.restore();
    }
    // muzzle flashes (star burst)
    for(let i=0;i<MUZZLE_MAX;i++){
      const m=MZ[i]; if(!m.on) continue;
      const u=1-m.t/0.12;
      ctx.save(); ctx.globalCompositeOperation='lighter';
      const g=ctx.createRadialGradient(m.x*s+ox,m.y*s+oy,0,m.x*s+ox,m.y*s+oy,16*s);
      g.addColorStop(0,'rgba(255,255,230,'+(0.95*u)+')');
      g.addColorStop(0.5,'rgba(255,210,120,'+(0.7*u)+')');
      g.addColorStop(1,'rgba(255,150,60,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(m.x*s+ox,m.y*s+oy,16*s,0,TAU); ctx.fill();
      ctx.restore();
    }
  }

  function activeCount(){ let n=0; for(let i=0;i<P_MAX;i++) if(P[i].on) n++; return n; }
  function shakeState(){ return {t:+shT.toFixed(3), mag:+shMag.toFixed(2), x:+shX.toFixed(2), y:+shY.toFixed(2)}; }
  function clear(){
    for(let i=0;i<P_MAX;i++) P[i].on=false;
    for(let i=0;i<D_MAX;i++) DN[i].on=false;
    for(let i=0;i<MUZZLE_MAX;i++) MZ[i].on=false;
    shT=0; shMag=0; hsT=0; recoil=0; pCount=0;
  }

  return { explosion, empBlast, dirtJet, dmgNum, muzzle, shake, shakeOffset,
           hitStop, hitStopScale, recoilPx, update, drawUnder, drawOver,
           slowmoStart, slowmoActive, slowmoUpdate, _fireFlame, whistle,
           activeCount, shakeState, clear, sfxThump, unlockAudio: ac };
})();
