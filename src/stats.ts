import { GENRES } from './genres';
import { BOOK_LANGUAGES } from './languages';
import type { Book, Chapter, Session } from './types';

/**
 * The Stats tab's numbers for one stretch of time, worked out on the phone from what is already saved: reading
 * sessions (book, chapter, start, length), books (genre, language, dates) and chapters (read or not). No AI.
 * Reading Wrapped reuses the same report for a month or a year.
 */

export type Range = 'week' | 'month' | 'year' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

const DAY = 86_400_000;

/** Midnight, local time. */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function addMonths(ms: number, n: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

/** One bar of the reading-time chart: a day, a month or a year. */
export type Bucket = { start: number; end: number; minutes: number; unit: 'day' | 'month' | 'year' };

/** Time of day in six bands, for "when you read". */
export const BANDS = ['Night', 'Early', 'Morning', 'Afternoon', 'Evening', 'Late'] as const;
export const BAND_HOURS = ['0–4', '4–8', '8–12', '12–16', '16–20', '20–24'] as const;
/** Monday first. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type Share = { id: string; label: string; minutes: number };

export type BookRow = {
  book: Book;
  minutes: number;
  /** Chapters read of all chapters, for the progress bar. */
  read: number;
  total: number;
  /** Days to the end at the recent pace, for books on the Reading shelf with a pace to go by. */
  daysLeft?: number;
};

export interface Report {
  range: Range;
  from: number;
  to: number;
  totalMinutes: number;
  /** The same length of time just before, to compare with (undefined for All time). */
  previousMinutes?: number;
  sessions: number;
  daysRead: number;
  /** Minutes per day on the days there was reading. */
  perReadingDay: number;
  /** Distinct chapters opened in the range. */
  chapters: number;
  /** Chapters per hour of reading (undefined with under 10 minutes to go by). */
  chaptersPerHour?: number;
  started: number;
  finished: number;
  streak: number;
  bestStreak: number;
  buckets: Bucket[];
  /** rhythm[weekday][band] = minutes, weekday 0 = Monday. */
  rhythm: number[][];
  /** The busiest weekday and band, for one plain line ("Mostly Sunday evenings"). */
  peak?: { weekday: number; band: number };
  genres: Share[];
  languages: Share[];
  books: BookRow[];
}

const minutesOf = (ms: number) => ms / 60_000;

function rangeStart(range: Range, now: number, sessions: Session[]): number {
  const today = dayStart(now);
  if (range === 'week') return today - 6 * DAY;
  if (range === 'month') return today - 29 * DAY;
  if (range === 'year') return addMonths(monthStart(now), -11);
  const first = sessions.reduce((m, s) => Math.min(m, s.startedAt), now);
  return monthStart(first);
}

function bucketsFor(range: Range, from: number, now: number, sessions: Session[]): Bucket[] {
  const out: Bucket[] = [];
  if (range === 'week' || range === 'month') {
    for (let d = from; d <= dayStart(now); d = dayStart(d + DAY * 1.5)) out.push({ start: d, end: dayStart(d + DAY * 1.5), minutes: 0, unit: 'day' });
  } else {
    const months = (new Date(now).getFullYear() - new Date(from).getFullYear()) * 12 + new Date(now).getMonth() - new Date(from).getMonth() + 1;
    if (months > 24) {
      for (let y = new Date(from).getFullYear(); y <= new Date(now).getFullYear(); y++) {
        out.push({ start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime(), minutes: 0, unit: 'year' });
      }
    } else {
      for (let m = monthStart(from); m <= now; m = addMonths(m, 1)) out.push({ start: m, end: addMonths(m, 1), minutes: 0, unit: 'month' });
    }
  }
  for (const s of sessions) {
    const b = out.find((x) => s.startedAt >= x.start && s.startedAt < x.end);
    if (b) b.minutes += minutesOf(s.ms);
  }
  for (const b of out) b.minutes = Math.round(b.minutes);
  return out;
}

/** Days in a row with reading, now (today or ending yesterday) and the longest ever. */
export function streaks(sessions: Session[], now: number): { streak: number; best: number } {
  const days = new Set(sessions.map((s) => dayStart(s.startedAt)));
  const today = dayStart(now);
  let streak = 0;
  for (let d = days.has(today) ? today : dayStart(today - DAY / 2); days.has(d); d = dayStart(d - DAY / 2)) streak++;
  let best = 0;
  for (const d of days) {
    // Only count from the first day of each run.
    if (days.has(dayStart(d - DAY / 2))) continue;
    let n = 0;
    for (let x = d; days.has(x); x = dayStart(x + DAY * 1.5)) n++;
    best = Math.max(best, n);
  }
  return { streak, best };
}

