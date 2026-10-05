import { isForcedBreak, isLegalBreak } from './nodes.js';
import { Metrics, adjustmentRatio, lineWidthFn } from './metrics.js';

/**
 * First fit line breaking, the way most word processors and browsers do it: fill each line with
 * as much material as fits, then break at the last legal breakpoint. It never looks ahead, which is
 * exactly why it produces the uneven spacing Knuth Plass avoids.
 *
 * @param {boolean} options.allowShrink let a line fit by shrinking its glue (default true)
 */
export function greedyBreak(nodes, lineWidths, { allowShrink = true } = {}) {
  const widthOf = lineWidthFn(lineWidths);
  const metrics = new Metrics(nodes);
  const breaks = [];
  let start = 0;
  let lastFit = -1;

  const commit = (b) => {
    const line = breaks.length;
    const r = adjustmentRatio(metrics.measure(start, b), widthOf(line));
    breaks.push({ position: b, line, ratio: r, overfull: r < -1 });
    start = metrics.lineStart(b);
    lastFit = -1;
  };

  for (let b = 0; b < nodes.length; b++) {
    if (b < start || !isLegalBreak(nodes, b)) continue;
    const m = metrics.measure(start, b);
    const target = widthOf(breaks.length);
    const fits = m.width <= target || (allowShrink && m.width - m.shrink <= target);
    if (fits) {
      if (isForcedBreak(nodes[b])) commit(b);
      else lastFit = b;
    } else if (lastFit >= 0) {
      commit(lastFit);
      b--; // re-examine this breakpoint as part of the new line
    } else {
      commit(b); // nothing fits: accept an overfull line
    }
  }
  return { breaks };
}
