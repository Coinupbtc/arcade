/* Orbit Putt — the numbers. Every tuning value and every hole lives here.
 * UMD: node (solver + acceptance test) and the browser read the SAME file.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OP_C = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // The hole is designed in this box; the renderer fits it to the canvas with one uniform scale.
  var FIELD = { w: 1000, h: 1500 };

  var PHYS = {
    FIELD: FIELD,
    BALL_R: 10,
    MAX_SPEED: 1280,        // u/s at power 1
    MIN_SPEED: 130,         // u/s at power ~0.04
    MAX_PULL: 230,          // u of drag = full power (touch/mouse slingshot)
    CHARGE_TIME: 0.95,      // s of held Space/A to reach full power
    DRAG: 0.55,             // 1/s exponential rolling drag
    GRAV_CAP: 1500,         // u/s^2, so nothing slingshots to infinity
    PLANET_REST: 0.45,      // planet surface bounce
    ASTEROID_REST: 0.6,     // design: asteroids bounce at ~0.6
    COMET_REST: 0.9,
    STOP_SPEED: 13,         // u/s below which the ball is "at rest"
    STOP_TIME: 0.28,        // s it must stay slow
    CUP_R: 27,
    CAPTURE_SPEED: 300,     // u/s — faster than this lips out and slings away
    LIP_BOOST: 1.12,
    BH_PULL: 900,           // u/s^2 at the black hole centre, falls to 0 at its ring
    SUB: 1 / 120,           // fixed physics step (deterministic, no tunnelling)
    FLIGHT_MAX: 24          // s; a ball that never settles is called at rest
  };

  // One strong palette: 5 accents + 2 neutrals.
  var PAL = {
    ink: "#04070f",
    deep: "#0a1024",
    ice: "#5fe3d0",
    coral: "#ff6b6b",
    gold: "#ffc65c",
    violet: "#9b6bff",
    bone: "#eaf2ff"
  };

  // kind -> colours used by the renderer
  var KINDS = {
    ice: { a: "#9ffff0", b: "#2fbfb4", c: "#0d5f6b", rim: "#d8fffb" },
    rock: { a: "#ffb0a0", b: "#e0655f", c: "#5c1f28", rim: "#ffd8cf" },
    gas: { a: "#ffe6a8", b: "#e8a23c", c: "#6b3d12", rim: "#fff3cf" }
  };

  /* ------------------------------------------------------------------ holes
   * Each planet: x, y, r (surface), mu (=G*M; a = mu / r^2 inside ring), ring, kind.
   * orbit: { cx, cy, rad, omega, phase } makes a moon that moves on a circle.
   * comet: { a:[x,y], b:[x,y], period, r } ping-pongs between a and b.
   * cup: [x, y]. ball: [x, y].
   */
  var HOLES = [
    {
      name: "FIRST LIGHT",
      par: 2,
      ball: [500, 1290],
      cup: [500, 300],
      planets: [{ x: 742, y: 800, r: 112, mu: 5.6e6, ring: 350, kind: "ice" }],
      asteroids: [],
      blackholes: [],
      comets: [],
      teach: "Straight up misses right. Aim LEFT and let the ice planet bend it back."
    },
    {
      name: "THE HOOK",
      par: 2,
      ball: [300, 1310],
      cup: [712, 268],
      planets: [{ x: 420, y: 790, r: 122, mu: 6.4e6, ring: 380, kind: "rock" }],
      asteroids: [],
      blackholes: [],
      comets: [],
      teach: "The rock planet is between you and the cup. Bend around it."
    },
    {
      name: "TWO TIDES",
      par: 3,
      ball: [500, 1320],
      cup: [772, 300],
      planets: [
        { x: 300, y: 700, r: 100, mu: 4.6e6, ring: 300, kind: "ice" },
        { x: 735, y: 980, r: 92, mu: 3.6e6, ring: 280, kind: "gold" },
        { x: 300, y: 700, r: 40, mu: 1.5e6, ring: 210, kind: "ice",
          orbit: { cx: 300, cy: 700, rad: 210, omega: 0.55, phase: 0.4 } }
      ],
      asteroids: [],
      blackholes: [],
      comets: [],
      teach: "A moon is circling the ice planet. Time your putt."
    },
    {
      name: "BILLIARDS",
      par: 3,
      ball: [770, 1300],
      cup: [286, 250],
      planets: [
        { x: 250, y: 900, r: 112, mu: 4.4e6, ring: 320, kind: "rock" },
        { x: 740, y: 560, r: 96, mu: 4.0e6, ring: 300, kind: "ice" }
      ],
      asteroids: [{ x: 520, y: 800, r: 48, spin: 0.6 }],
      blackholes: [],
      comets: [],
      teach: "Bank off the asteroid. It gives back 60% of the speed."
    },
    {
      name: "EVENT HORIZON",
      par: 4,
      ball: [500, 1330],
      cup: [520, 250],
      planets: [{ x: 262, y: 640, r: 104, mu: 4.8e6, ring: 330, kind: "gold" }],
      asteroids: [],
      blackholes: [{ x: 636, y: 790, core: 32, ring: 150 }],
      comets: [{ a: [60, 1030], b: [940, 1030], period: 7.5, r: 22 }],
      teach: "The black hole eats the straight line. The comet crosses it on a timer."
    },
    {
      name: "SLINGSHOT",
      par: 3,
      ball: [500, 1330],
      cup: [232, 232],
      planets: [
        { x: 762, y: 700, r: 132, mu: 1.05e7, ring: 430, kind: "gold" },
        { x: 205, y: 1010, r: 78, mu: 2.6e6, ring: 240, kind: "ice" }
      ],
      asteroids: [],
      blackholes: [],
      comets: [],
      teach: "Swing wide around the giant for a gravity assist — or take the slow safe line."
    }
  ];

  return { FIELD: FIELD, PHYS: PHYS, PAL: PAL, KINDS: KINDS, HOLES: HOLES };
});
