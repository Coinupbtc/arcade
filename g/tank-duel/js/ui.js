// Tank.UI — HUD, menu with sortie picker, pause panel, verdict, device prompts
Tank.UI = (function(){
  let els = {}, game = null, toastTimer = null;
  const ICON = { standard:'●', heavy:'⬤', drill:'◈', cluster:'⁙', emp:'⚡' };
  const P = 'assets/prompts/';

  function init(gameRef){
    game = gameRef;
    ['hud','menu','verdict','pause-panel','toast','btn-play','btn-rematch','btn-next','btn-menu',
     'btn-resume','btn-restart','btn-quit','btn-fire','btn-pause','wind-hud','wind-arrow','wind-val',
     'hp-p','hp-e','hp-p-num','hp-e-num','turn-banner','power-fill','power-num','ammo-row',
     'verdict-title','verdict-sub','verdict-stats','verdict-stars','stage-row','stage-name',
     'menu-controls','menu-best','score-val','stage-hud','clock-bar','sight-val','miss-val',
     'aim-hint','pause-sub','fatal'].forEach(id=>els[id] = document.getElementById(id));
    buildChips();
    buildStages();
  }

  // ---------------------------------------------------------------- ammo chips
  function buildChips(){
    const row = els['ammo-row'];
    row.innerHTML = '';
    Object.keys(Tank.CFG.AMMO).forEach(k=>{
      const def = Tank.CFG.AMMO[k];
      if(def.hidden) return;
      const b = document.createElement('button');
      b.className = 'ammo-chip'; b.dataset.ammo = k; b.type = 'button';
      b.setAttribute('aria-label', def.name + ' shell');
      b.innerHTML = '<span class="ic">' + ICON[k] + '</span><span>' + def.name +
        '</span><span class="cnt">' + (def.infinite ? '∞' : def.count) + '</span>';
      row.appendChild(b);
    });
    row.addEventListener('click', e=>{
      const chip = e.target.closest('.ammo-chip');
      if(chip) game.selectAmmo(chip.dataset.ammo);
    });
  }

  function refreshChips(state){
    Array.from(els['ammo-row'].children).forEach(chip=>{
      const k = chip.dataset.ammo, def = Tank.CFG.AMMO[k], n = state.ammoP[k];
      chip.querySelector('.cnt').textContent = def.infinite ? '∞' : n;
      chip.classList.toggle('sel', state.selAmmo === k);
      chip.classList.toggle('empty', !def.infinite && n <= 0);
      chip.disabled = (!def.infinite && n <= 0) || state.turn !== 'player';
    });
  }

  // ---------------------------------------------------------------- sortie picker
  function buildStages(){
    const row = els['stage-row'];
    row.innerHTML = '';
    Tank.CFG.STAGES.forEach(st=>{
      const b = document.createElement('button');
      b.className = 'stage-chip'; b.type = 'button'; b.dataset.stage = st.n;
      b.setAttribute('aria-label', 'Sortie ' + st.n + ' — ' + st.name);
      b.innerHTML = '<span>' + st.n + '</span><span class="st">' + st.name.split(' ')[0] + '</span>';
      b.addEventListener('click', ()=>game.selectStage(st.n));
      row.appendChild(b);
    });
  }

  function refreshStages(save, selected){
    Array.from(els['stage-row'].children).forEach(b=>{
      const n = +b.dataset.stage;
      const unlocked = n <= (save.unlocked || 1);
      const stars = (save.stars || {})[n] || 0;
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('sel', n === selected);
      b.disabled = !unlocked;
      const label = b.querySelector('.st');
      label.textContent = unlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'LOCKED';
    });
    const sel = Tank.CFG.STAGES[(selected|0 || 1) - 1];
    els['stage-name'].textContent = sel.name + ' — ' + sel.sub;
  }

  // ---------------------------------------------------------------- device prompts
  function promptRow(device){
    const rows = {
      touch: [[P+'touch_hand_open.png','Drag aim'], [P+'touch_tap.png','FIRE'], [P+'touch_tap.png','❚❚ pause']],
      keyboard: [[P+'keyboard_arrows.png','Aim / power'], [P+'keyboard_space.png','Fire'],
                 [P+'keyboard_enter.png','Start'], [P+'keyboard_p.png','Pause']],
      pad: [[P+'xbox_stick_l.png','Aim'], [P+'xbox_button_a.png','Fire'],
            [P+'xbox_button_x.png','Shell'], [P+'xbox_button_start.png','Pause']]
    }[device] || [];
    return rows.map(r=>'<span class="ai-prompt"><img src="'+r[0]+'" alt=""><i>'+r[1]+'</i></span>').join('');
  }

  function setDevice(device){
    els['menu-controls'].innerHTML = promptRow(device);
    els['aim-hint'].textContent = device === 'pad'
      ? 'Left stick aims · A fires · X changes shell · Start pauses'
      : (device === 'touch' ? 'Drag anywhere to aim · then FIRE'
                           : '← → angle · ↑ ↓ power · Space fires · 1-5 shell · P pauses');
  }

  // ---------------------------------------------------------------- screens
  function showMenu(save, selected){
    els.menu.classList.remove('hidden'); els.hud.classList.add('hidden');
    els.verdict.classList.add('hidden'); els['pause-panel'].classList.add('hidden');
    refreshStages(save, selected);
    const stars = Object.values(save.stars || {}).reduce((a,b)=>a+b,0);
    const won = (save.unlocked || 1) - 1;
    els['menu-best'].textContent = won > 0
      ? 'Sorties won: ' + won + '/5 · stars ' + stars + '/15 · best ' + (save.bestAll || 0) + ' pts'
      : 'Five duels, each harder than the last. Win one to unlock the next.';
  }
  function hideMenu(){ els.menu.classList.add('hidden'); els.hud.classList.remove('hidden'); }

  function showPause(on){
    els['pause-panel'].classList.toggle('hidden', !on);
    els.hud.classList.toggle('hidden', on);
  }

  function showVerdict(res){
    els['verdict-title'].textContent = res.win ? 'VICTORY' : 'DEFEAT';
    els['verdict-title'].style.color = res.win ? '#ffd54f' : '#ef5350';
    els['verdict-sub'].textContent = res.win
      ? 'Sortie ' + res.stage + ' cleared in ' + res.shots + ' shots'
      : 'Your hull is gone — the AI holds sortie ' + res.stage;
    els['verdict-stars'].textContent = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
    els['verdict-stars'].style.opacity = res.win ? '1' : '.35';
    els['verdict-stats'].innerHTML =
      'Damage dealt <b>' + Math.round(res.dmg) + '</b> · hull left <b>' + Math.round(res.hpP) + '</b><br>' +
      'Score <b>' + res.score + '</b> · best <b>' + res.best + '</b>' +
      (res.newBest ? ' <span style="color:#ffd54f">NEW BEST</span>' : '');
    els['btn-next'].classList.toggle('hidden', !(res.win && res.stage < Tank.CFG.STAGES.length));
    els.verdict.classList.remove('hidden');
    els.hud.classList.add('hidden');
  }
  function hideVerdict(){ els.verdict.classList.add('hidden'); els.hud.classList.remove('hidden'); }

  // ---------------------------------------------------------------- per-frame HUD
  // Every caller passes an element id. Reading el.textContent on a string threw
  // "Cannot set properties of undefined" once per frame, so the whole HUD froze at
  // its first paint (playtest 2026-10-26: hp 67 on screen 100, wind 0.0, turn stuck).
  const lastVal = {};
  function byId(ref){
    if(ref && typeof ref === 'object' && ref.nodeType) return ref;
    return document.getElementById(ref);
  }
  function setTxt(key, ref, v){
    const el = byId(ref);
    if(!el || lastVal[key] === v) return;
    lastVal[key] = v; el.textContent = v;
  }
  function setStyle(key, ref, prop, v){
    const el = byId(ref);
    if(!el || lastVal[key] === v) return;
    lastVal[key] = v; el.style[prop] = v;
  }
  let chipSig = '';

  function update(state, pulse, extra){
    if(!state) return;
    setStyle('hpw','hp-p','width', Math.max(0, 100 * state.hpP / state.hpMax) + '%');
    setStyle('hpe','hp-e','width', Math.max(0, 100 * state.hpE / state.hpMaxE) + '%');
    setTxt('hpn','hp-p-num', String(Math.max(0, Math.round(state.hpP))));
    setTxt('hen','hp-e-num', String(Math.max(0, Math.round(state.hpE))));
    setTxt('turn','turn-banner', state.status === 'paused' ? 'PAUSED'
      : (state.turn === 'player' ? 'YOUR TURN' : (state.turn === 'ai' ? 'AI TURN' : 'IN FLIGHT')));
    setStyle('pw','power-fill','width', state.powerPct + '%');
    setTxt('pwn','power-num', Math.round(state.powerPct) + '%');
    const w = state.wind;
    setTxt('wa','wind-arrow', w < -0.03 ? '←' : (w > 0.03 ? '→' : '·'));
    setStyle('wao','wind-arrow','opacity', String(0.4 + Math.min(1, Math.abs(w))));
    setTxt('wv','wind-val', Math.abs(w).toFixed(1));
    setTxt('stg','stage-hud', 'S' + extra.stage + ' · ' + Math.round(extra.score || 0) + ' PTS');
    const frac = state.turn === 'player' ? Math.max(0, extra.clockLeft / extra.clockMax) : 1;
    setStyle('ck','clock-bar','transform', 'scaleX(' + frac.toFixed(3) + ')');
    setStyle('ckc','clock-bar','background', frac < 0.28
      ? 'linear-gradient(90deg,#ff5252,#ff8a65)' : 'linear-gradient(90deg,#43a047,#ffd54f,#ff5252)');
    setTxt('sight','sight-val', extra.sightFull ? 'SIGHT FULL' : 'SIGHT ' + extra.sightPct + '%');
    setTxt('miss','miss-val', extra.missText || 'NO SHOT YET');
    const dis = state.turn !== 'player' || state.status !== 'playing';
    if(lastVal.dis !== dis){ lastVal.dis = dis; els['btn-fire'].disabled = dis; }
    if(pulse){
      if(lastVal.wp !== pulse.windPulse){ lastVal.wp = pulse.windPulse;
        els['wind-hud'].classList.toggle('pulse', !!pulse.windPulse); }
      const nudge = !!(pulse.idle && !els['btn-fire'].disabled);
      if(lastVal.nud !== nudge){ lastVal.nud = nudge; els['btn-fire'].classList.toggle('nudge', nudge); }
    }
    const sig = state.selAmmo + '|' + state.turn + '|' + state.ammoP.heavy + ',' + state.ammoP.drill + ',' +
      state.ammoP.cluster + ',' + state.ammoP.emp;
    if(sig !== chipSig){ chipSig = sig; refreshChips(state); }
  }

  function hpFlash(who){
    const el = who === 'P' ? els['hp-p'] : els['hp-e'];
    el.classList.remove('dmgflash');
    void el.offsetWidth;
    el.classList.add('dmgflash');
  }

  function toast(msg, ms){
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>els.toast.classList.add('hidden'), ms || 1600);
    window.__lastToast = msg;
  }
  function hideHint(){ els['aim-hint'].classList.add('faded'); }

  function bind(gameRef){
    els['btn-play'].addEventListener('click', ()=>gameRef.start());
    els['btn-rematch'].addEventListener('click', ()=>gameRef.start());
    els['btn-next'].addEventListener('click', ()=>gameRef.nextStage());
    els['btn-menu'].addEventListener('click', ()=>gameRef.toMenu());
    els['btn-resume'].addEventListener('click', ()=>gameRef.setPaused(false));
    els['btn-restart'].addEventListener('click', ()=>gameRef.start());
    els['btn-quit'].addEventListener('click', ()=>gameRef.toMenu());
    els['btn-pause'].addEventListener('click', ()=>gameRef.togglePause());
    els['btn-fire'].addEventListener('click', ()=>gameRef.fire());
  }

  // rects for probes / bots (CSS px, viewport space)
  function rects(){
    const out = [];
    const push = (name, el)=>{
      if(!el || el.classList.contains('hidden')) return;
      const cs = getComputedStyle(el);
      if(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return;
      const r = el.getBoundingClientRect();
      if(r.width < 1 || r.height < 1) return;
      out.push({name, x:r.left, y:r.top, w:r.width, h:r.height});
    };
    push('fire', els['btn-fire']); push('pause', els['btn-pause']);
    push('play', els['btn-play']); push('rematch', els['btn-rematch']);
    push('next', els['btn-next']); push('menu', els['btn-menu']);
    push('resume', els['btn-resume']);
    Array.from(els['ammo-row'].children).forEach((c,i)=>push('ammo' + (i+1), c));
    Array.from(els['stage-row'].children).forEach(c=>push('stage' + c.dataset.stage, c));
    return out;
  }

  return { init, bind, setDevice, showMenu, hideMenu, update, toast, showVerdict,
           hideVerdict, showPause, hpFlash, hideHint, refreshStages, rects };
})();
