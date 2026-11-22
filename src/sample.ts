import { db } from './db';
import { gzipJson } from './gzipJson';
import { applyGuide } from './guides';
import { newId } from './logic';
import type { Book } from './types';

/** The free sample book: "The Wonderful Wizard of Oz" (L. Frank Baum, 1900), public domain. Text from Standard Ebooks. */
export const SAMPLE_TITLE = 'The Wonderful Wizard of Oz';

interface SampleFile {
  title: string;
  author: string;
  chapters: { title: string; text: string }[];
}

/**
 * Adds the sample book with its guide already applied (cast, places, links and events), so a new reader sees the
 * whole app working, offline and with no key. Returns the book's id; when it is already in the library, that one.
 */
export async function addSampleBook(now = Date.now()): Promise<string> {
  const have = (await db.books.toArray()).find((b) => b.title === SAMPLE_TITLE);
  if (have) return have.id;
  const res = await fetch('/samples/oz.json.gz');
  if (!res.ok) throw new Error('The sample book could not be loaded. Try again when online.');
  const file = await gzipJson<SampleFile>(res);
  const book: Book = {
    id: newId(),
    title: file.title,
    author: file.author,
    language: 'en',
    genre: 'fantasy',
    shelf: 'reading',
    source: 'manual',
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.books, db.chapters, db.texts, async () => {
    await db.books.add(book);
    await db.addChapters(
      file.chapters.map((c, i) => ({
        chapter: { id: newId(), bookId: book.id, number: i + 1, title: c.title, read: false, createdAt: now },
        text: c.text,
      })),
    );
  });
  await applyGuide(book.id, (await import('./guides/oz')).OZ, now);
  return book.id;
}
