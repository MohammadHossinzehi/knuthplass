import test from 'node:test';
import assert from 'node:assert/strict';
import { greedyBreak, breakLines, textToNodes, Metrics } from '../src/index.js';
import { rng, randomWords, scoreBreaks } from './helpers.js';

test('greedy lines never exceed the width unless a single box is too wide', () => {
  const nodes = textToNodes(randomWords(rng(1), 200));
  const m = new Metrics(nodes);
  const { breaks } = greedyBreak(nodes, 30, { allowShrink: false });
  let start = 0;
  for (const b of breaks) {
    assert.ok(m.measure(start, b.position).width <= 30);
    start = m.lineStart(b.position);
  }
});

test('greedy fits each line as full as possible (next word would not fit)', () => {
  const text = randomWords(rng(2), 150);
  const nodes = textToNodes(text);
  const m = new Metrics(nodes);
  const { breaks } = greedyBreak(nodes, 35, { allowShrink: false });
  let start = 0;
  for (const b of breaks.slice(0, -1)) {
    // the next legal break after this one must overflow the same line
    let next = b.position + 1;
    while (nodes[next].type !== 'glue' || nodes[next - 1].type !== 'box') {
      if (nodes[next].type === 'penalty' && nodes[next].penalty <= -10000) break;
      next++;
    }
    if (nodes[next].type === 'glue') assert.ok(m.measure(start, next).width > 35);
    start = m.lineStart(b.position);
  }
});

test('Knuth Plass never scores worse than greedy when greedy is feasible', () => {
  const rand = rng(42);
  let compared = 0;
  for (let t = 0; t < 80; t++) {
    const nodes = textToNodes(randomWords(rand, 40 + Math.floor(rand() * 40)));
    const width = 25 + Math.floor(rand() * 30);
    const g = scoreBreaks(nodes, greedyBreak(nodes, width).breaks.map((b) => b.position), () => width, { tolerance: 1e9 });
    const k = breakLines(nodes, width, { tolerance: 1e9 });
    if (!Number.isFinite(g)) continue;
    assert.ok(k.demerits <= g + 1e-6, `trial ${t}: kp ${k.demerits} greedy ${g}`);
    compared++;
  }
  assert.ok(compared > 60);
});
