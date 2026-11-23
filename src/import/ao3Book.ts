import { db } from '../db';
import { genreOf, guessGenre } from '../genres';
import { applyGuide } from '../guides';
import { newId } from '../logic';
import type { Book, Chapter } from '../types';
import { ao3Guide, type Ao3Work } from './ao3';
import type { DraftChapter } from './chapters';
import { numbersFor } from './range';

/** True when AI may be used for this book: always, except fan works whose reader has not turned it on. */
export function aiAllowedFor(book: Pick<Book, 'ao3' | 'aiOk'> | undefined | null): boolean {
  return !book?.ao3 || !!book.aiOk;
}

/** The message shown when AI is asked for on a fan work that keeps it off. */
export const AI_OFF_FOR_FAN_WORK = 'AI is off for this fan work. You can turn it on in Edit details.';

/** The book already in the library for this AO3 work, if any. */
export async function bookForAo3(url: string | undefined): Promise<Book | undefined> {
  if (!url) return undefined;
  return (await db.books.toArray()).find((b) => b.ao3?.url === url);
}

/** After a new AO3 work is saved: its cast and relationships from the tags (free), and a genre guessed from the tags. */
export async function setUpAo3Book(bookId: string, work: Ao3Work, title: string): Promise<void> {
  await applyGuide(bookId, ao3Guide(work, title));
  const book = await db.books.get(bookId);
  if (book && genreOf(book).id === 'general') {
    const genre = guessGenre([...work.tags, ...work.fandoms, work.summary ?? ''].join('. ').repeat(4));
    if (genre) await db.books.update(bookId, { genre });
  }
}

const plain = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A newer download of a work already in the library (a work in progress got new chapters): adds the chapters that
 * are not there yet, after the last one, and refreshes the work's details. Nothing already there is changed, so
 * notes, highlights and progress stay. Returns how many chapters were added.
 */
export async function addNewAo3Chapters(book: Book, drafts: DraftChapter[], work: Ao3Work): Promise<number> {
  const have = (await db.chapters.where('bookId').equals(book.id).sortBy('number')) as Chapter[];
  const titles = new Set(have.map((c) => plain(c.title)));
  const kept = drafts.filter((d) => d.text.trim());
  // Chapters past the ones already there, by position; a title already in the book is never added twice.
  const fresh = kept.slice(have.length).filter((d) => !titles.has(plain(d.title)));
  const now = Date.now();
  const last = have.length ? have[have.length - 1].number : 0;
  const numbers = numbersFor(fresh.map((d) => d.title)).map((n, i) => (n > last ? n : last + i + 1));
  if (fresh.length) {
    await db.addChapters(
      fresh.map((d, i) => ({ chapter: { id: newId(), bookId: book.id, number: numbers[i], title: d.title, read: false, createdAt: now }, text: d.text })),
    );
  }
  await db.books.update(book.id, { ao3: work, updatedAt: now });
  return fresh.length;
}
