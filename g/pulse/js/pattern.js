// Pattern generator: ONE event list feeds both the synth and the chart.
// If a note is audible it is also a note you can hit, at the same timestamp.
//
// A track is a recipe — scale, chord walk, groove feel, lead style, drum kit, bass
// style, hold bias — so eight tracks are eight pieces, not eight tempos.
import { mulberry32 } from './rng.js';

export const LANES = 4;

export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

// kept for callers that imported the old constant
export const SCALE = SCALES.minorPentatonic;

export const TRACKS = [
  {
    id: 'low-tide', name: 'low tide', blurb: '84 bpm · aeolian · drift',
    tier: 'drift', bpm: 84, bars: 28, seed: 4404, root: 98, colour: '#6fd0e8', density: 'light',
    scale: 'aeolian', progression: [0, 5, 3, 7], feel: 'straight',
    lead: 'sparse', drums: 'rim', bass: 'pulse', holdBias: 0.85,
  },
  {
    id: 'night-ferry', name: 'night ferry', blurb: '92 bpm · dorian · 12/8 drift',
    tier: 'drift', bpm: 92, bars: 24, seed: 5505, root: 123.47, colour: '#9d8bff', density: 'light',
    scale: 'dorian', progression: [0, 3, 5, 1], feel: 'triplet',
    lead: 'sparse', drums: 'rim', bass: 'walk', holdBias: 0.8,
  },
  {
    id: 'first-light', name: 'first light', blurb: '96 bpm · minor · gentle',
    tier: 'gentle', bpm: 96, bars: 32, seed: 1101, root: 110, colour: '#3ff0ff', density: 'light',
    scale: 'minorPentatonic', progression: [0, 3, 1, 4], feel: 'straight',
    lead: 'arp', drums: 'half', bass: 'pulse', holdBias: 0.3,
  },
  {
    id: 'glass', name: 'glass', blurb: '104 bpm · aeolian · steady',
    tier: 'steady', bpm: 104, bars: 32, seed: 6606, root: 155.56, colour: '#b8ff8f', density: 'mid',
    scale: 'aeolian', progression: [0, 5, 2, 6], feel: 'straight',
    lead: 'stabs', drums: 'half', bass: 'walk', holdBias: 0.6,
  },
  {
    id: 'undercurrent', name: 'undercurrent', blurb: '112 bpm · minor · moving',
    tier: 'moving', bpm: 112, bars: 32, seed: 2202, root: 146.83, colour: '#ff4fd8', density: 'mid',
    scale: 'minorPentatonic', progression: [0, 2, 4, 1], feel: 'straight',
    lead: 'arp', drums: 'half', bass: 'walk', holdBias: 0.35,
  },
  {
    id: 'salt', name: 'salt', blurb: '118 bpm · dorian · shuffle',
    tier: 'moving', bpm: 118, bars: 32, seed: 7707, root: 130.81, colour: '#ffa24d', density: 'mid',
    scale: 'dorian', progression: [0, 3, 5, 1], feel: 'shuffle',
    lead: 'arp', drums: 'broken', bass: 'offbeat', holdBias: 0.25,
  },
  {
    id: 'overdrive', name: 'overdrive', blurb: '132 bpm · minor · pressure',
    tier: 'pressure', bpm: 132, bars: 32, seed: 3303, root: 164.81, colour: '#ffc24d', density: 'hard',
    scale: 'minorPentatonic', progression: [0, 3, 1, 4], feel: 'straight',
    lead: 'run', drums: 'four', bass: 'offbeat', holdBias: 0.2,
  },
  {
    id: 'fever', name: 'fever', blurb: '142 bpm · phrygian · pressure',
    tier: 'pressure', bpm: 142, bars: 32, seed: 8808, root: 116.54, colour: '#ff5c6e', density: 'hard',
    scale: 'phrygian', progression: [0, 1, 4, 2], feel: 'straight',
    lead: 'run', drums: 'four', bass: 'pulse', holdBias: 0.15,
  },
];

const MIN_LANE_GAP = 0.115; // seconds — same lane cannot take two notes closer than this

// Each song gets its own light. Lanes + aura; the renderer reads these instead of
// one global palette, so eight tracks do not look like one track in eight tempos.
const PALETTES = {
  'low-tide': { lanes: ['#7fe3d4', '#57c7ff', '#9b8bff', '#d8f5ff'], aura: ['70,170,255', '80,255,220'] },
  'night-ferry': { lanes: ['#b6a8ff', '#6d7bff', '#ffd9a0', '#8fe8ff'], aura: ['120,100,255', '255,190,120'] },
  'first-light': { lanes: ['#3ff0ff', '#ff4fd8', '#ffc24d', '#57ffa8'], aura: ['70,170,255', '190,80,240'] },
  glass: { lanes: ['#c9ffb0', '#8fe6ff', '#ffffff', '#b8c8ff'], aura: ['150,255,200', '120,200,255'] },
  undercurrent: { lanes: ['#ff4fd8', '#8a6bff', '#3ff0ff', '#ff9ecb'], aura: ['200,70,220', '80,120,255'] },
  salt: { lanes: ['#ffa24d', '#ff6b6b', '#ffd98a', '#ffe6c9'], aura: ['255,150,70', '255,90,110'] },
  overdrive: { lanes: ['#ffc24d', '#ff8a3d', '#ffe98a', '#ff5c6e'], aura: ['255,170,60', '255,80,90'] },
  fever: { lanes: ['#ff5c6e', '#ff2d6f', '#ffb03a', '#ff8fa3'], aura: ['255,60,90', '255,140,40'] },
};

