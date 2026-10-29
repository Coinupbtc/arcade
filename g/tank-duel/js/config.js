// Tank.CFG — constants shared by every module (v3: 5-sortie campaign)
window.Tank = window.Tank || {};
Tank.CFG = {
  WORLD_W: 900,            // world units (px at scale 1)
  WORLD_H: 900,
  GRAVITY: 220,            // world units / s^2
  WIND_MAX: 26,            // horizontal accel at |wind|=1 (a full wind = ~a 3° correction)
  WIND_CHANGE: 0.35,       // max delta per turn
  POWER_MIN: 15, POWER_MAX: 100,
  ANGLE_MIN: 5, ANGLE_MAX: 85,     // 0 = right, 90 = up (player fires right)
  TANK_HP: 100,            // the player's hull never changes across sorties
  SHELL_R: 4,
  TANK_W: 46, TANK_H: 16, TURRET_R: 9, BARREL_LEN: 26,
  AMMO: {
    standard: { name:'STD', infinite:true,  dmg:34, r:46, color:'#ffe082', mass:1.0 },
    heavy:    { name:'HVY', count:4, dmg:52, r:62, color:'#ff8a65', mass:1.5, splash:1.25 },
    drill:    { name:'DRL', count:3, dmg:44, r:40, color:'#b39ddb', mass:1.25, drill:true },
    cluster:  { name:'CLU', count:2, dmg:20, r:30, color:'#4dd0e1', mass:0.9, cluster:5 },
    emp:      { name:'EMP', count:1, dmg:26, r:80, color:'#69f0ae', mass:1.0, stun:true },
    bomblet:  { name:'BOM', hidden:true, dmg:14, r:26, color:'#4dd0e1', mass:0.8 },
  },
  // ---- campaign: five sorties, each a 1v1 duel on a fresh map ----
  STAGES: [
    { n:1, name:'FIRST CONTACT', sub:'Full sight. Learn the arc.',
      enemyHp:100, err0:11,  errMin:6.0, errShrink:0.93, windMax:0.35, ridge:0,  aiFirst:false, enemyDmgMul:1.0,
      clock:32, preview:60, enemy:{ heavy:0, drill:0, cluster:0, emp:0 } },
    { n:2, name:'CROSSWIND', sub:'Wind pushes harder. Read the drift.',
      enemyHp:120, err0:9,   errMin:4.5, errShrink:0.88, windMax:0.55, ridge:0,  aiFirst:false, enemyDmgMul:1.0,
      clock:30, preview:48, enemy:{ heavy:2, drill:0, cluster:0, emp:0 } },
    { n:3, name:'HULL DOWN', sub:'A ridge blocks the flat shot. Drill it.',
      enemyHp:140, err0:7.5, errMin:3.5, errShrink:0.85, windMax:0.65, ridge:74, aiFirst:false, enemyDmgMul:0.95,
      clock:27, preview:40, enemy:{ heavy:2, drill:2, cluster:0, emp:0 } },
    { n:4, name:'SPOTTER', sub:'The AI shoots first and walks its shots in.',
      enemyHp:150, err0:6.0, errMin:3.2, errShrink:0.72, windMax:0.72, ridge:52, aiFirst:true, enemyDmgMul:0.80,
      clock:24, preview:32, enemy:{ heavy:2, drill:1, cluster:2, emp:1 } },
    { n:5, name:'IRON RAIN', sub:'One clean shot a turn. Make it count.',
      enemyHp:155, err0:5.0, errMin:2.8, errShrink:0.70, windMax:0.90, ridge:86, aiFirst:true, enemyDmgMul:0.72,
      clock:20, preview:26, enemy:{ heavy:3, drill:1, cluster:2, emp:1 } },
  ],
  AI: {
    thinkMs: 800,             // pause so the player sees the AI aiming
    stunErrMul: 4.5,          // player EMP scrambles the next AI shot
    walkIn: 0.72,             // spotter: fraction of the last miss corrected next shot
  },
  SCORE_HIT: 100, SCORE_KILL: 250,
  CRATER_MIN: 18, CRATER_MAX: 42,
  PROP: {
    building: { hp:60, w:64, h:76, dmg:22, debris:10 },
    tree:     { hp:24, w:18, h:64, dmg:10, debris:6 },
    rock:     { hp:40, w:34, h:26, dmg:14, debris:8 },
  },
  PROPS_N: 9,
  COLORS: {
    sky1:'#1b2a4a', sky2:'#e8956d', sun:'#ffd54f', hillBack:'#3d5a45',
    hill:'#5a7d47', dirt:'#7a5a3a', dirtDark:'#5d4429',
    pBody:'#2196f3', pDark:'#0d47a1', eBody:'#e53935', eDark:'#7f1d1d',
    trail:'#cfd8dc', scorch:'rgba(20,16,12,0.55)',
  },
  SLOWMO_SCALE: 0.28, SLOWMO_TIME: 1.4,
  SHAKE_DECAY: 3.2,
  FX: {
    HIT_STOP_S: 0.075,
    KILL_ZOOM: 1.16,
    KILL_ZOOM_HOLD: 1.2,
    IDLE_NUDGE_S: 7,
    TRAIL_LIFE: 0.4,
    TRAIL_MAX: 96,
  },
  SAVE_KEY: 'tankduel.v3',
};
