import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YoomiDB } from './db';
import { makeBackup, parseBackup } from './backup';
import { movePhoneBackdropToBook } from './backdrop';
import type { Book } from './types';

const picture = { type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]).buffer };
const book = (id: string, lastReadAt?: number, extra: Partial<Book> = {}): Book => ({ id, title: id, author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1, lastReadAt, ...extra });
let db: YoomiDB;
afterEach(async () => {
  await db.delete();
});

describe('a background for each book', () => {
  it('moves the old phone-wide background to the book read most recently, once', async () => {
    db = new YoomiDB('bd1');
    await db.books.bulkAdd([book('old', 5), book('foolish', 50), book('never')]);
    await db.settings.put({ key: 'readerBackdrop', value: { picture, cover: 0.7 } });
    expect(await movePhoneBackdropToBook(db)).toBe('foolish');
    expect((await db.books.get('foolish'))?.backdrop?.cover).toBe(0.7);
    expect((await db.books.get('old'))?.backdrop).toBeUndefined();
    expect(await db.settings.get('readerBackdrop')).toBeUndefined();
    expect(await movePhoneBackdropToBook(db)).toBeUndefined();
  });

  it('keeps a book’s own background if it already has one', async () => {
    db = new YoomiDB('bd2');
    await db.books.add(book('foolish', 50, { backdrop: { picture, cover: 0.9 } }));
    await db.settings.put({ key: 'readerBackdrop', value: { picture, cover: 0.6 } });
    await movePhoneBackdropToBook(db);
    expect((await db.books.get('foolish'))?.backdrop?.cover).toBe(0.9);
  });

  it('goes into backups and comes back', async () => {
    db = new YoomiDB('bd3');
    const raw = JSON.stringify(await makeBackup({ books: [book('foolish', 1, { backdrop: { picture, cover: 0.75 } })], chapters: [], notes: [], sessions: [], glossary: [] }));
    await db.restore(parseBackup(raw));
    const back = (await db.books.get('foolish'))?.backdrop;
    expect(back?.cover).toBe(0.75);
    expect(new Uint8Array(back!.picture.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
