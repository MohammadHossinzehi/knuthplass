import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breakLines, textToNodes, box, glue, penalty, INF, FIL, Hyphenator, englishHyphenator } from '../src/index.js';
import { rng, randomWords, bruteForceOptimum, scoreBreaks } from './helpers.js';

const positions = (r) => r.breaks.map((b) => b.position);
// Random "words" are much harder to justify than prose, so the exhaustive comparisons use a looser
// tolerance to get plenty of feasible cases. The point is equality with brute force, not beauty.
const LOOSE = { tolerance: 4 };

test('matches exhaustive search on random paragraphs (uniform width)', () => {
  const rand = rng(7);
  let checked = 0;
  for (let trial = 0; trial < 60; trial++) {
    const text = randomWords(rand, 6 + Math.floor(rand() * 9));
    const width = 14 + Math.floor(rand() * 16);
    const nodes = textToNodes(text);
    const expected = bruteForceOptimum(nodes, () => width, LOOSE);
    if (!Number.isFinite(expected)) continue; // no feasible solution at this tolerance
    const result = breakLines(nodes, width, { ...LOOSE, lastResort: false });
    assert.ok(Math.abs(result.demerits - expected) < 1e-6, `trial ${trial}: ${result.demerits} vs ${expected}`);
    assert.ok(Math.abs(scoreBreaks(nodes, positions(result), () => width, LOOSE) - expected) < 1e-6);
    checked++;
  }
  assert.ok(checked > 30, `only ${checked} feasible trials`);
});

test('matches exhaustive search with variable line widths', () => {
  const rand = rng(99);
  let checked = 0;
  for (let trial = 0; trial < 60; trial++) {
    const text = randomWords(rand, 6 + Math.floor(rand() * 8));
    const widths = [16 + Math.floor(rand() * 10), 24 + Math.floor(rand() * 10), 18 + Math.floor(rand() * 12)];
    const widthOf = (i) => widths[Math.min(i, widths.length - 1)];
    const nodes = textToNodes(text);
    const expected = bruteForceOptimum(nodes, widthOf, LOOSE);
    if (!Number.isFinite(expected)) continue;
    const result = breakLines(nodes, widths, { ...LOOSE, lastResort: false });
    assert.ok(Math.abs(result.demerits - expected) < 1e-6, `trial ${trial}`);
    checked++;
  }
  assert.ok(checked > 20);
});

test('matches exhaustive search with hyphenation, flagged and fitness demerits', () => {
  const h = new Hyphenator(['1ba', '1ca', '1da']);
  const rand = rng(3);
  let checked = 0;
  for (let trial = 0; trial < 40; trial++) {
    const syll = () => ['ba', 'ca', 'da', 'xa'][Math.floor(rand() * 4)];
    const words = [];
    for (let i = 0; i < 5; i++) words.push(Array.from({ length: 1 + Math.floor(rand() * 4) }, syll).join(''));
    const nodes = textToNodes(words.join(' '), { hyphenator: h });
    const width = 9 + Math.floor(rand() * 8);
    const expected = bruteForceOptimum(nodes, () => width, LOOSE);
    if (!Number.isFinite(expected)) continue;
    const result = breakLines(nodes, width, { ...LOOSE, lastResort: false });
    assert.ok(Math.abs(result.demerits - expected) < 1e-6, `trial ${trial}`);
    checked++;
  }
  assert.ok(checked > 15);
});

test('every line of a normal pass respects the tolerance', () => {
  const text = readFileSync(new URL('../data/sample.txt', import.meta.url), 'utf8');
  const nodes = textToNodes(text, { hyphenator: englishHyphenator() });
  const result = breakLines(nodes, 40, { tolerance: 1.5 });
  assert.equal(result.pass, 'normal');
  for (const b of result.breaks) assert.ok(b.ratio >= -1 && b.ratio <= 1.5);
  assert.equal(result.breaks.at(-1).position, nodes.length - 1);
});

test('prefers even spacing over the greedy choice (classic example)', () => {
  // Greedy would put "aaa bb" on line 1 and leave "cc ddddd" badly loose.
  const nodes = textToNodes('aaa bb cc ddddd');
  const r = breakLines(nodes, 6, { tolerance: 10 });
  const lines = r.breaks.length;
  assert.equal(lines, 3);
});

test('looseness asks for one more line when it is feasible', () => {
  const nodes = textToNodes(randomWords(rng(11), 80));
  const base = breakLines(nodes, 50, { tolerance: 3 });
  const looser = breakLines(nodes, 50, { tolerance: 3, looseness: 1 });
  const tighter = breakLines(nodes, 50, { tolerance: 3, looseness: -1 });
  assert.equal(looser.breaks.length, base.breaks.length + 1);
  assert.ok(tighter.breaks.length <= base.breaks.length);
  assert.ok(looser.demerits >= base.demerits);
});

test('flagged demerits discourage hyphens on consecutive lines', () => {
  const h = new Hyphenator(['1ba']);
  const text = 'xxbaba xxbaba xxbaba xxbaba xxbaba xxbaba xxbaba xxbaba';
  const nodes = textToNodes(text, { hyphenator: h });
  const count = (r) => {
    let runs = 0;
    for (let i = 1; i < r.breaks.length; i++) {
      const a = nodes[r.breaks[i - 1].position];
      const b = nodes[r.breaks[i].position];
      if (a.flagged && b.flagged && a.text && b.text) runs++;
    }
    return runs;
  };
  const cheap = breakLines(nodes, 11, { flaggedDemerits: 0, tolerance: 5 });
  const strict = breakLines(nodes, 11, { flaggedDemerits: 1e7, tolerance: 5 });
  assert.ok(count(strict) <= count(cheap));
  assert.equal(count(strict), 0);
});

test('an impossible paragraph falls back to the last resort pass instead of failing', () => {
  const nodes = textToNodes('a supercalifragilisticexpialidocious word');
  assert.throws(() => breakLines(nodes, 10, { lastResort: false }), /No feasible/);
  const r = breakLines(nodes, 10);
  assert.equal(r.pass, 'last-resort');
  assert.ok(r.breaks.some((b) => b.overfull));
});

test('emergency stretch rescues a paragraph without needing overfull lines', () => {
  const nodes = textToNodes('aaaa bbbbbbbbbbbb cccc dddddddddddddd eeee');
  assert.throws(() => breakLines(nodes, 16, { lastResort: false }));
  const r = breakLines(nodes, 16, { emergencyStretch: 10 });
  assert.equal(r.pass, 'emergency');
  assert.ok(r.breaks.every((b) => !b.overfull));
});

test('forced breaks inside a paragraph are honoured', () => {
  const nodes = [box(3, 'aaa'), glue(1, 1, 0), box(3, 'bbb'), penalty(0, -INF), box(3, 'ccc'), penalty(0, INF), glue(0, FIL, 0), penalty(0, -INF)];
  const r = breakLines(nodes, 20);
  assert.deepEqual(positions(r), [3, 7]);
});

test('rejects node lists that do not end with a forced break', () => {
  assert.throws(() => breakLines([box(1, 'a')], 10), /forced break/);
});
