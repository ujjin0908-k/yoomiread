import type { GlossaryEntry } from './types';

/**
 * The picture book: which place, god or group with a picture is first named in each paragraph, once per chapter.
 * A one-word English name ("Time", "Order", "Death") is also an everyday word, so it only counts in brackets
 * ("[Time]", the way the translation writes gods) or capitalised in the middle of a sentence ("the god of Death").
 * Longer names ("Sea of Desire", "Grand Tribunal") and Chinese names count wherever they appear.
 */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function namedAt(paragraph: string, name: string): number {
  if (!name.trim()) return -1;
  if (/[^\x00-\x7f]/.test(name)) return paragraph.indexOf(name);
  const word = escape(name.trim());
  const patterns = /\s/.test(name.trim())
    ? [new RegExp(`(^|[^A-Za-z])${word}(?![A-Za-z])`)]
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
  const withPicture = entries.filter((g) => g.picture && g.status === 'ok' && (g.kind === 'place' || g.kind === 'god' || g.kind === 'group'));
  const shown = new Set<string>();
  return paragraphs.map((text) => {
    let first: { g: GlossaryEntry; at: number } | undefined;
    for (const g of withPicture) {
      if (shown.has(g.id)) continue;
      for (const name of [g.english, g.original, ...(g.aliases ?? [])]) {
        const at = namedAt(text, name);
        if (at >= 0 && (!first || at < first.at)) first = { g, at };
      }
    }
    if (first) shown.add(first.g.id);
    return first?.g;
  });
}
