#!/usr/bin/env node
// Typeset plain text into a fixed width monospace column with Knuth Plass (or greedy) breaking.
//
//   node bin/knuthplass.js [file] [--width 60] [--align justify|left|center] [--greedy]
//                          [--no-hyphenate] [--tolerance 2] [--looseness 0] [--stats]
//
// Paragraphs are separated by blank lines. Reads stdin when no file is given.
import { readFileSync } from 'node:fs';
import { breakLines, greedyBreak, textToNodes, renderMonospace, englishHyphenator } from '../src/index.js';

function parseArgs(argv) {
  const args = { width: 60, align: 'justify', greedy: false, hyphenate: true, tolerance: 2, looseness: 0, stats: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--width' || a === '-w') args.width = Number(next());
    else if (a === '--align') args.align = next();
    else if (a === '--greedy') args.greedy = true;
    else if (a === '--no-hyphenate') args.hyphenate = false;
    else if (a === '--tolerance') args.tolerance = Number(next());
    else if (a === '--looseness') args.looseness = Number(next());
    else if (a === '--stats') args.stats = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
    else args.file = a;
  }
  if (!Number.isInteger(args.width) || args.width < 5) throw new Error('--width must be an integer >= 5');
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 7).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  const text = readFileSync(args.file ?? 0, 'utf8');
  const hyphenator = args.hyphenate ? englishHyphenator() : null;
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  let totalDemerits = 0;
  let totalLines = 0;
  for (const p of paragraphs) {
    // In a monospace grid a space cannot shrink below one cell, so interword glue is 1 +1 -0.
    const nodes = textToNodes(p, { align: args.align, hyphenator, stretch: 1, shrink: 0 });
    const result = args.greedy
      ? greedyBreak(nodes, args.width)
      : breakLines(nodes, args.width, { tolerance: args.tolerance, looseness: args.looseness });
    out.push(renderMonospace(nodes, result.breaks, args.width).join('\n'));
    totalLines += result.breaks.length;
    if (result.demerits) totalDemerits += result.demerits;
  }
  process.stdout.write(out.join('\n\n') + '\n');
  if (args.stats) {
    console.error(`${paragraphs.length} paragraph(s), ${totalLines} lines` + (args.greedy ? '' : `, ${Math.round(totalDemerits)} demerits`));
  }
}

main();
