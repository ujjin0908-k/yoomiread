import Dexie, { type EntityTable } from 'dexie';
import type { BackupChapter, Book, Chapter, ChapterText, GlossaryEntry, Note, Session, Translation } from './types';

export class YoomiDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  texts!: EntityTable<ChapterText, 'chapterId'>;
  notes!: EntityTable<Note, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  translations!: EntityTable<Translation, 'chapterId'>;
  glossary!: EntityTable<GlossaryEntry, 'id'>;
  /** Device-only settings (the API key lives here). Never exported. */
  settings!: EntityTable<{ key: string; value: unknown }, 'key'>;

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
    // v3: chapter text moves to its own table.
    this.version(3)
      .stores({ texts: 'chapterId, bookId' })
      .upgrade(async (tx) => {
        const chapters = tx.table('chapters');
        const old = (await chapters.toArray()) as BackupChapter[];
        await tx.table('texts').bulkAdd(
          old.filter((c) => c.text).map((c) => ({ chapterId: c.id, bookId: c.bookId, text: c.text! })),
        );
        await chapters.toCollection().modify((c: BackupChapter) => {
          if (c.text) c.length = c.text.length;
          delete c.text;
        });
      });
    // v4: translations, glossary and device settings.
    this.version(4).stores({
      translations: 'chapterId, bookId',
      glossary: 'id, bookId, [bookId+original]',
      settings: 'key',
    });
  }

  /** Adds chapters together with their text. */
  async addChapters(items: { chapter: Chapter; text?: string }[]): Promise<void> {
    await this.transaction('rw', this.chapters, this.texts, async () => {
      await this.chapters.bulkAdd(items.map(({ chapter, text }) => ({ ...chapter, length: text ? text.length : undefined })));
      await this.texts.bulkAdd(
        items.filter((i) => i.text).map(({ chapter, text }) => ({ chapterId: chapter.id, bookId: chapter.bookId, text: text! })),
      );
    });
  }

  /** Replaces a chapter's text; empty text removes it. */
  async setText(chapter: Chapter, text: string | undefined): Promise<void> {
    await this.transaction('rw', this.chapters, this.texts, async () => {
      if (text) await this.texts.put({ chapterId: chapter.id, bookId: chapter.bookId, text });
      else await this.texts.delete(chapter.id);
      await this.chapters.update(chapter.id, { length: text ? text.length : undefined });
    });
  }

  /** Tables that hold a book's own data (settings are not one of them). */
  private bookTables() {
    return [this.books, this.chapters, this.texts, this.notes, this.sessions, this.translations, this.glossary];
  }

  async deleteBook(bookId: string): Promise<void> {
    await this.transaction('rw', this.bookTables(), async () => {
      await this.translations.where('bookId').equals(bookId).delete();
      await this.glossary.where('bookId').equals(bookId).delete();
      await this.notes.where('bookId').equals(bookId).delete();
      await this.texts.where('bookId').equals(bookId).delete();
      await this.chapters.where('bookId').equals(bookId).delete();
      await this.sessions.where('bookId').equals(bookId).delete();
      await this.books.delete(bookId);
    });
  }

  async deleteChapter(chapterId: string): Promise<void> {
    await this.transaction('rw', this.chapters, this.texts, this.notes, this.translations, async () => {
      await this.notes.where('chapterId').equals(chapterId).delete();
      await this.texts.delete(chapterId);
      await this.translations.delete(chapterId);
      await this.chapters.delete(chapterId);
    });
  }

  /** Everything, with each chapter's text and translation put back in (the backup file format). */
  async exportAll(): Promise<LibraryData> {
    const [books, chapters, texts, translations, notes, sessions, glossary] = await Promise.all([
      this.books.toArray(),
      this.chapters.toArray(),
      this.texts.toArray(),
      this.translations.toArray(),
      this.notes.toArray(),
      this.sessions.toArray(),
      this.glossary.toArray(),
    ]);
    const textOf = new Map(texts.map((t) => [t.chapterId, t.text]));
    const translationOf = new Map(translations.map(({ chapterId, bookId: _b, ...rest }) => [chapterId, rest]));
    const full: BackupChapter[] = chapters.map((c) => ({ ...c, text: textOf.get(c.id), translation: translationOf.get(c.id) }));
    return { books, chapters: full, notes, sessions, glossary };
  }

  /** Replaces everything, all or nothing. Device settings (the API key) are kept. */
  async restore(data: LibraryData): Promise<void> {
    await this.transaction('rw', this.bookTables(), async () => {
      await Promise.all(this.bookTables().map((t) => t.clear()));
      await this.books.bulkAdd(data.books);
      await this.addChapters(
        data.chapters.map(({ text, translation: _t, ...chapter }) => ({
          chapter: { ...chapter, length: text?.length ?? chapter.length },
          text,
        })),
      );
      await this.translations.bulkAdd(
        data.chapters
          .filter((c) => c.translation)
          .map((c) => ({ ...c.translation!, chapterId: c.id, bookId: c.bookId })),
      );
      await this.notes.bulkAdd(data.notes);
      await this.sessions.bulkAdd(data.sessions);
      await this.glossary.bulkAdd(data.glossary);
    });
  }
}

export interface LibraryData {
  books: Book[];
  chapters: BackupChapter[];
  notes: Note[];
  sessions: Session[];
  glossary: GlossaryEntry[];
}

export const db = new YoomiDB();
