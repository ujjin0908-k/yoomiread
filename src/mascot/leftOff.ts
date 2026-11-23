import { db } from '../db';
import { isRead } from '../logic';
import type { Book, Chapter } from '../types';

/**
 * "Where you left off" for the Ask tab, kept cheap so the tab opens at once: chapter rows (no text), the story-so-far
 * summary from at most the last few translated chapters, and the latest big moments. Nothing past my reading line.
 */
export interface LeftOff {
  chapter?: Chapter;
  /** The last chapter I have finished (or a copied world's start). */
  line: number;
  soFar?: string;
  moments: string[];
  daysAway?: number;
}

/** A chapter's title without the number many titles carry ("6. The Cowardly Lion" → "The Cowardly Lion"). */
export function bareTitle(c: Pick<Chapter, 'title' | 'titleEn'>): string {
  return (c.titleEn ?? c.title ?? '').replace(/^\s*(?:chapter\s*)?\d+\s*[.:\-–—]?\s*/i, '').trim();
}

export async function leftOff(book: Book, now = Date.now()): Promise<LeftOff> {
  const chapters = (await db.chapters.where('bookId').equals(book.id).toArray()).sort((a, b) => a.number - b.number);
  let line = book.startLine ?? 0;
  for (const c of chapters) if (isRead(c) && c.number > line) line = c.number;
  const chapter = chapters.find((c) => c.id === book.lastChapterId) ?? chapters.filter((c) => c.number <= line).pop();
  // The summary a translation leaves behind, from the nearest finished chapter that has one (looking back at most 5).
  let soFar: string | undefined;
  for (const c of chapters.filter((c) => c.number <= line).slice(-5).reverse()) {
    const t = await db.translations.get(c.id);
    if (t?.summary) {
      soFar = t.summary;
      break;
    }
  }
  const moments = (await db.worldEvents.where('bookId').equals(book.id).toArray())
    .filter((e) => e.chapter !== undefined && e.chapter <= line)
    .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0))
    .slice(-3)
    .map((e) => e.title.replace(/[.!]$/, ''));
  return { chapter, line, soFar, moments, daysAway: book.lastReadAt ? Math.floor((now - book.lastReadAt) / 86_400_000) : undefined };
}
