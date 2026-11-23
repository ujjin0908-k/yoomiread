import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { db, YoomiDB } from './db';
import { chaptersWithoutText, fillFromDrafts, matchChapters } from './fillText';
import { syncOnce, type Remote, type SyncRow } from './sync';
import type { Chapter } from './types';

const oz = JSON.parse(gunzipSync(readFileSync('public/samples/oz.json.gz')).toString()) as { chapters: { title: string; text: string }[] };
const ch = (i: number, title: string, extra: Partial<Chapter> = {}): Chapter => ({ id: `c${i}`, bookId: 'b', number: i, title, read: false, createdAt: 1, length: 10, ...extra });

describe('matching a file to a book', () => {
  it('finds every chapter of the same book', () => {
    const book = oz.chapters.map((c, i) => ch(i + 1, c.title));
    const { texts, share } = matchChapters(book, oz.chapters);
    expect(share).toBe(1);
    expect(texts.get('c1')).toMatch(/^Dorothy lived in the midst/);
    expect(texts.get('c24')).toMatch(/Aunt Em/);
  });

  it('finds the chapters of a book that was cut down to some chapters', () => {
    const book = oz.chapters.slice(0, 10).map((c, i) => ch(i + 1, c.title));
    expect(matchChapters(book, oz.chapters).share).toBe(1);
  });

  it('does not take another book for this one', () => {
    const other = Array.from({ length: 24 }, (_, i) => ch(i + 1, `Part ${i + 1}: Somewhere else`));
    expect(matchChapters(other, oz.chapters.slice(0, 20)).share).toBe(0);
  });
});

/** A server in memory, as in sync.test.ts. */
function server() {
  const rows = new Map<string, SyncRow & { device: string }>();
  let clock = 0;
  return {
    rows,
    remoteFor: (device: string): Remote => ({
      async push(list) {
        for (const r of list) rows.set(`${r.tbl}:${r.id}`, { ...structuredClone(r), device, updated_at: `t${String(++clock).padStart(6, '0')}` });
      },
      async pull(since) {
        return [...rows.values()].filter((r) => r.device !== device && (!since || r.updated_at! >= since)).sort((a, b) => a.updated_at!.localeCompare(b.updated_at!)).map((r) => structuredClone(r));
      },
    }),
  };
}

const extra: YoomiDB[] = [];
afterEach(async () => {
  await Promise.all(extra.splice(0).map((d) => d.delete()));
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('a second device without book text', () => {
  it('gets the book with notes but no text, then fills it from the same file, notes untouched', async () => {
    const s = server();
    const phone = new YoomiDB(`fill-phone-${Math.random()}`);
    extra.push(phone);
    await phone.books.add({ id: 'b', title: 'Oz', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    await phone.addChapters(oz.chapters.map((c, i) => ({ chapter: ch(i + 1, c.title), text: c.text })));
    await phone.notes.add({ id: 'n1', bookId: 'b', chapterId: 'c1', kind: 'highlight', quote: 'Kansas', start: 40, end: 46, createdAt: 2 } as never);
    await syncOnce(phone, s.remoteFor('phone'), { noBookText: true });
    expect([...s.rows.values()].some((r) => r.tbl === 'texts')).toBe(false);

    // The second device is the app's own database here, so the fill functions run on it.
    await syncOnce(db, s.remoteFor('tablet'), { noBookText: true });
    expect(await db.chapters.count()).toBe(24);
    expect(await db.texts.count()).toBe(0);
    expect(await chaptersWithoutText('b')).toHaveLength(24);

    const r = await fillFromDrafts('b', oz.chapters);
    expect(r).toEqual({ filled: 24, stillEmpty: 0 });
    expect((await db.texts.get('c1'))!.text).toMatch(/^Dorothy lived/);
    expect(await db.notes.get('n1')).toMatchObject({ quote: 'Kansas' });
    expect(await chaptersWithoutText('b')).toHaveLength(0);
    // Filled text stays on this device too.
    await syncOnce(db, s.remoteFor('tablet'), { noBookText: true });
    expect([...s.rows.values()].some((r) => r.tbl === 'texts')).toBe(false);
  });

  it('refuses a different book and changes nothing', async () => {
    await db.books.add({ id: 'b', title: 'Other', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    await db.chapters.bulkAdd(Array.from({ length: 5 }, (_, i) => ch(i + 1, `Elsewhere ${i + 1}`)));
    await expect(fillFromDrafts('b', [{ title: 'Unrelated', text: 'x' }])).rejects.toThrow(/does not look like the same book/);
    expect(await db.texts.count()).toBe(0);
  });

  it('never overwrites a chapter that already has text', async () => {
    await db.books.add({ id: 'b', title: 'Oz', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    await db.addChapters([{ chapter: ch(1, oz.chapters[0].title), text: 'My own edited text.' }]);
    await db.chapters.add(ch(2, oz.chapters[1].title));
    const r = await fillFromDrafts('b', oz.chapters.slice(0, 2));
    expect(r.filled).toBe(1);
    expect((await db.texts.get('c1'))!.text).toBe('My own edited text.');
  });
});

describe('the free sample', () => {
  it('syncs its text even when book text stays on the phone', async () => {
    const s = server();
    const phone = new YoomiDB(`fill-sample-${Math.random()}`);
    extra.push(phone);
    await phone.books.bulkAdd([
      { id: 'oz', title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum', language: 'en', shelf: 'reading', sample: true, createdAt: 1, updatedAt: 1 },
      { id: 'mine', title: 'Mine', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 },
    ]);
    await phone.addChapters([
      { chapter: { ...ch(1, 'One'), id: 'oz1', bookId: 'oz' }, text: 'Public domain text.' },
      { chapter: { ...ch(1, 'One'), id: 'm1', bookId: 'mine' }, text: 'Private text.' },
    ]);
    await syncOnce(phone, s.remoteFor('phone'), { noBookText: true, textAlways: ['oz'] });
    const sent = JSON.stringify([...s.rows.values()]);
    expect(sent).toContain('Public domain text.');
    expect(sent).not.toContain('Private text.');
  });
});
