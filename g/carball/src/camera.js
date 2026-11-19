// CARBALL — the chase camera. Ball cam sits behind the car's nose and looks at the ball,
// the way the reference game's default camera does. It lags with a spring, not a snap.

import * as THREE from '../lib/three.module.js';
import {
  CAM_BACK, CAM_UP, CAM_LOOK_AHEAD, CAM_FOV, CAM_FOV_FAST,
  PITCH_HALF_W, PITCH_HALF_L, WALL_H, GOAL_DEPTH, MAX_BOOST_SPEED,
} from './config.js';

const pos = new THREE.Vector3();
const look = new THREE.Vector3();
let started = false;

export function resetCamera(car, ball, back = CAM_BACK, up = CAM_UP) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  pos.set(car.x - fx * back, car.y + up, car.z - fz * back);
  look.set(ball.x, ball.y, ball.z);
  started = true;
}

export function updateCamera(camera, car, ball, dt, opts) {
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const portrait = camera.aspect < 0.85;
  const back = CAM_BACK * (portrait ? 1.45 : 1.0);
  const up = CAM_UP * (portrait ? 1.30 : 1.0);

  // goal celebration: a wide, outside-the-net shot instead of following the car
  // into the goal frame (which filled the screen with the net and the wall)
  if (opts.goalCam) {
    const sign = ball.z >= 0 ? 1 : -1;
    const gx = ball.x * 0.35;
    const gy = 6.5;
    const gz = Math.max(-PITCH_HALF_L + 3, Math.min(PITCH_HALF_L - 3, ball.z - sign * 15));
    if (!started) { pos.set(gx, gy, gz); started = true; }
    // cut to the wide shot when the chase camera is far away, then ease
    if (Math.hypot(pos.x - gx, pos.z - gz) > 12) pos.set(gx, gy, gz);
    const k = 1 - Math.exp(-6.0 * dt);
    pos.x += (gx - pos.x) * k;
    pos.y += (gy - pos.y) * k;
    pos.z += (gz - pos.z) * k;
    camera.position.copy(pos);
    camera.lookAt(ball.x, Math.min(2.4, Math.max(1.0, ball.y)), ball.z);
    return;
  }

  let ax = fx, az = fz;                      // anchor direction: behind the nose, always.
  // Ball cam only changes where the camera LOOKS. Anchoring on the far side of the
  // ball put the car behind the camera whenever the ball got behind the car, so the
  // player lost the car entirely; the camera now stays behind the car in both modes.
  const desiredX = car.x - ax * back;
  const desiredY = car.y + up;
  const desiredZ = car.z - az * back;

  if (!started) resetCamera(car, ball, back, up);

  // keep the camera inside the arena; if the car is against a wall, lift the camera
  // so it looks down over the car instead of sitting on its roof
  // never inside the net: a camera behind the goal line filled the screen with the net and
  // the wall while the car sat in the goal mouth (playtest [stuck-state])
  const limW = PITCH_HALF_W - 0.8, limL = PITCH_HALF_L - 1.2;
  const cx = Math.max(-limW, Math.min(limW, desiredX));
  const cz = Math.max(-limL, Math.min(limL, desiredZ));
  const push = Math.hypot(desiredX - cx, desiredZ - cz);
  const cy = desiredY + Math.min(3.2, push * 0.75);

  const k = Math.max(0, Math.min(1, 1 - Math.exp(-8.5 * dt)));
  pos.x += (cx - pos.x) * k;
  pos.y += (cy - pos.y) * k;
  pos.z += (cz - pos.z) * k;

  pos.y = Math.max(0.7, Math.min(WALL_H - 0.8, pos.y));

  let tx, ty, tz;
  if (opts.ballCam) {
    // Look part-way to the ball, then clamp the look yaw to a narrow cone around the
    // car. On a portrait phone the horizontal half-FOV is only ~18 degrees, so an
    // unclamped ball look swings the car out of the frame on a turn. The ball may sit
    // off-centre; the ring still marks it.
    const dx = ball.x - car.x, dz = ball.z - car.z;
    const d = Math.hypot(dx, dz);
    const t = Math.max(0.35, Math.min(0.85, 12 / Math.max(d, 1)));
    tx = car.x + dx * t;
    tz = car.z + dz * t;
    ty = car.y + 0.9 + (ball.y - car.y - 0.9) * t;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const carYaw = Math.atan2(car.x - pos.x, car.z - pos.z);
    const lookYaw = Math.atan2(tx - pos.x, tz - pos.z);
    const dy = Math.max(-0.22, Math.min(0.22, wrap(lookYaw - carYaw)));
    const yaw = carYaw + dy;
    const dist = Math.hypot(tx - pos.x, tz - pos.z);
    tx = pos.x + Math.sin(yaw) * dist;
    tz = pos.z + Math.cos(yaw) * dist;
  } else {
    tx = car.x + fx * CAM_LOOK_AHEAD; ty = car.y + 0.9; tz = car.z + fz * CAM_LOOK_AHEAD;
  }
  const lk = 1 - Math.exp(-11 * dt);
  look.x += (tx - look.x) * lk;
  look.y += (ty - look.y) * lk;
  look.z += (tz - look.z) * lk;

  camera.position.copy(pos);
  if (opts.shake > 0.001) {
    const s = opts.shake;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s * 0.7;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(look);

  const speed = Math.hypot(car.vx, car.vz);
  const targetFov = CAM_FOV + (speed / MAX_BOOST_SPEED) * (CAM_FOV_FAST - CAM_FOV);
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-4 * dt));
  camera.updateProjectionMatrix();
}
