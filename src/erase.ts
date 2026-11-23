import type { YoomiDB } from './db';

/**
 * Erases everything YoomiRead keeps on this phone: books, chapters, notes, progress, translations, the guide and all
 * settings (keys included). Used after deleting the account, when the reader asks for it. It cannot be undone, so the
 * screen offers a backup first.
 */
export async function eraseThisPhone(db: YoomiDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
