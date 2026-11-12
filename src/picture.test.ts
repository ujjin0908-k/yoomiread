import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { YoomiDB, storePicturesAsBytes } from './db';
import { asStored, isPicture, pictureBlob } from './picture';
import type { Book } from './types';

describe('pictures saved as bytes', () => {
  it('turns an old Blob into bytes, and leaves bytes as they are', async () => {
    const pic = await asStored(new Blob([new Uint8Array([7, 8])], { type: 'image/png' }));
    expect(isPicture(pic)).toBe(true);
    expect([...new Uint8Array(pic!.bytes)]).toEqual([7, 8]);
    expect(await asStored(pic)).toBe(pic);
  });
  it('drops a Blob that can no longer be read, so the record can be saved again', async () => {
    const broken = new Blob(['x']);
    Object.defineProperty(broken, 'arrayBuffer', { value: () => Promise.reject(new Error('NotReadableError')) });
    expect(await asStored(broken)).toBeUndefined();
  });
  it('gives a Blob to show either kind', async () => {
    expect(pictureBlob({ type: 'image/png', bytes: new Uint8Array([1]).buffer })?.type).toBe('image/png');
    expect(pictureBlob(undefined)).toBeUndefined();
  });
  it('converts the covers already on the phone, once', async () => {
    const db = new YoomiDB('pictures-test');
    const book = { id: 'b', title: 'T', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 } as Book;
    // Put the old kind straight in, the way an older version saved it.
    await db.books.put({ ...book, cover: new Blob([new Uint8Array([9])], { type: 'image/jpeg' }) as unknown as Book['cover'] });
    await db.books.put({ ...book, id: 'c' });
    expect(await storePicturesAsBytes(db)).toBe(1);
    const saved = await db.books.get('b');
    expect(isPicture(saved?.cover)).toBe(true);
    expect([...new Uint8Array(saved!.cover!.bytes)]).toEqual([9]);
    expect(await storePicturesAsBytes(db)).toBe(0);
    await db.delete();
  });
});
