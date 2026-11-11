import { db } from './db';
import { computeStats } from './logic';
import type { Book, Chapter, Note } from './types';

/** The queries behind the four tabs. Shared by the pages and by the head start in App, so both fill the same memory. */
export const allBooks = () => db.books.toArray();
export const allChapters = () => db.chapters.toArray();

export const readingStats = async () => computeStats(await db.books.toArray(), await db.sessions.toArray());

export const aiSpent = async () => {
  const books = await db.books.toArray();
  return { total: books.reduce((sum, b) => sum + (b.spent ?? 0), 0), estimated: books.some((b) => b.spentEstimated) };
};

export type QuoteItem = { note: Note; book: Book; chapter?: Chapter };

export const allQuotes = async (): Promise<QuoteItem[]> => {
  const notes = await db.notes.where('kind').equals('highlight').reverse().sortBy('createdAt');
  const books = new Map((await db.books.toArray()).map((b) => [b.id, b]));
  // Only the chapters that have a highlight, not every chapter of every book.
  const ids = [...new Set(notes.map((n) => n.chapterId))];
  const chapters = new Map((await db.chapters.bulkGet(ids)).filter((c): c is Chapter => !!c).map((c) => [c.id, c]));
  return notes.filter((n) => books.has(n.bookId)).map((n) => ({ note: n, book: books.get(n.bookId)!, chapter: chapters.get(n.chapterId) }));
};
