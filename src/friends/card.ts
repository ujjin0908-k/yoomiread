import { GENRES } from '../genres';
import { isRead } from '../logic';
import { dayStart } from '../stats';
import type { Book, Chapter, Note, Session } from '../types';
import { readerType, wrapFor } from '../wrapped/data';

/**
 * The reader's name card (the owner's pick, 2026-11-24: the zine look). Everything on it is worked out here, on the
 * phone, from what the app already keeps. Items switched off are left empty, so they are never sent anywhere.
 */

export type Visibility = 'public' | 'friends' | 'private';

/** What goes on the card, each on or off. Name and picture are always on. */
export type CardItem = 'now' | 'genres' | 'line' | 'stats' | 'theories' | 'wrapped';

export const CARD_ITEMS: { id: CardItem; label: string }[] = [
  { id: 'now', label: 'What I’m reading now' },
  { id: 'genres', label: 'Favourite genres' },
  { id: 'line', label: 'A line I kept' },
  { id: 'stats', label: 'Hours and streak' },
  { id: 'theories', label: 'Theory record' },
  { id: 'wrapped', label: 'Latest Wrapped' },
];

export const VISIBILITY: { id: Visibility; label: string; note: string }[] = [
  { id: 'public', label: 'Public', note: 'Anyone with your code or link can see your card.' },
  { id: 'friends', label: 'Friends', note: 'Only friends you’ve added can see your card.' },
  { id: 'private', label: 'Private', note: 'Only you. Your card and your posts are hidden from everyone.' },
];

export interface CardPrefs {
  name: string;
  visibility: Visibility;
  show: Record<CardItem, boolean>;
}

export const DEFAULT_PREFS: CardPrefs = {
  name: '',
  visibility: 'friends',
  show: { now: true, genres: true, line: true, stats: true, theories: false, wrapped: true },
};

/** A card as the server keeps it (supabase/friends.sql), and as the app draws it. */
export interface CardData {
  user_id?: string;
  code?: string;
  name: string;
  visibility: Visibility;
  badge?: string | null;
  now_title?: string | null;
  now_chapter?: number | null;
  now_total?: number | null;
  genres?: string | null;
  line?: string | null;
  line_book?: string | null;
  line_chapter?: number | null;
  hours?: number | null;
  streak?: number | null;
  theories?: string | null;
  wrapped?: string | null;
  updated_at?: string;
}

const DAY = 86_400_000;

/** The card's items from the reader's own data. Off items are null. */
export function cardFrom(input: { books: Book[]; sessions: Session[]; chapters: Chapter[]; notes: Note[] }, prefs: CardPrefs, now = Date.now()): CardData {
  const on = prefs.show;
  const year = new Date(now).getFullYear();
  const yearWrap = wrapFor(input, { kind: 'year', year }, now);
  const books = new Map(input.books.map((b) => [b.id, b]));

  // A badge from when the reading happens, over the last 90 days.
  const recent = input.sessions.filter((s) => s.startedAt > now - 90 * DAY);
  const badge = readerType(wrapFor({ ...input, sessions: recent }, { kind: 'year', year }, now).peak ?? yearWrap.peak);

  // Now reading: the book read most recently that isn't finished or dropped.
  const last = [...input.sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => books.get(s.bookId))
    .find((b) => b && b.shelf !== 'finished' && b.shelf !== 'dropped');
  const own = last ? input.chapters.filter((c) => c.bookId === last.id) : [];
  const nowChapter = own.filter(isRead).reduce((n, c) => Math.max(n, c.number), 0);

  const genreNames = yearWrap.genres.slice(0, 2).map((g) => GENRES.find((x) => x.id === g.id)?.name ?? g.label);

  // A line: the newest highlight short enough for the card.
  const numberOf = new Map(input.chapters.map((c) => [c.id, c.number]));
  const kept = input.notes
    .filter((n) => n.kind === 'highlight' && n.quote && n.quote.trim().length <= 140 && books.has(n.bookId))
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  const theories = input.notes.filter((n) => n.kind === 'theory');
  const settled = theories.filter((t) => t.verdict);
  const right = settled.filter((t) => t.verdict === 'right').length;

  // The latest Wrapped: last month, else this month.
  const d = new Date(now);
  const lastMonth = d.getMonth() === 0 ? { kind: 'month' as const, year: year - 1, month: 12 } : { kind: 'month' as const, year, month: d.getMonth() };
  const thisMonth = { kind: 'month' as const, year, month: d.getMonth() + 1 };
  const monthWrap = [lastMonth, thisMonth].map((p) => wrapFor(input, p, now)).find((w) => w.totalMinutes > 0);
  const monthName = monthWrap && new Date(monthWrap.period.year, (monthWrap.period as { month: number }).month - 1, 1).toLocaleDateString('en', { month: 'long' });
  const wrapped = monthWrap ? `${monthName}: ${Math.round(monthWrap.totalMinutes / 60)}h${readerType(monthWrap.peak) ? ` · ${readerType(monthWrap.peak)}` : ''}` : undefined;

  return {
    name: prefs.name.trim() || 'Reader',
    visibility: prefs.visibility,
    badge: badge ?? null,
    now_title: on.now && last ? last.title.slice(0, 200) : null,
    now_chapter: on.now && last ? nowChapter : null,
    now_total: on.now && last ? own.length : null,
    genres: on.genres && genreNames.length ? genreNames.join(' · ') : null,
    line: on.line && kept ? kept.quote!.trim() : null,
    line_book: on.line && kept ? books.get(kept.bookId)!.title.slice(0, 200) : null,
    line_chapter: on.line && kept ? numberOf.get(kept.chapterId) ?? null : null,
    hours: on.stats && yearWrap.totalMinutes ? Math.round(yearWrap.totalMinutes / 60) : null,
    streak: on.stats && yearWrap.bestStreak ? yearWrap.bestStreak : null,
    theories: on.theories && settled.length ? `${right} of ${settled.length} came true` : null,
    wrapped: on.wrapped && wrapped ? wrapped : null,
  };
}

/**
 * Whether a friend's "line I kept" could spoil a book I am reading: the same title, and I haven't finished its
 * chapter yet. Then the card blurs it until tapped. Books are matched by title, the only thing friends share.
 */
export function lineMightSpoil(card: Pick<CardData, 'line_book' | 'line_chapter'>, books: Book[], chapters: Chapter[]): boolean {
  if (!card.line_book || !card.line_chapter) return false;
  const mine = books.find((b) => b.title.trim().toLowerCase() === card.line_book!.trim().toLowerCase());
  if (!mine || mine.shelf === 'finished') return false;
  const line = chapters.filter((c) => c.bookId === mine.id && isRead(c)).reduce((n, c) => Math.max(n, c.number), 0);
  return line < card.line_chapter;
}

/** "Updated today", "Updated 3 days ago". */
export function updatedWords(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const days = Math.round((dayStart(now) - dayStart(Date.parse(iso))) / DAY);
  return days <= 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`;
}
