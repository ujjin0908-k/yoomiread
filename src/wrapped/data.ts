import { GENRES } from '../genres';
import { BOOK_LANGUAGES } from '../languages';
import { dayStart, shares, type Share } from '../stats';
import type { Book, Chapter, Note, Session } from '../types';

/**
 * Reading Wrapped: one month or one year of reading, worked out on the phone from what is already saved
 * (sessions, books, highlights). No AI. The pages (src/wrapped/Pages.tsx) are drawn from this.
 */

export type Period = { kind: 'year'; year: number } | { kind: 'month'; year: number; month: number };

/** "2026" or "2026-11" (month 1–12), as in the address #/wrapped/2026-11. */
export function parsePeriod(id: string | undefined): Period | undefined {
  const m = id?.match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!m) return undefined;
  const year = Number(m[1]);
  if (!m[2]) return { kind: 'year', year };
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { kind: 'month', year, month } : undefined;
}

export function periodId(p: Period): string {
  return p.kind === 'year' ? String(p.year) : `${p.year}-${p.month}`;
}

/** "2026" or "November 2026"; short: "2026" or "November". */
export function periodName(p: Period, short = false): string {
  if (p.kind === 'year') return String(p.year);
  const name = new Date(p.year, p.month - 1, 1).toLocaleDateString('en', { month: 'long' });
  return short ? name : `${name} ${p.year}`;
}

function bounds(p: Period): { from: number; to: number } {
  if (p.kind === 'year') return { from: new Date(p.year, 0, 1).getTime(), to: new Date(p.year + 1, 0, 1).getTime() };
  return { from: new Date(p.year, p.month - 1, 1).getTime(), to: new Date(p.year, p.month, 1).getTime() };
}

const minutesOf = (ms: number) => ms / 60_000;

export interface Wrap {
  period: Period;
  totalMinutes: number;
  daysRead: number;
  sessions: number;
  chapters: number;
  /** Minutes on each day of the period up to today, oldest first (the wave line). */
  daily: number[];
  bestStreak: number;
  busiest?: { day: number; minutes: number };
  /** weekday 0 = Monday; band = 4-hour block, 0 = midnight to 4. */
  peak?: { weekday: number; band: number };
  genres: Share[];
  languages: Share[];
  top?: { book: Book; minutes: number; chapters: number };
  started: Book[];
  finished: Book[];
  highlights: number;
  quote?: { text: string; book: Book; chapter?: number };
}

export function wrapFor(input: { books: Book[]; sessions: Session[]; chapters: Chapter[]; notes: Note[] }, period: Period, now = Date.now()): Wrap {
  const { from, to } = bounds(period);
  const end = Math.min(to, now);
  const books = new Map(input.books.map((b) => [b.id, b]));
  const inside = input.sessions.filter((s) => s.ms > 0 && s.startedAt >= from && s.startedAt < end && books.has(s.bookId));

  const perDay = new Map<number, number>();
  for (const s of inside) perDay.set(dayStart(s.startedAt), (perDay.get(dayStart(s.startedAt)) ?? 0) + minutesOf(s.ms));
  const daily: number[] = [];
  let run = 0;
  let bestStreak = 0;
  let busiest: Wrap['busiest'];
  for (let d = dayStart(from); d < end; d = dayStart(d + 36 * 3_600_000)) {
    const m = Math.round(perDay.get(d) ?? 0);
    daily.push(m);
    run = m > 0 ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
    if (m > 0 && (!busiest || m > busiest.minutes)) busiest = { day: d, minutes: m };
  }

  const rhythm = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => 0));
  for (const s of inside) {
    const d = new Date(s.startedAt);
    rhythm[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 4)] += minutesOf(s.ms);
  }
  let peak: Wrap['peak'];
  rhythm.forEach((row, w) => row.forEach((m, b) => (m > 0 && (!peak || m > rhythm[peak.weekday][peak.band]) ? (peak = { weekday: w, band: b }) : undefined)));

  const genres = shares(
    inside.map((s) => {
      const g = GENRES.find((x) => x.id === (books.get(s.bookId)!.genre ?? 'general'))!;
      return [g.id, g.name, minutesOf(s.ms)];
    }),
  );
  const languages = shares(
    inside.map((s) => {
      const lang = books.get(s.bookId)!.language;
      return [lang, BOOK_LANGUAGES.find((l) => l.id === lang)?.label ?? lang, minutesOf(s.ms)];
    }),
  );
  const byBook = shares(inside.map((s) => [s.bookId, '', minutesOf(s.ms)]));
  const topId = byBook[0]?.id;
  const top = topId
    ? { book: books.get(topId)!, minutes: byBook[0].minutes, chapters: new Set(inside.filter((s) => s.bookId === topId).map((s) => s.chapterId)).size }
    : undefined;

  const within = (ms?: number) => !!ms && ms >= from && ms < end;
  const kept = input.notes.filter((n) => n.kind === 'highlight' && n.quote && within(n.createdAt) && books.has(n.bookId));
  // The quote: the longest line that still fits a page, newest first among equals.
  const fits = kept.filter((n) => n.quote!.trim().length <= 180).sort((a, b) => b.quote!.length - a.quote!.length || b.createdAt - a.createdAt);
  const pick = fits[0];
  const number = new Map(input.chapters.map((c) => [c.id, c.number]));

  return {
    period,
    totalMinutes: Math.round(minutesOf(inside.reduce((n, s) => n + s.ms, 0))),
    daysRead: perDay.size,
    sessions: inside.length,
    chapters: new Set(inside.map((s) => s.chapterId)).size,
    daily,
    bestStreak,
    busiest,
    peak,
    genres,
    languages,
    top,
    started: input.books.filter((b) => within(b.startedAt)),
    finished: input.books.filter((b) => within(b.finishedAt)).sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0)),
    highlights: kept.length,
    quote: pick ? { text: pick.quote!.trim(), book: books.get(pick.bookId)!, chapter: number.get(pick.chapterId) } : undefined,
  };
}

/** The wraps worth offering: this year, this month and last month, when they have any reading. */
export function wrapsOffered(sessions: Session[], now = Date.now()): Period[] {
  const d = new Date(now);
  const candidates: Period[] = [
    { kind: 'year', year: d.getFullYear() },
    { kind: 'month', year: d.getFullYear(), month: d.getMonth() + 1 },
    d.getMonth() === 0 ? { kind: 'month', year: d.getFullYear() - 1, month: 12 } : { kind: 'month', year: d.getFullYear(), month: d.getMonth() },
  ];
  return candidates.filter((p) => {
    const { from, to } = bounds(p);
    return sessions.some((s) => s.ms > 0 && s.startedAt >= from && s.startedAt < to);
  });
}

export const PEAK_WORDS = ['at night', 'early in the morning', 'in the morning', 'in the afternoon', 'in the evening', 'late in the evening'];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A reading type from when the reading happens. */
export function readerType(peak: Wrap['peak']): string | undefined {
  if (!peak) return undefined;
  if (peak.band === 0 || peak.band === 5) return 'Night owl';
  if (peak.band === 1) return 'Early bird';
  if (peak.band === 2) return 'Morning reader';
  if (peak.band === 3) return 'Afternoon reader';
  return 'Evening reader';
}
