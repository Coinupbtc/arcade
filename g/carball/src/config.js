// CARBALL — every size, speed and time in one place.
// Source of truth: ~/Documents/projects/_shared/game-teardowns/rocket-league-2015
// 1 uu (Unreal unit) = 1 cm, so every teardown number below is uu / 100 = metres.

export const UU = 0.01;

// --- ball (teardown: radius 91.25 uu, mass 30, restitution 60%, max speed 6000 uu/s, max spin 6 rad/s)
export const BALL_RADIUS = 91.25 * UU;          // 0.9125 m
export const BALL_MASS = 30;
export const BALL_RESTITUTION = 0.6;
export const BALL_MAX_SPEED = 6000 * UU;        // 60 m/s
export const BALL_MAX_SPIN = 6.0;               // rad/s
export const BALL_DRAG = 0.030562030038766;     // linear damping per second
export const BALL_FRICTION = 0.45;

// --- car (hitbox 118.01 x 84.2 x 36.16 uu, mass 180)
export const CAR_LENGTH = 118.01 * UU;          // 1.1801 m (along +z)
export const CAR_WIDTH = 84.2 * UU;             // 0.842 m (along x)
export const CAR_HEIGHT = 36.16 * UU;           // 0.3616 m
export const CAR_MASS = 180;
export const CAR_REST_Y = 0.18;                 // body centre height at rest (wheels touch floor)
export const MAX_SPEED = 1410 * UU;             // 14.1 m/s
export const MAX_BOOST_SPEED = 2300 * UU;       // 23 m/s
export const SUPERSONIC = 2200 * UU;            // 22 m/s
// Drive torque curve (teardown: source-physics.txt:76 "at -1,400 0.1 at 0 1 at 1,400 0.1"):
// torque is full at rest and a tenth at top speed, so the car pulls hard off the line and
// tapers. With the base below it reaches 14.1 m/s in 2.24 s, the real ramp.
export const THROTTLE_ACCEL = 16.1;             // m/s^2 at zero speed (curve applies on top)
export function driveTorque(v) {
  const a = Math.min(Math.abs(v), MAX_SPEED);
  return 1 - 0.9 * (a / MAX_SPEED);
}
// Turning (teardown: rlbot-useful-game-values.txt:502-516). curvature(v) is the real game's
// measured turn curvature in 1/uu; the yaw rate is v * curvature, so the radius grows with
// speed and a 90 degree turn takes 0.775 s at any speed.
export function turnCurvature(v) {
  const u = Math.abs(v) * 100;                  // m/s -> uu/s
  let k;
  if (u < 500) k = 0.006900 - 5.84e-6 * u;
  else if (u < 1000) k = 0.005610 - 3.26e-6 * u;
  else if (u < 1500) k = 0.004300 - 1.95e-6 * u;
  else if (u < 1750) k = 0.003025 - 1.1e-6 * u;
  else if (u < 2500) k = 0.001800 - 4e-7 * u;
  else k = 0;
  return Math.max(0, k) * 100;                  // 1/uu -> 1/m
}
export const TURNING_TOP_SPEED = 1234 * UU;     // 12.34 m/s while turning at full lock
export const REVERSE_MAX = 6.0;
export const BRAKE = 3500 * UU;                 // 35 m/s^2
export const COAST = 525 * UU;                  // 5.25 m/s^2
export const STEER_RATE = 2.03;                 // rad/s fallback at low speed (90 deg in 0.775 s)
export const AIR_STEER_RATE = 1.35;             // rad/s while airborne
export const GRIP = 9.0;                        // lateral velocity decay per second
export const SLIDE_GRIP = 2.0;
export const AIR_GRIP = 1.2;

