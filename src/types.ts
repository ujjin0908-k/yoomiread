export type Shelf = 'want' | 'reading' | 'finished' | 'dropped';

export type BookLanguage = 'zh' | 'en' | 'other';

/** How this book should read in English. Applied to every chapter translated for it. */
export interface BookStyle {
  tone?: 'natural' | 'literary' | 'punchy' | 'formal';
  /** 'romanised' keeps titles like Senior Brother; 'english' translates them. */
  honorifics?: 'romanised' | 'english';
  /** Free notes, e.g. "keep cultivation terms in pinyin". */
  notes?: string;
  /** One or two paragraphs of the English style wanted, pasted by the owner. Stays on the phone. */
  sample?: string;
}

export interface Book {
  id: string;
  /** The style for this book's translations (optional). */
  style?: BookStyle;
  title: string;
  author: string;
  originalTitle?: string;
  language: BookLanguage;
  shelf: Shelf;
  /** Cover image: taken from the PDF's first page, or added by hand. */
  cover?: Blob;
  source?: 'manual' | 'pdf' | 'epub' | 'web' | 'paste';
  /** 0.5 to 5 in half steps; set when the book is finished. */
  rating?: number;
  review?: string;
  startedAt?: number;
  finishedAt?: number;
  lastChapterId?: string;
  lastReadAt?: number;
  /** Novel Updates series page, for finding the book again. */
  novelUpdatesUrl?: string;
  /** Where the book can be read online: a name and a web link each. */
  sources?: { name: string; url: string }[];
  /** Model id used to translate this book (falls back to the default in Settings). */
  model?: string;
  /** US dollars spent on AI for this book: every call, kept or not (comparisons, glossary, title). */
  spent?: number;
  /** True when some of that was estimated because the provider did not report tokens. */
  spentEstimated?: boolean;
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
  /** Saved with a bookmark, so it can be found again from the chapter list. */
  bookmarked?: boolean;
  createdAt: number;
}

/** Chapter text lives apart from the chapter, so lists stay light even for huge novels. */
export interface ChapterText {
  chapterId: string;
  bookId: string;
  text: string;
}

/** The English version of a chapter, kept next to the original. */
export interface Translation {
  chapterId: string;
  bookId: string;
  text: string;
  model: string;
  /** Tokens the provider reported, and what that cost in US dollars (when prices are set). */
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  /** True when the provider did not report tokens and the cost was estimated. */
  costEstimated?: boolean;
  /** Things worth a look, e.g. pronouns that do not match the glossary. */
  warnings?: string[];
  /** The story so far, up to and including this chapter; the next chapter starts from it. */
  summary?: string;
  createdAt: number;
}

export type GlossaryKind = 'person' | 'place' | 'term';
export type Gender = 'he' | 'she' | 'they' | 'it';

/** One name or term in a book's glossary, so translations stay consistent. */
export interface GlossaryEntry {
  id: string;
  bookId: string;
  /** As written in the original (e.g. 林梅). */
  original: string;
  /** How it is written in English (e.g. Lin Mei). */
  english: string;
  kind: GlossaryKind;
  gender?: Gender;
  note?: string;
  /** Locked entries are never changed by the app. */
  locked: boolean;
  /** 'review': proposed by the model, not used in translations until approved. */
  status: 'ok' | 'review';
  /** Optional face for the reader (small JPEG). */
  picture?: Blob;
  createdAt: number;
  updatedAt: number;
}

/** A chapter as written in a backup file: text and translation included. */
export type BackupChapter = Chapter & { text?: string; translation?: Omit<Translation, 'chapterId' | 'bookId'> };

export type NoteKind = 'chapter' | 'highlight';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface Note {
  id: string;
  bookId: string;
  chapterId: string;
  kind: NoteKind;
  /** Which text a highlight belongs to; older notes are on the original. */
  on?: 'original' | 'translation';
  /** Character offsets into that text (highlights only). */
  start?: number;
  end?: number;
  quote?: string;
  /** Highlights can be sorted into folders (e.g. "Lines", "Plot"). */
  folder?: string;
  /** Highlight color; yellow when not set. */
  color?: HighlightColor;
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
  version: 1 | 2 | 3;
  exportedAt: number;
  books: (Omit<Book, 'cover'> & { cover?: string })[];
  chapters: BackupChapter[];
  notes: Note[];
  sessions?: Session[];
  glossary?: (Omit<GlossaryEntry, 'picture'> & { picture?: string })[];
}

/** One model offered by the translation provider, with its prices per million tokens. */
export interface ModelOption {
  id: string;
  label: string;
  inputPrice?: number;
  outputPrice?: number;
}

/** Translation settings. Stored on this device only and never put in a backup. */
export interface TranslateSettings {
  baseUrl: string;
  apiKey: string;
  models: ModelOption[];
  defaultModel: string;
  /** How many of the next chapters to translate in the background while reading (0 turns it off). */
  ahead?: number;
  /** When true, models are asked not to think before answering: faster and cheaper, but untested per model. */
  thinkingOff?: boolean;
}
