# knuthplass

Optimal paragraph line breaking for JavaScript: the Knuth Plass "total fit" algorithm that TeX uses, Liang's pattern based hyphenation, and a small PATGEN style learner that trains hyphenation patterns from a word list. Zero dependencies, runs in Node and in the browser.

```
Greedy (first fit), 34 columns          Knuth Plass, 34 columns
Typesetting   a  paragraph   is  a      Typesetting    a   paragraph    is
surprisingly           interesting      a     surprisingly     interesting
optimization  problem. The  simple      optimization  problem. The  simple
method used by most software fills      method used by most software fills
each  line with  as many  words as      each  line  with   as  many  words
possible   and   then  moves   on,      as  possible  and then  moves  on,
```

The greedy breaker commits to "is a" on line 1 and pays for it with a line that is almost all whitespace. Knuth Plass sees the whole paragraph, spreads the slack over two lines, and nothing looks broken. (Hyphenation is off in both columns here so the difference is purely the breaking strategy.)

## Why this exists

Browsers, word processors and most terminal tools break lines greedily: put as many words on the line as fit, move on, never look back. It is fast, and it is the reason justified text on the web has "rivers" of white space. In 1981 Knuth and Plass showed that the problem is really a shortest path over all feasible breakpoints, and that it can be solved in roughly linear time in practice. Their algorithm has been inside TeX for over forty years, but it is rarely implemented outside of it.

This repository is a careful, tested implementation of the full model, not just the core loop:

* **Box, glue and penalty model.** Words are boxes, spaces are glue that can stretch and shrink, and breakpoints carry penalties. Justified, ragged right and centred text are all expressed through glue and penalties (section 3 of the paper), so a single optimiser handles every alignment.
* **Full demerit function.** Badness ~ 100·|r|³, line penalty, penalty costs, extra demerits for consecutive hyphenated lines (flagged penalties) and for adjacent lines in incompatible fitness classes (tight next to very loose).
* **TeX's pass structure.** A normal pass at the requested tolerance, an optional emergency stretch pass, and a last resort pass that accepts overfull or very loose lines instead of failing. The result tells you which pass produced it.
* **Variable line widths and looseness.** Line widths can be a number, an array (for example to flow around a figure) or a function. `looseness` asks for one more or fewer line than optimal, as TeX's `\looseness` does.
* **Liang hyphenation.** A trie based implementation of the algorithm from "Word Hy-phen-a-tion by Com-put-er", with exceptions, minimum fragment lengths, punctuation handling and a loader for TeX `\patterns{}` files.
* **A pattern learner.** `generatePatterns` reimplements the idea behind PATGEN: levels of hyphenating and inhibiting patterns selected by good/bad counts. The bundled English patterns were trained with it.
* **Greedy baseline, layout and rendering.** A first fit breaker for comparison, exact box positioning, and a monospace renderer for the CLI.

## Running it

Requires Node 18 or newer. There is nothing to install.

```bash
git clone https://github.com/MohammadHossinzehi/knuthplass.git
cd knuthplass

npm test                     # 30 tests, including exhaustive optimality checks
npm run sample               # typeset data/sample.txt at 48 columns

node bin/knuthplass.js data/sample.txt --width 34 --no-hyphenate
node bin/knuthplass.js data/sample.txt --width 34 --greedy --no-hyphenate
node bin/knuthplass.js notes.txt --width 72 --align left --stats
cat essay.txt | node bin/knuthplass.js --width 60 --looseness 1
```

CLI options: `--width N`, `--align justify|left|center`, `--greedy`, `--no-hyphenate`, `--tolerance R`, `--looseness N`, `--stats`. Paragraphs are separated by blank lines.

### Browser demo

```bash
npm run demo                 # then open http://localhost:8080/demo/
```

The demo sets the same text side by side with both algorithms using real font metrics (canvas `measureText`). A coloured bar beside each line shows its adjustment ratio, blue for squeezed and red for stretched, and the header of each column reports the mean and worst ratio. Drag the width slider and you will see widths where both algorithms happen to agree, and widths where the greedy column picks up a badly stretched line that the optimal column avoids. Tolerance, looseness, alignment and hyphenation are all live controls, and the optimal column tells you when it had to fall back to the emergency stretch pass.

### As a library

```js
import { textToNodes, breakLines, layoutLines, englishHyphenator } from './src/index.js';

const ctx = canvas.getContext('2d');
ctx.font = '17px Georgia';

const nodes = textToNodes(text, {
  measure: (s) => ctx.measureText(s).width,
  align: 'justify',
  hyphenator: englishHyphenator(),
});

const { breaks, demerits, pass } = breakLines(nodes, [300, 300, 420], { tolerance: 2 });
for (const line of layoutLines(nodes, breaks, [300, 300, 420])) {
  for (const { x, text } of line.items) drawText(text, x);  // every box, positioned
}
```

You can also build node lists by hand with `box`, `glue` and `penalty` (for example to typeset code, math, or a language with different spacing rules) and pass any of them to `breakLines` or `greedyBreak`.

