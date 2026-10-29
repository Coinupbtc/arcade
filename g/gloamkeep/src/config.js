/* GLOAMKEEP — config. 12x20 tile moor, 2-tile-wide causeway, no scrolling. */
window.GK = window.GK || {};

(function () {
  const TILE = 16, COLS = 12, ROWS = 20;

  // --- 2-tile-wide causeway ------------------------------------------------
  function rect(c0, c1, r0, r1) {
    const out = [];
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) out.push([c, r]);
    return out;
  }
  const rawPath = [
    ...rect(2, 3, 0, 5),    // north run
    ...rect(3, 8, 4, 5),    // east bend
    ...rect(7, 8, 5, 9),    // down
    ...rect(3, 8, 8, 9),    // west bend
    ...rect(2, 3, 9, 14),   // down
    ...rect(3, 8, 13, 14),  // east bend
    ...rect(7, 8, 14, 19)   // south run to the gate
  ];
  const seen = new Set();
  const PATH = [];
  for (const [c, r] of rawPath) {
    const k = c + ',' + r;
    if (seen.has(k)) continue;
    seen.add(k);
    PATH.push([c, r]);
  }

  // road centreline (boundaries between the two road columns/rows)
  const WAY = [
    { x: 48, y: -10 },
    { x: 48, y: 80 },    // rows 4-5
    { x: 128, y: 80 },   // cols 7-8
    { x: 128, y: 144 },  // rows 8-9
    { x: 48, y: 144 },
    { x: 48, y: 224 },   // rows 13-14
    { x: 128, y: 224 },
    { x: 128, y: 320 }
  ];

  const DECOR = [
    { t:'tree',   c:0,  r:1  }, { t:'tree',   c:11, r:2  }, { t:'tree', c:1,  r:7  },
    { t:'tree',   c:10, r:6  }, { t:'tree',   c:0,  r:12 }, { t:'tree', c:11, r:13 },
    { t:'tree',   c:2,  r:16 }, { t:'tree',   c:9,  r:16 },
    { t:'rock',   c:5,  r:2  }, { t:'rock',   c:6,  r:7  }, { t:'rock', c:1,  r:10 },
    { t:'rock',   c:10, r:11 },
    { t:'reed',   c:1,  r:3  }, { t:'reed',   c:11, r:4  }, { t:'reed', c:0,  r:8  },
    { t:'reed',   c:9,  r:9  }, { t:'reed',   c:2,  r:11 }, { t:'reed', c:10, r:15 },
    { t:'pool',   c:5,  r:7  }, { t:'pool',   c:6,  r:11 }, { t:'pool', c:4,  r:16 },
    { t:'menhir', c:4,  r:18 }, { t:'menhir', c:7,  r:2  }
  ];

  const key = (c, r) => c + ',' + r;
  const pathSet = new Set(PATH.map(([c, r]) => key(c, r)));
  const decorSet = new Set(DECOR.map(d => key(d.c, d.r)));

  const PAL = {
    ink:        '#05080c',
    water:      '#08131a',
    waterLit:   '#122732',
    peat:       '#0e1c23',
    peatLit:    '#162a33',
    moss:       '#1f3d3a',
    mossLit:    '#2f5c55',
    causeway:   '#7a7593',
    causewayLit:'#9a94b8',
    causewayHi: '#c3bedd',
    joint:      '#3f3a56',
    rune:       '#ffd166',
    stone:      '#55536e',
    stoneLit:   '#7a7898',
    stoneDark:  '#2e2c3e',
    iron:       '#26263a',
    ironLit:    '#3a3a52',
    fire:       '#ff7a2f',
    ember:      '#ffb347',
    flame:      '#ffe9a8',
    frost:      '#7fd6ff',
    frostLit:   '#d6f4ff',
    arc:        '#8a6bff',
    arcLit:     '#d9c6ff',
    shade:      '#6a4f9e',
    shadeLit:   '#c9a6f5',
    foe:        '#4a4a74',
    foeLit:     '#b6b6e4',
    eye:        '#ff4d4d',
    gold:       '#ffd166',
    goldLit:    '#ffe9a8',
    mushroom:   '#c77dd6'
  };

  // --- towers: two modes each (Perfect Dark rule) --------------------------
  const TOWERS = {
    lantern: {
      key:'lantern', name:'Ember Lantern', short:'EMBER', cost:40, accent:'#ffb347', glow:'rgba(255,190,90,0.20)',
      modes: {
        a: { name:'BOLT',  dmg:10, rate:0.55, range:46, kind:'bolt', speed:220,
             blurb:'Fast single bolt' },
        b: { name:'FLARE', dmg:7, rate:1.6, range:44, kind:'flare', speed:170, splash:18, mark:3,
             blurb:'Burst + mark: +25% damage taken' }
      }
    },
    brazier: {
      key:'brazier', name:'Cinder Bowl', short:'CINDER', cost:65, accent:'#ff6a2a', glow:'rgba(255,140,60,0.22)',
      modes: {
        a: { name:'LOB', dmg:18, rate:1.6, range:40, kind:'bomb', speed:120, splash:18,
             blurb:'Lobbed fire, splash damage' },
        b: { name:'TAR', dmg:0, rate:2.2, range:40, kind:'tar', tarDur:5, tarRadius:14, tarSlow:0.45, tarDps:9,
             blurb:'Burning tar pool: slow + damage' }
      }
    },
    chill: {
      key:'chill', name:'Frost Spire', short:'FROST', cost:55, accent:'#7fd6ff', glow:'rgba(120,210,255,0.20)',
      modes: {
        a: { name:'AURA',  dmg:3, rate:0.6, range:44, kind:'aura', slow:0.45, slowDur:1.2,
             blurb:'Aura: chips and slows everything' },
        b: { name:'LANCE', dmg:28, rate:1.8, range:64, kind:'lance', root:0.8, pierce:4,
             blurb:'Long lance: heavy hit + root' }
      }
    },
    arc: {
      key:'arc', name:'Arc Pylon', short:'ARC', cost:90, accent:'#8a6bff', glow:'rgba(150,110,255,0.20)',
      modes: {
        a: { name:'CHAIN', dmg:16, rate:1.2, range:50, kind:'chain', chain:3, chainFall:0.72, chainRange:34,
             blurb:'Chain lightning, 3 links' },
        b: { name:'STORM', dmg:22, rate:1.5, range:52, kind:'storm', strikes:2, stun:0.6, pierce:2,
             blurb:'Strikes 2: heavy hit + stun' }
      }
    }
  };

  const ENEMIES = {
    wisp:      { key:'wisp',      name:'Wisp',           hp:26,   spd:34, gold:4,  armor:0, r:5, spr:'wisp',      leak:1 },
    hound:     { key:'hound',     name:'Moor Hound',     hp:42,   spd:54, gold:5,  armor:0, r:5, spr:'hound',     leak:1 },
    husk:      { key:'husk',      name:'Husk',           hp:95,   spd:20, gold:8,  armor:3, r:6, spr:'husk',      leak:1 },
    knight:    { key:'knight',    name:'Drowned Knight', hp:150,  spd:17, gold:11, armor:6, r:6, spr:'knight',    leak:1 },
    shade:     { key:'shade',     name:'Shade',          hp:52,   spd:32, gold:7,  armor:0, r:5, spr:'shade',     leak:1, fly:true },
    gloamling: { key:'gloamling', name:'Gloamling',      hp:70,   spd:26, gold:7,  armor:1, r:6, spr:'gloamling', leak:1, split:2 },
    brute:     { key:'brute',     name:'Slag Brute',     hp:280,  spd:14, gold:24, armor:5, r:7, spr:'brute',     leak:2 },
    boss:      { key:'boss',      name:'Gloam Sovereign', hp:900, spd:10, gold:100, armor:5, r:9, spr:'boss',     leak:3, ward:true }
  };

  // t = type, n = count, gap = seconds between spawns, delay = seconds after wave start
  // Round 3 ramp: waves 1-3 are a teaching slope (a stranger's first towers hold), waves 4-11
  // leak a little more each time, and wave 12 is tense but not a light tax.
  const WAVES = [
    [{ t:'wisp', n:6, gap:1.0 }],
    [{ t:'wisp', n:8, gap:0.8 }, { t:'hound', n:4, gap:1.5, delay:7 }],
    [{ t:'husk', n:4, gap:2.0 }, { t:'wisp', n:6, gap:0.8, delay:4 }],
    [{ t:'shade', n:5, gap:1.2 }, { t:'hound', n:6, gap:1.0, delay:4 }],
    [{ t:'brute', n:1, gap:1 }, { t:'husk', n:5, gap:1.3, delay:2 }, { t:'wisp', n:8, gap:0.6, delay:6 }],
    [{ t:'knight', n:4, gap:2.0 }, { t:'hound', n:8, gap:0.8, delay:3 }],
    [{ t:'gloamling', n:6, gap:1.6 }, { t:'shade', n:6, gap:1.0, delay:4 }],
    [{ t:'husk', n:8, gap:1.0 }, { t:'knight', n:5, gap:1.8, delay:4 }, { t:'wisp', n:10, gap:0.5, delay:7 }],
    [{ t:'brute', n:3, gap:3.0 }, { t:'hound', n:10, gap:0.6, delay:2 }],
    [{ t:'boss', n:1, gap:1 }, { t:'shade', n:8, gap:0.8, delay:3 }, { t:'husk', n:6, gap:1.2, delay:7 }],
    [{ t:'knight', n:8, gap:1.4 }, { t:'gloamling', n:8, gap:1.0, delay:4 }, { t:'brute', n:3, gap:2.4, delay:8 }],
    [{ t:'boss', n:2, gap:5.0 }, { t:'knight', n:6, gap:1.2, delay:3 }, { t:'shade', n:8, gap:0.7, delay:6 }, { t:'hound', n:8, gap:0.5, delay:10 }]
  ];

  GK.CFG = {
    TILE, COLS, ROWS, W: COLS * TILE, H: ROWS * TILE,
    PATH, WAY, DECOR, PAL, TOWERS, ENEMIES, WAVES,
    START_GOLD: 160,
    START_LIVES: 20,
    PREP: 10,
    WAVE_BONUS: 20,
    WAVE_BONUS_PER: 4,
    SELL_RATE: 0.6,
    // Four levels, not three. A maxed board was the playtester's "gold piles up unspent" finding:
    // a fourth level is a real sink (a full board costs ~900 more embers) and it keeps the late run
    // about spending, not about watching.
    MAX_LEVEL: 4,
    LVL_DMG: [1, 1.55, 2.4, 3.3],
    LVL_RATE: [1, 0.9, 0.82, 0.76],
    LVL_RANGE: [0, 4, 8, 12],
    MARK_MULT: 1.3,          // a marked target also loses its armour (enemies.applyDamage)
    // The keep's own lantern: one active verb during a wave. It marks every foe on the field,
    // which strips armour (see MARK_MULT), so it is the answer to an armoured push and the reason
    // to hold it for the Sovereign instead of spending it on the first wisp.
    FLARE: { cd: 14, mark: 3.0, flash: 1.0 },
    STREAK_WINDOW: 1.6,      // seconds between kills that keep a streak alive
    // KEEP HEAT: every kill heats the lantern one step (max 10). Steps stay warm while kills
    // land and cool one at a time in a 1.4 s gap; a leak cools the keep to zero. Each step cuts
    // the FLARE recharge by 4% (max -40%, 14 s -> 8.4 s), so a chain buys more of the verb that
    // strips armour. Measured: this is the one buff that changes the run; a fire-rate or range
    // bonus measured as no gain at all on the 4-tower build (overkill ate it).
    HEAT: { max: 10, cool: 1.4, flareCut: 0.04 },
    LIGHT_FROM_BOSS: 1,      // a broken Sovereign relights one lantern on the way out
    ENEMY_HP_MUL: 1,
    // Per-wave toughness. Flat 0.13w + 0.007w² made waves 1-3 a formality and let a steady build
    // coast from wave 6. This curve keeps the teaching slope (waves 1-3 clear on two lanterns) and
    // adds ~10% at the top. Measured with the mixed bot: without FLARE it wins wave 12 on 5 light;
    // with FLARE on the armoured pushes it holds 11. A 4.45 top made the same bot lose on wave 11,
    // which read as a wall rather than a challenge, so the top was pulled back.
    // 10-26 (tester FAIL: "easy, a naive build wins, FLARE optional"). Measured with GKDebug.bot + sim:
    // the old curve won with FLARE (11 light) AND without it (8 light). This one steepens waves 4-9:
    // with FLARE on armour/brutes/Sovereign it wins on ~8 light; without FLARE it falls at wave 9.
    HP_CURVE: [1, 1.14, 1.32, 1.60, 1.84, 2.06, 2.32, 2.60, 2.90, 3.12, 3.45, 3.80],
    // An unmarked Sovereign shrugs off damage (55%): FLARE is the answer, so "save it for the
    // Sovereign" is a decision, not a slogan. A marked Sovereign takes full damage.
    WARD_MUL: 0.4,           // was 0.55: an unflared Sovereign must cost real light (10-26 tester: flare optional)
    NOTICES: {
      4: 'SHADES FLY STRAIGHT TO THE GATE',
      6: 'KNIGHTS WEAR HEAVY ARMOUR \u00b7 FLARE OR LANCE',
      9: 'SLAG BRUTES INBOUND \u00b7 HOLD FLARE',
      11: 'KNIGHTS AND BRUTES \u00b7 FLARE STRIPS ARMOUR',
      12: 'TWO SOVEREIGNS WALK \u00b7 SAVE FLARE'
    },
    TAP_RADIUS: 22,          // logical px (~45 screen px at 2x): easy tower pick
    isPath(c, r) { return pathSet.has(key(c, r)); },
    isDecor(c, r) { return decorSet.has(key(c, r)); },
    inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; },
    buildable(c, r) {
      return this.inBounds(c, r) && !pathSet.has(key(c, r)) && !decorSet.has(key(c, r));
    },
    upCost(type, level) {
      const base = TOWERS[type].cost;
      // 34 / 56 / 84 for an Ember at 40: the 4th level costs real embers, so the late game is a
      // choice between a wider board and a taller one.
      return Math.round(base * (level === 1 ? 0.85 : level === 2 ? 1.4 : 2.1));
    }
  };
})();