export function shares(entries: [string, string, number][]): Share[] {
  const by = new Map<string, Share>();
  for (const [id, label, minutes] of entries) {
    const s = by.get(id) ?? { id, label, minutes: 0 };
    s.minutes += minutes;
    by.set(id, s);
  }
  return [...by.values()]
    .map((s) => ({ ...s, minutes: Math.round(s.minutes) }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export function readingReport(input: { books: Book[]; sessions: Session[]; chapters: Chapter[] }, range: Range, now = Date.now()): Report {
  const all = input.sessions.filter((s) => s.ms > 0);
  const from = rangeStart(range, now, all);
  const inRange = all.filter((s) => s.startedAt >= from && s.startedAt <= now);
  const books = new Map(input.books.map((b) => [b.id, b]));
  const totalMs = inRange.reduce((n, s) => n + s.ms, 0);
  const days = new Set(inRange.map((s) => dayStart(s.startedAt)));
  const chapterIds = new Set(inRange.map((s) => s.chapterId));

  let previousMinutes: number | undefined;
  if (range !== 'all') {
    const length = (range === 'year' ? now - from : dayStart(now) + DAY - from);
    previousMinutes = Math.round(minutesOf(all.filter((s) => s.startedAt >= from - length && s.startedAt < from).reduce((n, s) => n + s.ms, 0)));
  }

  const rhythm = WEEKDAYS.map(() => BANDS.map(() => 0));
  for (const s of inRange) {
    const d = new Date(s.startedAt);
    rhythm[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 4)] += minutesOf(s.ms);
  }
  let peak: Report['peak'];
  rhythm.forEach((row, w) =>
    row.forEach((m, b) => {
      if (m > 0 && (!peak || m > rhythm[peak.weekday][peak.band])) peak = { weekday: w, band: b };
    }),
  );

  const genres = shares(
    inRange.map((s) => {
      const g = GENRES.find((x) => x.id === (books.get(s.bookId)?.genre ?? 'general'));
      return [g?.id ?? 'general', g?.name ?? 'General', minutesOf(s.ms)];
    }),
  );
  const languages = shares(
    inRange.map((s) => {
      const lang = books.get(s.bookId)?.language ?? 'en';
      return [lang, BOOK_LANGUAGES.find((l) => l.id === lang)?.label ?? lang, minutesOf(s.ms)];
    }),
  );

  // Pace per book: chapters opened per day over the last two weeks, for a finish forecast.
  const recent = all.filter((s) => s.startedAt > now - 14 * DAY);
  const bookRows = shares(inRange.map((s) => [s.bookId, '', minutesOf(s.ms)]))
    .map((s) => {
      const book = books.get(s.id);
      if (!book) return undefined;
      const own = input.chapters.filter((c) => c.bookId === book.id);
      const read = own.filter((c) => c.read).length;
      const perDay = new Set(recent.filter((x) => x.bookId === book.id).map((x) => x.chapterId)).size / 14;
      const left = own.length - read;
      const daysLeft = book.shelf === 'reading' && left > 0 && perDay > 0 ? Math.ceil(left / perDay) : undefined;
      return { book, minutes: s.minutes, read, total: own.length, daysLeft } as BookRow;
    })
    .filter((r): r is NonNullable<typeof r> => !!r) satisfies BookRow[];

  const { streak, best } = streaks(all, now);
  const totalMinutes = Math.round(minutesOf(totalMs));
  const within = (ms?: number) => !!ms && ms >= from && ms <= now;
  return {
    range,
    from,
    to: now,
    totalMinutes,
    previousMinutes,
    sessions: inRange.length,
    daysRead: days.size,
    perReadingDay: days.size ? Math.round(totalMinutes / days.size) : 0,
    chapters: chapterIds.size,
    chaptersPerHour: totalMinutes >= 10 ? Math.round((chapterIds.size / (totalMinutes / 60)) * 10) / 10 : undefined,
    started: input.books.filter((b) => within(b.startedAt)).length,
    finished: input.books.filter((b) => within(b.finishedAt)).length,
    streak,
    bestStreak: best,
    buckets: bucketsFor(range, from, now, inRange),
    rhythm: rhythm.map((row) => row.map(Math.round)),
    peak,
    genres,
    languages,
    books: bookRows,
  };
}

/** The last 53 weeks as columns of 7 days (Monday first), each day's minutes; days after today are null. */
export function calendar(sessions: Session[], now = Date.now()): { weeks: (number | null)[][]; firstDay: number } {
  const perDay = new Map<number, number>();
  for (const s of sessions) perDay.set(dayStart(s.startedAt), (perDay.get(dayStart(s.startedAt)) ?? 0) + minutesOf(s.ms));
  const today = dayStart(now);
  const weekday = (new Date(today).getDay() + 6) % 7;
  // The Monday 52 weeks before this week's Monday.
  let day = dayStart(today - (weekday + 52 * 7) * DAY + DAY / 2);
  const firstDay = day;
  const weeks: (number | null)[][] = [];
  for (let w = 0; w < 53; w++) {
    const col: (number | null)[] = [];
    for (let i = 0; i < 7; i++) {
      col.push(day > today ? null : Math.round(perDay.get(day) ?? 0));
      day = dayStart(day + DAY * 1.5);
    }
    weeks.push(col);
  }
  return { weeks, firstDay };
}

/** "2h 05m", "45m", "<1m". */
export function hours(minutes: number): string {
  if (minutes > 0 && minutes < 1) return '<1m';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
