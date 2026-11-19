// ROCKET SOCCER — opponent AI.
// Drives the same car controller as the player, so it obeys identical physics.
// Goal: get behind the ball (relative to YOUR goal) and drive through it.

import { CONFIG, defensiveRisk } from './rules.js';
import { forwardFromYaw, createCar } from './car.js';

export function createAI(ph, difficulty = 1) {
  const ctl = createCar(ph, 'ai');
  return {
    ...ctl,                 // keep boost / isPlayer / body / collider / car together
    ph,
    skill: difficulty,      // 0.6 easy .. 1.4 hard
    reactTimer: 0,
    target: { x: 0, z: 0 },
    jumpHeld: false,
    boostOn: false,
    stuckTimer: 0,
    orbitTimer: 0,          // time spent circling the ball without touching it
    reverseFor: 0,
  };
}

export function stepAI(ai, aiCtl, state, ballPos, dt) {
  const body = ai.body;
  const pos = body.translation();
  const vel = body.linvel();
  const c = aiCtl.car;

  // The AI attacks YOUR goal, which is at +z.
  const attackZ = CONFIG.pitchHalfL;
  const ownZ = -CONFIG.pitchHalfL;

  // 1. Stand-off point: behind the ball on the line from the target goal. Driving
  //    straight at the ball instead just shoves it around (32 touches → 11).
  const toGoalX = 0 - ballPos.x;
  const toGoalZ = attackZ - ballPos.z;
  const tl = Math.hypot(toGoalX, toGoalZ) || 1;
  const standOff = 3.05 + CONFIG.ballRadius;   // the proven value on this arena
  let tx = ballPos.x - (toGoalX / tl) * standOff;
  let tz = ballPos.z - (toGoalZ / tl) * standOff;

  // 2. If the ball is behind the AI (between it and its own goal), recover first.
  const ballBehind = ballPos.z < pos.z - 1.5 && Math.abs(ballPos.x - pos.x) < 6;
  if (ballBehind) {
    // swing around the ball rather than pushing it into its own net
    const side = pos.x > ballPos.x ? 1 : -1;
    tx = ballPos.x + side * 4.5;
    tz = ballPos.z + 4.0;
  }

  // 3. Commit vs rotate (DECISION 4). defensiveRisk rises as the AI pushes upfield;
  //    past a threshold it must rotate back instead of chasing.
  const risk = defensiveRisk(pos);
  const ballNearOwnGoal = ballPos.z < ownZ + 9;
  if (ballNearOwnGoal && (pos.z > ballPos.z + 3 || risk > 0.55)) {
    tx = ballPos.x * 0.4;
    tz = ownZ + 5.5;
  }

  // 3b. Own-goal guard. If the ball is near its own net, get on the GOAL side of it so
  //     any contact pushes the ball upfield. Without this the AI scored 0.8 own goals a
  //     match — an idle player could beat it by doing nothing.
  const ownGoalZ = -CONFIG.pitchHalfL;
  const dangerZone = ballPos.z < ownGoalZ + 9;
  if (dangerZone) {
    // Arc around the ball instead of driving through it. A straight run at the goal
    // side pushes the ball INTO the net (0.7 own goals a match); a lateral offset makes
    // the car swing behind it and clear upfield.
    const side = pos.x >= ballPos.x ? 1 : -1;
    tx = ballPos.x + side * 4.5;
    tz = Math.max(ownGoalZ + 0.8, ballPos.z - 3.0);
    ai.reactTimer = 0;              // react immediately when its own net is threatened
  }

  // 4. Once it is behind the ball and roughly lined up, CHARGE THROUGH it instead of
  //    stopping at the stand-off point. Stopping there is why the AI nudged the ball
  //    instead of shooting it.
  const ballDist = Math.hypot(ballPos.x - pos.x, ballPos.z - pos.z);
  const carSide = Math.sign(ballPos.z - pos.z);
  const goalSide = Math.sign(attackZ - ballPos.z);
  const behindBall = carSide !== 0 && carSide === goalSide;
  const charge = behindBall && ballDist < 7.5;   // behind = goal-side, so a charge clears

  // Reaction delay makes it beatable: it re-targets at a human-ish rate.
  // No target may sit outside the arena.
  tx = Math.max(-CONFIG.pitchHalfW + 1.5, Math.min(CONFIG.pitchHalfW - 1.5, tx));
  tz = Math.max(ownGoalZ + 1.6, Math.min(CONFIG.pitchHalfL - 1.6, tz));

  // ── kickoff contest ──────────────────────────────────────────────────────
  // A charging player wins every kickoff if the AI is still driving at skill-scaled
  // throttle with a re-target delay: a naive charge bot scored 70-0. At a kickoff the
  // AI now commits fully, exactly like a human would.
  const kickoff = Math.abs(ballPos.z) < 1.5 && Math.abs(ballPos.x) < 1.5
                  && Math.hypot(pos.x, pos.z) > 12;
  if (kickoff) {
    ai.reactTimer = 0;
    ai.target.x = ballPos.x;
    ai.target.z = ballPos.z;
    const kw = Math.atan2(ballPos.x - pos.x, -(ballPos.z - pos.z));
    let kerr = kw - (c.yaw || 0);
    while (kerr > Math.PI) kerr -= 2 * Math.PI;
    while (kerr < -Math.PI) kerr += 2 * Math.PI;
    const kSteer = Math.max(-1, Math.min(1, kerr * 2.2));
    return { throttle: 1, steer: kSteer, boost: false, jumpPressed: false };
  }

  ai.reactTimer -= dt;
  if (ai.reactTimer <= 0) {
    ai.reactTimer = 0.15 / ai.skill;   // slower re-targeting at low skill
    ai.target.x = charge ? ballPos.x : tx;
    ai.target.z = charge ? ballPos.z : tz;
  }

  // ── steering ─────────────────────────────────────────────────────────────
  const dx = ai.target.x - pos.x;
  const dz = ai.target.z - pos.z;
  const dist = Math.hypot(dx, dz);

  const fwd = forwardFromYaw(c.yaw);
  const desiredYaw = Math.atan2(dx, -dz);
  let err = desiredYaw - c.yaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;

  const steer = Math.max(-1, Math.min(1, err * 2.4 * (0.75 + 0.25 * ai.skill)));

  // ── throttle ─────────────────────────────────────────────────────────────
  const speed = Math.hypot(vel.x, vel.z);
  let throttle = 1;
  // Turning radius at top speed is ~9 m, so never accelerate through a big heading
  // error — the AI used to swing into the corner and wedge against the wall.
  const aerr = Math.abs(err);
  // A stopped car cannot steer, so a big heading error from rest must still drive.
  if (aerr > 1.6) throttle = speed < 2.5 ? 0.65 : 0.10;
  else if (aerr > 0.9) throttle = speed > 6 ? 0.0 : 0.35;   // brake, then creep round
  else if (aerr > 0.45) throttle = 0.7;
  if (dist < 1.2 && !charge) throttle = 0.4;
  if (charge) throttle = 1;              // drive through the ball at full speed
  throttle *= 0.72 + 0.28 * ai.skill;   // a fresh opponent drives slower than a tuned one

  // ── boost ────────────────────────────────────────────────────────────────
  // Boost when the target is far and the AI is roughly pointed at it.
  const wantsBoost = dist > 9 && Math.abs(err) < 0.55 && aiCtl.boost > 18;

  // ── jump for a high ball ─────────────────────────────────────────────────
  const ballHigh = ballPos.y > 1.35;
  const nearBall = Math.hypot(ballPos.x - pos.x, ballPos.z - pos.z) < 3.2;
  let jumpPressed = false;
  if (ballHigh && nearBall && c.grounded && c.jumpsLeft === 2 && Math.random() < 0.10 * ai.skill) {
    jumpPressed = true;
  }

  // ── wall / corner escape ─────────────────────────────────────────────────
  // If the car is out near the boards, steer back toward the middle of the pitch.
  const marginX = CONFIG.pitchHalfW - 2.0, marginZ = CONFIG.pitchHalfL - 2.0;
  const pinned = Math.abs(pos.x) > marginX || Math.abs(pos.z) > marginZ;
  if (pinned) {
    ai.target.x = -Math.sign(pos.x) * Math.min(Math.abs(pos.x), 4);
    ai.target.z = -Math.sign(pos.z) * Math.min(Math.abs(pos.z), 4);
  }

  // ── orbit breaker ────────────────────────────────────────────────────────
  // The stand-off point keeps sliding as the ball drifts, so a passive game makes the
  // AI circle it forever (a tester watched 60 s of mutual orbit). If it has been close
  // without making contact for 2.5 s, stop being clever and drive through the ball.
  const orbitDist = Math.hypot(pos.x - ballPos.x, pos.z - ballPos.z);
  const touching = orbitDist < CONFIG.ballRadius + 1.1;
  if (touching) ai.orbitTimer = 0;
  else if (orbitDist < 14) ai.orbitTimer += dt;
  else ai.orbitTimer = Math.max(0, ai.orbitTimer - dt);
  if (ai.orbitTimer > 2.5) {
    tx = ballPos.x;
    tz = ballPos.z;
    ai.orbitTimer = 1.2;    // stay committed for a moment after contact
  }

  // ── unstick: reverse out instead of grinding forward forever ─────────────
  if (speed < 0.8) ai.stuckTimer += dt; else ai.stuckTimer = 0;
  if (ai.stuckTimer > 0.9) {
    ai.reverseFor = 0.7;
    ai.stuckTimer = 0;
  }
  if (ai.reverseFor > 0) {
    ai.reverseFor -= dt;
    return { throttle: -1, steer: -steer, boost: false, jumpPressed: false };
  }

  return { throttle, steer, boost: wantsBoost, jumpPressed };
}
