// ROCKET SOCCER — Rapier world: pitch, walls, goals, ball, car.
// The car is a dynamic body driven by an arcade controller; the ball is a dynamic
// sphere. All collisions are real, so momentum transfers through the car.

import RAPIER from '../lib/rapier/rapier.mjs';
import { CONFIG } from './rules.js';

export async function createPhysics() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  world.timestep = 1 / 60;

  const W = CONFIG.pitchHalfW, L = CONFIG.pitchHalfL, H = CONFIG.wallHeight;
  const GW = CONFIG.goalHalfW, GD = CONFIG.goalDepth;

  // ── ground ───────────────────────────────────────────────────────────────
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(W + 2, 0.5, L + 2).setFriction(0.9).setRestitution(0.05),
    ground
  );

  // ── side walls (x = ±W) ──────────────────────────────────────────────────
  for (const sx of [-1, 1]) {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(sx * (W + 0.5), H / 2, 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, H / 2, L + 1).setRestitution(0.55).setFriction(0.4), b);
  }

  // ── end walls (z = ±L), with a goal mouth cut out ────────────────────────
  // left post | goal opening (open) | right post, plus a lintel above the goal.
  for (const sz of [-1, 1]) {
    const zc = sz * (L + 0.5);
    const postW = W - GW;                     // width of each solid segment
    for (const sx of [-1, 1]) {
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
        .setTranslation(sx * (GW + postW / 2), H / 2, zc));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(postW / 2, H / 2, 0.5).setRestitution(0.5), b);
    }
    // lintel above the goal opening
    const lintelH = H - CONFIG.goalHeight;
    if (lintelH > 0.1) {
      const lb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, CONFIG.goalHeight + lintelH / 2, zc));
      world.createCollider(RAPIER.ColliderDesc.cuboid(GW, lintelH / 2, 0.5).setRestitution(0.5), lb);
    }
    // goal box: back wall + side walls behind the line
    const back = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, CONFIG.goalHeight / 2, sz * (L + GD)));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(GW, CONFIG.goalHeight / 2, 0.4).setRestitution(0.3), back);
    for (const sx of [-1, 1]) {
      const sb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
        .setTranslation(sx * (GW + 0.4), CONFIG.goalHeight / 2, sz * (L + GD / 2)));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.4, CONFIG.goalHeight / 2, GD / 2).setRestitution(0.3), sb);
    }
  }

  // ── ceiling, so the ball cannot leave the arena ──────────────────────────
  const ceil = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, H + 0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(W + 1, 0.5, L + 1).setRestitution(0.45), ceil);

  // ── ball ─────────────────────────────────────────────────────────────────
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, CONFIG.ballRadius + CONFIG.ballStartRadius, 0)
      .setLinearDamping(CONFIG.ballAirDrag)
      .setAngularDamping(0.45)
      .setCcdEnabled(true)
  );
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(CONFIG.ballRadius)
      .setRestitution(CONFIG.ballRestitution)
      .setFriction(CONFIG.ballRollFriction)
      .setDensity(CONFIG.ballDensity)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    ballBody
  );

  // ── cars ─────────────────────────────────────────────────────────────────
  // half extents: 1.2 wide, 0.93 tall, 2.56 long  → 0.6 / 0.465 / 1.28
  function makeCar(z) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, CONFIG.carRestY, z)
        .setLinearDamping(0.05)
        .setAngularDamping(2.2)          // we drive rotation ourselves
        .setCcdEnabled(true)
        .setAdditionalMass(CONFIG.carMass)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.42, 0.40, 0.59)      // 0.84 x 0.36 x 1.18 m: teardown car size
        .setFriction(0.0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)   // ground friction must not brake the car
        .setRestitution(0.12)
        .setMass(CONFIG.carMass)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    return { body, collider };
  }
  const you = makeCar(CONFIG.carStartZ);
  const foe = makeCar(-CONFIG.carStartZ);
  const carBody = you.body, carCollider = you.collider;
  const aiBody = foe.body, aiCollider = foe.collider;

  return { world, RAPIER, ballBody, ballCollider,
           carBody, carCollider, aiBody, aiCollider, W, L, H };
}

// Put the ball and car back on their marks for a kickoff.
export function resetKickoff(ph, who = 'you') {
  const { ballBody, carBody, aiBody, RAPIER } = ph;
  const sign = who === 'you' ? 1 : -1;
  ballBody.setTranslation({ x: 0, y: CONFIG.ballRadius + CONFIG.ballStartRadius, z: 0 }, true);
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  carBody.setTranslation({ x: 0, y: CONFIG.carRestY, z: sign * CONFIG.carStartZ }, true);
  carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  carBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  carBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
  aiBody.setTranslation({ x: 0, y: CONFIG.carRestY, z: -sign * CONFIG.carStartZ }, true);
  aiBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  aiBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  aiBody.setRotation(new RAPIER.Quaternion(0, 0, 0, 1), true);
}
