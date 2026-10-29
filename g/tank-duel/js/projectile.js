// Tank.Shells — projectile lifecycle, ammo kinds, cluster split, drill tunnel
Tank.Shells = (function(){
  let shots = [];       // active shells {x,y,vx,vy,kind,mass,drilled}
  let pending = [];     // cluster bomblets queued
  let onResolve = null; // callback(impact) when salvo fully resolves

  function spawn(kind, x, y, angleDeg, powerPct){
    const def = Tank.CFG.AMMO[kind];
    const v0 = Tank.Phys.muzzleVel(powerPct);
    const a = angleDeg*Math.PI/180;
    shots.push({ x, y, vx:Math.cos(a)*v0, vy:-Math.sin(a)*v0,
                 kind, mass:def.mass, drilled:false, life:0,
                 wind: (typeof Tank.Game !== 'undefined' && Tank.Game.wind) ? Tank.Game.wind() : 0 });
  }

  function active(){ return shots.length + pending.length; }

  function clear(){ shots=[]; pending=[]; }

  // update all shells; cb(event) events: {type:'trail'|'split'|'impact', ...}
  function update(dt, terrain, cb){
    // refill from pending
    while(pending.length && shots.length<1){ shots.push(pending.shift()); }
    for(let i=shots.length-1;i>=0;i--){
      const sh = shots[i];
      Tank.Phys.stepShot(sh, dt, sh.wind||0);
      sh.life += dt;
      if(cb) cb({type:'trail', x:sh.x, y:sh.y, kind:sh.kind});
      const def = Tank.CFG.AMMO[sh.kind];
      const groundY = terrain.heightAt(sh.x);
      // drill shells tunnel through ground: only detonate after burrow distance
      if(def.drill && sh.y > groundY && !sh.drilled){
        sh.drilled = true;
        sh.drillY = groundY;
        sh.burrow = 0;
        if(cb) cb({type:'burrow', x:sh.x, y:groundY});
        continue; // keep moving under the hill
      }
      if(sh.drilled){
        sh.burrow += Math.hypot(sh.vx*dt, sh.vy*dt);
        if(sh.burrow > 90 || sh.y > Tank.CFG.WORLD_H){   // detonate inside the hill
          shots.splice(i,1);
          if(cb) cb({type:'impact', x:sh.x, y:groundY, kind:sh.kind, internal:true,
                     vy:sh.vy, vx:sh.vx});
        }
        continue;
      }
      // out of world horizontally
      if(sh.x<-100 || sh.x>Tank.CFG.WORLD_W+100 || sh.y<-400){
        const gone = (sh.x<-100 || sh.x>Tank.CFG.WORLD_W+100);
        if(sh.y<-400){ // above world top: resolve once past apex (falling) or strayed too long
          if(sh.vy>0 || sh.life>6){
            shots.splice(i,1);
            if(def.cluster){
              // cluster that leaves the sky still splits — bomblets rain back down
              const n = def.cluster, cx = Tank.U.clamp(sh.x, 40, Tank.CFG.WORLD_W-40);
              for(let b=0;b<n;b++){
                pending.push({ x:cx+(b-(n-1)/2)*30, y:-360-b*10,
                  vx:sh.vx*0.35 + (b-(n-1)/2)*20, vy:20,
                  kind:'bomblet', mass:0.8, bomblet:true, life:0 });
              }
              if(cb) cb({type:'split', x:cx, y:-360});
            } else {
              if(cb) cb({type:'impact', x:sh.x, y:groundY, kind:sh.kind, offworld:true});
            }
          }
          continue;
        }
        else if(gone){
          shots.splice(i,1);
          if(def.cluster){
            // split at the map edge so cluster never silently vanishes offworld
            const n = def.cluster, cx = Tank.U.clamp(sh.x, 40, Tank.CFG.WORLD_W-40);
            for(let b=0;b<n;b++){
              pending.push({ x:cx, y:groundY-40-b*8,
                vx:sh.vx*0.4 + (b-(n-1)/2)*38, vy:-30,
                kind:'bomblet', mass:0.8, bomblet:true, life:0 });
            }
            if(cb) cb({type:'split', x:cx, y:groundY-40});
          } else {
            if(cb) cb({type:'impact', x:sh.x, y:groundY, kind:sh.kind, offworld:true});
          }
        }
        continue;
      }
      const hitProp = (!def.drill && terrain.propHitAt) ? terrain.propHitAt(sh.x, sh.y) : null;
      if(hitProp){
        shots.splice(i,1);
        if(cb) cb({type:'impact', x:sh.x, y:sh.y, kind:sh.kind, vy:sh.vy, vx:sh.vx, prop:hitProp,
                   bomblet:!!sh.bomblet});
        continue;
      }
      if(Tank.Phys.belowGround(sh.x, sh.y, terrain)){
        shots.splice(i,1);
        if(def.cluster){
          // split into bomblets above impact point
          const n = def.cluster;
          for(let b=0;b<n;b++){
            pending.push({ x:sh.x, y:Math.min(sh.y, groundY)-40-b*8,
              vx:sh.vx*0.4 + (b-(n-1)/2)*38, vy:Math.max(sh.vy*0.3,-60),
              kind:'bomblet', mass:0.8, bomblet:true, life:0 });
          }
          if(cb) cb({type:'split', x:sh.x, y:sh.y});
          // small crater at split point too
          if(cb) cb({type:'impact', x:sh.x, y:groundY, kind:'bomblet', bombletParent:true,
                     vy:sh.vy, vx:sh.vx});
          continue;
        }
        if(cb) cb({type:'impact', x:sh.x, y:sh.y, kind:sh.kind, vy:sh.vy, vx:sh.vx,
                   bomblet:!!sh.bomblet});
      }
    }
    if(shots.length===0 && pending.length===0){
      if(onResolve){ const f=onResolve; onResolve=null; f(); }
    }
  }

  function whenResolved(cb){ onResolve = cb; }

  return { spawn, update, clear, active, whenResolved, shots:()=>shots };
})();
