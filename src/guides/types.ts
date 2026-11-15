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
  /** How it looks, as a picture description. */
  look?: string;
}

/** A ready-made glossary for one book. Also the shape of an imported guide file. */
export interface Guide {
  book: string;
  /** Book titles (lower case) this guide is for. */
  titles: string[];
  entries: GuideEntry[];
  /** The art style for this book's pictures. */
  style?: string;
  /** Corrections to entries an earlier version of the guide added, found by English name and kind. */
  fixes?: { english: string; kind: GlossaryKind; original?: string; removeAliases?: string[] }[];
}
