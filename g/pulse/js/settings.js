// Player settings. Pure data + tiny storage helpers so tests can import them.
export const SPEEDS = [
  { id: 'slow', label: 'slow', approach: 1.9 },
  { id: 'normal', label: 'normal', approach: 1.45 },
  { id: 'fast', label: 'fast', approach: 1.0 },
];

// Tap calibration in ms. Positive means "my taps feel late" — the judge reads the
// tap earlier by that much. iPhone + Bluetooth headphones typically need +80..+140.
export const OFFSETS = [-120, -60, 0, 60, 120];

export const DEFAULTS = { speed: 'normal', offset: 0 };

const KEY = 'pulse.settings.v1';

export function approachFor(speedId) {
  const s = SPEEDS.find((x) => x.id === speedId) || SPEEDS[1];
  return s.approach;
}

export function cycle(list, value) {
  const i = list.indexOf(value);
  return list[(i + 1) % list.length];
}

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      speed: SPEEDS.some((s) => s.id === raw.speed) ? raw.speed : DEFAULTS.speed,
      offset: OFFSETS.includes(raw.offset) ? raw.offset : DEFAULTS.offset,
    };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

export function save(settings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* private mode */ }
}
