// Judging is pure: no DOM, no audio. The pointer handler and the tests call the
// SAME tap()/tick()/release() functions, so a passing test is a passing game.

export const WINDOWS = { perfect: 0.045, good: 0.09, ok: 0.16 };
export const POINTS = { perfect: 300, good: 200, ok: 100, miss: 0 };
export const TAIL_BONUS = 150;   // a held tail is worth a note and a half
export const TAIL_ACC = 300;     // and it counts as one perfect note in accuracy
// The clear line. Finishing the song is not enough: you have to play it. 60% is
// the bottom of a C, so a run of ok-only taps (33%) and a spammer both fail.
export const CLEAR_ACC = 60;

export function gradeForOffset(dt) {
  const a = Math.abs(dt);
  if (a <= WINDOWS.perfect) return 'perfect';
  if (a <= WINDOWS.good) return 'good';
  if (a <= WINDOWS.ok) return 'ok';
  return null;
}

export function multiplier(combo) {
  if (combo >= 100) return 1.5;
  if (combo >= 50) return 1.4;
  if (combo >= 25) return 1.2;
  if (combo >= 10) return 1.1;
  return 1.0;
}

export function letterFor(accuracy) {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 88) return 'A';
  if (accuracy >= 75) return 'B';
  if (accuracy >= 60) return 'C';
  return 'D';
}

export class Judge {
  constructor(notes) {
    this.notes = notes.map((n) => ({
      t: n.t, lane: n.lane, dur: n.dur || 0, deg: n.deg,
      judged: null, dt: null, holdActive: false, tailDone: false,
    }));
    this.lanes = [[], [], [], []];
    this.notes.forEach((n, i) => { if (n.lane >= 0 && n.lane < 4) this.lanes[n.lane].push(i); });
    this.cursor = [0, 0, 0, 0];

    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
    this.tails = { hit: 0, missed: 0 };
    this.basePoints = 0;
    this.holdCount = this.notes.filter((n) => n.dur > 0).length;
    this.results = []; // for the renderer's judgement text
  }

  /** Nearest unjudged note in `lane` inside the ok window. */
  nearest(lane, time) {
    if (lane < 0 || lane > 3) return null;
    const idx = this.lanes[lane];
    let best = null;
    let bestDt = Infinity;
    for (let k = this.cursor[lane]; k < idx.length; k++) {
      const n = this.notes[idx[k]];
      if (n.judged || n.tailDone) continue;
      const dt = time - n.t;
      if (dt > WINDOWS.ok) { this.cursor[lane] = Math.max(this.cursor[lane], k); continue; }
      if (dt < -WINDOWS.ok) break;
      if (Math.abs(dt) < Math.abs(bestDt)) { best = n; bestDt = dt; }
    }
    return best ? { note: best, dt: bestDt } : null;
  }

  /** Player pressed a lane. Returns a result or null when there was nothing there. */
  tap(lane, time) {
    const found = this.nearest(lane, time);
    if (!found) return null;
    const { note, dt } = found;
    const grade = gradeForOffset(dt);
    if (!grade) return null;

    note.judged = grade;
    note.dt = dt;
    this.counts[grade] += 1;
    this.basePoints += POINTS[grade];
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = Math.round(POINTS[grade] * multiplier(this.combo));
    this.score += gained;

    if (note.dur > 0) note.holdActive = true;

    const res = { grade, dt, gained, lane, note };
    this.results.push(res);
    return res;
  }

  /** Called every frame: expires passed notes and closes hold tails. */
  tick(time, heldLanes = new Set()) {
    const out = { misses: [], tails: [] };

    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (!n.judged && time > n.t + WINDOWS.ok) {
        n.judged = 'miss';
        this.counts.miss += 1;
        this.combo = 0;
        const res = { grade: 'miss', dt: time - n.t, gained: 0, lane: n.lane, note: n };
        this.results.push(res);
        out.misses.push(res);
      }
    }

    for (const n of this.notes) {
      if (!n.holdActive || n.tailDone) continue;
      const tailDue = n.t + n.dur;
      if (time >= tailDue) {
        n.tailDone = true;
        n.holdActive = false;
        const held = heldLanes.has(n.lane);
        if (held) {
          this.tails.hit += 1;
          this.basePoints += TAIL_ACC;
          this.score += Math.round(TAIL_BONUS * multiplier(this.combo));
          out.tails.push({ ok: true, lane: n.lane, note: n });
        } else {
          this.tails.missed += 1;
          this.combo = 0;
          this.counts.miss += 1;
          out.tails.push({ ok: false, lane: n.lane, note: n });
        }
      }
    }
    return out;
  }

  /** Player lifted a finger. An early lift kills the tail. */
  release(lane, time) {
    for (const n of this.notes) {
      if (!n.holdActive || n.tailDone || n.lane !== lane) continue;
      const tailDue = n.t + n.dur;
      if (time < tailDue - 0.12) {
        n.tailDone = true;
        n.holdActive = false;
        this.tails.missed += 1;
        this.counts.miss += 1;
        this.combo = 0;
        return { ok: false, lane, note: n };
      }
    }
    return null;
  }

  /** Notes still in play (renderer). */
  active(fromTime, toTime) {
    return this.notes.filter((n) => !n.judged && n.t >= fromTime && n.t <= toTime);
  }

  get accuracy() {
    const total = (this.notes.length + this.holdCount) * TAIL_ACC;
    return total ? (this.basePoints / total) * 100 : 100;
  }

  /** Accuracy over notes judged so far — the HUD number, not the final one. */
  get liveAccuracy() {
    const judged = this.judgedCount + this.tails.hit;
    return judged ? (this.basePoints / (judged * TAIL_ACC)) * 100 : 100;
  }

  get judgedCount() {
    const c = this.counts;
    return c.perfect + c.good + c.ok + c.miss;
  }

  summary() {
    const acc = this.accuracy;
    return {
      score: this.score,
      accuracy: acc,
      grade: letterFor(acc),
      bestCombo: this.bestCombo,
      counts: { ...this.counts },
      tails: { ...this.tails },
      cleared: acc >= CLEAR_ACC,
      clearLine: CLEAR_ACC,
      total: this.notes.length,
      judged: this.judgedCount,
    };
  }
}

/**
 * Run a whole chart with a list of {lane, time, offset} taps and an optional
 * "released" set of lanes. Returns the summary. Used by tests and by the
 * in-browser proof runner (same code path).
 */
export function simulate(notes, taps, opts = {}) {
  const judge = new Judge(notes);
  const sorted = [...taps].sort((a, b) => a.time - b.time);
  const held = new Set();
  const end = opts.end ?? (notes.length ? notes[notes.length - 1].t + 2 : 2);
  let i = 0;
  const dt = 0.02;
  const released = opts.released ?? [];

  for (let t = 0; t <= end; t += dt) {
    while (i < sorted.length && sorted[i].time <= t) {
      const tap = sorted[i++];
      const res = judge.tap(tap.lane, tap.time + (tap.offset || 0));
      // Hold the lane only if the note we actually judged was a hold.
      if (res && res.note.dur > 0) held.add(res.lane);
    }
    for (const r of released) {
      if (Math.abs(t - r.time) < dt) { judge.release(r.lane, r.time); held.delete(r.lane); }
    }
    judge.tick(t, held);
  }
  return judge.summary();
}
