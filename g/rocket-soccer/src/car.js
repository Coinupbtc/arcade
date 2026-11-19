// ROCKET SOCCER — arcade car controller.
// Deliberately not a tyre simulation. Drive is velocity-controlled (not force-based):
// force drive fought ground friction and stalled the car, and velocity control is how
// arcade racers actually get an instant, crisp response.

import { CONFIG, boostTick, canJump, jump, landCar } from './rules.js';

export function createCar(ph, which = 'you') {
  return {
    ph,
    isPlayer: which === 'you',
    body: which === 'ai' ? ph.aiBody : ph.carBody,
    collider: which === 'ai' ? ph.aiCollider : ph.carCollider,
    boost: CONFIG.boostTank,
    car: {
      grounded: true,
      jumpsLeft: 2,
      jumpCooldown: 0,
      flipping: 0,
      yaw: 0,                    // radians, 0 = facing -z (upfield)
      speed: 0,
      boosting: false,
      vy: 0,
    },
  };
}

// Forward is -z at yaw 0 (the car drives upfield toward the far goal).
export function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}
export function rightFromYaw(yaw) {
  return { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
}

function groundDistance(ph, pos, collider) {
  const { world, RAPIER } = ph;
  const ray = new RAPIER.Ray({ x: pos.x, y: pos.y, z: pos.z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 1.5, true, undefined, undefined, collider);
  return hit ? hit.timeOfImpact : null;
}

// One physics step of car control. `input` = {throttle, steer, boost, jumpPressed}
export function stepCar(state, carCtl, input, dt) {
  const ph = carCtl.ph;
  const body = carCtl.body;
  const c = carCtl.car;
  const pos = body.translation();
  const vel = body.linvel();

  // ── grounded ─────────────────────────────────────────────────────────────
  const gd = groundDistance(ph, pos, carCtl.collider);
  const wasGrounded = c.grounded;
  c.grounded = gd !== null && gd < 1.32 && vel.y < 4.0;
  if (c.grounded && !wasGrounded) landCar(c);
  if (c.jumpCooldown > 0) c.jumpCooldown = Math.max(0, c.jumpCooldown - dt);
  if (c.flipping > 0) c.flipping = Math.max(0, c.flipping - dt);

  const fwd = forwardFromYaw(c.yaw);
  const right = rightFromYaw(c.yaw);

  // ── steering (direct yaw, scaled by speed so a parked car cannot spin) ───
  const speedNow = Math.hypot(vel.x, vel.z);
  const speedFactor = Math.min(1, speedNow / 5) * (c.grounded ? 1 : 0.5);
  c.steerVis = input.steer;
  if (Math.abs(input.steer) > 0.01) {
    const backwards = vel.x * fwd.x + vel.z * fwd.z < -0.5;
    c.yaw += input.steer * CONFIG.steerRate * speedFactor * (backwards ? -1 : 1) * dt;
  }
  body.setRotation(
    new ph.RAPIER.Quaternion(0, Math.sin(c.yaw / 2), 0, Math.cos(c.yaw / 2)), true);

  // ── boost (DECISION 1) ───────────────────────────────────────────────────
  const thrust = boostTick(state, carCtl, dt, input.boost);
  c.boosting = thrust > 0;

  // ── drive: impulses, NOT velocity writes ─────────────────────────────────
  // Velocity control overwrote the collision response, so the car bulldozed straight
  // through the ball instead of transferring momentum. Impulses keep the hit physical.
  // Ground only, unless boosting (boost also works in the air — that is aerial reach).
  const canDrive = c.grounded || c.boosting;
  if (canDrive && Math.abs(input.throttle) > 0.01) {
    const f = input.throttle >= 0 ? CONFIG.driveForce : CONFIG.reverseForce;
    body.applyImpulse({ x: fwd.x * f * input.throttle * dt, y: 0, z: fwd.z * f * input.throttle * dt }, true);
  }
  if (thrust > 0) {
    body.applyImpulse({ x: fwd.x * thrust * dt, y: 0, z: fwd.z * thrust * dt }, true);
  }

  // lateral grip: the car goes where it points, not where it slid
  if (c.grounded) {
    const v = body.linvel();
    const lateral = v.x * right.x + v.z * right.z;
    body.setLinvel({
      x: v.x - right.x * lateral * CONFIG.gripLateral,
      y: v.y,
      z: v.z - right.z * lateral * CONFIG.gripLateral,
    }, true);
  }

  // speed ceiling
  {
    const v = body.linvel();
    const hs = Math.hypot(v.x, v.z);
    const cap = c.boosting ? CONFIG.boostSpeed : CONFIG.maxSpeed;
    if (hs > cap) {
      const k = cap / hs;
      body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
    }
  }

  // ── jump / double jump (DECISION 2) ──────────────────────────────────────
  if (input.jumpPressed && canJump(c)) {
    const wasFirst = c.jumpsLeft === 2;
    jump(state, c);
    const lv = body.linvel();
    body.setLinvel({ x: lv.x, y: c.vy, z: lv.z }, true);
    if (!wasFirst) {
      // a flip throws the car forward and rolls it — this is how you hit a high ball
      const lv2 = body.linvel();
      body.setLinvel({ x: lv2.x + fwd.x * 4.5, y: lv2.y, z: lv2.z + fwd.z * 4.5 }, true);
      body.setAngvel({ x: fwd.z * 9, y: 0, z: -fwd.x * 9 }, true);
    }
  }

  c.speed = Math.hypot(body.linvel().x, body.linvel().z);
  return c;
}
