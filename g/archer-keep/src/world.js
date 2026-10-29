// Archer.World — sky, parallax, lane, both castles, orc keep, camera-aware drawing (M2)
// M4 graphics pass: richer castle, layered parallax + fog, textured lane, glows, vignette.
Archer.World = (function(){
  const C = () => Archer.CFG;
  let stars = null, shooting = null, castleTier = 1, castleHpFrac = 1, gateFrac = 1, shakeT = 0, shakeMag = 0;
  let clouds = [], birds = [], torchFlick = 0, shootT = 6;

  function init(seed){
    const rng = Archer.U.RNG((seed||1)>>>0);
    stars = [];
    for(let i=0;i<110;i++) stars.push({ x: rng()*C().WORLD_W, y: rng()*300, r: 0.4+rng()*1.3, tw: rng()*6.28 });
    clouds = [];
    for(let i=0;i<14;i++) clouds.push({ x: rng()*C().WORLD_W, y: 80+rng()*170, w: 60+rng()*90, s: 0.15+rng()*0.2 });
    birds = [];
    for(let i=0;i<5;i++) birds.push({ x: 200+rng()*2200, y: 160+rng()*150, ph: rng()*6.28, s: 14+rng()*10 });
    shooting = null;
  }
  function setCastle(tier, hpFrac, gFrac){ castleTier = tier; castleHpFrac = hpFrac; gateFrac = gFrac; }
  function gateShake(mag){ shakeMag = Math.max(shakeMag, mag); shakeT = 0.35; }
  function update(dt){
    torchFlick += dt*7; for(const b of birds){ b.x -= b.s*dt; if(b.x < -30) b.x = C().WORLD_W+20; }
    // shooting star spawn
    shootT -= dt;
    if(shootT <= 0 && !shooting){
      shooting = { x: Math.random()*C().W, y: 40+Math.random()*160, vx: -260-Math.random()*160, vy: 90+Math.random()*70, life: 0.9 };
      shootT = 5 + Math.random()*9;
    }
    if(shooting){ shooting.x += shooting.vx*dt; shooting.y += shooting.vy*dt; shooting.life -= dt; if(shooting.life<=0) shooting = null; }
  }

  // ---- helpers to convert world x -> screen x using camera ----
  function sx(worldX){
    const cam = window.Archer && Archer.Camera ? Archer.Camera.x : 0;
    return worldX - cam;
  }

  let skyKey = '', skyGrad = null;
  function draw(ctx, t){
    const Cfg = C(), P = Cfg.PALETTE, W = Cfg.W, H = Cfg.H;
    // dusk sky — 3-stop gradient for depth. Cached: rebuilding it every frame is allocation churn
    // on a phone (and the blur behind the stat row is gone, so the compositor has less to do).
    if(skyKey !== W + 'x' + H){
      skyKey = W + 'x' + H;
      skyGrad = ctx.createLinearGradient(0,0,0,H*0.9);
      skyGrad.addColorStop(0, P.skyTop); skyGrad.addColorStop(0.55, '#3a3a63'); skyGrad.addColorStop(1, P.skyBot);
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(0,0,W,H);
    // clouds (parallax 0.2) — two-tone puffs, wrap WITHOUT popping (clamp inside band)
    for(const cl of clouds){
      const band = Cfg.W + cl.w*2;
      let px = (cl.x*0.2 - (Archer.Camera?Archer.Camera.x:0)*0.2 + t*4*cl.s*8) % band;
      if(px < -cl.w) px += band; if(px > Cfg.W + cl.w) px -= band;
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.ellipse(px, cl.y, cl.w, cl.w*0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.ellipse(px + cl.w*0.25, cl.y - cl.w*0.1, cl.w*0.6, cl.w*0.13, 0, 0, 7); ctx.fill();
    }
    // stars twinkle
    if(stars){
      for(const s of stars){
        const px = sx(s.x);
        if(px < -4 || px > W+4) continue;
        const a = 0.35 + 0.4*Math.sin(t*1.7 + s.tw);
        ctx.globalAlpha = a * (1 - s.y/(H*0.42));
        ctx.fillStyle = '#e8eefc';
        ctx.beginPath(); ctx.arc(px, s.y, s.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // shooting star with fading tail
    if(shooting){
      const sh = shooting, a = Math.max(0, sh.life/0.9);
      ctx.strokeStyle = `rgba(255,244,214,${0.85*a})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.x - sh.vx*0.12, sh.y - sh.vy*0.12); ctx.stroke();
      ctx.fillStyle = `rgba(255,250,230,${a})`;
      ctx.beginPath(); ctx.arc(sh.x, sh.y, 1.6, 0, 7); ctx.fill();
    }
    // moon with halo — anchored to the SKY (slow parallax), not glued to the screen
    const moonX = 322 - (Archer.Camera ? Archer.Camera.x : 0) * 0.06;
    const mg = ctx.createRadialGradient(moonX, 96, 12, moonX, 96, 60);
    mg.addColorStop(0, 'rgba(245,238,222,0.28)'); mg.addColorStop(1, 'rgba(245,238,222,0)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(moonX, 96, 60, 0, 7); ctx.fill();
    ctx.fillStyle = '#f5eede'; ctx.beginPath(); ctx.arc(moonX, 96, 22, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(43,58,103,0.18)'; ctx.beginPath(); ctx.arc(moonX-8, 90, 6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX+8, 104, 4, 0, 7); ctx.fill();
    // M7 aurora band: two slow-shifting translucent ribbons (owner: better graphics)
    for(let a=0;a<2;a++){
      const ay = H*(0.16+a*0.09), aa = 0.05+0.03*Math.sin(t*0.35+a*2.1);
      const ag = ctx.createLinearGradient(0, ay-26, 0, ay+26);
      ag.addColorStop(0, 'rgba(80,220,160,0)'); ag.addColorStop(0.5, 'rgba(90,225,175,'+aa.toFixed(3)+')'); ag.addColorStop(1, 'rgba(80,220,160,0)');
      ctx.fillStyle = ag;
      ctx.beginPath();
      for(let x=0;x<=W+16;x+=12){
        const yy = ay + Math.sin(x*0.012 + t*(0.5+a*0.2) + a*3)*9 + Math.sin(x*0.031 - t*0.3)*5;
        if(x===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
      }
      ctx.lineTo(W+16, ay+30); ctx.lineTo(0, ay+30); ctx.closePath(); ctx.fill();
    }
    // THREE ridge layers for depth (parallax by camera; NO time drift — owner: right edge
    // used to visibly slide/change while aiming because ridges moved with t, not camera)
    drawRidge(ctx, sx(0)*0.7, H*0.56, 60, P.mtnFar, 0.008, 0);
    drawRidge(ctx, sx(0)*0.4 + 40, H*0.615, 34, P.mtnMid, 0.012, 90);
    drawRidge(ctx, sx(0)*0.55 + 80, H*0.655, 18, '#2f3a4d', 0.02, 200);
    // treeline is WORLD-ANCHORED (was screen-static → froze while hills slid = torn edge)
    drawTreeline(ctx, H*0.665, P.tree, sx(0)*0.75);
    // atmospheric fog band at horizon
    const fg = ctx.createLinearGradient(0, H*0.62, 0, H*0.72);
    fg.addColorStop(0, 'rgba(217,131,95,0.14)'); fg.addColorStop(1, 'rgba(217,131,95,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, H*0.62, W, H*0.1);
    // birds
    for(const b of birds){
      const px = sx(b.x); if(px<-20||px>W+20) continue;
      const flap = Math.sin(t*6+b.ph)*3;
      ctx.strokeStyle='rgba(20,24,34,0.7)'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(px-4, b.y+flap); ctx.lineTo(px, b.y-2); ctx.lineTo(px+4, b.y+flap); ctx.stroke();
    }
    // ground: grass base + dirt road + stone texture
    const laneY = Cfg.LANE.y;
    ctx.fillStyle = '#57683c'; ctx.fillRect(0, laneY+10, W, H-laneY);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, laneY+34, W, H-laneY-34);
    ctx.fillStyle = P.lane; ctx.fillRect(0, laneY, W, 12);
    ctx.fillStyle = P.laneDark; ctx.fillRect(0, laneY+9, W, 4);
    ctx.fillStyle = 'rgba(255,235,200,0.12)'; ctx.fillRect(0, laneY-1, W, 1.5);
    // dirt speckle + pebbles (world-anchored)
    const x0 = Math.floor((Archer.Camera?Archer.Camera.x:0)/11)*11;
    for(let wx=x0; wx<x0+W+22; wx+=11){
      const px = sx(wx);
      const r = ((wx*31)%7+7)%7;
      ctx.fillStyle = r%3===0 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(px, laneY+3+r%6, 4, 2);
      if(r===5){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(px+5, laneY+5+r%5, 2, 1.2, 0, 0, 7); ctx.fill(); }
    }
    // grass tufts (world-anchored, clear near gate)
    ctx.strokeStyle = 'rgba(88,120,60,0.9)'; ctx.lineWidth = 1.4;
    for(let wx=x0; wx<x0+W+13; wx+=13){
      if(wx>150 && wx<420) continue;
      const px = sx(wx);
      const gy = laneY+14+(((wx*7)%5)+5)%5;
      ctx.beginPath(); ctx.moveTo(px, gy+6); ctx.lineTo(px-2, gy);
      ctx.moveTo(px+3, gy+6); ctx.lineTo(px+4, gy+1); ctx.stroke();
    }
    // campfires along the road with glow halos
    for(let wx=900; wx<Cfg.WORLD_W-200; wx+=430){
      const px = sx(wx); if(px<-30||px>W+30) continue;
      const fl = Math.sin(torchFlick+wx)*1.5;
      const gl = ctx.createRadialGradient(px, laneY-4, 2, px, laneY-4, 26);
      gl.addColorStop(0, 'rgba(255,179,71,0.30)'); gl.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, laneY-4, 26, 0, 7); ctx.fill();
      ctx.fillStyle='#3d3628'; ctx.fillRect(px-5, laneY+2, 10, 3);
      ctx.fillStyle='rgba(255,179,71,0.85)';
      ctx.beginPath(); ctx.moveTo(px-3, laneY+2); ctx.quadraticCurveTo(px, laneY-10-fl, px+3, laneY+2); ctx.fill();
    }
    drawCastle(ctx, t);
    drawOrcKeep(ctx, t);
    // vignette: darker corners for focus
    const vg = ctx.createRadialGradient(W/2, H*0.42, H*0.32, W/2, H*0.42, H*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,8,16,0.30)');
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  }

  function drawRidge(ctx, off, baseY, amp, color, freq, seedShift){
    const W = Archer.CFG.W;
    ctx.fillStyle = color;
    // Owner fix: extend the curve PAST the right edge (to W+16) and sample a couple points
    // beyond, so the fill's boundary is never a vertical cliff inside the viewport.
    ctx.beginPath(); ctx.moveTo(0, baseY);
    for(let x=0;x<=W+16;x+=8){
      const y = baseY - amp*(0.5+0.5*Math.sin((x+off)*freq+seedShift)) - amp*0.3*Math.sin((x+off*1.7)*freq*2.3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W+16, baseY+40); ctx.lineTo(0, baseY+40); ctx.closePath(); ctx.fill();
  }
  function drawTreeline(ctx, y, color, off){
    const W = Archer.CFG.W;
    off = off || 0;
    for(let x=-20;x<W+20;x+=14){
      const wx = x + off;                 // world-anchored: scrolls with camera parallax
      const h = 16 + (((wx|0)*13)%9+9)%9;
      const px = x - (((off%14)+14)%14);  // stable 14px grid under camera scroll
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(px-6, y); ctx.lineTo(px, y-h); ctx.lineTo(px+6, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.moveTo(px-1.5, y-h*0.45); ctx.lineTo(px, y-h); ctx.lineTo(px+1.5, y-h*0.45); ctx.closePath(); ctx.fill();
    }
  }

  // ---- Your keep: detailed stone, windows, torch glow, banners ----
  function drawCastle(ctx, t){
    const Cfg = C(), P = Cfg.PALETTE;
    const cs = Cfg.CASTLE;
    let sxo = 0, sy = 0;
    if(shakeT > 0){
      shakeT -= 1/60;
      const k = shakeT/0.35;
      sxo = (Math.random()*2-1)*shakeMag*k; sy = (Math.random()*2-1)*shakeMag*k*0.5;
      if(shakeT<=0) shakeMag = 0;
    }
    ctx.save(); ctx.translate(sxo, sy);
    const bx = cs.x, baseY = cs.baseY, topY = baseY - cs.towerH;
    // back keep wall with shading
    ctx.fillStyle = P.stoneDark; ctx.fillRect(sx(bx-cs.wallW/2), baseY-118, cs.wallW, 118);
    const lw = ctx.createLinearGradient(sx(bx-cs.wallW/2), 0, sx(bx+cs.wallW/2), 0);
    lw.addColorStop(0, 'rgba(0,0,0,0.25)'); lw.addColorStop(0.5, 'rgba(255,255,255,0.10)'); lw.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = P.stone; ctx.fillRect(sx(bx-cs.wallW/2), baseY-118, cs.wallW, 118);
    ctx.fillStyle = lw; ctx.fillRect(sx(bx-cs.wallW/2), baseY-118, cs.wallW, 118);
    // arrow-slit windows on back wall
    ctx.fillStyle = '#14100c';
    ctx.fillRect(sx(bx-cs.wallW/2+14), baseY-96, 4, 12);
    ctx.fillRect(sx(bx+cs.wallW/2-18), baseY-96, 4, 12);
    ctx.fillRect(sx(bx-cs.wallW/2+14), baseY-58, 4, 12);
    ctx.fillRect(sx(bx+cs.wallW/2-18), baseY-58, 4, 12);
    ctx.fillStyle = 'rgba(255,190,80,0.5)';
    ctx.fillRect(sx(bx-cs.wallW/2+14), baseY-58, 4, 12);
    // connector mass
    ctx.fillStyle = P.stoneDark; ctx.fillRect(sx(bx-cs.towerW/2-4), baseY-130, cs.towerW+8, 130);
    // wall crenels
    for(let i=0;i<4;i++){
      if(castleHpFrac < 0.4 && i===2) continue;
      ctx.fillStyle = P.stone; ctx.fillRect(sx(bx-cs.wallW/2 + i*(cs.wallW/4)+3), baseY-126, cs.wallW/4-8, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(sx(bx-cs.wallW/2 + i*(cs.wallW/4)+3), baseY-120, cs.wallW/4-8, 2);
    }
    // tower body + vertical shading
    ctx.fillStyle = P.stoneDark; ctx.fillRect(sx(bx-cs.towerW/2), topY, cs.towerW, cs.towerH);
    ctx.fillStyle = P.stone; ctx.fillRect(sx(bx-cs.towerW/2), topY, cs.towerW*0.62, cs.towerH);
    const tw = ctx.createLinearGradient(sx(bx-cs.towerW/2), 0, sx(bx+cs.towerW/2), 0);
    tw.addColorStop(0, 'rgba(0,0,0,0.18)'); tw.addColorStop(0.6, 'rgba(255,255,255,0.08)'); tw.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = tw; ctx.fillRect(sx(bx-cs.towerW/2), topY, cs.towerW, cs.towerH);
    // stone block seams
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
    for(let y=topY+14;y<baseY;y+=16){
      ctx.beginPath(); ctx.moveTo(sx(bx-cs.towerW/2), y); ctx.lineTo(sx(bx+cs.towerW/2), y); ctx.stroke();
      const off = ((y/16)|0)%2 ? 8 : 20;
      ctx.beginPath(); ctx.moveTo(sx(bx-cs.towerW/2+off), y); ctx.lineTo(sx(bx-cs.towerW/2+off), y-16); ctx.stroke();
    }
    // gothic windows up the tower with warm light
    for(let wy=topY+28; wy<baseY-90; wy+=52){
      ctx.fillStyle = '#14100c';
      ctx.beginPath(); ctx.arc(sx(bx), wy+8, 3.2, Math.PI, 0); ctx.fill();
      ctx.fillRect(sx(bx)-3.2, wy+8, 6.4, 9);
      ctx.fillStyle = 'rgba(255,190,80,0.55)';
      ctx.beginPath(); ctx.arc(sx(bx), wy+8, 2.2, Math.PI, 0); ctx.fill();
      ctx.fillRect(sx(bx)-2.2, wy+8, 4.4, 7);
    }
    // tier additions
    if(castleTier >= 2){
      ctx.fillStyle = P.stone; ctx.fillRect(sx(bx-cs.towerW/2-9), topY+30, 9, cs.towerH-30);
      ctx.fillRect(sx(bx+cs.towerW/2), topY+30, 9, cs.towerH-30);
    }
    if(castleTier >= 3){
      ctx.fillStyle = P.stoneLight;
      for(let i=0;i<3;i++) ctx.fillRect(sx(bx-cs.towerW/2-9+2+i*4), topY+18+i*0, 2, 12);
      ctx.fillStyle = P.stone; ctx.fillRect(sx(bx-cs.towerW/2-16), topY+24, 7, 16); ctx.fillRect(sx(bx+cs.towerW/2+9), topY+24, 7, 16);
    }
    // crenellations
    const nCren = 5, miss = Math.round((1-castleHpFrac)*2.4);
    for(let i=0;i<nCren;i++){
      if(i < miss) continue;
      const cx0 = bx-cs.towerW/2 + i*(cs.towerW/nCren);
      ctx.fillStyle = P.stone; ctx.fillRect(sx(cx0+2), topY-10, cs.towerW/nCren-6, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(sx(cx0+2), topY-4, cs.towerW/nCren-6, 2);
    }
    // roof line + tall banner pole with waving blue banner
    ctx.fillStyle = P.wood; ctx.fillRect(sx(bx-cs.towerW/2-3), topY-2, cs.towerW+6, 5);
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx(bx-cs.towerW/2+6), topY-2); ctx.lineTo(sx(bx-cs.towerW/2+6), topY-26); ctx.stroke();
    ctx.fillStyle = '#4a86c9';
    ctx.beginPath(); ctx.moveTo(sx(bx-cs.towerW/2+6), topY-26);
    ctx.quadraticCurveTo(sx(bx-cs.towerW/2+16), topY-23+Math.sin(t*3)*2, sx(bx-cs.towerW/2+24), topY-20+Math.sin(t*2.4)*3);
    ctx.lineTo(sx(bx-cs.towerW/2+24), topY-14);
    ctx.quadraticCurveTo(sx(bx-cs.towerW/2+16), topY-16+Math.sin(t*3)*2, sx(bx-cs.towerW/2+6), topY-14);
    ctx.closePath(); ctx.fill();
    // right-side pennant
    ctx.strokeStyle = '#4a86c9'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(sx(bx+cs.towerW/2-6), topY-2);
    ctx.quadraticCurveTo(sx(bx+cs.towerW/2+8), topY-8+Math.sin(t*3)*3, sx(bx+cs.towerW/2+13), topY-2+Math.sin(t*2.4)*2);
    ctx.stroke();
    // torches flanking the gate WITH glow halos
    drawTorch(ctx, sx(bx-26), cs.gateY-20, t, true);
    drawTorch(ctx, sx(bx+26), cs.gateY-20, t+2, true);
    // damage cracks
    if(castleHpFrac < 0.7){
      ctx.strokeStyle = 'rgba(20,16,12,0.5)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx(bx-8), topY+30); ctx.lineTo(sx(bx-2), topY+58); ctx.lineTo(sx(bx-12), topY+80); ctx.stroke();
      if(castleHpFrac < 0.4){
        ctx.beginPath(); ctx.moveTo(sx(bx+14), topY+20); ctx.lineTo(sx(bx+6), topY+52); ctx.lineTo(sx(bx+18), topY+92); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx(bx-16), baseY-46); ctx.lineTo(sx(bx-6), baseY-18); ctx.stroke();
      }
    }
    // ---- DAMAGE STATES at 75% / 50% / 25% (owner ask) ----
    // 75%: fresh cracks + a few missing stones
    if(castleHpFrac < 0.75){
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(sx(bx-cs.towerW/2+8), topY+64, 7, 5);      // missing stone chunk
      ctx.strokeStyle = 'rgba(15,12,10,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx(bx+cs.towerW/2-12), topY+40); ctx.lineTo(sx(bx+cs.towerW/2-4), topY+66); ctx.stroke();
    }
    // 50%: heavy cracks + rubble at base + smoke wisp
    if(castleHpFrac < 0.5){
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(sx(bx-cs.towerW/2+20), topY+100, 9, 6);
      ctx.fillRect(sx(bx-cs.towerW/2+4), topY+44, 6, 5);
      // rubble pile at base
      ctx.fillStyle = '#6c7a89';
      ctx.beginPath(); ctx.ellipse(sx(bx+cs.towerW/2+10), baseY-3, 10, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#97a3b4';
      ctx.beginPath(); ctx.ellipse(sx(bx+cs.towerW/2+4), baseY-5, 5, 3, 0, 0, 7); ctx.fill();
      // smoke wisp from a crack
      const sm = Math.sin(t*2.2)*3;
      ctx.fillStyle = 'rgba(120,120,125,0.35)';
      ctx.beginPath(); ctx.ellipse(sx(bx-2)+sm, topY+30, 3.5, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(150,150,155,0.25)';
      ctx.beginPath(); ctx.ellipse(sx(bx-4)+sm*1.6, topY+16, 4.5, 7, 0, 0, 7); ctx.fill();
    }
    // 25%: fire in the breach, scorched marks, half the crenels gone, banner tattered
    if(castleHpFrac < 0.25){
      // flames licking from the biggest crack
      const ff = Math.sin(t*11)*1.6;
      ctx.fillStyle = 'rgba(255,120,40,0.85)';
      ctx.beginPath(); ctx.moveTo(sx(bx-6), topY+44); ctx.quadraticCurveTo(sx(bx-2), topY+30-ff, sx(bx+3), topY+44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,80,0.85)';
      ctx.beginPath(); ctx.moveTo(sx(bx-4), topY+44); ctx.quadraticCurveTo(sx(bx-1), topY+36-ff*0.6, sx(bx+1), topY+44); ctx.closePath(); ctx.fill();
      // scorched black marks
      ctx.fillStyle = 'rgba(15,10,8,0.55)';
      ctx.beginPath(); ctx.ellipse(sx(bx-2), topY+50, 9, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx(bx+cs.towerW/2-8), topY+80, 7, 4, 0, 0, 7); ctx.fill();
      // gate battered: dark scorch
      const gwD = cs.gateW, ghD = cs.gateH * (0.55+0.45*gateFrac);
      ctx.fillStyle = 'rgba(10,8,6,0.5)';
      ctx.beginPath(); ctx.ellipse(sx(bx), cs.gateY-ghD/2, gwD*0.4, ghD*0.3, 0, 0, 7); ctx.fill();
    }
    // gate with iron hinges
    const gw = cs.gateW, gh = cs.gateH * (0.55+0.45*gateFrac);
    ctx.fillStyle = P.woodDark; ctx.fillRect(sx(bx-gw/2), cs.gateY-gh, gw, gh);
    const gg = ctx.createLinearGradient(sx(bx-gw/2), 0, sx(bx+gw/2), 0);
    gg.addColorStop(0, 'rgba(0,0,0,0.3)'); gg.addColorStop(0.5, 'rgba(255,220,160,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = P.wood; ctx.fillRect(sx(bx-gw/2+2), cs.gateY-gh+2, gw-4, gh-4);
    ctx.fillStyle = gg; ctx.fillRect(sx(bx-gw/2+2), cs.gateY-gh+2, gw-4, gh-4);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(sx(bx-gw/2+2), cs.gateY-gh+i*gh/3); ctx.lineTo(sx(bx+gw/2-2), cs.gateY-gh+i*gh/3); ctx.stroke(); }
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(sx(bx-gw/2+3), cs.gateY-gh+6, gw-6, 2);
    ctx.fillRect(sx(bx-gw/2+3), cs.gateY-gh+gh-10, gw-6, 2);
    ctx.strokeStyle = '#5a5a5a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sx(bx+3), cs.gateY-gh/2, 3, 0, 7); ctx.stroke();
    if(gateFrac < 0.75){
      ctx.strokeStyle = 'rgba(20,16,12,0.6)';
      ctx.beginPath(); ctx.moveTo(sx(bx-8), cs.gateY-gh+8); ctx.lineTo(sx(bx-2), cs.gateY-14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx(bx+7), cs.gateY-gh+14); ctx.lineTo(sx(bx+11), cs.gateY-10); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTorch(ctx, px, y, t, glow){
    const fl = Math.sin(t*9+px)*1.6;
    if(glow){
      const gl = ctx.createRadialGradient(px+0.5, y-4, 1, px+0.5, y-4, 20);
      gl.addColorStop(0, 'rgba(255,179,71,0.35)'); gl.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px+0.5, y-4, 20, 0, 7); ctx.fill();
    }
    ctx.fillStyle='#5d4027'; ctx.fillRect(px-1, y, 3, 8);
    ctx.fillStyle='rgba(255,179,71,0.9)';
    ctx.beginPath(); ctx.ellipse(px+0.5, y-4+fl*0.3, 2.4, 4.5+fl, 0, 0, 7); ctx.fill();
    ctx.fillStyle='rgba(255,240,200,0.8)';
    ctx.beginPath(); ctx.ellipse(px+0.5, y-3+fl*0.3, 1.1, 2.2+fl*0.5, 0, 0, 7); ctx.fill();
  }

  // ---- ORC KEEP: dark spiky fortress with skull banner, glowing gate ----
  function drawOrcKeep(ctx, t){
    const Cfg = C(), P = Cfg.PALETTE;
    const k = Cfg.ORC_KEEP, baseY = Cfg.LANE.y;
    const kx = k.x, w = k.w, h = k.h;
    const kg = ctx.createLinearGradient(sx(kx-w/2), 0, sx(kx+w/2), 0);
    kg.addColorStop(0, 'rgba(0,0,0,0.35)'); kg.addColorStop(0.5, 'rgba(120,140,110,0.10)'); kg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = P.orcDark; ctx.fillRect(sx(kx-w/2), baseY-h, w, h);
    ctx.fillStyle = P.orc; ctx.fillRect(sx(kx-w/2), baseY-h, w*0.45, h);
    ctx.fillStyle = kg; ctx.fillRect(sx(kx-w/2), baseY-h, w, h);
    // brutal tower spikes
    ctx.fillStyle = P.orcDark;
    for(let i=0;i<5;i++){
      const px = kx-w/2 + i*(w/5)+6;
      ctx.beginPath(); ctx.moveTo(sx(px), baseY-h); ctx.lineTo(sx(px+9), baseY-h-22-((i*13)%12)); ctx.lineTo(sx(px+18), baseY-h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx(px+9), baseY-h-4); ctx.lineTo(sx(px+9), baseY-h-18-((i*13)%12)); ctx.stroke();
    }
    // skull banner on pole
    ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sx(kx), baseY-h-6); ctx.lineTo(sx(kx), baseY-h-34); ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(sx(kx), baseY-h-34);
    ctx.quadraticCurveTo(sx(kx+12), baseY-h-31+Math.sin(t*2.6)*2, sx(kx+18), baseY-h-27+Math.sin(t*2.2)*3);
    ctx.lineTo(sx(kx+18), baseY-h-20);
    ctx.quadraticCurveTo(sx(kx+12), baseY-h-23, sx(kx), baseY-h-22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#e8eefc'; ctx.fillRect(sx(kx+4), baseY-h-30, 7, 5);
    ctx.fillStyle='#c0392b'; ctx.fillRect(sx(kx+5), baseY-h-28.5, 1.6, 1.6); ctx.fillRect(sx(kx+8), baseY-h-28.5, 1.6, 1.6);
    // seams
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for(let y=baseY-h+16;y<baseY;y+=20){
      ctx.beginPath(); ctx.moveTo(sx(kx-w/2), y); ctx.lineTo(sx(kx+w/2), y); ctx.stroke();
    }
    // gate (dark maw) with warning glow + bone posts
    const gw = 40, gh = 52;
    const gglow = ctx.createRadialGradient(sx(kx), k.gateY-gh/2, 4, sx(kx), k.gateY-gh/2, 46);
    gglow.addColorStop(0, 'rgba(255,60,40,0.16)'); gglow.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = gglow; ctx.beginPath(); ctx.arc(sx(kx), k.gateY-gh/2, 46, 0, 7); ctx.fill();
    ctx.fillStyle = '#14100c'; ctx.fillRect(sx(kx-gw/2), k.gateY-gh, gw, gh);
    ctx.strokeStyle = P.orcDark; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(sx(kx), k.gateY-gh, gw/2, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#d7ccc8';
    ctx.fillRect(sx(kx-gw/2-5), k.gateY-30, 3, 14); ctx.fillRect(sx(kx+gw/2+2), k.gateY-30, 3, 14);
    drawTorch(ctx, sx(kx-gw/2-10), k.gateY-24, t+1, true);
    drawTorch(ctx, sx(kx+gw/2+10), k.gateY-24, t+3, true);
  }

  return { init, draw, update, setCastle, gateShake };
})();
