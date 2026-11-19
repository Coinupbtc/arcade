// CARBALL — the opponent's brain as a pure function.
// Orange attacks -z (blue's goal) and defends +z. Same drive functions as the player.
// Skill comes from ai.skill: {speed, aim, power, reaction} set by the menu difficulty.

import { PITCH_HALF_L, GOAL_HALF_W } from './config.js';
import { predictBall, wrapAngle } from './carModel.js';

export const AI_MAX_SPEED = 21.0;   // build choice: below the player's 23 m/s boost cap
export const AI_REACTION = 0.10;    // seconds between target updates

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ai: car state (x,z,yaw,boost,grounded,skill). ball: {x,y,z,vx,vy,vz}.
// mem: {timer, target:{x,z}, mode, seed, aim} — mutated so the AI keeps a decision between ticks.
export function aiInput(ai, ball, dt, mem = {}) {
  if (mem.timer === undefined) mem.timer = 0;
  if (mem.mode === undefined) mem.mode = 'chase';
  if (mem.target === undefined) mem.target = { x: ball.x, z: ball.z + 2.2 };
  if (mem.seed === undefined) mem.seed = 12345;
  if (mem.aim === undefined) mem.aim = 0;
  if (mem.patience === undefined) mem.patience = 0;
  const skill = ai.skill || {};
  const reaction = skill.reaction ?? AI_REACTION;
  const aimErr = skill.aim ?? 1.2;
  // patience: how long the AI will hold its ground while the ball sits on the
  // player's half. A rookie gives the player space; a pro presses sooner.
  if (ball.z >= 6) mem.patience = 0;
  else mem.patience += dt;
  const holdTime = skill.holdTime ?? 8.0;
  mem.timer += dt;
  if (mem.timer >= reaction) {
    mem.timer = 0;
    const look = 0.22 + Math.min(0.25, Math.hypot(ball.vx, ball.vz) * 0.012);
    const b = predictBall(ball, look);
    const ownGoalZ = PITCH_HALF_L;
    const targetGoalZ = -PITCH_HALF_L;

    // 0) Ball in the danger zone (5.5 m from our goal line): go and meet it, from whichever
    //    side we are on. Falling back to the post here turned the keeper into a doormat —
    //    it backed into its own net while the ball sat beside it.
    // A weak keeper guards a spot slightly OFF the ball's line; a strong one tracks it.
    // That gap is what a shot at the far side beats — it is the difference between a
    // keeper you can score on and a wall.
    const off = skill.off ?? 0.8;
    if (mem.offSign === undefined) mem.offSign = (mem.seed & 1) ? 1 : -1;
    const guardX = (bx) => clamp(bx + mem.offSign * off, -GOAL_HALF_W + 0.9, GOAL_HALF_W - 0.9);

    if (b.z > PITCH_HALF_L - 5.5) {
      if (off >= 1.0) {
        // rookie keeper: stay on the line, guard its spot
        mem.mode = 'defend';
        mem.target = { x: guardX(b.x), z: PITCH_HALF_L - 3.2 };
      } else {
        mem.mode = 'clear';
        mem.target = { x: b.x, z: b.z };
      }
    } else if ((ball.vz > 4 && b.z > -14) && ai.z > b.z + 0.4) {
      // 1) A shot is coming at our goal and we are goal-side of the ball:
      //    stand on the ball's line, not behind it. This is the keeper rule that
      //    stops a straight kickoff ball from rolling in untouched.
      mem.mode = 'defend';
      const t = clamp((ai.z - b.z) / Math.max(2, ball.vz), 0.15, 2.4);
      mem.target = {
        x: guardX(clamp(b.x + ball.vx * t, -GOAL_HALF_W + 0.8, GOAL_HALF_W - 0.8)),
        z: PITCH_HALF_L - 5,
      };
    } else if (b.z > ownGoalZ - 18 && b.z <= ai.z + 0.5 && Math.hypot(b.x - ai.x, b.z - ai.z) < 24) {
      // 2b) Ball in our third: come out and clear it. Standing on the line and letting it
      //     arrive turned every straight shot into a rebound the player tapped in.
      mem.mode = 'clear';
      if (ai.z > b.z + 0.5) {
        // goal-side of the ball: drive straight at it. The keeper meets the ball head-on,
        // so the closing speed does the clearing instead of a nudge at the goal line.
        mem.target = { x: b.x, z: b.z };
      } else {
        const gx = 0, gz = targetGoalZ;
        const ox = b.x - gx, oz = b.z - gz;         // goal -> ball
        const ol = Math.hypot(ox, oz) || 1;
        mem.target = { x: b.x + (ox / ol) * 2.4, z: b.z + (oz / ol) * 2.4 };
      }
    } else if (b.z < 6 && mem.patience < holdTime) {
      // 2) The ball is on the player's half: hold a keeper spot and let them come.
      mem.mode = 'hold';
      mem.target = {
        x: guardX(clamp(b.x * 0.35, -12, 12)),
        z: ownGoalZ - (skill.holdZ ?? 9),
      };
    } else if (b.z > ai.z + 0.5 && b.z > ownGoalZ - 14) {
      // 3) Deep ball behind us: fall back to the post the ball is not on.
      mem.mode = 'retreat';
      const side = b.x > 0 ? -1 : 1;
      mem.target = { x: side * (GOAL_HALF_W - 1.2), z: ownGoalZ - 2.4 };
    } else {
      // 4) Attack: push the ball toward -z.
      let tx = 0 - b.x, tz = targetGoalZ - b.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      // side < 0 means the AI is on the +z side of the ball: it can drive through it.
      const side = (ai.x - b.x) * tx + (ai.z - b.z) * tz;
      if (side < -0.3) {
        mem.mode = 'shoot';
        if (b.z < targetGoalZ + 18) {
          // seeded aim error: a rookie misses the mouth sometimes, a pro rarely
          mem.seed = (mem.seed * 1103515245 + 12345) & 0x7fffffff;
          mem.aim = ((mem.seed / 0x7fffffff) * 2 - 1) * aimErr;
          mem.target = {
            x: clamp(mem.aim, -GOAL_HALF_W + 1.5, GOAL_HALF_W - 1.5),
            z: targetGoalZ - 3,
          };
        } else {
          mem.target = { x: b.x + tx * 4.0, z: b.z + tz * 4.0 };
        }
      } else {
        mem.mode = 'lineup';
        mem.target = { x: b.x - tx * 2.0, z: b.z - tz * 2.0 };
      }
    }
  }

  // Escape our own goal mouth. The goal box has a back wall and posts, so a car that
  // wanders in can sit there as an unmoving blocker while the ball is 25 m away.
  if (ai.z > PITCH_HALF_L - 2.5 && Math.hypot(ball.x - ai.x, ball.z - ai.z) > 6) {
    mem.mode = 'escape';
    mem.target = { x: clamp(ball.x * 0.2, -6, 6), z: PITCH_HALF_L - 13 };
  }

  const tx = mem.target.x - ai.x;
  const tz = mem.target.z - ai.z;
  const dist = Math.hypot(tx, tz);
  // close to the ball: aim at the ball itself, not at a point past it, or the car
  // circles a metre wide and never touches it
  const ballDistNow = Math.hypot(ball.x - ai.x, ball.z - ai.z);
  if (ballDistNow < 3.4 && mem.mode === 'clear') {
    // once we are behind it, drive THROUGH the ball: braking at the target let the car
    // overshoot past the ball and shove it into our own net
    mem.target = { x: ball.x, z: ball.z };
  }
  if (ballDistNow < 6 && (mem.mode === 'shoot' || mem.mode === 'lineup')) {
    mem.target = { x: ball.x, z: ball.z };
  }
  const wantYaw = Math.atan2(mem.target.x - ai.x, mem.target.z - ai.z);
  const err = wrapAngle(wantYaw - ai.yaw);

  const steerGain = (mem.mode === 'defend' || mem.mode === 'hold') ? 1.5 : 2.4;
  let steer = clamp(-err * steerGain, -1, 1);
  let throttle = 1;
  if (Math.abs(err) > 2.4) {
    if ((mem.mode === 'defend' || mem.mode === 'hold') && dist < 30) {
      // target is behind us and we are the keeper: back into position, keep facing the ball
      throttle = -0.55;
      steer = 0;
    } else {
      // a 180-degree target: pick a turn direction once, or the steer sign flips every tick
      if (!mem.turnDir) mem.turnDir = err > 0 ? -1 : 1;
      steer = mem.turnDir;
      throttle = 0.18;
    }
  } else {
    mem.turnDir = 0;
    if (Math.abs(err) > 1.1) throttle = 0.3;       // facing the wrong way: turn first
    if (Math.abs(err) > 1.8) throttle = 0.12;
  }
  if ((mem.mode === 'defend' || mem.mode === 'hold') && Math.abs(tx) < 1.6) steer = 0;
  if (mem.mode === 'retreat' && dist < 3) throttle = 0.2;
  if (mem.mode === 'lineup' && dist < 3) throttle = 0.55;
  if (mem.mode === 'defend' && dist < 1.6) throttle = 0.35;
  if (mem.mode === 'clear' && dist < 0.9 && ballDistNow > 7) throttle = 0.2;
  if (mem.mode === 'hold' && dist < 2.0) throttle = 0.2;

  const ballDist = Math.hypot(ball.x - ai.x, ball.z - ai.z);
  const boost = (mem.mode === 'shoot' || mem.mode === 'defend') && ballDist > 11 &&
    ai.boost > 12 && Math.abs(err) < 0.55 && (skill.boost ?? 1) > 0.5;
  const jump = !!ai.grounded && ball.y > 1.45 && ballDist < 3.2;

  return { throttle, steer, boost, jump, slide: false, mode: mem.mode };
}
