// Dune Drift — one constants file. Every feel number in CONTRACT.md lives here.
export const CFG = {
  // --- speed ---
  topSpeed: 40,            // m/s (144 km/h). Boost = x1.35
  accelTau: 0.5757,        // 0 -> 90% of top speed in ~4 s: 1 - e^(-0.5757*4) = 0.90
  coastTau: 1.35,          // how fast speed falls back when boost releases
  brakeDecel: 26,          // m/s^2 under air-brake
  boostMul: 1.35,          // +35% top speed while held
  padBoostSec: 1.35,       // boost pad: heat-free kick

  // --- heat / boost gamble ---
  heatPerSec: 25,          // 0 -> 100 in 4 s of boost
  coolPerSec: 25,          // -25%/s when not boosting
  cutoutSec: 2.0,          // engine cut when heat hits 100
  cutoutSpeedMul: 0.55,    // speed the cutout drags you down to

  // --- steering ---
  steerAt0: 1.55,          // rad/s at a standstill
  steerAtTop: 0.60,        // rad/s at top speed (steering falls with speed)
  brakeTurnMul: 1.4,       // air-brake tightens turning x1.4
  steerSmooth: 9,          // input smoothing (no 180 deg spins from a thumb flick)

  // --- hull / track ---
  hoverHeight: 0.85,
  gravity: 24,
  roadHalf: 9.0,           // road half width (18 m road)
  wallHalf: 10.3,          // wall contact plane
  wallLoss: 0.20,          // 20% speed on wall contact
  scrapeDrag: 7,           // m/s^2 while scraping
  wallCooldown: 0.28,
  respawnAfter: 2.0,       // no progress for 2 s -> respawn
  jumpVy: 0.19,            // launch vy = speed * this
  laps: 3,

  // --- camera ---
  camDist: 7.2,
  camHeight: 2.2,
  camLook: 6.5,
  fovMin: 70,
  fovMax: 80,

  // --- rivals ---
  aiTop: [33.2, 34.8, 36.2],  // m/s base; player top is 40 so a clean race wins
  aiLatAccel: 12.5,           // cornering limit -> target speed = sqrt(a / curvature)
  aiRubber: 0.10,             // +/-10% only
  aiBrake: 2.6,               // how fast a rival changes speed

  // --- race meta ---
  goldSec: 150,            // gold: <= 150 s AND zero heat cutouts (clean + smart boosting)
  silverSec: 168,

  // --- palette (6 colours + neutrals) ---
  col: {
    sand:   0xe8c48a,
    rock:   0xb4552a,
    violet: 0x2b1b3d,
    amber:  0xffb347,
    cyan:   0x35e1e8,
    bone:   0xf5efe6,
    ink:    0x0b0710
  },
  // rivals: amber / magenta / rust — all read against sand
  rivalCols: [0xffb347, 0xb05ce0, 0xd9662f],
  playerCol: 0x33204a
};

export const CSS_COL = {
  sand: '#e8c48a', rock: '#b4552a', violet: '#2b1b3d',
  amber: '#ffb347', cyan: '#35e1e8', bone: '#f5efe6', ink: '#0b0710'
};
