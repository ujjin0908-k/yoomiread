import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YoomiDB } from './db';
import { makeBackup } from './backup';
import { backupBlob } from './backupNow';
import type { Book, Chapter } from './types';

let db: YoomiDB;
afterEach(async () => {
  await db.delete();
});

describe('backup file built in pieces', () => {
  it('holds the same data as the whole-library backup', async () => {
    db = new YoomiDB('backup-blob');
    const cover = { type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer };
    const books: Book[] = ['b1', 'b2'].map((id) => ({
      id, title: id, author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1, cover,
    }));
    await db.books.bulkAdd(books);
    const chapters: { chapter: Chapter; text?: string }[] = [];
    for (let i = 0; i < 45; i++) {
      chapters.push({
        chapter: { id: `c${i}`, bookId: i % 2 ? 'b1' : 'b2', number: i, title: `${i}`, read: false, createdAt: 1 },
        text: i % 3 ? `text "${i}" ✓\n` : undefined,
      });
    }
    await db.addChapters(chapters);
    await db.translations.put({ chapterId: 'c4', bookId: 'b2', text: 'translated' } as never);
    await db.notes.put({ id: 'n1', bookId: 'b1', chapterId: 'c1', kind: 'chapter', body: 'x', createdAt: 1, updatedAt: 1 });

    const got = JSON.parse(await (await backupBlob(db, 5)).text());
    const want = JSON.parse(JSON.stringify(await makeBackup(await db.exportAll(), 5)));
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(got.chapters.sort(byId)).toEqual(want.chapters.sort(byId));
    expect({ ...got, chapters: [] }).toEqual({ ...want, chapters: [] });
  });
});
