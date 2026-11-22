import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { setTourSeen, showTour } from './pages/Tour';

afterEach(async () => {
  await Promise.all([db.books.clear(), db.settings.clear()]);
});

describe('the tour', () => {
  it('shows once to someone new, and never to someone who already has books', async () => {
    expect(await showTour()).toBe(true);
    await setTourSeen(true);
    expect(await showTour()).toBe(false);
    await db.settings.clear();
    await db.books.add({ id: 'b', title: 'B', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    expect(await showTour()).toBe(false);
  });

  it('shows again when asked for in Settings, even with books', async () => {
    await db.books.add({ id: 'b', title: 'B', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 });
    await setTourSeen(false);
    expect(await showTour()).toBe(true);
    await setTourSeen(true);
    expect(await showTour()).toBe(false);
  });
});
