import type { GlossaryEntry } from '../types';

/**
 * The Living Book: the chapter in which each glossary entry is first named. Found on the phone, from the chapter text
 * and its translation, so it costs nothing and works offline. It is what lets a person, place or god appear in the
 * world only once the story has reached them.
 *
 * Name rules follow the reader's (see `namedAt` in src/scenes.ts):
 * - Chinese names count wherever they appear.
 * - Latin names must stand as whole words, with their capitals ("Song" is not in "Songs" or "a song").
 * - A one-word god ("Fate", "Time") counts only in brackets ("[Fate]"); another one-word name that is not a person
 *   counts in brackets or capitalised in the middle of a sentence ("the Void"), not at the start of one.
 * - Names of one Latin letter are ignored.
 * One pass over each chapter with a single pattern, so a thousand chapters and hundreds of names stay quick.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isLatin = (s: string) => /^[\x00-\x7f]+$/.test(s);
const isLetter = (c: string | undefined) => !!c && /[A-Za-z]/.test(c);

type Rule = 'any' | 'word' | 'brackets' | 'midSentence';

interface Name {
  ids: string[];
  rule: Rule;
}

/** Every name of every entry, with the rule it must meet to count. */
function namesTable(entries: GlossaryEntry[]): Map<string, Name> {
  const table = new Map<string, Name>();
  for (const g of entries) {
    const names = [g.english, g.original, ...(g.aliases ?? [])].map((n) => n?.trim()).filter((n): n is string => !!n);
    for (const n of new Set(names)) {
      if (isLatin(n) && n.length < 2) continue;
      const oneWord = isLatin(n) && !/\s/.test(n);
      const rule: Rule = !isLatin(n) ? 'any' : !oneWord || g.kind === 'person' ? 'word' : g.kind === 'god' ? 'brackets' : 'midSentence';
      const had = table.get(n);
      if (had) {
        had.ids.push(g.id);
        // Several entries share a name: the strictest rule wins, so a god's rule is never loosened by a term.
        const order: Rule[] = ['any', 'word', 'midSentence', 'brackets'];
        if (order.indexOf(rule) > order.indexOf(had.rule)) had.rule = rule;
      } else table.set(n, { ids: [g.id], rule });
    }
  }
  return table;
}

function meets(text: string, at: number, name: string, rule: Rule): boolean {
  if (rule === 'any') return true;
  const before = text[at - 1];
  const after = text[at + name.length];
  if (isLetter(before) || isLetter(after)) return false;
  if (rule === 'word') return true;
  const bracketed = (before === '[' || before === '【') && (after === ']' || after === '】');
  if (bracketed) return true;
  if (rule === 'brackets') return false;
  // Mid-sentence: a lower-case word, comma or semicolon, a space, then an optional small word before the name.
  return /[a-z,;] (?:the |of |to |by |for )?$/.test(text.slice(Math.max(0, at - 6), at));
}

/** A finder that reports the ids of the entries named in a piece of text. Build once, use for every chapter. */
export function nameFinder(entries: GlossaryEntry[]): (text: string) => Set<string> {
  const table = namesTable(entries);
  const names = [...table.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return () => new Set();
  const pattern = new RegExp(names.map(escape).join('|'), 'g');
  return (text: string) => {
    const found = new Set<string>();
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const name = m[0];
      const entry = table.get(name)!;
      if (meets(text, m.index, name, entry.rule)) entry.ids.forEach((id) => found.add(id));
      else pattern.lastIndex = m.index + 1; // failed its rule: look again from the next character
    }
    return found;
  };
}

/**
 * The first chapter number each entry is named in. `chapters` must give each chapter's number and its texts (original
 * and/or translation); they may come in any order. Entries never named are left out.
 */
export function firstSeen(entries: GlossaryEntry[], chapters: Iterable<{ number: number; texts: (string | undefined)[] }>): Map<string, number> {
  const find = nameFinder(entries);
  const first = new Map<string, number>();
  for (const c of chapters) {
    for (const text of c.texts) {
      if (!text) continue;
      for (const id of find(text)) {
        const had = first.get(id);
        if (had === undefined || c.number < had) first.set(id, c.number);
      }
    }
  }
  return first;
}
