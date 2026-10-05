import { Metrics, adjustmentRatio, lineWidthFn } from './metrics.js';

/**
 * Position every box once breakpoints are known. The adjustment ratio is recomputed from the
 * nodes themselves (not taken from the breaker), so lines chosen with emergency stretch are still
 * set exactly to width, exactly as TeX does.
 *
 * @returns {Array<{ratio:number, width:number, naturalWidth:number, items:Array<{x:number,width:number,text:string}>, hyphenated:boolean}>}
 */
export function layoutLines(nodes, breaks, lineWidths) {
  const widthOf = lineWidthFn(lineWidths);
  const metrics = new Metrics(nodes);
  const lines = [];
  let start = 0;
  breaks.forEach((brk, i) => {
    const b = brk.position;
    const target = widthOf(i);
    const m = metrics.measure(start, b);
    let r = adjustmentRatio(m, target);
    if (!Number.isFinite(r)) r = 0; // nothing can stretch or shrink: set at natural width
    const shrinkLimited = Math.max(r, -1);
    const items = [];
    let x = 0;
    let lastBoxEnd = 0;
    for (let k = start; k < b; k++) {
      const node = nodes[k];
      if (node.type === 'box') {
        if (node.width > 0 || node.text) items.push({ x, width: node.width, text: node.text });
        x += node.width;
        if (node.width > 0) lastBoxEnd = x;
      } else if (node.type === 'glue') {
        x += node.width + (shrinkLimited >= 0 ? shrinkLimited * node.stretch : shrinkLimited * node.shrink);
      }
    }
    const end = nodes[b];
    const hyphenated = end.type === 'penalty' && !!end.text;
    if (hyphenated) {
      // Hang the hyphen on the last box, not after any trailing ragged right glue.
      items.push({ x: lastBoxEnd, width: end.width, text: end.text });
      x = Math.max(x, lastBoxEnd + end.width);
    }
    lines.push({ ratio: r, width: target, naturalWidth: m.width, setWidth: x, items, hyphenated });
    start = metrics.lineStart(b);
  });
  return lines;
}

/**
 * Render a paragraph as monospaced text: every box is placed at its rounded x position. Rounding
 * absolute positions (not individual gaps) keeps the right margin exact and never closes a gap.
 */
export function renderMonospace(nodes, breaks, lineWidths) {
  return layoutLines(nodes, breaks, lineWidths).map((line) => {
    let out = '';
    for (const item of line.items) {
      const x = Math.round(item.x);
      if (x > out.length) out += ' '.repeat(x - out.length);
      out += item.text;
    }
    return out;
  });
}
