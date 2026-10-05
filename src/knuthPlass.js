import { INF, isLegalBreak } from './nodes.js';
import { Metrics, adjustmentRatio, lineWidthFn } from './metrics.js';

export const DEFAULTS = Object.freeze({
  tolerance: 2, // largest adjustment ratio accepted in the normal pass (TeX's \tolerance=200 ~ r=1.26)
  linePenalty: 10, // TeX's \linepenalty: a small cost per line, which favours fewer lines
  flaggedDemerits: 3000, // extra cost for two consecutive lines ending in flagged (hyphen) breaks
  fitnessDemerits: 3000, // extra cost when adjacent lines differ by more than one fitness class
  looseness: 0, // ask for this many more (+) or fewer (-) lines than the optimum, if possible
  emergencyStretch: 0, // background stretch added to every line in a second pass
  lastResort: true, // if nothing else works, allow overfull / very underfull lines rather than fail
});

const OVERFULL_BADNESS = 1e6;
const BADNESS_CAP = 1e5;

/** TeX's badness: roughly 100 r^3, capped so that extremely loose lines remain comparable. */
export function badness(r) {
  if (!Number.isFinite(r)) return BADNESS_CAP;
  return Math.min(100 * Math.abs(r) ** 3, BADNESS_CAP);
}

/** Fitness class: 0 tight, 1 decent, 2 loose, 3 very loose. */
export function fitnessClass(r) {
  if (r < -0.5) return 0;
  if (r <= 0.5) return 1;
  if (r <= 1) return 2;
  return 3;
}

/** Demerits for a single line, given its badness and the penalty at its breakpoint. */
export function lineDemerits(bad, cost, linePenalty) {
  const base = (linePenalty + bad) ** 2;
  if (cost >= 0) return base + cost * cost;
  if (cost > -INF) return base - cost * cost;
  return base;
}

/**
 * Optimal paragraph breaking (Knuth & Plass 1981).
 *
 * The algorithm is a shortest path search over feasible breakpoints. It sweeps the node list once,
 * keeping a set of "active" breakpoints: earlier breaks from which a feasible line could still end
 * at the current position. For each legal breakpoint b and each active node a it evaluates the
 * line a..b, and records, per fitness class, the cheapest way to reach b. Active nodes are retired
 * as soon as the line from them is overfull (it can only get worse) or a forced break passes.
 *
 * @param {Array} nodes box/glue/penalty list; must end with a forced break
 * @param {number|number[]|function} lineWidths width of every line, a per line array (the last
 *   entry repeats), or a function of the zero based line index
 * @param {object} options see DEFAULTS
 * @returns {{breaks: Array, demerits: number, pass: string}}
 */
export function breakLines(nodes, lineWidths, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!nodes.length || nodes[nodes.length - 1].type !== 'penalty' || nodes[nodes.length - 1].penalty > -INF) {
    throw new Error('A paragraph must end with a forced break: penalty(0, -INF)');
  }
  const widthOf = lineWidthFn(lineWidths);
  const metrics = new Metrics(nodes);
  // With variable line widths (or looseness), two breaks at the same position but on different
  // line numbers are not interchangeable, so the search state must include the line number.
  const byLine = typeof lineWidths !== 'number' || opts.looseness !== 0;

  const passes = [{ name: 'normal', tolerance: opts.tolerance, extra: 0, overfull: false }];
  if (opts.emergencyStretch > 0) {
    passes.push({ name: 'emergency', tolerance: opts.tolerance, extra: opts.emergencyStretch, overfull: false });
  }
  if (opts.lastResort) {
    passes.push({ name: 'last-resort', tolerance: Infinity, extra: opts.emergencyStretch, overfull: true });
  }

  for (const pass of passes) {
    const result = runPass(nodes, metrics, widthOf, byLine, opts, pass);
    if (result) return { ...result, pass: pass.name };
  }
  throw new Error('No feasible set of breakpoints; raise tolerance or enable lastResort');
}

function runPass(nodes, metrics, widthOf, byLine, opts, pass) {
  const n = nodes.length;
  let active = [{ position: -1, start: 0, line: 0, fitness: 1, total: 0, ratio: 0, flagged: false, prev: null }];

  for (let b = 0; b < n; b++) {
    if (!isLegalBreak(nodes, b)) continue;
    const node = nodes[b];
    const cost = node.type === 'penalty' ? node.penalty : 0;
    const flagged = node.type === 'penalty' && !!node.flagged;
    const forced = cost <= -INF;

    const candidates = new Map();
    const survivors = [];

    for (const a of active) {
      // Breakpoints that fall inside the discardable run right after a's break are not real lines.
      if (a.start > b) {
        survivors.push(a);
        continue;
      }
      const target = widthOf(a.line);
      const m = metrics.measure(a.start, b);
      const r = adjustmentRatio(m, target, pass.extra);

      // An active node dies once its line is overfull (adding material only makes it worse), or
      // when a forced break passes, because no line may span a forced break.
      if (!(r < -1 || forced)) survivors.push(a);

      let bad;
      if (r >= -1 && r <= pass.tolerance) bad = badness(r);
      else if (pass.overfull) bad = r < -1 ? OVERFULL_BADNESS + (m.width - target) : BADNESS_CAP;
      else continue;

      let d = lineDemerits(bad, cost, opts.linePenalty);
      if (flagged && a.flagged) d += opts.flaggedDemerits;
      const fc = fitnessClass(r);
      if (Math.abs(fc - a.fitness) > 1) d += opts.fitnessDemerits;
      const total = a.total + d;

      const key = byLine ? (a.line + 1) * 4 + fc : fc;
      const best = candidates.get(key);
      if (!best || total < best.total) {
        candidates.set(key, { position: b, start: -1, line: a.line + 1, fitness: fc, total, ratio: r, flagged, prev: a, overfull: r < -1 });
      }
    }

    for (const c of candidates.values()) {
      c.start = metrics.lineStart(b);
      survivors.push(c);
    }
    active = survivors;
    if (active.length === 0) return null;
  }

  // Every surviving node now ends at the final forced break.
  let best = active[0];
  for (const a of active) if (a.total < best.total) best = a;
  if (opts.looseness !== 0) {
    const want = best.line + opts.looseness;
    for (const a of active) {
      const da = Math.abs(a.line - want);
      const db = Math.abs(best.line - want);
      if (da < db || (da === db && a.total < best.total)) best = a;
    }
  }

  const breaks = [];
  for (let a = best; a.prev; a = a.prev) {
    breaks.push({ position: a.position, line: a.line - 1, ratio: a.ratio, fitness: a.fitness, overfull: !!a.overfull });
  }
  breaks.reverse();
  return { breaks, demerits: best.total };
}
