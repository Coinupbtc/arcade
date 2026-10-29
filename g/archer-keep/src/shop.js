// Archer.Shop — between-round upgrade card ONLY (no mid-wave upgrades).
// Castle + archer + garrison upgrades. Soldier buy opens a type picker.
// M10: the shop is a real focus menu (pad DPad/stick + A, keyboard arrows + Enter, Esc = next wave),
// so a player who never touches the mouse can still buy. Mouse and touch go through the same
// one press path — the card owns no second click listener (arcade-input lesson 9: one per button).
Archer.Shop = (function(){
  const C = () => Archer.CFG;
  let game = null, offers = [], rng = Math.random;
  let counts = {};   // repeat purchases per id
  let menu = null, focusId = null;
  let pickType = 'knight';   // M12: a knight is the blocker the gate needs; the picker still lets you change it
  // M12 SHOP-SKIP GUARD: the playtester mashed A/Space (the fire button) as wave 1 cleared, the
  // shop opened under the still-live press, and the first press marched out without buying
  // (coins 127 -> 127). Every activation now needs a fresh press at least 350 ms after the panel
  // appears. A hold does not produce a new edge, so only a new mash is caught.
  const GUARD_MS = 500;
  let openedAt = 0;

  function init(gameRef){ game = gameRef; }
  function reset(seed){ counts = {}; rng = Archer.U.RNG(((seed||0)+31)>>>0); focusId = null; }

  function rollOffers(state){
    // show EVERYTHING for sale at once (owner ask) — availability filtered only
    offers = C().SHOP_POOL.filter(it => {
      if(it.unlockKind && Archer.Bow.isUnlocked(it.unlockKind)) return false;
      if(it.id === 'repair' && state.castleHp >= state.castleMax) return false;
      if(it.needs === 'cauldron' && !Archer.Cauldron.isBuilt()) return false;
      if(it.id === 'slot' && Archer.Garrison.getSlots() >= 3) return false;
      if(it.id === 'soldier' && !Archer.Garrison.rosterFree()) return false;
      const n = counts[it.id]||0;
      if(it.maxRepeats && n >= it.maxRepeats) return false;
      return true;
    });
  }
  function costOf(it, state){
    if(it.id === 'soldier') return C().SOLDIER_COST[pickType] || 45;  // live price of selected type
    if(typeof it.cost === 'function') return it.cost(state);
    const n = counts[it.id]||0;
    return Math.round(it.cost * Math.pow(1.6, n));
  }

  // What this wave is teaching, and what to buy for it. The playtester could not tell that wave 2
  // needs a recruit (6/6 bot losses without one, 0/6 with) — so the shop says it in one line.
  const BRIEF = {
    1: 'Next wave: goblins. Recruit a KNIGHT — it holds the gate while you shoot.',
    2: 'Next wave: goblins, more of them. A second body at the gate buys you time.',
    3: 'Next wave: SCREECHERS. They sprint — draw longer and lead the walk.',
    4: 'Next wave: GOB ARCHERS. They shoot the wall from afar. Hit them first.',
    5: 'Next wave: the ORC WARLORD. Hit him while his guard is open after a slam.',
    6: 'Next wave: ORC BRUTES. Armoured — PIERCE arrows ignore armour.',
    7: 'Next wave: brutes and archers. Hold the gate, thin the shooters.',
    8: 'Next wave: SHAMANS. Their magic hurts the wall — kill them first.',
  };
  function recommendId(state){
    const have = function(id){ return offers.some(function(it){ return it.id === id; }); };
    const coin = state.coins;
    const frac = state.castleMax ? state.castleHp / state.castleMax : 1;
    if(frac < 0.6 && have('repair')) return 'repair';
    const knights = Archer.Garrison.all().filter(function(r){ return r.type === 'knight'; }).length;
    if((state.round <= 3 || knights === 0) && have('soldier') && coin >= C().SOLDIER_COST.knight) return 'soldier';
    if(state.round >= 6 && have('unlockPierce') && coin >= 120 && !Archer.Bow.isUnlocked('piercing')) return 'unlockPierce';
    if(frac < 0.85 && have('repair') && coin >= 40) return 'repair';
    return null;
  }
  function briefFor(state){
    const r = state.round + 1;
    if(BRIEF[r]) return BRIEF[r];
    const intro = Archer.Curves.introFor(r);
    if(intro) return 'Next wave: ' + Archer.Curves.nameOf(intro.key).toUpperCase() + ' — ' + intro.hint;
    if((r % C().ROUND.bossEvery) === 0) return 'Next wave: BOSS. Sally the knights to split the pressure.';
    return 'Next wave ' + r + '. Spend what helps the gate, keep a reserve.';
  }

  function show(state){
    rollOffers(state);
    bindPickerCapture();
    Archer.UI.hideBanner(); Archer.UI.hideToast(); Archer.UI.hideCoach();   // nothing sits on the shop
    render(state);
    document.getElementById('shop').classList.remove('hidden');
    if(Archer.Controls && Archer.Controls.paintHint) Archer.Controls.paintHint();
    openedAt = performance.now();
    focusId = null;                                  // a fresh shop opens on the recommendation
    openMenu(state);
    Archer.Audio.play('win');
  }
  function hide(){
    document.getElementById('shop').classList.add('hidden');
    closeMenu();
  }

  function render(state){
    const wrap = document.getElementById('shop-offers');
    const scroll = wrap.scrollTop || 0;
    wrap.innerHTML = '';
    document.getElementById('shop-round').textContent = 'WAVE ' + state.round + ' CLEARED';
    document.getElementById('shop-coins').textContent = '🪙 ' + Archer.U.fmt0(state.coins);
    const brief = document.getElementById('shop-brief');
    if(brief) brief.textContent = briefFor(state);
    const rec = recommendId(state);
    offers.forEach(it => {
      const cost = costOf(it, state);
      const afford = state.coins >= cost;
      const card = document.createElement('button');
      card.className = 'shop-card touch-target' + (afford ? '' : ' poor') +
        (it.id === rec ? ' rec' : '');
      card.dataset.menu = 'buy:' + it.id;
      card._offer = it;
      let inner = (it.id === rec ? '<div class="sc-badge">RECOMMENDED</div>' : '') +
        '<div class="sc-head"><span class="sc-name">'+it.name+'</span>' +
        '<span class="sc-cost">'+cost+'</span></div>' +
        '<div class="sc-desc">'+it.desc+'</div>' +
        (afford ? '' : '<div class="sc-need">need 🪙 '+(cost-state.coins)+' more</div>');
      if(it.id === 'soldier'){
        // Type picker row + an explicit buy strip. Without the strip the card's middle is the chip
        // row, so a tap that looked like "buy this card" only changed the type (my own bot did
        // exactly that and never recruited a knight). The strip is the one obvious buy target.
        // 10-26 retest: the type chips sat inside the card (a <button> in a <button>), and their 44 px rows filled
        // the card's lower half, so a tap on the card changed the type instead of buying. The card is one buy
        // target now; the type picker is its own row right under it (built after the card, below).
        const sd = Archer.Garrison.defOf(pickType);
        inner += '<div class="sc-buy">RECRUIT '+(sd?sd.name.toUpperCase():'SOLDIER')+' — 🪙'+cost+'</div>';
      }
      if(it.id === 'cauldron'){
        const tier = Archer.Cauldron.getTier();
        if(tier > 0) inner += '<div class="sc-sub">Tier '+tier+'/4 — next dump upgrades the liquid</div>';
      }
      if(it.id === 'bowTier'){
        const b = Archer.Bow.bowDef();
        inner += '<div class="sc-sub">Now: '+b.name+'</div>';
      }
      if(it.unlockKind){
        inner += '<div class="sc-sub">'+(state.selArrow===it.unlockKind?'IN THE QUIVER':'Unlocks an arrow chip')+'</div>';
      }
      card.innerHTML = inner;
      wrap.appendChild(card);
      if(it.id === 'soldier'){
        const row = document.createElement('div');
        row.className = 'soldier-pick';
        let chips = '';
        for(const t in C().SOLDIER_COST){
          const def = Archer.Garrison.defOf(t);
          const n = Archer.Garrison.countType(t);
          chips += '<button class="sp-type'+(t===pickType?' sel':'')+'" data-type="'+t+'">'+
            def.name+' 🪙'+C().SOLDIER_COST[t]+(n?' ×'+n:'')+'</button>';
        }
        row.innerHTML = chips;
        wrap.appendChild(row);
      }
    });
    wrap.scrollTop = scroll;
  }
  // The type picker row: a chip tap only picks the soldier type (price) and keeps the focus on the soldier card.
  // One press, one job — the picker changes the price, the card buys.
  function bindPickerCapture(){
    const wrap = document.getElementById('shop-offers');
    if(!wrap || wrap._aiPickCapture) return;
    wrap._aiPickCapture = true;
    wrap.addEventListener('click', function(ev){
      const sp = ev.target && ev.target.closest ? ev.target.closest('.sp-type') : null;
      if(!sp) return;
      pickType = sp.dataset.type; focusId = 'buy:soldier';
      render(game.State); openMenu(game.State);
    });
  }

  // One activation path for a mouse click, a finger tap, Enter and pad A.
  function activate(card){
    // A press that lands while the panel is still appearing is the tail of the wave's fire mash.
    if(performance.now() - openedAt < GUARD_MS) return;
    const it = card && card._offer;
    if(!it) return;
    buy(it, costOf(it, game.State));
  }

  function buy(it, cost){
    const state = game.State;
    if(state.coins < cost){ Archer.Audio.play('deny'); return; }
    if(it.id === 'soldier'){
      if(!Archer.Garrison.buySoldier(pickType)){ Archer.Audio.play('deny'); return; }
    }
    state.coins -= cost;
    counts[it.id] = (counts[it.id]||0) + 1;
    game.applyUpgrade(it.id);
    Archer.Audio.play('buy');
    focusId = 'buy:' + it.id;
    render(state);
    openMenu(state);
  }

  // ---- the focused menu: DPad / stick / arrows step, A / Enter buys, Start / Esc moves on ----
  function openMenu(state){
    const raw = Archer.Controls && Archer.Controls.raw;
    if(!raw) return;
    const cards = Array.prototype.slice.call(document.querySelectorAll('#shop-offers .shop-card'));
    const cont = document.getElementById('shop-continue');
    const items = cards.map(function(c){
      return { id: c.dataset.menu, el: c, action: function(){ activate(c); } };
    });
    if(cont) items.push({ id:'next', el: cont, action: function(){ game.nextRound(); } });
    if(!items.length) return;
    closeMenu();
    menu = raw.menu({ items: items, dom: '#shop',
      onFocus: function(i, it){
        // keep the focused card on screen when the list scrolls (pad / keyboard players)
        if(it && it.el && it.el.scrollIntoView) { try{ it.el.scrollIntoView({ block:'nearest' }); }catch(e){} }
      },
      onBack: function(){ game.nextRound(); },  // Esc / pad B: leave the shop (never a dead end)
      onStart: function(){ game.nextRound(); },  // pad Start: the hint says "Start: next wave" (10-26 tester FAIL: it bought)
      pressOn: 'click'                           // the list scrolls: a swipe must not buy (10-26 retest)
    });
    // Focus lands where the NEXT press does the most good: the recommended card for this wave, so
    // Enter/A on the panel buys instead of marching out (the wave-clear mash used to skip the shop).
    // A repeat purchase keeps the focus on that card; if it vanished (sold out) the focus goes to
    // NEXT WAVE, never to a different card the player did not choose.
    let idx = -1;
    if(focusId){
      idx = items.findIndex(function(it){ return it.id === focusId; });
    }
    if(idx < 0){
      const rec = recommendId(state);
      if(rec) idx = items.findIndex(function(it){ return it.id === 'buy:' + rec; });
    }
    if(idx < 0){
      // no recommendation: the first card the purse can actually pay for
      idx = items.findIndex(function(it){
        return it.id.indexOf('buy:') === 0 && it.el && it.el.classList && !it.el.classList.contains('poor');
      });
      if(idx < 0) idx = items.length - 1;   // nothing affordable: leave via NEXT WAVE
    }
    menu.open(idx);
  }
  function closeMenu(){ if(menu){ menu.close(); menu = null; } }

  function bindContinue(){
    const btn = document.getElementById('shop-continue');
    if(!btn) return;
    // With the input layer up, the shop menu owns this press (one press, one job).
    if(Archer.Controls && Archer.Controls.raw) return;
    btn.addEventListener('click', function(){ game.nextRound(); });
  }

  return { init, show, hide, reset, bindContinue, offers:()=>offers };
})();
