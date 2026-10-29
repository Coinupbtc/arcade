// Archer.UI — DOM HUD refresh, menus, pause overlay, verdict, toast, arrow chips, SALLY (M8)
Archer.UI = (function(){
  let els = {}, game = null, toastTimer = null, coachTimer = null, verdictAt = 0;

  const ICONS = { broadhead:'➤', piercing:'✜', fire:'🔥', frost:'❄', bomb:'✸' };
  function init(gameRef){
    game = gameRef;
    ['hud','menu','verdict','toast','coach','btn-play','btn-retry','pause','pause-resume',
     'shop','shop-offers','shop-continue','shop-round','shop-coins','hp-castle','hp-castle-num',
     'hp-archer','hp-archer-num','round-num','coins','arrow-row','draw-fill','draw-num',
     'round-banner','verdict-title','verdict-sub','combo','hint-row','menu-hints','fatal','left',
     'btn-sally'    // M12: this id was missing from the cache, so the SALLY button never got its
                    // click handler and never showed its ready state — a thumb tap did nothing at all.
    ].forEach(id=>els[id]=document.getElementById(id));
    buildChips();
    if(els['btn-sally']) els['btn-sally'].addEventListener('click', ()=>game.sally());
    if(els['pause-resume']) els['pause-resume'].addEventListener('click', ()=>{
      if(Archer.Controls && Archer.Controls.raw) Archer.Controls.raw.pause.resume();
      else game.setPaused(false);
    });
    // Menu and verdict: a tap anywhere starts. The DEFEND button is the pad/Enter focus target
    // (arcade-input menu), and one press must do one job.
    // M10: a tap on the arcade's ◀ ARCADE pill must NOT also start a run (the pill is an <a>).
    // 10-26 retest: the next bow draw (a pointerdown) landed on the fresh verdict and restarted the run before the
    // player could read why the keep fell. The verdict takes a deliberate tap (click), none in its first 900 ms.
    ['menu','verdict'].forEach(id=>{
      const el = els[id];
      if(!el) return;
      el.addEventListener(id === 'verdict' ? 'click' : 'pointerdown', function(ev){
        if(ev.target.closest('button')) return;      // the button's own handler/menu press owns that
        if(ev.target.closest('#arcade-home, a')) return; // the shelf pill keeps its own job
        if(id === 'verdict' && performance.now() - verdictAt < 900) return;
        game.start();
      });
    });
  }
  function buildChips(){
    const row = els['arrow-row'];
    row.innerHTML = '';
    Object.keys(Archer.CFG.ARROWS).forEach(k=>{
      const def = Archer.CFG.ARROWS[k];
      const b = document.createElement('button');
      b.className = 'ammo-chip touch-target'; b.dataset.arrow = k;
      b.innerHTML = '<span class="ai">'+ICONS[k]+'</span><span>'+def.name+'</span>';
      b.title = def.desc;
      b.addEventListener('click', ()=>{
        if(Archer.Bow.isUnlocked(k)) game.selectArrow(k);
      });
      row.appendChild(b);
    });
  }
  let chipSig = '';
  function refreshChips(state){
    // Chips only change when the selection or an unlock changes; re-writing classes every frame
    // is layout work for no reason.
    const sig = state.selArrow + '|' + Object.keys(Archer.CFG.ARROWS)
      .map(k => Archer.Bow.isUnlocked(k) ? 1 : 0).join('');
    if(sig === chipSig) return;
    chipSig = sig;
    Array.from(els['arrow-row'].children).forEach(chip=>{
      const k = chip.dataset.arrow;
      const un = Archer.Bow.isUnlocked(k);
      chip.classList.toggle('sel', state.selArrow===k);
      chip.classList.toggle('locked', !un);
      chip.disabled = !un;
    });
  }
  function showMenu(){
    els.menu.classList.remove('hidden');
    els.hud.classList.add('hidden'); els.shop.classList.add('hidden');
    els.pause.classList.add('hidden');
    hideCoach();
    // A reason to try again: the best number this browser has held.
    const bestEl = document.getElementById('menu-best');
    if(bestEl){
      let best = 0;
      try{ best = (JSON.parse(localStorage.getItem(Archer.CFG.WALLET_KEY))||{}).best || 0; }catch(e){}
      bestEl.textContent = best > 0 ? 'BEST HELD: WAVE ' + best : 'NO RUN YET — HOLD THE FIRST WAVE';
    }
    if(Archer.Controls){ Archer.Controls.paintHint(); Archer.Controls.openStartMenu(); }
  }
  function hideMenu(){
    els.menu.classList.add('hidden'); els.hud.classList.remove('hidden');
    if(Archer.Controls) Archer.Controls.closeMenu();
  }

  // DOM writes are cached: re-assigning the same string every frame forces style work for nothing.
  function txt(el, v){ if(el && el._v !== v){ el._v = v; el.textContent = v; } }
  function wid(el, pct){ if(!el) return; const v = Math.max(0, pct).toFixed(1) + '%';
    if(el._w !== v){ el._w = v; el.style.width = v; } }

  function update(state, pulse){
    wid(els['hp-castle'], state.castleHp/state.castleMax*100);
    wid(els['hp-archer'], state.archerHp/state.archerMax*100);
    txt(els['hp-castle-num'], String(Math.max(0, Math.round(state.castleHp))));
    txt(els['hp-archer-num'], String(Math.max(0, Math.round(state.archerHp))));
    txt(els['round-num'], 'WAVE ' + state.round + (state.isBoss ? ' · BOSS' : ''));
    txt(els['coins'], '🪙 ' + Archer.U.fmt0(state.coins));
    // M9: how many orcs are still coming — the player can read the pressure at a glance.
    if(els['left']){
      const left = window.Archer && Archer.Enemies ? Archer.Enemies.remaining() : 0;
      txt(els['left'], left > 0 ? '⚔ ' + left : '');
      els['left'].classList.toggle('clear', left === 0);
    }
    const drawing = state.drawPct > 26;
    // Honest ready light: while the last arrow is being nocked a press does nothing, so say NOCK.
    const nock = (Archer.Input && Archer.Input.nockLeft) ? Archer.Input.nockLeft() : 0;
    txt(els['draw-num'], drawing ? state.drawPct + '%' : (nock > 0 ? 'NOCK' : 'READY'));
    wid(els['draw-fill'], drawing ? state.drawPct : 0);
    els['draw-num'].classList.toggle('nocking', !drawing && nock > 0);
    txt(els['combo'], state.combo > 2
      ? 'COMBO ×' + state.combo + ' +' + Math.round(Math.min(0.5, (state.combo-1)*0.04)*100) + '%'
      : '');
    if(els['btn-sally']){
      const roster = Archer.Garrison.all();
      const count = roster.filter(r=>r.type==='knight' && r.mode!=='sallied').length;
      const ready = count > 0 || Archer.Knights.canSally();
      els['btn-sally'].classList.toggle('ready', ready);
      // M12: never `disabled` on an empty garrison — a dead button explains nothing. It reads
      // NO KNIGHTS and a press answers "recruit some in the shop" (toast + deny sound).
      els['btn-sally'].disabled = false;
      // M12: the button was live-looking from second 0 with an empty garrison. It now says so.
      const label = ready ? '⚔ SALLY' + (count ? ' ×'+count : '') : 'NO KNIGHTS';
      if(els['btn-sally']._label !== label){ els['btn-sally']._label = label; els['btn-sally'].textContent = label; }
    }
    refreshChips(state);
  }
  function banner(txt, ms){
    const b = els['round-banner'];
    b.textContent = txt; b.classList.remove('hidden'); b.classList.remove('pop');
    void b.offsetWidth; b.classList.add('pop');
    clearTimeout(banner.timer);
    banner.timer = setTimeout(()=>b.classList.add('hidden'), ms||1600);
  }
  function toast(msg, ms){
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>els.toast.classList.add('hidden'), ms||1600);
  }
  function hideToast(){ clearTimeout(toastTimer); if(els.toast) els.toast.classList.add('hidden'); }
  function hideBanner(){ clearTimeout(banner.timer); if(els['round-banner']) els['round-banner'].classList.add('hidden'); }
  // First-run coach: one pulsing line until the first arrow leaves (or 14 s, whichever is first).
  // A judgeable start needs the gesture named on screen, not in a menu paragraph.
  function showCoach(html, ms){
    const el = els.coach || (els.coach = document.getElementById('coach'));
    if(!el) return;
    el.innerHTML = html;
    el.classList.remove('hidden'); el.classList.add('pulse');
    clearTimeout(coachTimer);
    coachTimer = setTimeout(hideCoach, ms || 14000);
  }
  function retextCoach(html){   // a device change mid-coach: new wording, same timer
    const el = els.coach || (els.coach = document.getElementById('coach'));
    if(el && !el.classList.contains('hidden')) el.innerHTML = html;
  }
  function hideCoach(){
    clearTimeout(coachTimer);
    const el = els.coach || (els.coach = document.getElementById('coach'));
    if(el){ el.classList.add('hidden'); el.classList.remove('pulse'); }
  }
  // Paused is a real halt: the HUD keeps the HP readout, but every live control goes away, so a
  // finger cannot sally knights or swap arrows through the overlay (round-1 tester class).
  function showPause(){
    els.pause.classList.remove('hidden');
    document.body.classList.add('paused');
    // The whole bottom strip is hidden by `body.paused #hud-bottom`, so no chip needs disabling —
    // and disabling here left every unlocked chip dead after a resume (the cached signature never
    // repainted them). Hide is the honest halt.
  }
  function hidePause(){
    els.pause.classList.add('hidden');
    document.body.classList.remove('paused');
  }
  function isPausedShown(){ return els.pause && !els.pause.classList.contains('hidden'); }

  // What broke the keep, in plain words — so the next run has a target.
  const CAUSE = { dragon: "a dragon's fire", slam: "the warlord's slam", volley: "orc volleys",
                  ram: "a siege troll at the gate", chew: "the horde chewing the gate",
                  arrows: "enemy arrows", horde: "the horde" };
  function causeText(state){
    const c = CAUSE[state.fellTo] || 'the horde';
    if(state.archerHp <= 0 && state.castleHp > 0) return 'Your archer fell to ' + c;
    return 'The gate fell to ' + c;
  }

  function showVerdict(state){
    verdictAt = performance.now();
    const held = state.wavesHeld || 0;
    const best = Math.max(state.bestWave || 0, held);
    const secs = Math.round(state.runT || 0);
    els['verdict-title'].textContent = 'THE KEEP FELL';
    els['verdict-sub'].innerHTML =
      causeText(state) + ' on wave ' + (state.round || 1) + '.<br>' +
      'You held <b>' + held + '</b> wave' + (held===1?'':'s') + ' for ' + secs + 's' +
      ' and banked 🪙 ' + Archer.U.fmt0(state.runCoins || 0) + ' this run.<br>' +
      (held > (state.bestWave || 0)
        ? '<span class="best">NEW BEST — wave ' + held + '</span>'
        : 'Best so far: wave ' + best) +
      '<br><span class="again">Tap anywhere · Enter · pad A to rebuild</span>';
    els.verdict.classList.remove('hidden');
    els.hud.classList.add('hidden');
    document.body.classList.remove('paused');
    hideToast(); hideBanner(); hideCoach();     // a warning toast must not sit on top of the verdict
    if(Archer.Controls) Archer.Controls.openRetryMenu();
    Archer.Audio.play('lose');
  }
  function hideVerdict(){
    els.verdict.classList.add('hidden');
    if(Archer.Controls) Archer.Controls.closeMenu();
  }

  return { init, showMenu, hideMenu, update, banner, toast, showVerdict, hideVerdict, showCoach, retextCoach, hideCoach,
           showPause, hidePause, isPausedShown, hideToast, hideBanner };
})();
