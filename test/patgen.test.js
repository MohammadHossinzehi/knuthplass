import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePatterns, evaluate, parseEntry, Hyphenator } from '../src/index.js';

test('parseEntry finds hyphen positions', () => {
  const { word, hyphens } = parseEntry('Hy-phen-ation');
  assert.equal(word, 'hyphenation');
  assert.deepEqual([...hyphens], [2, 6]);
});

test('learns patterns that fit a small training set exactly', () => {
  const entries = ['ba-na-na', 'ca-ba-na', 'ba-ba', 'na-ba-ca', 'ab-ba', 'can-dle', 'han-dle', 'bun-dle'];
  const { patterns, log } = generatePatterns(entries, { leftMin: 1, rightMin: 1 });
  const h = new Hyphenator(patterns, { leftMin: 1, rightMin: 1 });
  const m = evaluate(h, entries);
  assert.equal(m.wrong, 0);
  assert.equal(m.missed, 0);
  assert.ok(log.length > 0);
});

test('generalises a consistent rule to unseen words', () => {
  // Every entry breaks between doubled consonants: the learner should discover it.
  const entries = ['bet-ter', 'let-ter', 'bat-ter', 'mat-ter', 'lad-der', 'mad-der', 'sum-mer', 'ham-mer', 'dip-per', 'hop-per'];
  const { patterns } = generatePatterns(entries);
  const h = new Hyphenator(patterns);
  assert.deepEqual(h.hyphenate('tatter'), ['tat', 'ter']);
  assert.deepEqual(h.hyphenate('bummer'), ['bum', 'mer']);
});
