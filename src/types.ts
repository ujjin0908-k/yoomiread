export type Shelf = 'want' | 'reading' | 'finished' | 'dropped';

export type BookLanguage = 'zh' | 'en' | 'other';

export interface Book {
  id: string;
  title: string;
  author: string;
  originalTitle?: string;
  language: BookLanguage;
  shelf: Shelf;
  /** Cover image: taken from the PDF's first page, or added by hand. */
  cover?: Blob;
  source?: 'manual' | 'pdf';
  /** 0.5 to 5 in half steps; set when the book is finished. */
  rating?: number;
  review?: string;
  startedAt?: number;
  finishedAt?: number;
  lastChapterId?: string;
  lastReadAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  /** Number of characters in the chapter text (the text itself is in its own table). */
  length?: number;
  read: boolean;
  /** How far down the chapter I scrolled, 0 to 1. */
  position?: number;
  createdAt: number;
}

/** Chapter text lives apart from the chapter, so lists stay light even for huge novels. */
export interface ChapterText {
  chapterId: string;
  bookId: string;
  text: string;
}

/** A chapter as written in a backup file: text included. */
export type BackupChapter = Chapter & { text?: string };

export type NoteKind = 'chapter' | 'highlight';

export interface Note {
  id: string;
  bookId: string;
  chapterId: string;
  kind: NoteKind;
  /** Character offsets into the chapter text (highlights only). */
  start?: number;
  end?: number;
  quote?: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

/** One sitting in the reader. */
export interface Session {
  id: string;
  bookId: string;
  chapterId: string;
  startedAt: number;
  ms: number;
}

/** Backup file. Covers are stored as data URLs so the file is plain JSON. */
export interface Backup {
  app: 'yoomiread';
  version: 1 | 2;
  exportedAt: number;
  books: (Omit<Book, 'cover'> & { cover?: string })[];
  chapters: BackupChapter[];
  notes: Note[];
  sessions?: Session[];
}
