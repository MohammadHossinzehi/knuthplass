export { INF, FIL, box, glue, penalty, isLegalBreak, isForcedBreak } from './nodes.js';
export { Metrics, adjustmentRatio, lineWidthFn } from './metrics.js';
export { breakLines, badness, fitnessClass, lineDemerits, DEFAULTS } from './knuthPlass.js';
export { greedyBreak } from './greedy.js';
export { textToNodes } from './build.js';
export { layoutLines, renderMonospace } from './layout.js';
export { Hyphenator, parsePattern, formatPattern } from './hyphenator.js';
export { generatePatterns, evaluate, parseEntry, DEFAULT_LEVELS } from './patgen.js';
export { PATTERNS as EN_PATTERNS } from '../data/patterns.js';

import { Hyphenator } from './hyphenator.js';
import { PATTERNS } from '../data/patterns.js';

/** A ready made English hyphenator built from the bundled, trained pattern set. */
export function englishHyphenator(options = {}) {
  return new Hyphenator(PATTERNS, options);
}
