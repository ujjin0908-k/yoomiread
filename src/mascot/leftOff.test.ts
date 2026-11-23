import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { Book } from '../types';
import { bareTitle, leftOff } from './leftOff';

const book = { id: 'b', title: 'B', createdAt: 1, updatedAt: 1, lastChapterId: 'c4', lastReadAt: 1_000 } as Book;

describe('where you left off (the Ask tab)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    for (let n = 1; n <= 6; n++) await db.chapters.add({ id: `c${n}`, bookId: 'b', number: n, title: `${n}. Title ${n}`, read: n <= 3, createdAt: 1 });
    await db.translations.bulkAdd([
      { chapterId: 'c2', bookId: 'b', text: 'x', model: 'm', createdAt: 1, summary: 'Up to two.' },
      { chapterId: 'c5', bookId: 'b', text: 'x', model: 'm', createdAt: 1, summary: 'SPOILER up to five.' },
    ]);
    await db.worldEvents.bulkAdd([
      { id: 'e1', bookId: 'b', chapter: 1, title: 'A storm came.', createdAt: 1 },
      { id: 'e2', bookId: 'b', chapter: 6, title: 'SPOILER the end', createdAt: 1 },
    ]);
  });

  it('uses only what is read: the latest summary and moments at or before the last finished chapter', async () => {
    const w = await leftOff(book, 1_000 + 3 * 86_400_000);
    expect(w.line).toBe(3);
    expect(w.chapter?.id).toBe('c4');
    expect(w.soFar).toBe('Up to two.');
    expect(w.moments).toEqual(['A storm came']);
    expect(w.daysAway).toBe(3);
    expect(JSON.stringify(w)).not.toContain('SPOILER');
  });

  it('shows a chapter title once, without its own number', () => {
    expect(bareTitle({ title: '6. The Cowardly Lion' })).toBe('The Cowardly Lion');
    expect(bareTitle({ title: '第6章', titleEn: 'Chapter 6: Into the Dream' })).toBe('Into the Dream');
  });
});
