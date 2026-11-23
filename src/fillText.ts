import { db } from './db';
import type { DraftChapter } from './import/chapters';
import { numbersFor } from './import/range';
import type { Chapter } from './types';

/**
 * "Fill in from file": on a device that got a book through sync without its text ("Include book text" off), the reader
 * picks the same PDF or ePub and the empty chapters get their text back. Notes, highlights and progress are kept:
 * only chapters with no text are filled, and nothing is ever overwritten.
 */

/** Chapters whose text is on another device: they had text (a length) when synced, but none is here. */
export async function chaptersWithoutText(bookId: string): Promise<Chapter[]> {
  const chapters = await db.chapters.where('bookId').equals(bookId).toArray();
  const have = new Set((await db.texts.where('bookId').equals(bookId).primaryKeys()) as string[]);
  return chapters.filter((c) => (c.length ?? 0) > 0 && !have.has(c.id));
}

const plain = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();

/**
 * Pairs the file's chapters with the book's, the way the book was first imported (same empty-page rule, same
 * numbering): by number and title, then by title alone, then by position when the counts match. Returns chapter id →
 * text, and how sure the match is (the share of the book's chapters found in the file).
 */
export function matchChapters(book: Chapter[], drafts: DraftChapter[]): { texts: Map<string, string>; share: number } {
  const kept = drafts.some((d) => d.text.trim()) ? drafts.filter((d) => d.text.trim()) : drafts;
  const numbers = numbersFor(kept.map((d) => d.title));
  const file = kept.map((d, i) => ({ number: numbers[i], title: plain(d.title), text: d.text }));
  const texts = new Map<string, string>();
  const used = new Set<number>();
  const take = (c: Chapter, i: number) => {
    texts.set(c.id, file[i].text);
    used.add(i);
  };
  const sorted = [...book].sort((a, b) => a.number - b.number);
  for (const c of sorted) {
    const i = file.findIndex((f, j) => !used.has(j) && f.number === c.number && f.title === plain(c.title));
    if (i >= 0) take(c, i);
  }
  for (const c of sorted.filter((c) => !texts.has(c.id))) {
    const same = file.map((f, j) => (!used.has(j) && f.title && f.title === plain(c.title) ? j : -1)).filter((j) => j >= 0);
    if (same.length === 1) take(c, same[0]);
  }
  if (file.length === sorted.length) {
    sorted.forEach((c, i) => {
      if (!texts.has(c.id) && !used.has(i)) take(c, i);
    });
  }
  return { texts, share: sorted.length ? texts.size / sorted.length : 0 };
}

/** Reads a PDF or ePub into chapters, with the app's own importers. */
export async function readBookFile(file: File): Promise<DraftChapter[]> {
  if (/\.epub$/i.test(file.name) || file.type === 'application/epub+zip') {
    const { readEpub } = await import('./import/epub');
    return readEpub(new Uint8Array(await file.arrayBuffer())).chapters;
  }
  const { importPdf } = await import('./import/pdf');
  return (await importPdf(file)).chapters;
}

/**
 * Fills the book's empty chapters from the file's chapters. Refuses a file that matches fewer than half the book's
 * chapters (most likely another book or another edition). Returns how many chapters were filled.
 */
export async function fillFromDrafts(bookId: string, drafts: DraftChapter[]): Promise<{ filled: number; stillEmpty: number }> {
  const all = await db.chapters.where('bookId').equals(bookId).toArray();
  const { texts, share } = matchChapters(all, drafts);
  if (share < 0.5) throw new Error('This file does not look like the same book (or the same edition). Nothing was changed.');
  const empty = await chaptersWithoutText(bookId);
  let filled = 0;
  for (const c of empty) {
    const text = texts.get(c.id);
    if (!text?.trim()) continue;
    await db.setText(c, text);
    filled++;
  }
  return { filled, stillEmpty: empty.length - filled };
}
