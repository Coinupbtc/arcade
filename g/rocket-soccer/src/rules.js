// ROCKET SOCCER — rules and match logic.
// Pure: no DOM, no Three.js, no Rapier. Both the game loop and test/acceptance.js
// call these, so a test proves the same code path a finger drives.

export const CONFIG = {
  // car
  carMass: 180,
  driveForce: 9000,        // tuned so top speed is reached in ~1.2 s at RL scale
  reverseForce: 2600,
  brakeForce: 2200,
  maxSpeed: 22,            // m/s without boost
  boostSpeed: 38,          // m/s ceiling while boosting
  boostThrust: 5200,
  boostTank: 100,
  boostDrain: 33,          // units/s while held
  boostPadValue: 25,
  steerRate: 3.2,          // rad/s at speed
  gripLateral: 0.86,       // 0 = ice, 1 = rails
  jumpImpulse: 7.3,          // aerial must reach above the 3.4 m goal, not stop at 2.4
  doubleJumpImpulse: 6.3,
  gravity: -14.0,          // ~1.4g: snappy arcade fall without slamming the car

  // ball
  ballRadius: 0.9125,      // teardown: RL ball radius 0.9125 m; diameter is 1.55x the car length
  ballMass: 30,
  ballDensity: 9.43,        // ≈30 kg at r=0.85 (density x volume; setMass is ignored)
  ballRestitution: 0.62,
  ballAirDrag: 0.10,
  ballRollFriction: 0.35,

  // pitch
  pitchHalfW: 18,          // x — 36 m wide. A scaled arena:
                           // the car:ball ratio is what makes it read as RL, not the pitch size
  pitchHalfL: 26,          // z — 52 m long (a scaled arena; see CONTRACT for why)
  wallHeight: 6,
  goalHalfW: 5,            // goal opening half-width (x)
  goalHeight: 3.4,
  goalDepth: 2.6,

  // match
  matchSeconds: 150,
  goalResetDelay: 1.0,
  carStartZ: 18,
  carRestY: 0.23,          // collider half-height + a hair; spawning higher slams the car
  ballStartRadius: 0.02,      // the ball rests ON the turf; 0.9 floated it above the car roof
};

// ── match state ────────────────────────────────────────────────────────────
export function createState(seed = 1) {
  return {
    seed,
    time: 0,
    phase: 'title',            // title | kickoff | play | goal | over
    scoreYou: 0,
    scoreAI: 0,
    clock: CONFIG.matchSeconds,
    goalDelay: 0,
    countdown: 0,
    lastScorer: null,
    stats: { yourShots: 0, aiShots: 0, yourBoostUsed: 0, aerials: 0, flips: 0, hits: 0 },
    events: [],
  };
}

export function emit(s, type, data = {}) { s.events.push({ type, ...data }); }

// ── DECISION 1: boost economy ──────────────────────────────────────────────
// Boost is a finite tank. Holding it thrusts hard; it drains and only pads refill
// it. A player who spends it all chasing cannot recover or reach an aerial.
// `c` is a car controller. Each car owns its own tank — sharing one let the AI
// silently drain the player's boost.
export function boostTick(s, c, dt, wantsBoost) {
  if (!wantsBoost || !(c.boost > 0)) return 0;
  const used = Math.min(c.boost, CONFIG.boostDrain * dt);
  c.boost -= used;
  if (s && s.stats && c.isPlayer) s.stats.yourBoostUsed += used;
  return CONFIG.boostThrust;
}

export function takePad(c, value = CONFIG.boostPadValue) {
  const before = c.boost;
  c.boost = Math.min(CONFIG.boostTank, c.boost + value);
  return c.boost - before;
}

// Boost pads: fixed positions with a respawn timer. Big pads in the corners, small
// pads along the flanks — the standard layout that makes the economy a real choice.
export function makePads() {
  const W = CONFIG.pitchHalfW, L = CONFIG.pitchHalfL;
  const big = [[-W * 0.72, -L * 0.72], [W * 0.72, -L * 0.72], [-W * 0.72, L * 0.72], [W * 0.72, L * 0.72]];
  const small = [[-W * 0.45, 0], [W * 0.45, 0], [0, -L * 0.55], [0, L * 0.55],
                 [-W * 0.72, 0], [W * 0.72, 0]];
  return [
    ...big.map(([x, z]) => ({ x, z, value: 100, respawn: 10, timer: 0, big: true })),
    ...small.map(([x, z]) => ({ x, z, value: 25, respawn: 4, timer: 0, big: false })),
  ];
}

// Returns the pad that was collected, or null. Called every frame for each car.
export function tickPads(pads, carPos, carCtl, dt) {
  let got = null;
  for (const p of pads) {
    if (p.timer > 0) { p.timer = Math.max(0, p.timer - dt); continue; }
    const d = Math.hypot(carPos.x - p.x, carPos.z - p.z);
    if (d < 1.7) {
      takePad(carCtl, p.value);
      p.timer = p.respawn;
      got = p;
    }
  }
  return got;
}

