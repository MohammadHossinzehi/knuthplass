// Frank Liang's hyphenation algorithm (Word Hy-phen-a-tion by Com-put-er, 1983), as used by TeX.
//
// A pattern such as "hen5at" says: inside the letters "henat", the position between "n" and "a"
// gets the value 5. Every pattern that matches a word votes on every inter letter position; the
// highest value wins. Odd values allow a hyphen, even values forbid one. Because later (higher)
// levels override earlier ones, a small set of patterns can encode both rules and exceptions.

const LETTER = /\p{L}/u;

/** Split a TeX style pattern like "hy3ph" into its letters and its inter letter values. */
export function parsePattern(pattern) {
  let letters = '';
  const points = [0];
  for (const ch of pattern) {
    if (ch >= '0' && ch <= '9') points[points.length - 1] = Number(ch);
    else {
      letters += ch;
      points.push(0);
    }
  }
  return { letters, points };
}

/** Inverse of parsePattern: "hyph" + [0,0,3,0,0] -> "hy3ph". */
export function formatPattern(letters, points) {
  let out = '';
  const chars = [...letters];
  for (let i = 0; i <= chars.length; i++) {
    if (points[i]) out += String(points[i]);
    if (i < chars.length) out += chars[i];
  }
  return out;
}

export class Hyphenator {
  /**
   * @param {string[]} patterns Liang patterns, "." marks a word boundary
   * @param {object} [options]
   * @param {string[]} [options.exceptions] explicit hyphenations like "ta-ble" that bypass patterns
   * @param {number} [options.leftMin=2] minimum letters before the first hyphen
   * @param {number} [options.rightMin=3] minimum letters after the last hyphen
   */
  constructor(patterns = [], { exceptions = [], leftMin = 2, rightMin = 3 } = {}) {
    this.leftMin = leftMin;
    this.rightMin = rightMin;
    this.root = { children: new Map(), points: null };
    this.size = 0;
    for (const p of patterns) this.addPattern(p);
    this.exceptions = new Map();
    for (const e of exceptions) this.addException(e);
  }

  /** Build a hyphenator from a TeX file containing \patterns{...} and \hyphenation{...}. */
  static fromTeX(source, options = {}) {
    const clean = source.replace(/%.*$/gm, '');
    const block = (name) => {
      const m = clean.match(new RegExp(`\\\\${name}\\s*\\{([^}]*)\\}`));
      return m ? m[1].split(/\s+/).filter(Boolean) : [];
    };
    return new Hyphenator(block('patterns'), { ...options, exceptions: block('hyphenation') });
  }

  addPattern(pattern) {
    const { letters, points } = parsePattern(pattern);
    let node = this.root;
    for (const ch of letters) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), points: null };
        node.children.set(ch, next);
      }
      node = next;
    }
    if (!node.points) this.size++;
    node.points = points;
  }

  addException(hyphenated) {
    const parts = hyphenated.toLowerCase().split('-');
    const positions = [];
    let at = 0;
    for (let i = 0; i < parts.length - 1; i++) {
      at += [...parts[i]].length;
      positions.push(at);
    }
    this.exceptions.set(parts.join(''), positions);
  }

  /**
   * Raw Liang values for a word: an array of length word.length + 1 where entry t is the winning
   * value for the position just before letter t.
   */
  values(word) {
    const w = ['.', ...word.toLowerCase(), '.'];
    const pts = new Array(w.length + 1).fill(0);
    for (let i = 0; i < w.length; i++) {
      let node = this.root;
      for (let j = i; j < w.length; j++) {
        node = node.children.get(w[j]);
        if (!node) break;
        if (node.points) {
          const p = node.points;
          for (let k = 0; k < p.length; k++) if (p[k] > pts[i + k]) pts[i + k] = p[k];
        }
      }
    }
    return pts.slice(1, w.length);
  }

  /** Positions (counted in letters) where a hyphen may be inserted. */
  hyphenPositions(word) {
    const letters = [...word];
    const lower = word.toLowerCase();
    if (this.exceptions.has(lower)) return this.exceptions.get(lower).slice();
    const vals = this.values(word);
    const out = [];
    for (let t = this.leftMin; t <= letters.length - this.rightMin; t++) {
      if (vals[t] % 2 === 1) out.push(t);
    }
    return out;
  }

  /**
   * Split a word into hyphenatable fragments. Leading and trailing punctuation stays attached to
   * the first and last fragment; anything that is not a plain run of letters is left whole.
   */
  hyphenate(word) {
    const chars = [...word];
    let lo = 0;
    let hi = chars.length;
    while (lo < hi && !LETTER.test(chars[lo])) lo++;
    while (hi > lo && !LETTER.test(chars[hi - 1])) hi--;
    const core = chars.slice(lo, hi);
    if (core.length === 0 || !core.every((c) => LETTER.test(c))) return [word];
    const cuts = this.hyphenPositions(core.join(''));
    if (cuts.length === 0) return [word];
    const parts = [];
    let prev = 0;
    for (const c of [...cuts, core.length]) {
      parts.push(core.slice(prev, c).join(''));
      prev = c;
    }
    parts[0] = chars.slice(0, lo).join('') + parts[0];
    parts[parts.length - 1] += chars.slice(hi).join('');
    return parts;
  }
}
