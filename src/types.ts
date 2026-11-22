import type { Picture } from './picture';

export type Shelf = 'want' | 'reading' | 'finished' | 'dropped';

export type BookLanguage = 'zh' | 'en' | 'other';

/** The book's genre preset (see src/genres.ts). Not set means "General", how every book worked before presets. */
export type GenreId = 'general' | 'fantasy' | 'cultivation' | 'scifi' | 'romance' | 'mystery';

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
  /** The cast has been searched for new characters up to and including this chapter number. */
  /** The story has been searched for new people, places, gods, groups and terms up to and including this chapter number. */
  /** A picture of the owner's own behind this book's pages while reading (see src/backdrop.ts). */
  backdrop?: { picture: Picture; cover: number };
  /** The art style added to every picture prompt for this book (a book guide can set it). */
  artStyle?: string;
  worldUpTo?: number;
  castUpTo?: number;
  /** The Living Book: the story has been read for links and events up to and including this chapter number. */
  linksUpTo?: number;
  /** The Living Book: also show guide facts, links and events that have no chapter (they may be spoilers). Off by default. */
  worldSpoilers?: boolean;
  /** The style for this book's translations (optional). */
  style?: BookStyle;
  /** The book its cast, world and style were copied from ("Copy the world", src/world/copyWorld.ts). */
  worldFrom?: string;
  /**
   * Copied with the world: the chapter each name was first seen in, in the book it came from (glossary id → chapter).
   * A book that starts at chapter 521 then still knows who was met before.
   */
  seenBefore?: Record<string, number>;
  /** The reading line this book starts from: a copy that begins at chapter 521 counts 1 to 520 as read. */
  startLine?: number;
  /** The story before this book's first chapter, used as "the story so far" until a translated chapter has its own. */
  storySoFar?: string;
  title: string;
  author: string;
  originalTitle?: string;
  language: BookLanguage;
  /** Names the world's kinds and tells the story search what to look for (src/genres.ts). */
  genre?: GenreId;
  /** The reader's own names for the kinds ("Houses" for groups). A name also turns on a kind the genre leaves out. */
  kindNames?: Partial<Record<GlossaryKind, string>>;
  shelf: Shelf;
  /** Cover image: taken from the PDF's first page, or added by hand. */
  cover?: Picture;
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
  /** The title in English, for a book that is translated (from the chapter's translation, or "English titles"). */
  titleEn?: string;
  /** The web address it was read from, so a batch import does not add the same chapter twice. */
  url?: string;
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
  /** The chapter title in English, from the same reply. */
  title?: string;
  createdAt: number;
}

/** person: a character. place: city, realm, building. god: a god or divine power. group: faction, sect, guild, team, church.
 * term: a named power system, rank, title, skill, artifact, item or game rule. */
export type GlossaryKind = 'person' | 'place' | 'god' | 'group' | 'term';
export type Gender = 'he' | 'she' | 'they' | 'it';

/** One thing known about a character, with the chapter it came from. */
export interface ProfileFact {
  text: string;
  /** The chapter number it was read in. Missing on lines the owner wrote. */
  chapter?: number;
  /** Written or edited by the owner: an update never changes or removes it. */
  mine?: boolean;
  /** From a book guide (written in advance, not read from a chapter): kept by updates like the owner's own. */
  guide?: boolean;
}

/** What is known about a character so far, built only from chapters the owner has read. */
export interface CharacterProfile {
  /** One short line for the cast list. */
  line?: string;
  /** Appearance. No longer asked for or shown (2026-11-13); kept so nothing the owner wrote is lost. */
  looks: ProfileFact[];
  /** Who they are: identity, role, team, relationships, goals. Not a log of things they did in scenes. */
  about: ProfileFact[];
  /** Powers, skills, talents, and items they fight with. */
  powers?: ProfileFact[];
  /** Where they stand as of the latest update: rank, title, faction, condition. Replaced, not added to. */
  status?: ProfileFact[];
  quote?: ProfileFact;
  /** 2 for profiles built as who / powers / status. Older ones are rebuilt from chapter 1 on their next update. */
  v?: 2;
  /** The profile covers the story up to and including this chapter number. */
  upTo?: number;
  updatedAt?: number;
}

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
  picture?: Picture;
  /** People only: a main or a side character. Not set counts as side. */
  role?: 'main' | 'side';
  /** Other names the same character goes by ("Little Song", "the boss"), used to find their scenes. */
  aliases?: string[];
  /** People only: the character profile. */
  /** How it looks, as a picture description to paste into an image app (see `picturePrompt` in src/art.ts). */
  look?: string;
  /** Places only: the id of the place this one is inside (a city in a realm). Used to nest the map. */
  within?: string;
  profile?: CharacterProfile;
  createdAt: number;
  updatedAt: number;
}

/**
 * The Living Book: a link between two glossary entries ("master of", "enemy", "sister", "member of"), as known from a
 * chapter. A pair can have several links over time; the newest one up to the reading line is the current one.
 */
export interface WorldLink {
  id: string;
  bookId: string;
  /** Glossary entry ids. The label reads from → to ("Cheng Shi" master of "Xiao Qi"). */
  from: string;
  to: string;
  label: string;
  /** The chapter it became true in. Missing on the owner's own links and on guide links that do not know one. */
  chapter?: number;
  note?: string;
  /** Written by the owner: a scan never changes or removes it, and it shows at any reading line. */
  mine?: boolean;
  /** From a book guide (may be a spoiler when it has no chapter). */
  guide?: boolean;
  /** A setup fact, not a twist (a god's path, opposed gods, the god a player follows): shows once both ends are met. */
  safe?: boolean;
  createdAt: number;
}

/** The Living Book: one thing that happened, for the timeline. */
export interface WorldEvent {
  id: string;
  bookId: string;
  /** The chapter it happens in. Missing only on guide events that do not know one. */
  chapter?: number;
  /** One line: "Cheng Shi fakes his death". */
  title: string;
  detail?: string;
  /** Glossary entry ids of the people (and gods, groups) involved. */
  who?: string[];
  /** Glossary entry id of the place it happens in. */
  where?: string;
  /** The arc it belongs to ("The Sea of Desire"). */
  arc?: string;
  mine?: boolean;
  guide?: boolean;
  createdAt: number;
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
  version: 1 | 2 | 3 | 4;
  exportedAt: number;
  books: (Omit<Book, 'cover' | 'backdrop'> & { cover?: string; backdrop?: { cover: number; picture?: string } })[];
  chapters: BackupChapter[];
  notes: Note[];
  sessions?: Session[];
  glossary?: (Omit<GlossaryEntry, 'picture'> & { picture?: string })[];
  /** The Living Book (version 4 and later). */
  worldLinks?: WorldLink[];
  worldEvents?: WorldEvent[];
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
  /** How many of the first chapters to translate as soon as a book is added (0 turns it off). */
  onImport?: number;
  /** When true, models are asked not to think before answering: faster and cheaper, but untested per model. */
  thinkingOff?: boolean;
}
