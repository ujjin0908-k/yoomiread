import { chapterNumber } from './web';

/**
 * The chapter number of each title, in order. A title without a number ("Prologue", "Side story") takes the one after
 * the chapter before it, so a list that starts at chapter 521 keeps counting from 521.
 */
export function guessNumbers(titles: string[]): number[] {
  // "521: Title", as WebToEpub writes WTR-LAB chapters, counts too.
  const lead = (t: string) => {
    const m = /^\s*(\d{1,5})\s*[:.\-–—)]\s*\S/.exec(t);
    return m ? Number(m[1]) : undefined;
  };
  const written = titles.map((t) => chapterNumber(t) ?? lead(t));
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < titles.length; i++) {
    let n = written[i];
    if (n === undefined) {
      // A bonus chapter between 1080 and 1081 cannot take 1081: it gets 1080.1 (then 1080.2…).
      const next = written.slice(i + 1).find((x) => x !== undefined);
      n = next === undefined || next > prev + 1 ? prev + 1 : Math.round((prev + 0.1) * 10) / 10;
    }
    out.push(n);
    prev = n;
  }
  return out;
}

/** The positions whose number is from `from` to `to` (both included; either may be left empty). */
export function inRange(numbers: number[], from?: number, to?: number): number[] {
  const lo = from ?? -Infinity;
  const hi = to ?? Infinity;
  return numbers.flatMap((n, i) => (n >= Math.min(lo, hi) && n <= Math.max(lo, hi) ? [i] : []));
}

/**
 * The number each new chapter gets in the book: its own number when the book does not have it yet, otherwise the
 * next free one after everything in the book. `taken` is the numbers already in the book.
 */
export function placeNumbers(wanted: number[], taken: Iterable<number>): number[] {
  const used = new Set(taken);
  let top = Math.max(0, ...used);
  return wanted.map((n) => {
    const pick = n > 0 && !used.has(n) ? n : top + 1;
    used.add(pick);
    top = Math.max(top, pick);
    return pick;
  });
}

/** "Chapter 521 to 1488", for a picked range. */
export function rangeLabel(numbers: number[]): string {
  if (!numbers.length) return 'no chapters';
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  return lo === hi ? `chapter ${lo}` : `chapters ${lo} to ${hi}`;
}

/**
 * Chapter numbers for a new book: the numbers in the titles ("第521章", "Chapter 12") when they run in order, so a
 * book that starts at chapter 521 keeps its numbers; otherwise 1, 2, 3… as before.
 */
export function numbersFor(titles: string[]): number[] {
  const guessed = guessNumbers(titles);
  const rising = guessed.every((n, i) => i === 0 || n > guessed[i - 1]);
  return rising ? guessed : titles.map((_, i) => i + 1);
}
