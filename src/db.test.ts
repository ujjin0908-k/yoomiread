import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YoomiDB } from './db';
import { makeBackup, parseBackup } from './backup';
import type { Book, Chapter, Note } from './types';

const book: Book = { id: 'b1', title: 'A', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 };
const chapter: Chapter = { id: 'c1', bookId: 'b1', number: 1, title: 'One', read: false, createdAt: 1 };
const note: Note = { id: 'n1', bookId: 'b1', chapterId: 'c1', kind: 'chapter', body: 'Nice', createdAt: 1, updatedAt: 1 };

let db: YoomiDB;

afterEach(async () => {
  await db.delete();
});

describe('database', () => {
  it('deleting a book removes its chapters and notes', async () => {
    db = new YoomiDB('t1');
    await db.books.add(book);
    await db.chapters.add(chapter);
    await db.notes.add(note);
    await db.deleteBook('b1');
    expect(await db.chapters.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
  });

  it('restore replaces everything', async () => {
    db = new YoomiDB('t2');
    await db.books.add({ ...book, id: 'old' });
    await db.restore(parseBackup(JSON.stringify(await makeBackup({ books: [book], chapters: [chapter], notes: [note], sessions: [] }))));
    expect((await db.books.toArray()).map((b) => b.id)).toEqual(['b1']);
    expect(await db.notes.count()).toBe(1);
  });
});

describe('deleting', () => {
  it('a book also removes its reading sessions', async () => {
    db = new YoomiDB('t3');
    await db.books.add(book);
    await db.sessions.add({ id: 's1', bookId: 'b1', chapterId: 'c1', startedAt: 1, ms: 60_000 });
    await db.deleteBook('b1');
    expect(await db.sessions.count()).toBe(0);
  });
});
