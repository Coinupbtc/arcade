/* ZOMBIE BREACH — tuning. One place for every number. */

export const CFG = {
  // player
  hpMax: 100,
  speed: 6.4,            // m/s on the ground
  accel: 14,             // approach speed for the move vector
  jumpV: 8.2,            // peak 1.60 m, air time 0.78 s — clears a full grab
  jumpCd: 2.2,           // seconds before the next jump: shove-spam must not be a free shield
  gravity: 21,
  radius: 0.55,
  jumpShockR: 2.2,       // landing staggers the dead around you
  jumpShockPush: 1.0,
  jumpStagger: 0.5,

  // weapon
  magSize: 12,
  reserveStart: 60,
  reserveMax: 120,
  fireRate: 0.155,       // s between shots
  reloadTime: 1.15,
  autoReloadDelay: 0.35,
  bulletRange: 62,
  damage: 1,
  scavengeRounds: 8,
  scavengeTime: 2.6,

  // look
  mouseSens: 0.0026,     // rad per px (relative; pointer lock gives unbounded turning)
  touchLookSens: 0.0046, // rad per px
  padLookSens: 2.5,      // rad per second at full stick
  keyTurnRate: 2.6,      // rad/s while Q / E is held (no pointer lock needed)
  edgeTurnRate: 2.4,     // rad/s while the cursor rests against a side edge
  edgeBand: 0.075,       // fraction of the viewport that counts as "the edge"
  pitchMax: 0.85,
  aimAssist: 0.62,       // rad acquisition cone for touch / pad auto-aim (on-screen, not behind you)
  aimSticky: 0.85,       // a held target is kept until it leaves this cone
  aimAssistRate: 8.0,    // rad per second the camera turns onto the lock

  // zombies
  waveBase: 4,
  waveStep: 1.5,         // 4, 5, 7, 8, 10, 11, 13 … a ramp, not a cliff
  hpEvery: 3,            // +1 HP every third wave instead of every second
  aliveCap: 14,
  walker:  { hp: 3, speed: 2.15, dmg: 10, windup: 0.62, cooldown: 1.3, scale: 1.0,  score: 10 },
  runner:  { hp: 2, speed: 3.6,  dmg: 7,  windup: 0.44, cooldown: 1.1, scale: 0.92, score: 20 },
  brute:   { hp: 9, speed: 1.65, dmg: 18, windup: 0.85, cooldown: 1.6, scale: 1.38, score: 35 },
  // The first dead that can hurt you without walking into your gun. It holds range and lobs
  // acid: standing still and holding FIRE stops working once it is on the yard.
  spitter: { hp: 3, speed: 1.95, dmg: 9, windup: 0.9, cooldown: 2.3, scale: 0.98, score: 25,
             ranged: true, keepMin: 6.5, keepMax: 11 },
  warden:  { hp: 34, speed: 1.5, dmg: 24, windup: 1.0, cooldown: 1.9, scale: 1.85, score: 160, immune: true },
  spitFlight: 0.85,      // seconds of air time: the green ring is the landing spot
  spitGravity: 16,
  spitRadius: 1.55,

  // supply choice: every cleared wave drops three crates, you can carry one
  supplyRadius: 5.4,
  supplyTTL: 12,
  supplyTake: 1.1,
  supplyAmmo: 36,
  supplyHeal: 30,
  supplyDmg: 0.5,
  supplyScore: 15,
  bossEvery: 5,          // every fifth wave walks the Warden: a named beat, not a wall
  hitPush: 0.55,
  contact: 1.35,
  separation: 1.05,

  // world
  worldR: 33,
  crateHalf: 1.25,
  spawnR: 20,
  crates: [
    [-8, 12, 0.3], [9, -11, 0.9], [3, 16, 0.1], [-12, -14, 0.6],
    [0, -20, 0.2], [14, 6, 0.7], [-16, 2, 0.4], [7, -4, 0.15]
  ],

  // pacing
  waveBreak: 4.0,        // seconds of breather between waves: enough to reach a supply crate
  waveHeal: 12,
  waveAmmo: 16,
  waveBonus: 40,         // score per wave cleared × wave

  // camera
  camBack: 5.2,
  camUp: 1.62,
  camPush: 3.0,
  camRight: 0.85,
  fov: 74,
  dprMax: 1.5,

  // feel
  hitStop: 0.05,
  shakeShot: 0.05,
  shakeHit: 0.14,
  shakeHurt: 0.3,
  shakeLand: 0.16,

  // skill: a chain that rewards aim
  chainWindow: 3.0,      // seconds between kills to keep the chain alive
  chainStep: 0.5,
  chainMax: 3,
  pierceAt: 2.5,         // chain level that turns the rifle into piercing rounds
  pierceTargets: 3,      // a pierced round can pass through up to three bodies

  // awareness: how far off the crosshair counts as "to the side" / "behind"
  threatSide: 0.62,
  threatBehind: 2.0
};

export const SAVE_KEY = 'zb_best_v2';
export const SAVE_KEY_V1 = 'zb_best_v1';
