import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Hyphenator, parsePattern, formatPattern, englishHyphenator, evaluate } from '../src/index.js';

// The worked example from Appendix H of The TeXbook.
const TEXBOOK = ['hy3ph', 'he2n', 'hena4', 'hen5at', '1na', 'n2at', '1tio', '2io', 'o2n'];

test('reproduces the TeXbook hyphenation example', () => {
  const h = new Hyphenator(TEXBOOK);
  assert.deepEqual(h.values('hyphenation'), [0, 0, 3, 0, 0, 2, 5, 4, 2, 0, 2, 0]);
  assert.deepEqual(h.hyphenate('hyphenation'), ['hy', 'phen', 'ation']);
});

test('pattern parsing round trips', () => {
  for (const p of [...TEXBOOK, '.ab4c', 'x1y2z3']) {
    const { letters, points } = parsePattern(p);
    assert.equal(formatPattern(letters, points), p);
  }
});

test('leftMin and rightMin suppress breaks near word edges', () => {
  const h = new Hyphenator(['1b', '1c', '1d', '1e'], { leftMin: 1, rightMin: 1 });
  assert.deepEqual(h.hyphenate('abcde'), ['a', 'b', 'c', 'd', 'e']);
  const strict = new Hyphenator(['1b', '1c', '1d', '1e'], { leftMin: 2, rightMin: 2 });
  assert.deepEqual(strict.hyphenate('abcde'), ['ab', 'c', 'de']);
});

test('exceptions override patterns', () => {
  const h = new Hyphenator(TEXBOOK, { exceptions: ['hyphen-ation'] });
  assert.deepEqual(h.hyphenate('hyphenation'), ['hyphen', 'ation']);
});

test('punctuation and case are preserved', () => {
  const h = new Hyphenator(TEXBOOK);
  assert.deepEqual(h.hyphenate('"Hyphenation,"'), ['"Hy', 'phen', 'ation,"']);
  assert.deepEqual(h.hyphenate('x2y'), ['x2y']);
});

test('fromTeX reads \\patterns and \\hyphenation blocks and ignores comments', () => {
  const src = `% comment
\\patterns{ % more
hy3ph he2n hena4 hen5at 1na n2at 1tio 2io o2n
}
\\hyphenation{ ta-ble }`;
  const h = Hyphenator.fromTeX(src, { rightMin: 2 });
  assert.equal(h.size, 9);
  assert.deepEqual(h.hyphenate('hyphenation'), ['hy', 'phen', 'ation']);
  assert.deepEqual(h.hyphenate('table'), ['ta', 'ble']);
});

test('bundled English patterns reproduce the training word list', () => {
  const words = readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const m = evaluate(englishHyphenator(), words);
  assert.equal(m.wrong, 0);
  assert.equal(m.missed, 0);
});
