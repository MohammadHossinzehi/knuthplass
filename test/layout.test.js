import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breakLines, greedyBreak, textToNodes, renderMonospace, layoutLines, englishHyphenator } from '../src/index.js';
import { wordsFromLines } from './helpers.js';

const sample = readFileSync(new URL('../data/sample.txt', import.meta.url), 'utf8').split(/\n\s*\n/)[0].trim();
const mono = { stretch: 1, shrink: 0, hyphenator: englishHyphenator() };

test('justified monospace output is flush on both margins', () => {
  for (const width of [30, 42, 57, 72]) {
    const nodes = textToNodes(sample, mono);
    const lines = renderMonospace(nodes, breakLines(nodes, width).breaks, width);
    lines.slice(0, -1).forEach((l) => assert.equal(l.length, width, JSON.stringify(l)));
    assert.ok(lines.at(-1).length <= width);
    assert.deepEqual(wordsFromLines(lines), sample.split(/\s+/));
  }
});

test('ragged right and centred output never exceed the width and keep every word', () => {
  for (const align of ['left', 'center']) {
    const nodes = textToNodes(sample, { ...mono, align });
    const lines = renderMonospace(nodes, breakLines(nodes, 40).breaks, 40);
    for (const l of lines) assert.ok(l.length <= 40);
    assert.deepEqual(wordsFromLines(lines), sample.split(/\s+/));
    if (align === 'left') assert.ok(lines.every((l) => !l.startsWith(' ')));
  }
});

test('centred lines are balanced within one cell', () => {
  const nodes = textToNodes(sample, { align: 'center' });
  const lines = renderMonospace(nodes, breakLines(nodes, 44).breaks, 44);
  for (const l of lines) {
    const left = l.length - l.trimStart().length;
    const right = 44 - l.length;
    assert.ok(Math.abs(left - right) <= 1, JSON.stringify(l));
  }
});

test('layout sets every justified line to exactly its target width', () => {
  const measure = (s) => s.length * 7.3; // a non integer "font"
  const nodes = textToNodes(sample, { measure, hyphenator: englishHyphenator() });
  const widths = [300, 320, 340];
  const { breaks } = breakLines(nodes, widths);
  const lines = layoutLines(nodes, breaks, widths);
  lines.slice(0, -1).forEach((l, i) => assert.ok(Math.abs(l.setWidth - widths[Math.min(i, 2)]) < 1e-6));
});

test('Knuth Plass spacing is more uniform than greedy on the sample', () => {
  const nodes = textToNodes(sample, mono);
  const spread = (breaks) => {
    const r = layoutLines(nodes, breaks, 44).slice(0, -1).map((l) => l.ratio);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    return r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
  };
  assert.ok(spread(breakLines(nodes, 44).breaks) <= spread(greedyBreak(nodes, 44).breaks));
});
