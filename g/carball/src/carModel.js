// CARBALL — the car and ball rules as pure functions.
// The browser applies these to Rapier bodies; `node test/acceptance.js` runs the same functions.
// Nothing here imports three.js or Rapier, so the rules can be proved without a browser.
//
// Every number below comes from the teardown (~/Documents/projects/_shared/game-teardowns/rocket-league-2015):
// the drive torque curve, the turn curvature curve, the masses, the restitution and the ball's own
// "car interaction" block (push scales + push factor curve) are the real game's values, not guesses.

import {
  MAX_SPEED, MAX_BOOST_SPEED, THROTTLE_ACCEL, driveTorque, turnCurvature, TURNING_TOP_SPEED,
  REVERSE_MAX, BRAKE, COAST, STEER_RATE, AIR_STEER_RATE, GRIP, SLIDE_GRIP, AIR_GRIP,
  BOOST_MAX, BOOST_DRAIN, BOOST_ACCEL_GROUND, BOOST_ACCEL_AIR, BOOST_AIR_LIFT,
  JUMP_SPEED, DOUBLE_JUMP_SPEED, FLIP_FORWARD, FLIP_UP,
  PITCH_HALF_L, GOAL_HALF_W, GOAL_H, CAR_REST_Y,
  BALL_RADIUS, BALL_MASS, BALL_RESTITUTION, CAR_MASS, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH,
  HIT_MAX_REL_SPEED, HIT_PUSH_FORWARD, HIT_PUSH_Z, HIT_FRICTION, HIT_PUSH_CURVE,
} from './config.js';

export function makeCarState(x = 0, z = 0, yaw = 0) {
  return {
    x, y: CAR_REST_Y, z, vx: 0, vy: 0, vz: 0, yaw,
    boost: BOOST_MAX, jumps: 2, grounded: true, speed: 0, boosting: false, flipT: 0,
  };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// One drive step. input: {throttle -1..1, steer -1..1, boost bool, slide bool}.
// Mutates `car` and returns it. Gravity and ground contact are Rapier's job; this only
// changes horizontal velocity, yaw and the boost tank.
export function driveStep(car, input, dt) {
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);
  const fwdX = Math.sin(car.yaw), fwdZ = Math.cos(car.yaw);
  const rightX = Math.cos(car.yaw), rightZ = -Math.sin(car.yaw);

  let vF = car.vx * fwdX + car.vz * fwdZ;   // forward speed
  let vL = car.vx * rightX + car.vz * rightZ; // sideways speed

  // Throttle through the real drive torque curve: full pull at rest, a tenth at top speed.
  if (throttle > 0.04) {
    if (vF < MAX_SPEED) {
      vF = Math.min(MAX_SPEED, vF + THROTTLE_ACCEL * driveTorque(vF) * throttle * dt);
    }
  } else if (throttle < -0.04) {
    if (vF > 0.1) vF = Math.max(0, vF - BRAKE * -throttle * dt);
    else vF = Math.max(-REVERSE_MAX, vF - THROTTLE_ACCEL * 0.55 * -throttle * dt);
  } else {
    const d = COAST * dt;
    vF = Math.abs(vF) <= d ? 0 : vF - Math.sign(vF) * d;
  }

  car.boosting = false;
  if (input.boost && car.boost > 0.01) {
    const acc = car.grounded ? BOOST_ACCEL_GROUND : BOOST_ACCEL_AIR;
    vF = Math.min(MAX_BOOST_SPEED, vF + acc * dt);
    car.boost = Math.max(0, car.boost - BOOST_DRAIN * dt);
    car.boosting = true;
    if (!car.grounded) car.vy += acc * BOOST_AIR_LIFT * dt; // nose-up share of air boost
  }
  // Over the cap with no boost (a downhill bounce): bleed back to the no-boost cap.
  if (!car.boosting && vF > MAX_SPEED) vF = Math.max(MAX_SPEED, vF - 3.0 * dt);
  vF = clamp(vF, -REVERSE_MAX, MAX_BOOST_SPEED);

  // Steering: the real curvature curve. yaw rate = speed x curvature, so the turn radius
  // grows with speed instead of the car pivoting in place.
  const sp = Math.abs(vF);
  let yawRate;
  if (!car.grounded) {
    yawRate = AIR_STEER_RATE;
  } else {
    yawRate = sp > 0.4 ? sp * turnCurvature(sp) : STEER_RATE * 0.25 * Math.min(1, sp / 1.2);
    if (input.slide) yawRate *= 0.75;      // the handbrake turns the wheels less, not more
  }
  const dir = vF < -0.4 ? -1 : 1;
  // Screen convention: the camera sits behind the car looking +z, so world -x is
  // screen-right. A positive (right) steer must therefore decrease yaw.
  car.yaw = wrapAngle(car.yaw - steer * yawRate * dt * dir);

  // Turning at full lock caps the car below its straight-line top speed (real: 12.34 m/s).
  if (car.grounded && Math.abs(steer) > 0.35 && vF > TURNING_TOP_SPEED) {
    vF = Math.max(TURNING_TOP_SPEED, vF - 4.0 * dt);
  }

  // Lateral grip: sideways speed dies fast on the ground, slowly in the air, and a
  // powerslide keeps more of it.
  const grip = car.grounded ? (input.slide ? SLIDE_GRIP : GRIP) : AIR_GRIP;
  vL *= Math.exp(-grip * dt);

  car.vx = fwdX * vF + rightX * vL;
  car.vz = fwdZ * vF + rightZ * vL;
  car.speed = Math.hypot(car.vx, car.vz);
  return car;
}

