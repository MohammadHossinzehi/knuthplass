import { isForcedBreak } from './nodes.js';

/**
 * Prefix sums of width, stretch and shrink so the natural width of any line can be read off in
 * O(1). Penalty widths are deliberately excluded: a penalty only contributes width (for example a
 * hyphen) when the line actually ends there.
 */
export class Metrics {
  constructor(nodes) {
    const n = nodes.length;
    this.nodes = nodes;
    this.width = new Float64Array(n + 1);
    this.stretch = new Float64Array(n + 1);
    this.shrink = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const isGlue = node.type === 'glue';
      this.width[i + 1] = this.width[i] + (node.type === 'penalty' ? 0 : node.width);
      this.stretch[i + 1] = this.stretch[i] + (isGlue ? node.stretch : 0);
      this.shrink[i + 1] = this.shrink[i] + (isGlue ? node.shrink : 0);
    }
  }

  /**
   * Index of the first node of the line that follows a break at `p` (p = -1 for the paragraph
   * start). As in TeX, glue and penalties immediately after a break are discarded, stopping at the
   * first box or at a forced break.
   */
  lineStart(p) {
    if (p < 0) return 0;
    const { nodes } = this;
    let s = p + 1;
    while (s < nodes.length && nodes[s].type !== 'box' && !isForcedBreak(nodes[s])) s++;
    return s;
  }

  /** Natural width, total stretch and total shrink of the line nodes[s .. b), ending at break b. */
  measure(s, b) {
    const end = this.nodes[b];
    return {
      width: this.width[b] - this.width[s] + (end.type === 'penalty' ? end.width : 0),
      stretch: this.stretch[b] - this.stretch[s],
      shrink: this.shrink[b] - this.shrink[s],
    };
  }
}

/**
 * Adjustment ratio r: how far the glue on a line must stretch (r > 0) or shrink (r < 0), as a
 * fraction of its total stretchability or shrinkability, to make the line exactly `target` wide.
 */
export function adjustmentRatio({ width, stretch, shrink }, target, extraStretch = 0) {
  if (width < target) {
    const s = stretch + extraStretch;
    return s > 0 ? (target - width) / s : Infinity;
  }
  if (width > target) {
    if (!(shrink > 0)) return -Infinity;
    const r = (target - width) / shrink;
    // Prefix sum differences carry rounding error; a line that shrinks exactly to its limit must
    // not be rejected because r came out as -1.0000000000000002.
    return r < -1 && r > -1 - 1e-9 ? -1 : r;
  }
  return 0;
}

/** Normalise the lineWidths argument (number, array or function) to a function of line index. */
export function lineWidthFn(lineWidths) {
  if (typeof lineWidths === 'number') return () => lineWidths;
  if (Array.isArray(lineWidths)) {
    if (lineWidths.length === 0) throw new Error('lineWidths array must not be empty');
    return (i) => lineWidths[Math.min(i, lineWidths.length - 1)];
  }
  if (typeof lineWidths === 'function') return lineWidths;
  throw new TypeError('lineWidths must be a number, an array of numbers or a function');
}
