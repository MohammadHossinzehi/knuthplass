// The box / glue / penalty model from Knuth & Plass, "Breaking Paragraphs into Lines" (1981).
//
//   box      material that is never broken or stretched (a word, or a fragment of one)
//   glue     space that can stretch or shrink, and is a legal breakpoint when it follows a box
//   penalty  a potential breakpoint with a cost; INF forbids a break, -INF forces one

export const INF = 10000;

/** Effectively infinite stretch, used for the "fill" glue that ends a paragraph. */
export const FIL = 1e6;

export function box(width, text = '') {
  return { type: 'box', width, text };
}

export function glue(width, stretch, shrink) {
  return { type: 'glue', width, stretch, shrink };
}

export function penalty(width, cost, flagged = false, text = '') {
  return { type: 'penalty', width, penalty: cost, flagged, text };
}

export function isForcedBreak(node) {
  return node.type === 'penalty' && node.penalty <= -INF;
}

/**
 * Is position b a legal breakpoint? Glue is only breakable when it directly follows a box,
 * and penalties are breakable unless their cost is +INF.
 */
export function isLegalBreak(nodes, b) {
  const node = nodes[b];
  if (node.type === 'penalty') return node.penalty < INF;
  if (node.type === 'glue') return b > 0 && nodes[b - 1].type === 'box';
  return false;
}
