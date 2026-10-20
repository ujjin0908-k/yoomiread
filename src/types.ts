export type Shelf = 'want' | 'reading' | 'finished' | 'dropped';

export type BookLanguage = 'zh' | 'en' | 'other';

export interface Book {
  id: string;
  title: string;
  author: string;
  originalTitle?: string;
  language: BookLanguage;
  shelf: Shelf;
  /** 0.5 to 5 in half steps; set when the book is finished. */
  rating?: number;
  review?: string;
  startedAt?: number;
  finishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  number: number;
  title: string;
  /** Chapter text, if pasted or imported. Highlights need it. */
  text?: string;
  read: boolean;
  createdAt: number;
}

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

export interface Backup {
  app: 'yoomiread';
  version: 1;
  exportedAt: number;
  books: Book[];
  chapters: Chapter[];
  notes: Note[];
}
