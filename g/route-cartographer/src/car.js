// car.js - arcade driving physics. DOM-free: the tests call step() directly,
// and so does the touch/key handler. One code path, no shortcuts.

import { project, pointAt, curvatureAhead } from './route.js';

export const MODES = {
  car: {
    label: 'Car',
    vmax: 780,        // world units per second
    accel: 430,
    brake: 760,
    coast: 190,
    steer: 2.55,      // rad/s at full grip
    offroadMax: 235,
    offroadDrag: 820,
    grip: 0.68,       // how much top speed costs you steering authority
  },
};

export const CP_RADIUS = 260;
export const OFFROAD_FAIL_SECONDS = 9;

export function createCar(route) {
  const a = route.pts[0], b = route.pts[1];
  const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return {
    x: a[0],
    y: a[1],
    heading,
    speed: 0,
    s: 0,
    offroad: false,
    scraping: false,
    offroadTime: 0,
    nextCp: 0,
    cpTaken: 0,
    finished: false,
    failed: false,
    failReason: '',
    time: 0,
    lateral: 0,
    topSpeed: 0,
  };
}

// input: { throttle: 0..1, brake: 0..1, steer: -1..1 }
// returns the events this step caused
export function step(car, route, input, dt, mode = MODES.car) {
  const ev = { cp: false, offroadChanged: false, finished: false };

  const throttle = Math.max(0, Math.min(1, input.throttle || 0));
  const brake = Math.max(0, Math.min(1, input.brake || 0));
  const steer = Math.max(-1, Math.min(1, input.steer || 0));

  const before = project(route, car.x, car.y);
  const onRoad = before.d <= route.halfWidth - 40;
  // scraping the edge costs speed. Without this, holding GAS through every bend
  // was faster than braking and the brake was a trap.
  const edge = route.halfWidth - 100;
  const scraping = onRoad && before.d > edge;
  const cap = onRoad ? (scraping ? mode.vmax * 0.55 : mode.vmax) : mode.offroadMax;
  car.scraping = scraping;

  if (brake > 0) {
    car.speed = Math.max(0, car.speed - mode.brake * brake * dt);
  } else if (throttle > 0) {
    car.speed = Math.min(cap, car.speed + mode.accel * throttle * dt);
  } else {
    car.speed = Math.max(0, car.speed - mode.coast * dt);
  }
  if (!onRoad && car.speed > mode.offroadMax) {
    car.speed = Math.max(mode.offroadMax, car.speed - mode.offroadDrag * dt);
  } else if (scraping && car.speed > cap) {
    car.speed = Math.max(cap, car.speed - mode.offroadDrag * dt);
  }
  car.speed = Math.min(car.speed, cap);

  // steering authority falls off with speed, and you cannot turn while stopped
  const authority = Math.min(1, car.speed / 170) * (1 - mode.grip * (car.speed / mode.vmax));
  car.heading += steer * mode.steer * authority * dt;

  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;

  const after = project(route, car.x, car.y);
  car.s = after.s;
  car.lateral = after.d;
  const offNow = after.d > route.halfWidth - 40;
  if (offNow !== car.offroad) ev.offroadChanged = true;
  car.offroad = offNow;

  if (offNow) {
    car.offroadTime += dt;
    if (car.offroadTime >= OFFROAD_FAIL_SECONDS) {
      car.failed = true;
      car.failReason = 'You left the route';
    }
  } else {
    car.offroadTime = Math.max(0, car.offroadTime - dt * 0.6);
  }

  car.topSpeed = Math.max(car.topSpeed, car.speed);
  car.time += dt;

  // checkpoints in strict order - skipping one does not count
  const cps = route.checkpoints;
  if (car.nextCp < cps.length) {
    const cp = cps[car.nextCp];
    const d = Math.hypot(car.x - cp.p[0], car.y - cp.p[1]);
    if (d <= CP_RADIUS) {
      car.nextCp++;
      car.cpTaken++;
      ev.cp = true;
      if (car.nextCp >= cps.length) {
        car.finished = true;
        ev.finished = true;
      }
    }
  }

  if (!car.failed && car.time > route.par + 12) {
    car.failed = true;
    car.failReason = 'Out of time';
  }

  return ev;
}

// corner-speed advice for the HUD and for the autopilot test
export function suggestedSpeed(route, s, mode = MODES.car) {
  const turn = curvatureAhead(route, s, 420);
  const safe = mode.vmax * Math.max(0.28, 1 - turn / 1.55);
  return safe;
}

// autopilot: drives the same step() the player drives. Used only for tests.
export function autopilotInput(car, route, mode = MODES.car) {
  const look = 240 + car.speed * 0.28;
  const target = pointAt(route, car.s + look);
  let dh = Math.atan2(target.y - car.y, target.x - car.x) - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dh * 2.2));
  const safe = suggestedSpeed(route, car.s, mode);
  const throttle = car.speed < safe ? 1 : 0;
  const brake = car.speed > safe * 1.12 ? 1 : 0;
  return { throttle, brake, steer };
}
