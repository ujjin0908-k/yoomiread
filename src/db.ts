import Dexie, { type EntityTable } from 'dexie';
import type { Backup, Book, Chapter, Note } from './types';

export class YoomiDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  notes!: EntityTable<Note, 'id'>;

  constructor(name = 'yoomiread') {
    super(name);
    this.version(1).stores({
      books: 'id, shelf, updatedAt',
      chapters: 'id, bookId, [bookId+number]',
      notes: 'id, bookId, chapterId',
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.transaction('rw', this.books, this.chapters, this.notes, async () => {
      await this.notes.where('bookId').equals(bookId).delete();
      await this.chapters.where('bookId').equals(bookId).delete();
      await this.books.delete(bookId);
    });
  }

  async deleteChapter(chapterId: string): Promise<void> {
    await this.transaction('rw', this.chapters, this.notes, async () => {
      await this.notes.where('chapterId').equals(chapterId).delete();
      await this.chapters.delete(chapterId);
    });
  }

  async exportAll(): Promise<Omit<Backup, 'app' | 'version' | 'exportedAt'>> {
    const [books, chapters, notes] = await Promise.all([
      this.books.toArray(),
      this.chapters.toArray(),
      this.notes.toArray(),
    ]);
    return { books, chapters, notes };
  }

  /** Replaces everything with the backup, all or nothing. */
  async restore(backup: Backup): Promise<void> {
    await this.transaction('rw', this.books, this.chapters, this.notes, async () => {
      await Promise.all([this.books.clear(), this.chapters.clear(), this.notes.clear()]);
      await this.books.bulkAdd(backup.books);
      await this.chapters.bulkAdd(backup.chapters);
      await this.notes.bulkAdd(backup.notes);
    });
  }
}

export const db = new YoomiDB();