for (const t of TRACKS) t.palette = PALETTES[t.id];

export function scaleFreq(root, degree, scaleName = 'minorPentatonic') {
  const scale = SCALES[scaleName] || SCALES.minorPentatonic;
  const oct = Math.floor(degree / scale.length);
  const semi = scale[((degree % scale.length) + scale.length) % scale.length];
  return root * Math.pow(2, oct + semi / 12);
}

function sectionFor(bar) {
  if (bar < 4) return 'intro';
  if (bar < 12) return 'build';
  if (bar < 24) return 'main';
  if (bar < 28) return 'break';
  return 'finale';
}

/**
 * buildSong(track) -> { track, step, beat, bars, duration, events[], notes[], meta }
 * events: audio events {t, type, freq, dur, vel}
 * notes: chart notes {t, lane, dur, deg, accent}
 */
export function buildSong(track) {
  const rng = mulberry32(track.seed);
  const beat = 60 / track.bpm;

  const feel = track.feel || 'straight';
  const stepsPerBar = feel === 'triplet' ? 12 : 16;
  const step = beat / (stepsPerBar / 4);       // 16 steps = 16ths, 12 steps = triplets
  const swing = feel === 'shuffle' ? step * 0.17 : 0;
  const scale = track.scale || 'minorPentatonic';
  const progression = track.progression || [0, 3, 1, 4];
  const holdBias = track.holdBias ?? 0.3;

  const bars = track.bars;
  const duration = bars * stepsPerBar * step;

  const events = [];
  const rawNotes = [];
  const lastLaneAt = [-Infinity, -Infinity, -Infinity, -Infinity];
  let holdLane = -1;
  let holdEnd = -1;

  const at = (bar, s) => bar * stepsPerBar * step + s * step + (feel === 'shuffle' && s % 2 ? swing : 0);
  const push = (t, type, freq, dur, vel = 1) => events.push({ t, type, freq, dur, vel });

  for (let bar = 0; bar < bars; bar++) {
    const section = sectionFor(bar);
    const chord = progression[bar % progression.length];
    const barT = bar * stepsPerBar * step;
    const full = section === 'main' || section === 'finale';
    const half = section === 'build' || section === 'main' || section === 'finale';

    // ---- pad ---------------------------------------------------------------
    for (const d of [0, 2, 4]) {
      push(barT, 'pad', scaleFreq(track.root, chord + d, scale) * 2, 4 * beat,
        section === 'break' ? 0.5 : 0.32);
    }

    // ---- drums -------------------------------------------------------------
    const kit = track.drums || 'half';
    const kickSteps = {
      half: [0, stepsPerBar / 2],
      four: [0, 4, 8, 12].filter((s) => s < stepsPerBar),
      broken: [0, 6, 11].filter((s) => s < stepsPerBar),
      rim: [0],
    }[kit] || [0, stepsPerBar / 2];

    if (half) {
      for (const s of kickSteps) push(at(bar, s), 'kick', 0, 0.22, 1);
      if (full && (kit === 'broken' || kit === 'four') && rng() < 0.4) {
        push(at(bar, stepsPerBar - 2), 'kick', 0, 0.18, 0.75);
      }
      if (kit !== 'rim') {
        for (const s of [4, 12]) push(at(bar, s), 'snare', 0, 0.16, full ? 0.9 : 0.6);
      }
      const hatStep = full ? 1 : 2;
      for (let s = 0; s < stepsPerBar; s += hatStep) {
        push(at(bar, s), 'hat', 0, 0.05, s % 4 === 2 ? 0.5 : 0.26);
      }
    }

    // ---- bass --------------------------------------------------------------
    if (half) {
      const rootFreq = scaleFreq(track.root, chord, scale) / 2;
      const style = track.bass || 'pulse';
      const pattern = style === 'offbeat'
        ? [2, 6, 10, 14].filter((s) => s < stepsPerBar)
        : style === 'walk'
          ? [0, 4, 8, 12].filter((s) => s < stepsPerBar)
          : [0, 2, 4, 6, 8, 10, 12, 14].filter((s) => s < stepsPerBar);
      pattern.forEach((s, i) => {
        if (style === 'pulse' && rng() > 0.9) return;
        const mult = style === 'walk' ? [1, 1.5, 2, 1.5][i % 4] : (rng() < 0.15 ? 2 : 1);
        push(at(bar, s), 'bass', rootFreq * mult, step * 1.6, 0.85);
      });
    }

    // ---- lead: the melody. This is also the chart. -------------------------
    const leadStyle = track.lead || 'arp';
    const leadSteps = section === 'intro' ? Math.round(stepsPerBar / 2)
      : section === 'break' ? Math.round(stepsPerBar / 4)
        : full ? stepsPerBar : Math.round(stepsPerBar / 2);
    const stride = stepsPerBar / leadSteps;

    // Holds are a mechanic, not a garnish: one long bar is decided per qualifying
    // bar (build teaches it, main and finale keep it), on the last quarter of the
    // bar. holdBias is how often it fires — drift tracks teach it, pressure tracks
    // barely use it.
    const holdEligible = (section === 'build' || section === 'main' || section === 'finale') && bar % 2 === 0;
    const barHolds = holdEligible && rng() < holdBias;
    const tailZone = Math.max(2, Math.round(leadSteps / 4));
    let holdTaken = false;

    const base = [chord, chord + 2, chord + 4];
    const choices = leadStyle === 'run'
      ? [...base, chord + 1, chord + 3, chord + 5, chord + 7]
      : leadStyle === 'stabs'
        ? [...base, chord + 6]
        : [...base, chord + 1, chord + 3, chord + 5];

    for (let i = 0; i < leadSteps; i++) {
      const s = Math.round(i * stride);
      const t = at(bar, s);

      if (leadStyle === 'sparse' && rng() < 0.45) continue;
      if (leadStyle === 'stabs' && s % 2 !== 0) continue;
      if (leadStyle === 'run' && !full && rng() < 0.45) continue;
      if (leadStyle === 'arp' && section === 'intro' && rng() < 0.35) continue;
      if (leadStyle === 'arp' && section === 'break' && rng() < 0.55) continue;
      if (full && leadStyle === 'arp' && rng() < 0.12) continue;

      const deg = choices[Math.floor(rng() * choices.length)] + (leadStyle === 'run' && rng() < 0.2 ? 7 : 0);
      const freq = scaleFreq(track.root, deg, scale) * 2;
      const long = leadStyle === 'sparse' ? step * 3
        : leadStyle === 'stabs' ? step * 2.5
          : step * (rng() < 0.15 ? 3 : 1.2);
      push(t, 'lead', freq, long, leadStyle === 'stabs' ? 0.6 : 0.7);

      // Lane follows the pitch, but never drop a note that a free lane can take:
      // rotate to the next free lane instead. Dropping made fast tracks half-empty.
      const preferred = ((deg % LANES) + LANES) % LANES;
      let lane = rng() < 0.28 ? Math.floor(rng() * LANES) : preferred;
      let placed = -1;
      for (let k = 0; k < LANES; k++) {
        const L = (lane + k) % LANES;
        const free = t - lastLaneAt[L] >= MIN_LANE_GAP && !(t < holdEnd && L === holdLane);
        if (free) { placed = L; break; }
      }
      if (placed < 0) continue; // the bar is truly saturated: no legal lane
      lane = placed;

      lastLaneAt[lane] = t;
      const accent = s === 0 || s === 4 || s === 8 || s === 12;
      const wantsHold = barHolds && !holdTaken && i >= leadSteps - tailZone;
      const noteDur = wantsHold ? beat * (leadStyle === 'sparse' ? 2 : 1.5) : 0;
      if (wantsHold) { holdLane = lane; holdEnd = t + noteDur + MIN_LANE_GAP; holdTaken = true; }
      rawNotes.push({ t, lane, dur: noteDur, deg, accent });
    }

    // ---- accents: a readable extra note on even bars -----------------------
    if (full && bar % 2 === 0) {
      const t = barT;
      const lane = (bar / 2) % LANES;
      if (t - lastLaneAt[lane] >= MIN_LANE_GAP && t >= holdEnd) {
        lastLaneAt[lane] = t;
        rawNotes.push({ t, lane, dur: 0, deg: chord, accent: true });
        push(t, 'lead', scaleFreq(track.root, chord + 4, scale) * 2, step * 2, 0.5);
      }
    }
  }

  events.sort((a, b) => a.t - b.t);
  rawNotes.sort((a, b) => a.t - b.t || a.lane - b.lane);

  // The first half bar is a musical lead-in: it plays under the countdown and has
  // no chart notes, so no note is already at the hit line when the song starts.
  // Two beats, not four: the first note now arrives at ~1.4 s of song time, so the
  // core verb starts in the first minute instead of after a 5 s intro.
  const lead = 2 * beat;
  const chart = rawNotes.filter((n) => n.t >= lead);

  return {
    track,
    step, beat, bars, lead, duration, stepsPerBar, feel,
    events,
    notes: chart,
    meta: {
      notes: chart.length,
      holds: chart.filter((n) => n.dur > 0).length,
      events: events.length,
      seconds: Math.round(duration * 10) / 10,
      laneSpread: [0, 1, 2, 3].map((l) => chart.filter((n) => n.lane === l).length),
    },
  };
}

// A perfect machine: every note hit on its exact time.
export function perfectOffsets(notes) {
  return notes.map((n) => ({ lane: n.lane, time: n.t, offset: 0 }));
}

/** Notes per second — the honest pressure number used by tests and the menu. */
export function difficulty(track) {
  const song = buildSong(track);
  return song.notes.length / song.duration;
}