// --- ball vs car hit (teardown: ball "Car interaction" block, source-physics.txt:43-52)
export const HIT_MAX_REL_SPEED = 4600 * UU;     // 46 m/s: nothing above this is transferred
export const HIT_PUSH_FORWARD = 0.65;           // forward axis share of the hit
export const HIT_PUSH_Z = 0.35;                 // vertical axis share of the hit
export const HIT_FRICTION = 2.0;                // contact friction: glancing hits add spin
// push factor curve: relative speed (m/s) -> share of the momentum solution that transfers
export const HIT_PUSH_CURVE = [
  [0, 0.65], [5, 0.65], [14, 0.6], [23, 0.55], [46, 0.3],
];

// --- jump / flip (build choice tuned to gravity 6.5; the double jump is the real +2.92 m/s)
export const JUMP_SPEED = 5.6;                  // m/s -> ~2.4 m apex
export const DOUBLE_JUMP_SPEED = 291.667 * UU;  // 2.92 m/s (teardown: rlbot-useful-game-values.txt:473)
export const FLIP_FORWARD = 6.5;                // m/s added along the nose on a directional flip
export const FLIP_UP = 2.4;

// --- boost (tank 100, drain 33.3/s, ground accel 991.666 uu/s^2, air 1058.333 uu/s^2)
export const BOOST_MAX = 100;
export const BOOST_DRAIN = 33.3;
export const BOOST_ACCEL_GROUND = 991.666 * UU; // 9.91666 m/s^2
export const BOOST_ACCEL_AIR = 1058.333 * UU;   // 10.58333 m/s^2
export const BOOST_AIR_LIFT = 0.45;             // build choice: nose-up share of air boost
export const SMALL_PAD_BOOST = 12;
export const BIG_PAD_BOOST = 100;
export const SMALL_PAD_RESPAWN = 4;
export const BIG_PAD_RESPAWN = 10;

// --- arena (side walls x=±4096, back walls y=±5120, ceiling 2048, goal 892.755 / 642.775 / 880)
export const PITCH_HALF_W = 4096 * UU;          // 40.96 m
export const PITCH_HALF_L = 5120 * UU;          // 51.2 m
export const WALL_H = 2048 * UU;                // 20.48 m
export const GOAL_HALF_W = 892.755 * UU;        // 8.92755 m -> 17.855 m mouth
export const GOAL_H = 642.775 * UU;             // 6.42775 m
export const GOAL_DEPTH = 880 * UU;             // 8.8 m
export const WALL_T = 0.5;                      // wall thickness (physics)

// --- match (build choice: 3 minutes, not 5, for a phone session)
export const MATCH_TIME = 120;                  // build choice: a 2-minute phone match
export const OVERTIME_TIME = 60;
export const TICK = 1 / 120;                    // physics tick from the teardown
export const KICKOFF_PAUSE = 1.4;               // seconds frozen after a goal

// --- camera (build choice; teardown only fixes the type and the ball-cam rule)
export const CAM_BACK = 3.15;
export const CAM_UP = 1.45;
export const CAM_LOOK_AHEAD = 8.0;
export const CAM_FOV = 68;
export const CAM_FOV_FAST = 80;

// --- gravity (650 uu/s^2)
export const GRAVITY = 650 * UU;                // 6.5 m/s^2

// Big boost pads, teardown coordinates in uu (x, y) -> metres (x, z)
export const BIG_PADS = [
  [-3584, 0], [3584, 0],
  [-3072, -4096], [3072, -4096],
  [-3072, 4096], [3072, 4096],
].map(([x, z]) => [x * UU, z * UU]);

// 28 small boost pads, teardown coordinates in uu
export const SMALL_PADS = [
  [0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816],
  [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300], [-2048, -1036], [0, -1024],
  [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024], [2048, 1036],
  [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484], [0, 2816], [-940, 3308],
  [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240],
].map(([x, z]) => [x * UU, z * UU]);

export const COLORS = {
  blue: 0x2f7bff,
  blueGlow: 0x59d8ff,
  orange: 0xff7a1a,
  orangeGlow: 0xffb347,
  floor: 0x0a1422,
  wall: 0x0d1a2c,
  white: 0xeaf4ff,
  ball: 0xf4f8ff,
};
