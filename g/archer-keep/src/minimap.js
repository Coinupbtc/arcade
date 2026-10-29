// Archer.Minimap — world-strip radar: allies blue, enemies red, boss skull, viewport rect (M2)
Archer.Minimap = (function(){
  const C = () => Archer.CFG;
  let rect = { x: 0, y: 0, w: 150, h: 12 };   // screen coords, set by draw
  let visible = false;

  function layout(){
    // Arcade QA: the radar keeps a constant CSS size and sits below the HUD + pause pill band
    // on every viewport (design units are scaled by viewScale(), so divide by it).
    const sc = (C().viewScale && C().viewScale()) || 1;
    const cssW = 150, cssH = 12, cssTop = 110, cssRight = 12;
    rect.w = Math.min(Math.round(cssW / sc), Math.round((C().W - 24) / 1));
    rect.h = Math.max(8, Math.round(cssH / sc));
    rect.x = Math.round((C().W - cssRight / sc) - rect.w);
    rect.y = Math.round(cssTop / sc);
    return rect;
  }
  function hit(sx, sy){
    const r = rect;
    return sx > r.x-8 && sx < r.x+r.w+8 && sy > r.y-8 && sy < r.y+r.h+14;
  }
  function worldToMap(wx){
    const r = rect;
    return r.x + (wx / C().WORLD_W) * r.w;
  }

  function draw(ctx){
    const r = layout(), Cfg = C();
    visible = true;
    // panel
    ctx.fillStyle = 'rgba(10,16,30,0.78)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(r.x-4, r.y-3, r.w+8, r.h+6, 5); else ctx.rect(r.x-4, r.y-3, r.w+8, r.h+6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,213,79,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // track
    ctx.fillStyle = 'rgba(90,110,80,0.5)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // your keep marker
    ctx.fillStyle = '#90a4ae';
    ctx.fillRect(r.x + (Cfg.CASTLE.x/Cfg.WORLD_W)*r.w - 2, r.y-2, 4, r.h+4);
    // orc keep marker
    ctx.fillStyle = '#3e2f2f';
    ctx.fillRect(r.x + (Cfg.ORC_KEEP.x/Cfg.WORLD_W)*r.w - 2, r.y-2, 5, r.h+4);
    // knights (blue dots)
    if(window.Archer && Archer.Knights){
      for(const k of Archer.Knights.all()){
        ctx.fillStyle = k.type==='healer' ? '#8bc34a' : '#64b5f6';
        ctx.beginPath(); ctx.arc(worldToMap(k.x), r.y + r.h/2, 1.6, 0, 7); ctx.fill();
      }
    }
    // enemies (red dots, boss = skull)
    if(window.Archer && Archer.Enemies){
      for(const e of Archer.Enemies.all()){
        const mx = worldToMap(e.x);
        if(e.def.boss){
          ctx.fillStyle = '#ffd54f';
          ctx.font = '800 8px -apple-system,sans-serif'; ctx.textAlign='center';
          ctx.fillText('☠', mx, r.y + r.h - 1);
        } else {
          ctx.fillStyle = e.def.flies ? '#ff8a80' : '#ef5350';
          ctx.beginPath(); ctx.arc(mx, r.y + r.h/2, 1.6, 0, 7); ctx.fill();
        }
      }
    }
    // viewport rectangle
    const camX = (window.Archer && Archer.Camera) ? Archer.Camera.x : 0;
    const vw = (Cfg.W / Cfg.WORLD_W) * r.w;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + (camX/Cfg.WORLD_W)*r.w, r.y, vw, r.h);
  }

  // returns world x if the tap was on the minimap, else null
  function tap(sx, sy){
    if(!hit(sx, sy)) return null;
    const r = rect;
    const frac = Archer.U.clamp((sx - r.x) / r.w, 0, 1);
    return frac * C().WORLD_W;
  }

  function reset(){ visible = false; }
  return { draw, tap, layout, reset, rect: ()=>rect };
})();
