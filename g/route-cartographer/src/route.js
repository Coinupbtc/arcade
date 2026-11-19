// route.js - route geometry. DOM-free so Node can test the same code the game calls.

export function buildRoute(level) {
  const pts = level.points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return {
    pts,
    cum,
    length: cum[cum.length - 1],
    halfWidth: level.roadWidth / 2,
    closed: !!level.closed,
    checkpoints: level.checkpoints,
    landmarks: level.landmarks || [],
    par: level.par,
    world: level.world,
  };
}

// nearest point on the centreline: { d, s, cx, cy, seg }
export function project(route, x, y) {
  let best = { d: Infinity, s: 0, cx: 0, cy: 0, seg: 0 };
  const p = route.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], ay = p[i][1];
    const bx = p[i + 1][0], by = p[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    let u = ((x - ax) * dx + (y - ay) * dy) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = ax + u * dx, cy = ay + u * dy;
    const d = Math.hypot(x - cx, y - cy);
    if (d < best.d) {
      best = { d, s: route.cum[i] + u * Math.sqrt(L2), cx, cy, seg: i };
    }
  }
  return best;
}

// world position + heading at arclength s
export function pointAt(route, s) {
  s = Math.max(0, Math.min(route.length, s));
  const c = route.cum;
  let lo = 0, hi = c.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] <= s) lo = mid; else hi = mid;
  }
  const span = c[hi] - c[lo] || 1;
  const u = (s - c[lo]) / span;
  const a = route.pts[lo], b = route.pts[hi];
  return {
    x: a[0] + (b[0] - a[0]) * u,
    y: a[1] + (b[1] - a[1]) * u,
    heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

// signed curvature over the next `window` units - used for corner-speed advice
export function curvatureAhead(route, s, window = 420) {
  const a = pointAt(route, s);
  const b = pointAt(route, s + window);
  let dh = b.heading - a.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return Math.abs(dh);
}

export function progress(route, s) {
  return Math.max(0, Math.min(1, s / route.length));
}
