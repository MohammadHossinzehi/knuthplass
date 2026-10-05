// Shared helpers for the test suite, including an independent brute force scorer.
import { INF, isLegalBreak } from '../src/nodes.js';

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWords(rand, count) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const words = [];
  for (let i = 0; i < count; i++) {
    const len = 1 + Math.floor(rand() * 9);
    let w = '';
    for (let j = 0; j < len; j++) w += letters[Math.floor(rand() * 26)];
    words.push(w);
  }
  return words.join(' ');
}

/**
 * Score an explicit list of breakpoints from first principles, written independently of
 * src/knuthPlass.js (no prefix sums, no active list). Returns Infinity if any line is infeasible.
 */
export function scoreBreaks(nodes, breaks, widthOf, { tolerance = 2, linePenalty = 10, flaggedDemerits = 3000, fitnessDemerits = 3000 } = {}) {
  let total = 0;
  let prevFitness = 1;
  let prevFlagged = false;
  let start = 0;
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    let w = 0;
    let y = 0;
    let z = 0;
    for (let k = start; k < b; k++) {
      const n = nodes[k];
      if (n.type === 'box') w += n.width;
      if (n.type === 'glue') {
        w += n.width;
        y += n.stretch;
        z += n.shrink;
      }
    }
    const end = nodes[b];
    if (end.type === 'penalty') w += end.width;
    const L = widthOf(i);
    let r;
    if (w < L) r = y > 0 ? (L - w) / y : Infinity;
    else if (w > L) r = z > 0 ? (L - w) / z : -Infinity;
    else r = 0;
    if (r < -1 && r > -1 - 1e-9) r = -1; // same rounding guard as the implementation
    if (r < -1 || r > tolerance) return Infinity;
    const bad = Math.min(100 * Math.abs(r) ** 3, 1e5);
    const p = end.type === 'penalty' ? end.penalty : 0;
    let d = (linePenalty + bad) ** 2;
    if (p >= 0) d += p * p;
    else if (p > -INF) d -= p * p;
    const flagged = end.type === 'penalty' && !!end.flagged;
    if (flagged && prevFlagged) d += flaggedDemerits;
    const fc = r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3;
    if (Math.abs(fc - prevFitness) > 1) d += fitnessDemerits;
    total += d;
    prevFitness = fc;
    prevFlagged = flagged;
    start = b + 1;
    while (start < nodes.length && nodes[start].type !== 'box' && !(nodes[start].type === 'penalty' && nodes[start].penalty <= -INF)) start++;
  }
  return total;
}

/** Minimum demerits over every subset of legal breakpoints (exponential; small inputs only). */
export function bruteForceOptimum(nodes, widthOf, opts) {
  const n = nodes.length;
  const legal = [];
  for (let b = 0; b < n - 1; b++) if (isLegalBreak(nodes, b) && !(nodes[b].type === 'penalty' && nodes[b].penalty <= -INF)) legal.push(b);
  if (legal.length > 18) throw new Error('too many breakpoints for brute force');
  let best = Infinity;
  for (let mask = 0; mask < 1 << legal.length; mask++) {
    const breaks = [];
    for (let i = 0; i < legal.length; i++) if (mask & (1 << i)) breaks.push(legal[i]);
    breaks.push(n - 1);
    const s = scoreBreaks(nodes, breaks, widthOf, opts);
    if (s < best) best = s;
  }
  return best;
}

/** Reassemble the original words from rendered lines (undoing hyphenation). */
export function wordsFromLines(lines) {
  return lines
    .map((l) => l.trim())
    .join('\n')
    .replace(/-\n/g, '')
    .split(/\s+/)
    .filter(Boolean);
}
