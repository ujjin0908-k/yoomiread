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
  /** Places only: the English name of the place this one is inside. */
  within?: string;
}

/** The Living Book: a link between two names of the guide, by English name (or any other name). */
export interface GuideLink {
  from: string;
  to: string;
  /** Reads from → to: "herald of", "elder twin sister of", "opposed to". */
  label: string;
  /** The chapter it becomes true in, when the guide knows it. Without one it counts as a spoiler… */
  chapter?: number;
  /** …unless it is a setup fact, not a twist: then it shows as soon as both ends are met. */
  safe?: boolean;
}

/** The Living Book: an event for the timeline. */
export interface GuideEvent {
  title: string;
  chapter?: number;
  detail?: string;
  /** Names of those involved. */
  who?: string[];
  /** Name of the place. */
  where?: string;
  arc?: string;
}

/** A ready-made glossary for one book. Also the shape of an imported guide file. */
export interface Guide {
  book: string;
  /** Book titles (lower case) this guide is for. */
  titles: string[];
  entries: GuideEntry[];
  /** The art style for this book's pictures. */
  style?: string;
  /** The Living Book: links and events (optional). */
  links?: GuideLink[];
  events?: GuideEvent[];
  /** Corrections to entries an earlier version of the guide added, found by English name and kind. */
  fixes?: { english: string; kind: GlossaryKind; original?: string; removeAliases?: string[] }[];
}
