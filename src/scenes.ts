import type { GlossaryEntry } from './types';

/**
 * The picture book: which place, god, group or term (a path, an item…) with a picture is first named in each
 * paragraph, once per chapter.
 * - A god with a one-word name ("Fate", "Time", "Order") counts only in brackets ("[Fate]"), the way the translation
 *   writes a god being named; "the Die of Fate" or "at that time" never call up the god.
 * - Any other one-word name counts in brackets or capitalised in the middle of a sentence.
 * - A name inside a longer glossary name ("Fate" in "Die of Fate", "Void" in "Path of the Void") does not count.
 * - Longer names ("Sea of Desire", "Grand Tribunal") and Chinese names count wherever they appear.
 */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function namedAt(paragraph: string, name: string, bracketsOnly = false): number {
  if (!name.trim()) return -1;
  if (/[^\x00-\x7f]/.test(name)) return paragraph.indexOf(name);
  const word = escape(name.trim());
  const patterns = /\s/.test(name.trim())
    ? [new RegExp(`(^|[^A-Za-z])${word}(?![A-Za-z])`)]
    : bracketsOnly
      ? [new RegExp(`[[【]${word}[\\]】]`)]
      : [new RegExp(`[[【]${word}[\\]】]`), new RegExp(`[a-z,;] (?:the |of |to |by |for )?${word}(?![A-Za-z])`)];
  let best = -1;
  for (const re of patterns) {
    const m = re.exec(paragraph);
    if (m) {
      const at = m.index + m[0].indexOf(name.trim());
      if (best < 0 || at < best) best = at;
    }
  }
  return best;
}

/** For each paragraph, the entry whose picture shows after it (or undefined). Each entry shows once per chapter. */
export function scenesFor(paragraphs: string[], entries: GlossaryEntry[]): (GlossaryEntry | undefined)[] {
  const withPicture = entries.filter((g) => g.picture && g.status === 'ok' && g.kind !== 'person');
  // Every glossary name, to find where a longer name of another entry covers a shorter one.
  const allNames = entries.flatMap((g) => [g.english, g.original, ...(g.aliases ?? [])].filter((n) => n && n.trim()).map((n) => ({ id: g.id, n: n.trim() })));
  const shown = new Set<string>();
  return paragraphs.map((text) => {
    const covered = (id: string, at: number, len: number) =>
      allNames.some((o) => {
        if (o.id === id || o.n.length <= len) return false;
        for (let from = text.indexOf(o.n); from >= 0; from = text.indexOf(o.n, from + 1)) if (from <= at && at + len <= from + o.n.length) return true;
        return false;
      });
    let first: { g: GlossaryEntry; at: number } | undefined;
    for (const g of withPicture) {
      if (shown.has(g.id)) continue;
      for (const raw of [g.english, g.original, ...(g.aliases ?? [])]) {
        const name = raw?.trim();
        if (!name) continue;
        const oneWordGod = g.kind === 'god' && !/\s/.test(name) && !/[^\x00-\x7f]/.test(name);
        const at = namedAt(text, name, oneWordGod);
        if (at >= 0 && !covered(g.id, at, name.length) && (!first || at < first.at)) first = { g, at };
      }
    }
    if (first) shown.add(first.g.id);
    return first?.g;
  });
}
