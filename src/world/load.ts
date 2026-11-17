import { db } from '../db';
import type { GlossaryEntry } from '../types';
import { firstSeen } from './seen';
import { readingLine, worldAt, type WorldAt } from './visible';

/**
 * Loads a book's world as it stands at my reading line. The first-seen scan reads every chapter's text, so its result
 * is kept on the phone (settings key `world-seen:<bookId>`) and redone only when the names or the chapters change.
 */

/** A short fingerprint of what the scan depends on: every name, and every chapter's number and lengths. */
function fingerprint(entries: GlossaryEntry[], chapters: { id: string; number: number; length?: number }[], translated: Map<string, number>): string {
  const parts = [
    ...entries.map((g) => `${g.id}:${g.english}|${g.original}|${(g.aliases ?? []).join('|')}|${g.kind}`).sort(),
    ...chapters.map((c) => `${c.number}:${c.length ?? 0}:${translated.get(c.id) ?? 0}`).sort(),
  ];
  let h = 2166136261;
  const s = parts.join('\n');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${parts.length}:${(h >>> 0).toString(36)}`;
}

export async function loadFirstSeen(bookId: string): Promise<Map<string, number>> {
  const [entries, chapters] = await Promise.all([
    db.glossary.where('bookId').equals(bookId).toArray(),
    db.chapters.where('bookId').equals(bookId).toArray(),
  ]);
  const translatedLength = new Map<string, number>();
  await db.translations.where('bookId').equals(bookId).each((t) => translatedLength.set(t.chapterId, t.text.length));
  const sig = fingerprint(entries, chapters, translatedLength);
  const key = `world-seen:${bookId}`;
  const saved = (await db.settings.get(key))?.value as { sig: string; seen: [string, number][] } | undefined;
  if (saved?.sig === sig) return new Map(saved.seen);

  // One chapter at a time, so a big book never sits in memory all at once.
  const numberOf = new Map(chapters.map((c) => [c.id, c.number]));
  const texts: { number: number; texts: (string | undefined)[] }[] = [];
  const seen = new Map<string, number>();
  const merge = (found: Map<string, number>) => {
    for (const [id, n] of found) if (!seen.has(id) || n < seen.get(id)!) seen.set(id, n);
  };
  await db.texts.where('bookId').equals(bookId).each((t) => {
    texts.push({ number: numberOf.get(t.chapterId) ?? Number.MAX_SAFE_INTEGER, texts: [t.text] });
    if (texts.length >= 50) merge(firstSeen(entries, texts.splice(0)));
  });
  await db.translations.where('bookId').equals(bookId).each((t) => {
    texts.push({ number: numberOf.get(t.chapterId) ?? Number.MAX_SAFE_INTEGER, texts: [t.text] });
    if (texts.length >= 50) merge(firstSeen(entries, texts.splice(0)));
  });
  merge(firstSeen(entries, texts));
  await db.settings.put({ key, value: { sig, seen: [...seen] } });
  return seen;
}

/** The book's world at my reading line (or at `line` when given, for the chapter slider). */
export async function loadWorld(bookId: string, line?: number): Promise<WorldAt | undefined> {
  const book = await db.books.get(bookId);
  if (!book) return undefined;
  const [entries, links, events, notes, chapters, seen] = await Promise.all([
    db.glossary.where('bookId').equals(bookId).toArray(),
    db.worldLinks.where('bookId').equals(bookId).toArray(),
    db.worldEvents.where('bookId').equals(bookId).toArray(),
    db.notes.where('bookId').equals(bookId).toArray(),
    db.chapters.where('bookId').equals(bookId).toArray(),
    loadFirstSeen(bookId),
  ]);
  const reached = readingLine(book, chapters);
  // The slider may go back in time, never past what I have reached.
  const at = line === undefined ? reached : Math.min(line, reached);
  return worldAt({ entries, links, events, notes, chapters, firstSeen: seen }, { line: at, spoilers: !!book.worldSpoilers });
}