// ── DECISION 2: ground vs aerial ───────────────────────────────────────────
// Jump once from the ground; a second jump in the air is a flip. Reachable height
// decides which balls you can touch at all.
// `c` is the car controller; `s` is match state (stats/events live there).
export function canJump(c) { return c.jumpsLeft > 0 && c.jumpCooldown <= 0; }

export function jump(s, c) {
  if (!canJump(c)) return false;
  const first = c.jumpsLeft === 2;
  c.jumpsLeft -= 1;
  c.jumpCooldown = 0.18;
  if (first) { c.vy = CONFIG.jumpImpulse; emit(s, 'jump', {}); }
  else { c.vy = CONFIG.doubleJumpImpulse; s.stats.flips += 1; c.flipping = 0.35; emit(s, 'flip', {}); }
  return true;
}

export function landCar(c) { c.jumpsLeft = 2; c.jumpCooldown = 0; c.flipping = 0; }

// Peak height reachable, for the design claim "aerials reach balls ground cannot".
export function jumpApex(fromY = 0) {
  const v = CONFIG.jumpImpulse;
  return fromY + (v * v) / (2 * Math.abs(CONFIG.gravity));
}

export function doubleJumpApex(fromY = 0) {
  // second impulse applied at the first apex
  const v = CONFIG.doubleJumpImpulse;
  return jumpApex(fromY) + (v * v) / (2 * Math.abs(CONFIG.gravity));
}

// ── DECISION 3: strike point ───────────────────────────────────────────────
// Where the car meets the ball decides the ball's direction. Contact offset from
// the ball's centre, projected onto the car's right/up axes, steers the shot.
export function strikeDirection(carPos, carVel, ballPos, carRight, carUp) {
  const dx = ballPos.x - carPos.x;
  const dy = ballPos.y - carPos.y;
  const dz = ballPos.z - carPos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const n = { x: dx / len, y: dy / len, z: dz / len };

  // how far off-centre the contact is, along the car's own axes
  const offR = n.x * carRight.x + n.z * carRight.z;      // side
  const offU = n.y * carUp.y;                            // height

  // base push is the car's own momentum through the ball
  const speed = Math.hypot(carVel.x, carVel.y, carVel.z);
  const base = Math.max(4, speed * 1.35);

  return {
    x: n.x * base + carRight.x * offR * base * 0.85,
    y: Math.max(0, n.y * base * 0.55 + offU * base * 0.5),
    z: n.z * base + carRight.z * offR * base * 0.85,
    speed: base,
    offR, offU,
  };
}

// ── DECISION 4: commit vs rotate ───────────────────────────────────────────
// Distance from your own goal is a proxy for risk: the further upfield you are,
// the more open your net. Used by the AI and to score your positioning.
export function defensiveRisk(carPos) {
  const ownGoalZ = CONFIG.pitchHalfL;
  const d = Math.abs(carPos.z - ownGoalZ);       // 0 at your own line
  return Math.max(0, Math.min(1, d / (CONFIG.pitchHalfL * 2)));
}

// ── goals ──────────────────────────────────────────────────────────────────
export function inGoal(ballPos) {
  if (Math.abs(ballPos.x) > CONFIG.goalHalfW) return null;
  if (ballPos.y > CONFIG.goalHeight) return null;
  if (ballPos.z > CONFIG.pitchHalfL) return 'ai';     // ball crossed YOUR goal line (z+)
  if (ballPos.z < -CONFIG.pitchHalfL) return 'you';
  return null;
}

export function scoreGoal(s, who) {
  if (s.phase !== 'play') return null;
  if (who === 'you') { s.scoreYou += 1; s.stats.yourShots += 1; }
  else { s.scoreAI += 1; s.stats.aiShots += 1; }
  s.lastScorer = who;
  s.phase = 'goal';
  s.goalDelay = CONFIG.goalResetDelay;
  emit(s, 'goal', { who, scoreYou: s.scoreYou, scoreAI: s.scoreAI });
  return who;
}

// ── clock ──────────────────────────────────────────────────────────────────
export function tickClock(s, dt) {
  if (s.phase === 'goal') {
    s.goalDelay -= dt;
    return s.goalDelay <= 0 ? 'kickoff' : null;
  }
  if (s.phase === 'play') {
    s.clock = Math.max(0, s.clock - dt);   // kickoff/countdown does not burn match time
    if (s.clock <= 0) { s.phase = 'over'; emit(s, 'over', {}); return 'over'; }
  }
  return null;
}

// ── kickoff positions ──────────────────────────────────────────────────────
export function kickoffPositions() {
  return {
    car: { x: 0, y: 0.5, z: CONFIG.carStartZ },
    ball: { x: 0, y: CONFIG.ballRadius + CONFIG.ballStartRadius, z: 0 },
    ai: { x: 0, y: 0.5, z: -CONFIG.carStartZ },
  };
}
