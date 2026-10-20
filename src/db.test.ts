import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
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

describe('chapter text in its own table', () => {
  it('moves text out of chapters when an old (v2) database opens', async () => {
    // Build a database the way v0.2 stored it: text inside the chapter.
    const old = new Dexie('t-upgrade');
    old.version(2).stores({
      books: 'id, shelf, updatedAt, lastReadAt',
      chapters: 'id, bookId, [bookId+number]',
      notes: 'id, bookId, chapterId, kind, createdAt',
      sessions: 'id, bookId, startedAt',
    });
    await old.table('books').add(book);
    await old.table('chapters').bulkAdd([
      { ...chapter, text: '她提着灯笼走过了小桥。' },
      { ...chapter, id: 'c2', number: 2, text: undefined },
    ]);
    old.close();

    db = new YoomiDB('t-upgrade');
    const moved = await db.chapters.get('c1');
    expect(moved).not.toHaveProperty('text');
    expect(moved?.length).toBe(11);
    expect((await db.texts.get('c1'))?.text).toBe('她提着灯笼走过了小桥。');
    expect(await db.texts.get('c2')).toBeUndefined();
  });

  it('keeps text with backups and removes it with its chapter or book', async () => {
    db = new YoomiDB('t-texts');
    await db.books.add(book);
    await db.addChapters([{ chapter, text: 'One line.' }, { chapter: { ...chapter, id: 'c2', number: 2 }, text: 'Two.' }]);
    const exported = await db.exportAll();
    expect(exported.chapters.find((c) => c.id === 'c1')?.text).toBe('One line.');

    await db.restore(parseBackup(JSON.stringify(await makeBackup(exported))));
    expect((await db.texts.get('c2'))?.text).toBe('Two.');
    expect((await db.chapters.get('c2'))?.length).toBe(4);

    await db.deleteChapter('c2');
    expect(await db.texts.get('c2')).toBeUndefined();
    await db.deleteBook('b1');
    expect(await db.texts.count()).toBe(0);
  });
});
