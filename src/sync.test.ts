import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YoomiDB } from './db';
import { batches, decodeRow, encodeRow, keepBooks, lastSyncUndo, syncOnce, undoLastSync, type Remote, type SyncRow } from './sync';
import type { Book } from './types';

/** A server in memory: one row per (table, id), each with a rising server time; a device never gets its own back. */
function server() {
  const rows = new Map<string, SyncRow & { device: string }>();
  let clock = 0;
  const remoteFor = (device: string): Remote => ({
    async push(list) {
      for (const r of list) {
        clock++;
        rows.set(`${r.tbl}:${r.id}`, { ...structuredClone(r), device, updated_at: `t${String(clock).padStart(6, '0')}` });
      }
    },
    async pull(since) {
      return [...rows.values()]
        .filter((r) => r.device !== device && (!since || r.updated_at! >= since))
        .sort((a, b) => a.updated_at!.localeCompare(b.updated_at!))
        .map((r) => structuredClone(r));
    },
  });
  return { rows, remoteFor };
}

const dbs: YoomiDB[] = [];
const device = (name: string) => {
  const db = new YoomiDB(`sync-${name}-${Math.random()}`);
  dbs.push(db);
  return db;
};
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()));
});

const book = (id: string, extra: Partial<Book> = {}): Book => ({ id, title: id, author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1, ...extra });
const cover = { type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3, 250]).buffer };

describe('sync between two phones', () => {
  it('copies a whole book (with its cover, chapter text and notes) to the other phone', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.add(book('b1', { cover }));
    await phone.addChapters([{ chapter: { id: 'c1', bookId: 'b1', number: 1, title: 'One', read: false, createdAt: 1 }, text: 'Dorothy lived in Kansas.' }]);
    await phone.notes.add({ id: 'n1', bookId: 'b1', chapterId: 'c1', kind: 'highlight', quote: 'Kansas', start: 18, end: 24, createdAt: 2 } as never);

    expect(await syncOnce(phone, s.remoteFor('phone'))).toMatchObject({ sent: 4, received: 0 });
    expect(await syncOnce(tablet, s.remoteFor('tablet'))).toMatchObject({ received: 4 });

    const got = (await tablet.books.get('b1'))!;
    expect(new Uint8Array(got.cover!.bytes as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect((await tablet.texts.get('c1'))!.text).toBe('Dorothy lived in Kansas.');
    expect(await tablet.notes.count()).toBe(1);
  });

  it('sends nothing when nothing changed, and does not echo what it just received', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.add(book('b1', { cover }));
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));
    expect(await syncOnce(tablet, s.remoteFor('tablet'))).toMatchObject({ sent: 0 });
    expect(await syncOnce(phone, s.remoteFor('phone'))).toMatchObject({ sent: 0, received: 0 });
  });

  it('carries edits and deletions both ways', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.bulkAdd([book('b1'), book('b2')]);
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));

    await tablet.books.update('b1', { shelf: 'finished', rating: 4.5, updatedAt: 5 });
    await tablet.books.delete('b2');
    await syncOnce(tablet, s.remoteFor('tablet'));
    await syncOnce(phone, s.remoteFor('phone'));

    expect(await phone.books.get('b1')).toMatchObject({ shelf: 'finished', rating: 4.5 });
    expect(await phone.books.get('b2')).toBeUndefined();
  });

  it('when both phones changed the same book, the newer change wins on both', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.add(book('b1'));
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));

    await phone.books.update('b1', { title: 'Older edit', updatedAt: 10 });
    await tablet.books.update('b1', { title: 'Newer edit', updatedAt: 20 });
    await syncOnce(phone, s.remoteFor('phone'));
    const r = await syncOnce(tablet, s.remoteFor('tablet'));
    expect(r.conflicts).toBe(1);
    expect((await tablet.books.get('b1'))!.title).toBe('Newer edit');
    await syncOnce(phone, s.remoteFor('phone'));
    expect((await phone.books.get('b1'))!.title).toBe('Newer edit');
  });

  it('an edit on one phone beats a delete on the other', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.add(book('b1'));
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));

    await phone.books.delete('b1');
    await syncOnce(phone, s.remoteFor('phone'));
    await tablet.books.update('b1', { title: 'Still reading', updatedAt: 9 });
    await syncOnce(tablet, s.remoteFor('tablet'));
    await syncOnce(phone, s.remoteFor('phone'));
    expect((await phone.books.get('b1'))?.title).toBe('Still reading');
  });

  it('merges two libraries on first sync, losing nothing from either', async () => {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.add(book('mine'));
    await tablet.books.add(book('theirs'));
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));
    await syncOnce(phone, s.remoteFor('phone'));
    expect((await phone.books.toArray()).map((b) => b.id).sort()).toEqual(['mine', 'theirs']);
    expect((await tablet.books.toArray()).map((b) => b.id).sort()).toEqual(['mine', 'theirs']);
  });

  it('never sends device settings such as the API key', async () => {
    const s = server();
    const phone = device('phone');
    await phone.settings.put({ key: 'translate', value: { apiKey: 'secret' } });
    await phone.books.add(book('b1'));
    await syncOnce(phone, s.remoteFor('phone'));
    expect(JSON.stringify([...s.rows.values()])).not.toContain('secret');
  });
});

