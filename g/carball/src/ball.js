// CARBALL — the ball: a 1.825 m sphere with a panel texture, a glow, a shadow and a trail.

import * as THREE from '../lib/three.module.js';
import { BALL_RADIUS, BALL_MASS, BALL_RESTITUTION, BALL_DRAG, BALL_FRICTION, COLORS } from './config.js';

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f7fbff';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#5b7692';
  g.lineWidth = 5;
  const s = 32;
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const cx = col * s + (row % 2 ? s / 2 : 0);
      const cy = row * s * 0.86;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i + Math.PI / 6;
        const px = cx + Math.cos(a) * s * 0.52;
        const py = cy + Math.sin(a) * s * 0.52;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  g.fillStyle = '#2f7bff';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(40 + i * 40, 128 + (i % 2 ? 20 : -20), 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(210,240,255,0.95)');
  grd.addColorStop(0.4, 'rgba(120,200,255,0.35)');
  grd.addColorStop(1, 'rgba(80,160,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createBall(scene, world, RAPIER) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, BALL_RADIUS + 0.05, 0)
      .setLinearDamping(BALL_DRAG)
      .setAngularDamping(0.35)
      .setCcdEnabled(true),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setMass(BALL_MASS)
      .setRestitution(BALL_RESTITUTION)
      .setFriction(BALL_FRICTION)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
    new THREE.MeshStandardMaterial({
      map: panelTexture(), color: 0xffffff, roughness: 0.32, metalness: 0.12,
      emissive: 0x7fc4ff, emissiveIntensity: 0.28,
    }),
  );
  scene.add(mesh);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0x9fdcff, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.setScalar(4.4);
  scene.add(glow);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(BALL_RADIUS * 2.6, BALL_RADIUS * 2.6),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.6, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // the ball carries its own light, so it reads against a dark wall
  const light = new THREE.PointLight(0x9fdcff, 38, 20, 2.0);
  scene.add(light);

  // a ring above the ball: a phone-sized marker that stays visible through the far wall
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.055, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthTest: false, blending: THREE.AdditiveBlending }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 20;
  scene.add(marker);

  const MAX = 24;
  const pos = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0x9fdcff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  trail.frustumCulled = false;
  scene.add(trail);
  const trailPts = [];

  return { body, collider, mesh, glow, shadow, light, marker, trail, trailPts, MAX };
}

export function updateBallVisual(ball, dt) {
  const t = ball.body.translation();
  const v = ball.body.linvel();
  ball.mesh.position.set(t.x, t.y, t.z);
  // spin is real now (the hit rule never zeroes it): show it
  const w = ball.body.angvel();
  ball.mesh.rotation.x += w.x * dt;
  ball.mesh.rotation.y += w.y * dt;
  ball.mesh.rotation.z += w.z * dt;
  ball.glow.position.set(t.x, t.y, t.z);
  ball.glow.material.opacity = 0.55 + 0.2 * Math.sin(performance.now() * 0.006);
  ball.light.position.set(t.x, t.y + 0.3, t.z);
  ball.marker.position.set(t.x, t.y + 1.55, t.z);
  ball.marker.rotation.z += dt * 1.6;
  ball.marker.material.opacity = 0.38 + 0.18 * Math.sin(performance.now() * 0.004);
  ball.shadow.position.set(t.x, 0.015, t.z);
  const h = Math.max(0, t.y - BALL_RADIUS);
  const k = Math.max(0.35, 1 - h / 14);
  ball.shadow.scale.setScalar(k);
  ball.shadow.material.opacity = 0.55 * k;

  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed > 7) {
    ball.trailPts.push({ x: t.x, y: t.y, z: t.z });
    if (ball.trailPts.length > ball.MAX) ball.trailPts.shift();
  } else if (ball.trailPts.length) {
    ball.trailPts.shift();
  }
  const arr = ball.trail.geometry.attributes.position.array;
  for (let i = 0; i < ball.MAX; i++) {
    const p = ball.trailPts[Math.max(0, ball.trailPts.length - 1 - i)] || { x: t.x, y: t.y, z: t.z };
    arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
  }
  ball.trail.geometry.attributes.position.needsUpdate = true;
  ball.trail.material.opacity = Math.min(0.55, speed / 45);
}
