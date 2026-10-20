import Dexie, { type EntityTable } from 'dexie';
import type { Book, Chapter, Note, Session } from './types';

export class YoomiDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  sessions!: EntityTable<Session, 'id'>;

  constructor(name = 'yoomiread') {
    super(name);
    this.version(1).stores({
      books: 'id, shelf, updatedAt',
      chapters: 'id, bookId, [bookId+number]',
      notes: 'id, bookId, chapterId',
    });
    this.version(2).stores({
      books: 'id, shelf, updatedAt, lastReadAt',
      notes: 'id, bookId, chapterId, kind, createdAt',
      sessions: 'id, bookId, startedAt',
    });
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.transaction('rw', [this.books, this.chapters, this.notes, this.sessions], async () => {
      await this.notes.where('bookId').equals(bookId).delete();
      await this.chapters.where('bookId').equals(bookId).delete();
      await this.sessions.where('bookId').equals(bookId).delete();
      await this.books.delete(bookId);
    });
  }

  async deleteChapter(chapterId: string): Promise<void> {
    await this.transaction('rw', this.chapters, this.notes, async () => {
      await this.notes.where('chapterId').equals(chapterId).delete();
      await this.chapters.delete(chapterId);
    });
  }

  async exportAll() {
    const [books, chapters, notes, sessions] = await Promise.all([
      this.books.toArray(),
      this.chapters.toArray(),
      this.notes.toArray(),
      this.sessions.toArray(),
    ]);
    return { books, chapters, notes, sessions };
  }

  /** Replaces everything, all or nothing. */
  async restore(data: { books: Book[]; chapters: Chapter[]; notes: Note[]; sessions: Session[] }): Promise<void> {
    await this.transaction('rw', [this.books, this.chapters, this.notes, this.sessions], async () => {
      await Promise.all([this.books.clear(), this.chapters.clear(), this.notes.clear(), this.sessions.clear()]);
      await this.books.bulkAdd(data.books);
      await this.chapters.bulkAdd(data.chapters);
      await this.notes.bulkAdd(data.notes);
      await this.sessions.bulkAdd(data.sessions);
    });
  }
}

export const db = new YoomiDB();
