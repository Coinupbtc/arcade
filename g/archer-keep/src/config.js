// Archer.CFG — constants shared by every module (M2 SIEGE WAR)
// M7: RESOLUTION-INDEPENDENT — W/H track the REAL canvas. Portrait 390x844 unchanged;
// landscape (owner rotates phone) gets a WIDER view instead of a broken half-painted screen.
window.Archer = window.Archer || {};
Archer.CFG = {
  W: 390, H: 844,              // design units; canvas scaled to fit + dpr
  GRAVITY: 1500,                // design units / s^2 (arrow drop, debris)
  WALLET_KEY: 'archer_keep_v2',
  // ---- M2 WORLD: 2600 units wide. Your keep left, orc keep right. ----
  WORLD_W: 2600,
  // Castle sits at x=300; lane runs along the bottom to the right.
  CASTLE: { x: 300, wallW: 118, towerW: 64, towerH: 210,
            hpTier1: 280, hpTier2: 480, hpTier3: 760,   // castle dies easier (owner ask)
            gateW: 34, gateH: 44 },
  ARCHER: { hpMax: 100, x: 300, yOff: -226, drawTime: 0.9, overdrawBonus: 1.15 },
  LANE: { yOff: 118 },         // lane sits yOff ABOVE the bottom of the screen (dynamic)
  // Enemies spawn at the ORC keep gate (~2270) and march left. GATE_X = your gate.
  SPAWN_X: 2270, GATE_X: 340,
  ORC_KEEP: { x: 2320, w: 190, h: 240 },
  CAMERA: { peekT: 4, homeBias: true },  // camera stays HOME unless threat is near
  AIM: { minAngle: -88, maxAngle: 88, drawMin: 25, drawMax: 100,
         speedMin: 420, speedMax: 1650,   // full-map lobbing (owner: far enemies must be reachable;
                                          // 45° full draw ≈ 2420u > castle→keep 1970u)
         nockTime: 0.85,                  // can't fire again until nocked (anti rapid-fire)
         minFireDraw: 25 },               // M10: every release looses SOMETHING (weak arrow).
                                          // A release that did nothing read as "controls broken"
                                          // to a first-time tester; nockTime is the anti-spam guard.
  ARROWS: {
    broadhead: { name:'BROAD', dmg: 24, armorMul: 0.5, speed: 1.0, color:'#e8dcc0',
                 price: 0, desc:'Solid all-round shaft' },
    piercing:  { name:'PIERCE', dmg: 18, armorMul: 2.5, speed: 1.18, color:'#9fd8ff',
                 price: 120, pierce: 1, desc:'Ignores armor, punches through' },
    fire:      { name:'FIRE', dmg: 15, armorMul: 1.0, speed: 0.95, color:'#ffb347',
                 price: 160, burn: { dps: 9, dur: 3 }, desc:'Ignites: burn over 3s' },
    frost:     { name:'FROST', dmg: 13, armorMul: 1.0, speed: 1.0, color:'#bfefff',
                 price: 220, slow: { mul: 0.45, dur: 2.5 }, desc:'Chills: slows 55%' },
    bomb:      { name:'BOMB', dmg: 28, armorMul: 1.2, speed: 0.85, color:'#ff8a65',
                 price: 300, aoe: 62, desc:'Explodes on impact' },
  },
  // ---- M7: BIGGER ENEMIES (owner ask) + HEADSHOTS (top 32% of the body = 1.8x) ----
  HEADSHOT: { zone: 0.32, mul: 1.8 },
  // ---- M2 ENEMIES: orcs & goblins + dragon, melee + ranged + flying ----
  // M4.5 balance: stronger but FEWER (owner ask). hp/dmg ~1.6x, count -40%.
  // M7: every unit ~1.35x bigger (w/h scaled) so heads are actually hittable.
  ENEMIES: {
    // goblins (fast, fragile, melee)
    goblin:   { name:'Goblin',     hp: 40,  spd: 66, armor: 0,    w: 30, h: 48, coin: 9,
                body:'#3f9142', dark:'#1d4a20', melee: true, meleeDps: 7 },
    screech:  { name:'Screecher',  hp: 26,  spd: 96, armor: 0,    w: 25, h: 40, coin: 12,
                body:'#8bc34a', dark:'#4a6a1d', melee: true, meleeDps: 5, fast: true },
    // goblin ranged — shoots arrows at the WALL/ARCHER from afar (longer range now)
    gobArch:  { name:'Gob Archer', hp: 42,  spd: 52, armor: 0,    w: 29, h: 45, coin: 16,
                body:'#6a9a3f', dark:'#33551c', shoots: true, atkDmg: 12, atkRange: 1100, atkCd: 3.0,
                targetsCastle: true },
    // orcs (tanky melee — high HP, slow, heavy hit)
    brute:    { name:'Orc Brute',  hp: 150, spd: 34, armor: 0.35, w: 48, h: 64, coin: 24,
                body:'#356e38', dark:'#16351c', melee: true, meleeDps: 15 },
    // orc ranged — magic caster, higher damage, slower, long range
    shaman:   { name:'Orc Shaman', hp: 68,  spd: 30, armor: 0.15, w: 34, h: 58, coin: 27,
                body:'#7b4bab', dark:'#3b1f5e', shoots: true, atkDmg: 21, atkRange: 950, atkCd: 4.2,
                magic: true, targetsCastle: true },
    // cavalry — fast + decent hp, melee
    warg:     { name:'Warg Rider', hp: 90,  spd: 88, armor: 0.2,  w: 58, h: 50, coin: 30,
                body:'#546e7a', dark:'#26343b', melee: true, meleeDps: 13, fast: true },
    // siege tank — huge HP + armor, breaks gate
    troll:    { name:'Siege Troll',hp: 380, spd: 18, armor: 0.5,  w: 68, h: 88, coin: 60,
                body:'#607d8b', dark:'#2a363c', gateDps: 48 },
    // dragon — FLYING (later levels), high hp, dives and burns the wall
    dragon:   { name:'Dragon',     hp: 300, spd: 55, armor: 0.25, w: 88, h: 50, coin: 90,
                body:'#b71c1c', dark:'#5f0f0f', flies: true, bombDmg: 42, diveEvery: 7 },
    // boss (every 5th) — boss mix: high hp + armor + heavy slam
    // warlord: boss walks faster than base so he actually arrives
    warlord:  { name:'ORC WARLORD', boss: true, hp: 900, spd: 22, armor: 0.45, w: 78, h: 106,
                coin: 210, body:'#8d3b2f', dark:'#471a12', gateDps: 55, slamDmg: 26,
                weak: { every: 5.5, dur: 2.2 } },
  },
  // ---- M2 ALLIES: knights that sally out of your keep (attr mixes too) ----
  ALLIES: {
    knight:   { name:'Knight', hp: 70, spd: 58, w: 34, h: 60, dmg: 16, coin: 0,
                body:'#4a86c9', dark:'#2e5a8f' },
    healer:   { name:'Healer', hp: 40, spd: 50, w: 30, h: 54, heal: 12, coin: 0,
                body:'#f5e6c8', dark:'#b09a6a' },
  },
  // Garrison units take damage from enemies (they're mortal — that's the point)
  GARRISON_COMBAT: { meleeRange: 30, enemyDps: 6 },
  SALLY: { countPerLevel: 2, maxLevel: 3, respawnPerRound: true },
  // Cauldron tuning: faster fill + wider dump radius so it actually fires during a siege
  CAULDRON: { dumpRadius: 220, minCharge: 0.5 },
  // ---- ROUND CURVE + TEACHING LADDER ----
  // One new enemy type per wave band, so the game progresses AND teaches:
  //   r1-2  goblins only            (learn: lob arrows far)
  //   r3    + screechers            (learn: fast units need lead time)
  //   r4    + gob archers           (learn: ranged duel — shoot them first)
  //   r5    WARLORD boss            (learn: weak point after slam)
  //   r6-7  + orc brutes            (learn: armor — use PIERCE)
  //   r8-9  + shamans               (learn: priority target, magic hurts)
  //   r10   WARLORD II (harder)     (learn: sally knights to split pressure)
  //   r11   + warg riders           (learn: fast + tanky — frost helps)
  //   r12-14 + siege trolls         (learn: big HP, burn/bomb them)
  //   r15   WARLORD III             (mid-boss check)
  //   r16+  + dragons               (learn: flyers — lead the sky, bomb the dives)
  ROUND: {
    hpMul: r => 1 + (r-1)*0.16, spdMul: r => 1 + Math.min(0.5,(r-1)*0.035),
    // M12 RAMP: the playtester lost wave 1 in ~5 of 11 bot runs and wave 2 in 6 of 6 without a
    // recruit. A stranger must survive the first minute and clear two or three stages, so waves
    // 1-2 are a gentle tutorial: fewer bodies, and the gate chews at half rate.
    count: r => r === 1 ? 4 : r === 2 ? 5 : Math.min(18, 4 + Math.floor(r*1.0)),
    gap:   r => Math.max(0.9, 2.2 - r*0.07),           // more spacing between spawns
    coins: r => r === 1 ? 70 : 26 + r*8,               // wave 1 pays for a knight recruit
    chewMul: r => r <= 2 ? 0.55 : 1,                   // gate DPS ramp, not a wall
    bossEvery: 5,
    weights: r => r<3 ? {goblin:1}
      : r<4 ? {goblin:2,screech:0.8}
      : r<5 ? {goblin:1.8,screech:0.7,gobArch:0.8}
      : r<6 ? {goblin:1}                                   // r5 boss handled separately
      : r<8 ? {goblin:1.6,screech:0.6,gobArch:0.8,brute:0.9}
      : r<10 ? {goblin:1.3,screech:0.5,gobArch:0.8,brute:1.0,shaman:0.55}
      : r<11 ? {goblin:1}                                   // r10 boss
      : r<12 ? {goblin:1.2,screech:0.5,gobArch:0.7,brute:0.9,shaman:0.6,warg:0.7}
      : r<15 ? {goblin:1.1,screech:0.4,gobArch:0.7,brute:0.9,shaman:0.6,warg:0.7,troll:0.35}
      : r<16 ? {goblin:1}                                   // r15 boss
      : {goblin:1,screech:0.4,gobArch:0.6,brute:0.8,shaman:0.6,warg:0.7,troll:0.45,dragon:0.3},
  },
  COMBO: { coinMul: 0.04, max: 1.5 },        // +4%/kill coin bonus up to +50%
  SHOP_POOL: [
    { id:'repair',   name:'Repair Walls',   cost: s => Math.ceil((s.castleMax-s.castleHp)*0.5/5)*5, repeat:true, desc:'Masons fix the stonework' },
    { id:'wallTier', name:'Reinforce Walls',cost: 90,  repeat:true, desc:'+40% max wall HP, full repair', maxRepeats: 2 },
    { id:'drawTier', name:'Heavy Draw',     cost: 110, repeat:true, desc:'+12% arrow speed & range', maxRepeats: 3 },
    { id:'arrowRain',name:'Arrow Rain',     cost: 70,  repeat:true, desc:'Charge: next volley rains arrows', maxRepeats: 3 },
    { id:'cauldron', name:'Cauldron',       cost: 100, repeat:true, maxRepeats: 3,
      desc:'Wall cauldron: fills, dumps on wall attackers. Water→Oil→Tar→LAVA' },
    { id:'vatHeat',  name:'Heated Vat',     cost: 80,  repeat:true, maxRepeats: 3, desc:'+35% cauldron damage', needs: 'cauldron' },
    { id:'vatBig',   name:'Bigger Vat',     cost: 70,  repeat:true, maxRepeats: 3, desc:'+30% cauldron refill speed', needs: 'cauldron' },
    { id:'bowTier',  name:'Better Bow',     cost: 150, repeat:true, maxRepeats: 4,
      desc:'Weak→Hunting→Strong→Compound(2 shots)→Crossbow' },
    // M10: the four ammo chips existed but could never be unlocked — the HUD promised a choice
    // it never gave. They are real purchases now, priced in the same ARROWS table.
    { id:'unlockPierce', name:'Pierce Arrows', cost: 120, desc:'Ignores armour — the answer to orc brutes', unlockKind:'piercing' },
    { id:'unlockFire',   name:'Fire Arrows',   cost: 160, desc:'Sets them burning for 3 s', unlockKind:'fire' },
    { id:'unlockFrost',  name:'Frost Arrows',  cost: 220, desc:'Chill: slows the horde by 55%', unlockKind:'frost' },
    { id:'unlockBomb',   name:'Bomb Arrows',   cost: 300, desc:'Explodes on impact — hits the whole pack', unlockKind:'bomb' },
    { id:'slot',     name:'+1 Soldier Slot',cost: 120, repeat:true, maxRepeats: 2, desc:'More garrison slots (max 3)' },
    { id:'soldier',  name:'Recruit Soldier',cost: 60,  repeat:true,
      desc:'Fill a slot: Archer 45g · Wizard 70g · Knight 55g · Guard 65g' },
    { id:'watchtower',name:'Watchtower',    cost: 140, repeat:true, desc:'Auto-shoots every 3.2s', maxRepeats: 2 },
    { id:'moat',     name:'Moat Spikes',    cost: 95,  repeat:true, desc:'Enemies cross the last 90px slower', maxRepeats: 2 },
  ],
  // soldier recruit prices by type
  SOLDIER_COST: { archer: 45, wizard: 70, knight: 55, guard: 65 },
  FX: { HIT_STOP: 0.045, SHAKE_DECAY: 3.0, TRAIL_MAX: 160 },
  PALETTE: {
    skyTop:'#1c2a4f', skyBot:'#d9835f', mtnFar:'#3a3050', mtnMid:'#423753', tree:'#2c4838',
    lane:'#8a7a55', laneDark:'#6d5f42', stone:'#97a3b4', stoneDark:'#6c7a89', stoneLight:'#b4bfcf',
    wood:'#8b5e34', woodDark:'#5d3f22', gold:'#ffd54f', ink:'#0e1526',
    enemyRed:'#c0392b', pArch:'#4a86c9', pArchDark:'#2e5a8f',
    orc:'#4e5a44', orcDark:'#2c3327', torch:'#ffb347',
  },
};
// ---- LIVE VIEWPORT (M7): in portrait nothing changes; when the owner rotates to landscape the
// design W widens to the real aspect so the whole canvas is painted (kills the half-screen ink
// glitch) and you SEE far more battlefield (fixes "can't aim at far enemies / too zoomed in").
Archer.CFG.setView = function(cssW, cssH){
  this.vw = cssW; this.vh = cssH;
  // M12 FRAMING: in portrait the bottom HUD strip (chips + meter + SALLY + hints) starts at
  // ~695 design px. With the old 118 px ground offset the orcs chewing the gate sat under those
  // buttons — the playtester could not see the thing that was killing the keep. Lift the ground
  // line to 658 in portrait and leave the fight clear of the strip. Landscape keeps one HUD row.
  this.LANE.yOff = cssW >= cssH ? 118 : 186;
  if(cssW >= cssH){
    // LANDSCAPE: keep the design height 844 (ground/castle keep their portrait positions),
    // widen design width to the real aspect — capped by the world width.
    this.H = 844;
    this.W = Math.round(Math.min(2600, 844 * (cssW / cssH)));
  } else {
    this.W = 390; this.H = 844;
  }
};
// Dynamic ground line: everything that sat on y=726 now sits on H-118 (identical in portrait).
Object.defineProperty(Archer.CFG, 'groundY', { get: function(){ return this.H - this.LANE.yOff; } });
// LANE.y / CASTLE.baseY / gates ride the live ground line:
Object.defineProperty(Archer.CFG.LANE, 'y', { get: function(){ return Archer.CFG.groundY; } });
Object.defineProperty(Archer.CFG.CASTLE, 'baseY', { get: function(){ return Archer.CFG.groundY; } });
Object.defineProperty(Archer.CFG.CASTLE, 'gateY', { get: function(){ return Archer.CFG.groundY - 26; } });
Object.defineProperty(Archer.CFG.ORC_KEEP, 'gateY', { get: function(){ return Archer.CFG.groundY - 26; } });

// Scale factor mapping design units -> CSS pixels (1 in portrait; <1 in landscape).
Archer.CFG.viewScale = function(){ return this.vw && this.vh ? (this.vh / this.H) : 1; };