Using real TeX patterns instead of the bundled ones:

```js
import { Hyphenator } from './src/index.js';
const hyphenator = Hyphenator.fromTeX(readFileSync('hyph-en-us.tex', 'utf8'));
```

## How the optimiser works

The paragraph is a sequence of nodes. A legal breakpoint is a penalty below +∞, or glue that directly follows a box. For a candidate line from break `a` to break `b`, prefix sums give its natural width, total stretch and total shrink in O(1), and from those the adjustment ratio `r`: how far its glue must stretch (r > 0) or shrink (r < 0) to hit the target width. Lines with r < −1 are impossible (glue cannot shrink past its limit) and lines with r above the tolerance are rejected.

The search sweeps the nodes once and keeps an *active list* of breakpoints from which a feasible line might still end. At each legal breakpoint it evaluates every active node, records the cheapest way to arrive per fitness class (and per line number when line widths vary or looseness is set, because then two arrivals at the same place are not interchangeable), and retires active nodes whose lines have become overfull, since adding material can only make them worse. A forced break at the end of the paragraph closes the search, and the optimal breaks are recovered by following back pointers.

Two details that took some care:

* **Discarded material.** After a break, TeX throws away glue and penalties up to the next box. That is what makes the ragged right construction work (the negative stretch glue after each break disappears), and it means a breakpoint can lie inside the discarded run of an active node. Those are skipped rather than evaluated as empty or negative lines.
* **Floating point at the shrink limit.** With shrink of one third of a space, a line that shrinks exactly to its limit computes r as −1.0000000000000002 from prefix sum differences and would be wrongly rejected. The exhaustive tests found this; ratios within 1e−9 of −1 are snapped.

## Testing

`npm test` runs 30 tests with the built in `node:test` runner.

* **Optimality against brute force.** `test/helpers.js` contains an independent scorer written without prefix sums or active lists, and an exhaustive search over every subset of legal breakpoints. On seeded random paragraphs the optimiser's demerits must equal the brute force minimum exactly, for uniform widths, varying widths, and hyphenated text where flagged and fitness demerits come into play.
* **Never worse than greedy.** On 80 random paragraphs, scoring the greedy breaks with the same demerit function never beats the optimiser.
* **Behavioural tests** for tolerance, looseness, flagged demerits suppressing stacked hyphens, the emergency and last resort passes, forced breaks, and invalid input.
* **Layout and rendering.** Justified monospace output is flush on both margins at several widths, ragged and centred output never exceeds the width, centred lines are balanced to within one cell, proportional layout lands every line on its exact target width, and every original word survives the round trip through hyphenation.
* **Hyphenation.** The worked example from Appendix H of The TeXbook (`hy-phen-ation`, with the exact intermediate values), pattern round tripping, margins, exceptions, punctuation, the TeX file loader, and the learner on toy data, including generalising a rule to unseen words.

## The bundled hyphenation patterns

`data/patterns.js` is generated by `npm run patterns` from the 644 hand hyphenated words in `data/words.txt` (dictionary style, including a list of single syllable words that teach the learner where *not* to break). Six levels alternate between finding missed hyphens and suppressing wrong ones; the first level is deliberately strict because a wrong hyphen is far worse than a missed one, and the last hyphenating level allows no new errors.

The script reports an honest held out score as well as the training score:

```
held out (80/20 split) precision 78.5%  recall 73.8%
training set           precision 100.0%  recall 100.0%
```

That is good enough for the demo text and a fair illustration of the method, but 644 words is tiny next to the ~50,000 word dictionary used for TeX's US English patterns, and you will find unseen words it splits badly. For production typesetting, load the official patterns with `Hyphenator.fromTeX`. The optimiser also limits the damage: hyphen breaks cost 50 penalty points plus flagged demerits, so a hyphen is only used when it actually improves the paragraph.

## Design notes

* **Alignment lives in the data.** There is no `if (align === ...)` in the optimiser. Ragged right is `glue(0, 3s, 0) penalty(0, 0) glue(s, −3s, 0)` between words, which gives every line the same stretch no matter how many words it holds; centring adds stretch on both sides with a zero width box to stop it being discarded.
* **Layout recomputes ratios.** Emergency stretch only influences *which* breaks are chosen. When the lines are set, the ratio is recomputed from the real glue, so the text is still justified to the exact width, which is also how TeX behaves.
* **Monospace rounding.** The CLI places each box at the rounded absolute position rather than rounding each gap, which keeps the right margin exact and can never close a gap between words.
* **Limitations.** No kerning or ligatures, no margin kerning (hanging punctuation), and the CLI treats every character as one cell, so East Asian wide characters will misalign.

## References

* Donald E. Knuth and Michael F. Plass, *Breaking Paragraphs into Lines*, Software: Practice and Experience 11 (1981).
* Frank M. Liang, *Word Hy-phen-a-tion by Com-put-er*, Stanford PhD thesis (1983).
* Donald E. Knuth, *The TeXbook*, Appendix H (Hyphenation).

## License

MIT