describe('sync safety (trust step)', () => {
  /** Two phones with the same five books. */
  async function twoPhones() {
    const s = server();
    const phone = device('phone');
    const tablet = device('tablet');
    await phone.books.bulkAdd(['a', 'b', 'c', 'd', 'e'].map((id) => book(id)));
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));
    return { s, phone, tablet };
  }

  it('asks before removing many books, and changes nothing until then', async () => {
    const { s, phone, tablet } = await twoPhones();
    await tablet.books.bulkDelete(['a', 'b', 'c']);
    await syncOnce(tablet, s.remoteFor('tablet'));
    const r = await syncOnce(phone, s.remoteFor('phone'));
    expect(r.held?.books.map((b) => b.id).sort()).toEqual(['a', 'b', 'c']);
    expect(await phone.books.count()).toBe(5);
    // The reader agrees: they go.
    await syncOnce(phone, s.remoteFor('phone'), { allowBookDeletes: true });
    expect(await phone.books.count()).toBe(2);
  });

  it('"Keep them" sends the books back, so every device has them again', async () => {
    const { s, phone, tablet } = await twoPhones();
    await tablet.books.bulkDelete(['a', 'b', 'c']);
    await syncOnce(tablet, s.remoteFor('tablet'));
    const r = await syncOnce(phone, s.remoteFor('phone'));
    await keepBooks(phone, r.held!.books.map((b) => b.id));
    expect((await syncOnce(phone, s.remoteFor('phone'))).held).toBeUndefined();
    expect(await phone.books.count()).toBe(5);
    await syncOnce(tablet, s.remoteFor('tablet'));
    expect(await tablet.books.count()).toBe(5);
  });

  it('removing one book is normal and needs no question', async () => {
    const { s, phone, tablet } = await twoPhones();
    await tablet.books.delete('a');
    await syncOnce(tablet, s.remoteFor('tablet'));
    const r = await syncOnce(phone, s.remoteFor('phone'));
    expect(r.held).toBeUndefined();
    expect(await phone.books.count()).toBe(4);
  });

  it('"Undo last sync" puts back what a sync changed or removed here', async () => {
    const { s, phone, tablet } = await twoPhones();
    await tablet.books.update('a', { title: 'Renamed by mistake', updatedAt: 9 });
    await tablet.books.delete('b');
    await syncOnce(tablet, s.remoteFor('tablet'));
    await syncOnce(phone, s.remoteFor('phone'));
    expect((await phone.books.get('a'))!.title).toBe('Renamed by mistake');
    expect(await lastSyncUndo(phone)).toBeDefined();

    expect(await undoLastSync(phone)).toBe(2);
    expect((await phone.books.get('a'))!.title).toBe('a');
    expect(await phone.books.get('b')).toBeDefined();
    expect(await lastSyncUndo(phone)).toBeUndefined();
    // The next sync sends them back, so the other phone gets them too.
    await syncOnce(phone, s.remoteFor('phone'));
    await syncOnce(tablet, s.remoteFor('tablet'));
    expect(await tablet.books.get('b')).toBeDefined();
  });

  it('can leave book text and translations on the phone', async () => {
    const s = server();
    const phone = device('phone');
    await phone.books.add(book('b1'));
    await phone.addChapters([{ chapter: { id: 'c1', bookId: 'b1', number: 1, title: 'One', read: false, createdAt: 1 }, text: 'Private text.' }]);
    await syncOnce(phone, s.remoteFor('phone'), { noBookText: true });
    const sent = [...s.rows.values()];
    expect(sent.map((r) => r.tbl).sort()).toEqual(['books', 'chapters']);
    expect(JSON.stringify(sent)).not.toContain('Private text.');
    // Turning it back on sends the text then.
    await syncOnce(phone, s.remoteFor('phone'));
    expect([...s.rows.values()].some((r) => r.tbl === 'texts')).toBe(true);
  });
});

describe('sync pieces', () => {
  it('turns pictures into text and back unchanged', async () => {
    const row = { id: 'g', picture: cover, backdrop: { picture: cover, cover: 0.5 } };
    const back = decodeRow(JSON.parse(JSON.stringify(await encodeRow(row))));
    expect(new Uint8Array((back.picture as typeof cover).bytes)).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect((back.backdrop as { cover: number }).cover).toBe(0.5);
  });

  it('splits a big upload into pieces under the size limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ tbl: 'texts' as const, id: String(i), data: { text: 'x'.repeat(300) }, deleted: false }));
    const parts = batches(rows, 1000);
    expect(parts.flat()).toHaveLength(10);
    expect(parts.length).toBeGreaterThan(3);
  });
});
