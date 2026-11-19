// CARBALL — the car: a low-poly rocket wedge, its four wheels, and its Rapier body.
// The body is a real dynamic body; the driver only ever changes velocity, so every
// collision with the ball and the walls is resolved by the physics engine.

import * as THREE from '../lib/three.module.js';
import { BALL_RESTITUTION, CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH, CAR_MASS, CAR_REST_Y, COLORS } from './config.js';

function bodyGeometry() {
  // Side profile in (z, y): a low wedge, 1.18 m long and 0.36 m tall.
  const s = new THREE.Shape();
  s.moveTo(-0.59, 0.00);
  s.lineTo(-0.59, 0.15);
  s.lineTo(-0.40, 0.19);
  s.lineTo(-0.16, 0.21);
  s.lineTo(0.24, 0.21);
  s.lineTo(0.47, 0.13);
  s.lineTo(0.59, 0.08);
  s.lineTo(0.59, 0.00);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.80, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2,
  });
  geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y - 0.18, -(b.min.z + b.max.z) / 2);
  return geo;
}

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.62)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let BLOB = null;

export function createCarVisual(team) {
  const isBlue = team === 'blue';
  const paint = isBlue ? COLORS.blue : COLORS.orange;
  const glow = isBlue ? COLORS.blueGlow : COLORS.orangeGlow;
  const g = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: paint, metalness: 0.22, roughness: 0.34, clearcoat: 1.0, clearcoatRoughness: 0.18,
    emissive: paint, emissiveIntensity: 0.55,
  });
  const body = new THREE.Mesh(bodyGeometry(), bodyMat);
  g.add(body);

  // contact shadow: without it the car floats on a flat-lit floor
  if (!BLOB) BLOB = blobTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 2.1),
    new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.175;
  shadow.renderOrder = 2;
  g.add(shadow);

  // floor ring under the car: on a dark pitch the car silhouette alone is easy to lose,
  // so the player always has a team-coloured marker under their own car
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.92, 40),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.16;
  ring.renderOrder = 15;
  g.add(ring);

  // a white racing stripe down the spine: the silhouette reads at phone size
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.012, 0.92),
    new THREE.MeshStandardMaterial({ color: 0xf2f8ff, roughness: 0.35, metalness: 0.2, emissive: 0xdfefff, emissiveIntensity: 0.35 }),
  );
  stripe.position.set(0, 0.216, 0.06);
  g.add(stripe);

  // cabin / glass
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.19, 0.54),
    new THREE.MeshPhysicalMaterial({ color: 0x0b1a2e, metalness: 0.9, roughness: 0.08, clearcoat: 1 }),
  );
  glass.position.set(0, 0.27, -0.07);
  g.add(glass);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.035, 0.40),
    new THREE.MeshStandardMaterial({ color: 0xdfe9f5, metalness: 0.4, roughness: 0.4 }),
  );
  roof.position.set(0, 0.375, -0.09);
  g.add(roof);

  // spoiler
  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x18222e, metalness: 0.7, roughness: 0.35 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.045, 0.16), spoilerMat);
  wing.position.set(0, 0.30, -0.52);
  g.add(wing);
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.10), spoilerMat);
    strut.position.set(sx * 0.27, 0.23, -0.52);
    g.add(strut);
  }

  // splitter + side skirts
  const trim = new THREE.MeshStandardMaterial({ color: 0x101820, metalness: 0.6, roughness: 0.4 });
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.035, 0.16), trim);
  splitter.position.set(0, -0.155, 0.55);
  g.add(splitter);
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.62), trim);
    skirt.position.set(sx * 0.41, -0.145, 0.0);
    g.add(skirt);
  }

  // lights
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 2.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xff2244, emissiveIntensity: 2.0 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.03), head);
    hl.position.set(sx * 0.25, 0.06, 0.585);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.05, 0.03), tail);
    tl.position.set(sx * 0.24, 0.10, -0.595);
    g.add(tl);
  }

  // wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.85, metalness: 0.1 });
  const rimMat = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 });
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.16, 18), wheelMat);
    tyre.rotation.z = Math.PI / 2;
    w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.17, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
    w.position.set(sx * 0.415, -0.015, sz * 0.36);
    w.userData.front = sz > 0;
    g.add(w);
    wheels.push(w);
  }

  // underglow
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 1.5),
    new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.175;
  g.add(under);

  const carLight = new THREE.PointLight(glow, 10, 5, 2.0);
  carLight.position.set(0, 1.0, 0);
  g.add(carLight);

  // twin boost flames
  const flameMat = new THREE.MeshBasicMaterial({ color: isBlue ? 0x8fe6ff : 0xffc27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.75, 8), flameMat);
    f.rotation.x = Math.PI / 2;
    f.position.set(sx * 0.22, 0.02, -0.78);
    f.visible = false;
    g.add(f);
    flames.push(f);
  }

  g.userData = { wheels, flames, body, glass };
  return g;
}

export function createCarBody(world, RAPIER, x, z, yaw) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, CAR_REST_Y, z)
      .setRotation(quatFromYaw(RAPIER, yaw))
      .setLinearDamping(0.01)
      .setAngularDamping(4.0)
      .setCcdEnabled(true),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_LENGTH / 2)
      .setMass(CAR_MASS)
      .setFriction(0.0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(BALL_RESTITUTION)  // a car is as bouncy as the ball: a stationary keeper
                                          // must deflect a shot, not swallow it (Rapier averages the two)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  return { body, collider };
}

export function quatFromYaw(RAPIER, yaw) {
  return new RAPIER.Quaternion(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
}

// Drive the visual: wheels spin with speed, front wheels steer, flames show on boost,
// and the whole body pitches through a flip.
export function updateCarVisual(vis, car, dt, steer) {
  vis.position.set(car.x, car.y, car.z);
  vis.rotation.set(0, car.yaw, 0);
  if (car.flipT > 0) {
    const p = 1 - car.flipT / 0.34;
    vis.rotation.x = Math.sin(p * Math.PI) * Math.PI * 0.9;
    car.flipT = Math.max(0, car.flipT - dt);
  }
  const spin = (car.speed * dt) / 0.165;
  for (const w of vis.userData.wheels) {
    w.rotation.x += spin * (w.userData.front ? 1 : 1);
    if (w.userData.front) w.rotation.y = -steer * 0.42;
  }
  for (const f of vis.userData.flames) {
    f.visible = car.boosting;
    if (car.boosting) {
      const s = 0.75 + Math.random() * 0.55;
      f.scale.set(0.8 + Math.random() * 0.3, s, 0.8 + Math.random() * 0.3);
    }
  }
}
