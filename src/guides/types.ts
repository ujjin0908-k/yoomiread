import type { Gender, GlossaryKind } from '../types';

/** One name in a book guide: who or what it is, written in advance (no tokens, no chapter). */
export interface GuideEntry {
  english: string;
  /** As the original writes it; the English name again when not known. */
  original: string;
  kind: GlossaryKind;
  aliases?: string[];
  gender?: Gender;
  role?: 'main' | 'side';
  note?: string;
  /** "Who they are" for people, "What it is" for the rest. */
  about?: string[];
  powers?: string[];
  status?: string[];
}

/** A ready-made glossary for one book. Also the shape of an imported guide file. */
export interface Guide {
  book: string;
  /** Book titles (lower case) this guide is for. */
  titles: string[];
  entries: GuideEntry[];
}