// Jump or flip. Returns 'jump' | 'double' | 'flip' | null.
// A directional second jump becomes a flip: it adds forward speed and a little lift.
export function jumpStep(car, input = {}) {
  if (car.jumps <= 0) return null;
  const fwdX = Math.sin(car.yaw), fwdZ = Math.cos(car.yaw);
  if (car.jumps === 2) {
    car.vy = JUMP_SPEED;
    car.jumps = 1;
    car.grounded = false;
    return 'jump';
  }
  const directional = Math.abs(input.throttle || 0) > 0.1 || Math.abs(input.steer || 0) > 0.1;
  if (directional) {
    car.vx += fwdX * FLIP_FORWARD;
    car.vz += fwdZ * FLIP_FORWARD;
    car.vy += FLIP_UP;
    car.flipT = 0.34;
    car.jumps = 0;
    return 'flip';
  }
  car.vy += DOUBLE_JUMP_SPEED;   // the real second-jump impulse: +2.92 m/s
  car.jumps = 0;
  return 'double';
}

export function landCar(car) {
  car.grounded = true;
  car.jumps = 2;
  car.flipT = 0;
  if (car.vy < -9) car.vy = -9; // no hard bounce on landing
}

// ── the core move: car hits ball ─────────────────────────────────────────────
// Push factor curve from the teardown's ball "Car interaction" block: the share of the
// relative speed that transfers, read against the closing speed (m/s).
export function pushFactor(relSpeed) {
  const s = Math.min(Math.abs(relSpeed), HIT_MAX_REL_SPEED);
  const c = HIT_PUSH_CURVE;
  if (s <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (s <= c[i][0]) {
      const [x0, y0] = c[i - 1], [x1, y1] = c[i];
      const t = (s - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return c[c.length - 1][1];
}

// Contact normal from the car's oriented box to the ball centre. A nose hit gives a nearly
// horizontal normal; a corner hit gives a diagonal one, which is what sends the ball wide.
// car: {x,y,z,yaw}; ball: {x,y,z}. Returns a unit {x,y,z} pointing car -> ball.
export function boxContactNormal(car, ball) {
  const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
  const dx = ball.x - car.x, dy = ball.y - car.y, dz = ball.z - car.z;
  // into the car's local frame (forward = +z after yaw)
  const lx = dx * cy - dz * sy;
  const lz = dx * sy + dz * cy;
  const hx = CAR_WIDTH / 2, hy = CAR_HEIGHT / 2, hz = CAR_LENGTH / 2;
  const cx = clamp(lx, -hx, hx), cyy = clamp(dy, -hy, hy), cz = clamp(lz, -hz, hz);
  let nx = lx - cx, ny = dy - cyy, nz = lz - cz;
  let len = Math.hypot(nx, ny, nz);
  if (len < 1e-4) { nx = 0; ny = 0; nz = 1; len = 1; }   // deep overlap: push along the nose
  nx /= len; ny /= len; nz /= len;
  // back to world (inverse yaw)
  return { x: nx * cy + nz * sy, y: ny, z: -nx * sy + nz * cy };
}

// The ball's velocity after a car hit. Pure: same inputs, same output, no bodies.
//   carVel {x,y,z}, ballVel {x,y,z}, normal {x,y,z} (car -> ball), opts {aboveRoof}
// Rule (teardown): momentum between mass 180 and mass 30 with restitution 0.6, scaled by the
// push factor curve; forward axis keeps HIT_PUSH_FORWARD, the vertical share HIT_PUSH_Z.
// Returns {vx, vy, vz, spin, impulse} or null when the car is not closing on the ball.
export function ballHitResponse(carVel, ballVel, normal, opts = {}) {
  // A ground hit is flat: the car's bumper meets the ball low on its face, so the geometric
  // normal points up-and-forward and would launch every touch. The reference game's hit
  // pushes on the forward axis (push forward scale 0.65), so the vertical share is dropped
  // unless the ball is above the car's roof (a flip or an aerial).
  const aboveRoof = opts.aboveRoof ?? (normal.y > 0.45);
  let n = normal;
  if (!aboveRoof) {
    const l = Math.hypot(normal.x, normal.z) || 1;
    n = { x: normal.x / l, y: 0, z: normal.z / l };
  }
  const relX = carVel.x - ballVel.x;
  const relY = (carVel.y || 0) - (ballVel.y || 0);
  const relZ = carVel.z - ballVel.z;
  const relN = relX * n.x + relY * n.y + relZ * n.z;
  if (relN <= 0.05) return null;                       // separating or touching: no hit
  const relSpeed = Math.min(Math.hypot(relX, relY, relZ), HIT_MAX_REL_SPEED);
  const push = pushFactor(relSpeed);
  const scale = push / HIT_PUSH_CURVE[0][1];           // curve normalised at its low-speed value

  // momentum with restitution, then the push factor curve
  const j = ((1 + BALL_RESTITUTION) * relN) / (1 / BALL_MASS + 1 / CAR_MASS);
  const dvN = (j / BALL_MASS) * scale;

  // vertical share: a ball below the car's roof is hit flat; a ball above it takes the
  // 0.35 z scale, so a flip under the ball lifts it and a ground drive does not.
  const axisY = aboveRoof ? HIT_PUSH_Z / HIT_PUSH_FORWARD : 0;
  let vx = ballVel.x + n.x * dvN;
  let vy = ballVel.y + n.y * dvN * axisY;
  let vz = ballVel.z + n.z * dvN;

  // tangential friction: a glancing hit drags the ball sideways and gives it spin
  const vnX = n.x * relN, vnY = n.y * relN, vnZ = n.z * relN;
  const tanX = relX - vnX, tanY = relY - vnY, tanZ = relZ - vnZ;
  const tanShare = Math.min(0.45, HIT_FRICTION * 0.08) * scale;
  vx += tanX * tanShare;
  vy += tanY * tanShare * (aboveRoof ? 1 : 0);
  vz += tanZ * tanShare;

  // spin from the tangential impulse at the contact point (r = -normal * radius)
  const spinScale = tanShare / BALL_RADIUS;
  const spin = {
    x: (n.z * tanY - n.y * tanZ) * spinScale,
    y: (n.x * tanZ - n.z * tanX) * spinScale,
    z: (n.y * tanX - n.x * tanY) * spinScale,
  };
  return { vx, vy, vz, spin, impulse: dvN };
}

// Impulse (kg*m/s) added to the ball when the car touches it. Kept for callers that only
// want the direction; it is the same rule as ballHitResponse, expressed as a delta.
export function strikeImpulse(car, ball, ballRadius = BALL_RADIUS) {
  const n = boxContactNormal({ x: car.x, y: car.y ?? CAR_REST_Y, z: car.z, yaw: car.yaw },
    { x: ball.x, y: ball.y, z: ball.z });
  const r = ballHitResponse({ x: car.vx, y: car.vy || 0, z: car.vz }, { x: 0, y: 0, z: 0 }, n,
    { aboveRoof: (ball.y - BALL_RADIUS) > (car.y ?? CAR_REST_Y) + CAR_HEIGHT / 2 });
  if (!r) return { x: 0, y: 0, z: 0 };
  return { x: r.vx * BALL_MASS, y: r.vy * BALL_MASS, z: r.vz * BALL_MASS };
}

// Which team scored, if any. Blue attacks +z, orange attacks -z.
export function isGoal(ball) {
  const inMouth = Math.abs(ball.x) < GOAL_HALF_W - 0.05 && ball.y < GOAL_H && ball.y > -0.2;
  if (!inMouth) return null;
  if (ball.z > PITCH_HALF_L + 0.35) return 'blue';
  if (ball.z < -PITCH_HALF_L - 0.35) return 'orange';
  return null;
}

// Is the car inside its own goal box? Used to recover a car that parks in the net.
export function inGoalBox(car) {
  return Math.abs(car.z) > PITCH_HALF_L && Math.abs(car.x) < GOAL_HALF_W && car.y < GOAL_H;
}

export function predictBall(ball, t) {
  return { x: ball.x + ball.vx * t, y: ball.y + ball.vy * t, z: ball.z + ball.vz * t };
}

export function resetCar(car, x, z, yaw) {
  car.x = x; car.z = z; car.yaw = yaw;
  car.vx = 0; car.vy = 0; car.vz = 0;
  car.boost = BOOST_MAX; car.jumps = 2; car.grounded = true; car.speed = 0; car.flipT = 0;
}
