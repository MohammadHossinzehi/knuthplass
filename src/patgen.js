// A compact reimplementation of the idea behind Liang's PATGEN: learn hyphenation patterns from a
// hyphenated word list, level by level.
//
// Odd levels add "hyphenating" patterns that find missed hyphens; even levels add "inhibiting"
// patterns that suppress wrong ones. At each level and pattern length we count, for every
// candidate substring + position, how many positions it would fix (good) and how many it would
// break (bad), and keep it if good * goodWeight - bad * badWeight >= threshold. Selected patterns
// are merged into the table before the next length is considered, so later passes only see the
// errors that remain.

import { Hyphenator, formatPattern } from './hyphenator.js';

// Tuned on data/words.txt with an 80/20 split. Level 1 is deliberately conservative (a wrong
// hyphen is worse than a missed one), level 5 forbids any new error so the training set is fit.
export const DEFAULT_LEVELS = [
  { minLength: 2, maxLength: 5, goodWeight: 1, badWeight: 6, threshold: 4 },
  { minLength: 2, maxLength: 5, goodWeight: 1, badWeight: 1, threshold: 1 },
  { minLength: 3, maxLength: 6, goodWeight: 1, badWeight: 6, threshold: 3 },
  { minLength: 3, maxLength: 7, goodWeight: 1, badWeight: 1, threshold: 1 },
  { minLength: 3, maxLength: 8, goodWeight: 1, badWeight: 1e9, threshold: 1 },
  { minLength: 3, maxLength: 9, goodWeight: 1, badWeight: 1, threshold: 1 },
];

/** "hy-phen-ation" -> { word: "hyphenation", hyphens: Set{2, 6} } */
export function parseEntry(entry) {
  const parts = entry.trim().toLowerCase().split('-');
  const hyphens = new Set();
  let at = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    at += [...parts[i]].length;
    hyphens.add(at);
  }
  return { word: parts.join(''), hyphens };
}

/**
 * Learn patterns from hyphenated entries.
 * @param {string[]} entries e.g. ["hy-phen-ation", "al-go-rithm"]
 * @returns {{ patterns: string[], log: object[] }}
 */
export function generatePatterns(entries, { levels = DEFAULT_LEVELS, leftMin = 2, rightMin = 3 } = {}) {
  const data = entries.map(parseEntry);
  const table = new Map(); // letters -> points array
  const log = [];

  const currentValues = () => {
    const h = new Hyphenator(toStrings(table), { leftMin, rightMin });
    return data.map((d) => h.values(d.word));
  };

  levels.forEach((cfg, i) => {
    const level = i + 1;
    const hyphenating = level % 2 === 1;
    for (let len = cfg.minLength; len <= cfg.maxLength; len++) {
      const values = currentValues();
      const counts = new Map();

      data.forEach((d, wi) => {
        const w = ['.', ...d.word, '.'];
        const letters = w.length - 2;
        for (let t = leftMin; t <= letters - rightMin; t++) {
          const v = values[wi][t];
          const isHyphen = d.hyphens.has(t);
          const currentlyOn = v % 2 === 1;
          // Only positions this level can still change matter.
          if (hyphenating && currentlyOn) continue;
          if (!hyphenating && !currentlyOn) continue;
          const good = hyphenating ? isHyphen : !isHyphen;
          const k = t + 1; // index into the dotted word of the position before letter t
          for (let dot = 0; dot <= len; dot++) {
            const s = k - dot;
            if (s < 0 || s + len > w.length) continue;
            const key = w.slice(s, s + len).join('') + '|' + dot;
            let c = counts.get(key);
            if (!c) counts.set(key, (c = { good: 0, bad: 0 }));
            if (good) c.good++;
            else c.bad++;
          }
        }
      });

      let added = 0;
      for (const [key, c] of counts) {
        if (c.good === 0) continue;
        if (c.good * cfg.goodWeight - c.bad * cfg.badWeight < cfg.threshold) continue;
        const [letters, dotStr] = key.split('|');
        const dot = Number(dotStr);
        let pts = table.get(letters);
        if (!pts) table.set(letters, (pts = new Array([...letters].length + 1).fill(0)));
        if (pts[dot] < level) {
          pts[dot] = level;
          added++;
        }
      }
      if (added) log.push({ level, length: len, added });
    }
  });

  return { patterns: toStrings(table), log };
}

function toStrings(table) {
  return [...table].map(([letters, pts]) => formatPattern(letters, pts)).sort();
}

/** Precision / recall of a hyphenator against hyphenated entries (positions within the margins). */
export function evaluate(hyphenator, entries) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const e of entries) {
    const { word, hyphens } = parseEntry(e);
    const n = [...word].length;
    const expected = [...hyphens].filter((t) => t >= hyphenator.leftMin && t <= n - hyphenator.rightMin);
    const got = new Set(hyphenator.hyphenPositions(word));
    for (const t of expected) {
      if (got.has(t)) tp++;
      else fn++;
    }
    for (const t of got) {
      if (!hyphens.has(t)) fp++;
    }
  }
  return {
    precision: tp + fp ? tp / (tp + fp) : 1,
    recall: tp + fn ? tp / (tp + fn) : 1,
    found: tp,
    wrong: fp,
    missed: fn,
  };
}
