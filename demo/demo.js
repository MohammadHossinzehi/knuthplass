import { breakLines, greedyBreak, textToNodes, layoutLines, englishHyphenator } from '../src/index.js';

const SAMPLE = `Typesetting a paragraph is a surprisingly interesting optimization problem. The simple method used by most software fills each line with as many words as possible and then moves on, without ever looking back. That approach is fast, but it often leaves one line beautifully tight and the next one full of awkward gaps, because a decision made early in the paragraph cannot be corrected later. The algorithm described by Knuth and Plass treats the whole paragraph at once. Every possible breakpoint is evaluated, each line receives a penalty that grows with the cube of its stretching, and dynamic programming finds the combination of breaks with the smallest total cost. The result is spacing that is consistent from one line to the next, with hyphenation used only where it really improves the paragraph.`;

const $ = (id) => document.getElementById(id);
const hyphenator = englishHyphenator();
const canvas = document.createElement('canvas').getContext('2d');

$('text').value = SAMPLE;

function color(r) {
  if (!Number.isFinite(r)) return 'var(--loose)';
  const t = Math.max(-1, Math.min(1, r / 2));
  if (Math.abs(r) < 0.15) return '#ccc';
  const mix = Math.round(30 + 70 * Math.abs(t));
  return `color-mix(in srgb, ${t < 0 ? 'var(--tight)' : 'var(--loose)'} ${mix}%, #ddd)`;
}

function render(target, statsEl, nodes, result, width, size, showRatio, label) {
  const lines = layoutLines(nodes, result.breaks, width);
  const lineHeight = Math.round(size * 1.5);
  target.innerHTML = '';
  target.style.height = `${lines.length * lineHeight}px`;
  target.style.width = `${width + 56}px`;
  target.style.fontSize = `${size}px`;
  const margin = document.createElement('div');
  margin.className = 'margin';
  margin.style.left = `${width + 12}px`;
  target.append(margin);

  lines.forEach((line, i) => {
    const y = i * lineHeight;
    const bar = document.createElement('div');
    bar.className = 'bar';
    Object.assign(bar.style, { top: `${y + 3}px`, height: `${lineHeight - 6}px`, left: '0px', background: i === lines.length - 1 ? '#eee' : color(line.ratio) });
    target.append(bar);
    const el = document.createElement('div');
    el.className = 'line';
    el.style.top = `${y}px`;
    el.style.left = '12px';
    el.style.lineHeight = `${lineHeight}px`;
    for (const item of line.items) {
      const span = document.createElement('span');
      span.textContent = item.text;
      span.style.position = 'absolute';
      span.style.left = `${item.x}px`;
      el.append(span);
    }
    target.append(el);
    if (showRatio && i < lines.length - 1) {
      const r = document.createElement('div');
      r.className = 'ratio';
      r.style.top = `${y + lineHeight / 2 - 5}px`;
      r.style.left = `${width + 18}px`;
      r.textContent = Number.isFinite(line.ratio) ? line.ratio.toFixed(2) : '∞';
      target.append(r);
    }
  });

  const body = lines.slice(0, -1).map((l) => l.ratio).filter(Number.isFinite);
  const mean = body.reduce((a, b) => a + Math.abs(b), 0) / (body.length || 1);
  const worst = body.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  const hyphens = lines.filter((l) => l.hyphenated).length;
  statsEl.innerHTML =
    `<b>${lines.length}</b> lines · mean |r| <b>${mean.toFixed(2)}</b> · worst |r| <b>${worst.toFixed(2)}</b> · <b>${hyphens}</b> hyphens` +
    (label ? ` · ${label}` : '');
}

function update() {
  const width = Number($('width').value);
  const size = Number($('size').value);
  const tolerance = Number($('tol').value);
  const looseness = Number($('loose').value) || 0;
  const align = $('align').value;
  $('widthOut').textContent = `${width}px`;
  $('sizeOut').textContent = `${size}px`;
  $('tolOut').textContent = tolerance.toFixed(1);

  canvas.font = `${size}px Georgia, 'Times New Roman', serif`;
  const measure = (s) => canvas.measureText(s).width;
  const nodes = textToNodes($('text').value, { measure, align, hyphenator: $('hyph').checked ? hyphenator : null });
  const showRatio = $('showRatio').checked;

  render($('greedy'), $('greedyStats'), nodes, greedyBreak(nodes, width), width, size, showRatio);
  const kp = breakLines(nodes, width, { tolerance, looseness, emergencyStretch: measure(' ') * 2 });
  const note = kp.pass === 'normal' ? `${Math.round(kp.demerits).toLocaleString()} demerits` : `${kp.pass} pass`;
  render($('kp'), $('kpStats'), nodes, kp, width, size, showRatio, note);
}

for (const id of ['text', 'width', 'size', 'tol', 'loose', 'align', 'hyph', 'showRatio']) $(id).addEventListener('input', update);
document.fonts?.ready.then(update);
update();
