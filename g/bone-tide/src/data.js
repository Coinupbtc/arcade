// Bone Tide — tuning, asset manifest, waves, shared State. Every module reads from window.BT.
window.BT = window.BT || {};

BT.CFG = {
  world: { w: 2200, h: 1700 },
  view: 540,                 // world px that fit the short side of the screen
  // chopFps 34 ≈ 0.36 s per swing (was 22 ≈ 0.55 s): holding CHOP keeps the chain moving.
  // dashCd 0.95 + 0.22 s i-frames = at most 23 % immunity, so mashing dash is no longer a shield.
  hero: { hp: 100, speed: 250, chopRange: 135, chopArc: 1.15, chopDmg: 2, chopFps: 34,
          spinRadius: 160, spinTick: 0.14, spinFps: 20, spinSpeed: 0.6,
          dashSpeed: 820, dashTime: 0.28, dashCd: 0.95, iframes: 0.22, rageHit: 9, rageSoul: 10 },
  minion:  { hp: 2, speed: [95, 125], reach: 62, dmg: 7,  cd: 1.3, score: 100, r: 22 },
  mage:    { hp: 3, speed: [70, 85], keep: 300, castCd: 3.2, boltSpeed: 330, boltDmg: 9, score: 250, r: 22 },
  warrior: { hp: 60, speed: [78, 78], reach: 120, slamR: 140, dmg: 25, cd: 2.2, telegraph: 0.75, score: 5000, r: 40, scale: 1.45 },
  drop: { minion: { soul: 0.30, potion: 0.06, rune: 0.02 }, mage: { soul: 0.6, potion: 0.12, rune: 0.12 } },
  comboWindow: 2.5
};

// Two tides. The dead come in a smoother ramp on both: wave 4 is a step, not a cliff.
BT.DIFF = {
  tide: { name: "HIGH TIDE", count: 1.00, gap: 1.00, dmg: 1.00, regen: 25, dashCd: 0.95, iframes: 0.22,
          note: "Five waves. Catch your breath between them." },
  deep: { name: "DEEP TIDE", count: 1.35, gap: 0.82, dmg: 1.30, regen: 15, dashCd: 1.05, iframes: 0.20,
          note: "A third more dead, harder hits, less mercy between waves." }
};
BT.D = function () { return BT.DIFF[BT.State.diff] || BT.DIFF.tide; };

// [minions, mages, boss?] per wave — wave 1 starts within 3 s of PLAY
BT.WAVES = [
  { minion: 10, mage: 0, gap: 0.9 },
  { minion: 12, mage: 2, gap: 0.8 },
  { minion: 16, mage: 4, gap: 0.65 },
  { minion: 20, mage: 5, gap: 0.55 },
  { minion: 6,  mage: 2, gap: 1.2, boss: true }
];

// sprite-bake.py sheets (assets/sprites/NAME.png + NAME.json)
BT.SHEETS = ["barb_act", "barb_move", "barb_death", "minion", "minion_fx", "mage", "mage_fx", "warrior", "warrior_fx"];
BT.REF_SHEET = "barb_act";   // hero renders 1:1; everything else scales by world_per_px

// clip name in the sheet → our verb; sheet that holds it; loop or once
BT.CLIPS = {
  hero:    { chop: ["barb_act", "2h_melee_attack_chop"], spin: ["barb_act", "2h_melee_attack_spin"],
             idle: ["barb_move", "2h_melee_idle", 1], run: ["barb_move", "running_a", 1],
             dodge: ["barb_move", "dodge_forward"], death: ["barb_death", "death_a"] },
  minion:  { walk: ["minion", "walking_d_skeletons", 1], attack: ["minion", "1h_melee_attack_chop"],
             rise: ["minion_fx", "spawn_ground_skeletons"], death: ["minion_fx", "death_c_skeletons"] },
  mage:    { walk: ["mage", "walking_d_skeletons", 1], attack: ["mage", "spellcast_shoot"],
             death: ["mage_fx", "death_c_skeletons"] },
  warrior: { walk: ["warrior", "walking_d_skeletons", 1], attack: ["warrior", "2h_melee_attack_chop"],
             taunt: ["warrior_fx", "taunt"], death: ["warrior_fx", "death_c_skeletons"] }
};

// static props (sprite-bake.py --static): name → solid radius in world px (0 = walk-through decor)
BT.PROPS = {
  grave_A: 26, grave_B: 26, grave_A_destroyed: 26, gravestone: 22, gravemarker_A: 14,
  tree_dead_large: 34, tree_dead_medium: 28, post_lantern: 14, crypt: 0, shrine_candles: 34,
  pumpkin_orange_jackolantern: 0, skull_candle: 0, ribcage: 0, bone_A: 0, floor_dirt_grave: 0,
  fence: 0, fence_broken: 0, fence_pillar: 12, coffin: 30, candle_triple: 0
};

BT.SFX = ["swing", "bonehit", "bonedeath", "rise", "spin", "dodge", "bolt", "hurt", "potion", "soul", "bell", "roar"];
BT.MUSIC = ["tide", "boss", "win", "lose"];
BT.ITEMS = ["potion", "soul", "rune"];

BT.DIRS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];   // index = round(angle / 45°)
BT.dirOf = function (dx, dy) {
  const i = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return BT.DIRS[(i + 8) % 8];
};

BT.State = {
  status: "boot",            // boot | menu | playing | paused | won | lost
  wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, best: 0,
  hp: 100, rage: 0, bossHp: 0, bossMax: 0, time: 0,
  diff: "tide",              // tide | deep — chosen on the title, saved in bonetide.diff
  practice: false,           // a run started from RETRY WAVE n: no best score
  startWave: 1,
  chops: 0, dashes: 0, spins: 0,          // action counters the QA probes read
  chopDirX: 0, chopDirY: 0                // last chop direction (unit vector) — proves pointer aim
};

BT.store = {
  get(k, d) { try { const v = localStorage.getItem("bonetide." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("bonetide." + k, JSON.stringify(v)); } catch (e) {} }
};
