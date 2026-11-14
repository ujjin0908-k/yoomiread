import type { GlossaryEntry } from './types';

/**
 * Finds the glossary entry for words selected in the reader: "Fate", "[Deceit]", "Deceit's", "the Sea of Desire",
 * or just "Sansui" from "Cao Sansui". Returns undefined when nothing fits, or when a part of a name fits several.
 */
const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’「」『』[\]【】()（）]/g, (c) => (c === '’' || c === "'" ? "'" : ' '))
    .replace(/'s\b/g, '')
    .replace(/'/g, '')
    .replace(/^\s*the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function glossaryFor(selection: string, entries: GlossaryEntry[]): GlossaryEntry | undefined {
  const picked = clean(selection);
  if (!picked) return undefined;
  const named = entries.map((g) => ({ g, names: [g.english, g.original, ...(g.aliases ?? [])].map(clean).filter(Boolean) }));
  // 1. The selection is one of the names.
  const exact = named.find((n) => n.names.includes(picked));
  if (exact) return exact.g;
  // 2. A name sits inside the selection ("God of Deceit", "Lord Order said"): the longest one wins.
  const inside = named
    .flatMap((n) => n.names.filter((name) => name.length > 1 && new RegExp(`(^| )${escape(name)}( |$)`).test(picked)).map((name) => ({ g: n.g, len: name.length })))
    .sort((a, b) => b.len - a.len);
  if (inside.length) return inside[0].g;
  // 3. The selection is a whole word of exactly one name ("Sansui" of "Cao Sansui").
  if (picked.length < 3) return undefined;
  const part = named.filter((n) => n.names.some((name) => name.split(' ').includes(picked) || (/\p{Script=Han}/u.test(picked) && name.includes(picked))));
  return part.length === 1 ? part[0].g : undefined;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
