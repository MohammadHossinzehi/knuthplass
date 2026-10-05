import { INF, FIL, box, glue, penalty } from './nodes.js';

/**
 * Turn plain text into a box/glue/penalty list.
 *
 * Alignment is not a separate rendering mode: following section 3 of the Knuth & Plass paper it is
 * expressed entirely through glue and penalties, so the same optimiser handles justified, ragged
 * right and centred text.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {(s: string) => number} [options.measure] width of a string (defaults to its length)
 * @param {'justify'|'left'|'center'} [options.align]
 * @param {{hyphenate(word: string): string[]}} [options.hyphenator] optional Liang hyphenator
 * @param {number} [options.stretch] interword stretch as a fraction of a space (justify)
 * @param {number} [options.shrink] interword shrink as a fraction of a space (justify)
 * @param {number} [options.hyphenPenalty] cost of breaking at a hyphenation point (TeX: 50)
 * @param {number} [options.explicitHyphenPenalty] cost of breaking after a written hyphen
 * @param {number} [options.indent] width of a paragraph indent box
 */
export function textToNodes(text, options = {}) {
  const {
    measure = (s) => [...s].length,
    align = 'justify',
    hyphenator = null,
    stretch = 1 / 2,
    shrink = 1 / 3,
    hyphenPenalty = 50,
    explicitHyphenPenalty = 50,
    indent = 0,
  } = options;
  if (!['justify', 'left', 'center'].includes(align)) throw new Error(`Unknown align: ${align}`);

  const space = measure(' ');
  const hyphenWidth = measure('-');
  const words = text.split(/\s+/).filter(Boolean);
  const nodes = [];

  if (align === 'center') nodes.push(glue(0, 3 * space, 0));
  if (indent > 0) nodes.push(box(indent, ''));

  const breakInside = (width, cost, hyphenText) => {
    if (align === 'left') {
      // Keep ragged right raggedness when breaking at a hyphen (paper, section 3).
      nodes.push(penalty(0, INF), glue(0, 3 * space, 0), penalty(width, cost, true, hyphenText), glue(0, -3 * space, 0));
    } else {
      nodes.push(penalty(width, cost, true, hyphenText));
    }
  };

  // In the ragged constructions every stretchable glue is preceded by penalty(INF) so that the only
  // breakpoints are the explicit penalties; a break at the glue itself would drop the stretch.
  words.forEach((word, wi) => {
    if (wi > 0) {
      if (align === 'justify') {
        nodes.push(glue(space, space * stretch, space * shrink));
      } else if (align === 'left') {
        nodes.push(penalty(0, INF), glue(0, 3 * space, 0), penalty(0, 0), glue(space, -3 * space, 0));
      } else {
        nodes.push(
          penalty(0, INF),
          glue(0, 3 * space, 0),
          penalty(0, 0),
          glue(space, -6 * space, 0),
          box(0, ''),
          penalty(0, INF),
          glue(0, 3 * space, 0),
        );
      }
    }

    // Written hyphens ("well-known") are always breakable, and cost nothing extra in width.
    const segments = word.split(/(?<=-)(?=.)/);
    segments.forEach((segment, si) => {
      const parts = hyphenator && align !== 'center' ? hyphenator.hyphenate(segment) : [segment];
      parts.forEach((part, pi) => {
        nodes.push(box(measure(part), part));
        if (pi < parts.length - 1) breakInside(hyphenWidth, hyphenPenalty, '-');
      });
      if (si < segments.length - 1) breakInside(0, explicitHyphenPenalty, '');
    });
  });

  if (align === 'center') {
    nodes.push(penalty(0, INF), glue(0, 3 * space, 0), penalty(0, -INF, true));
  } else {
    // \penalty10000 \hskip\parfillskip \penalty-10000: the last line is set at natural width.
    nodes.push(penalty(0, INF), glue(0, FIL, 0), penalty(0, -INF, true));
  }
  return nodes;
}
