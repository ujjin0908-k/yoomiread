import { describe, expect, it } from 'vitest';
import { calendar, readingReport, streaks } from './stats';
import type { Book, Chapter, Session } from './types';

// Wednesday 2026-11-18, 23:00 local time.
const NOW = new Date(2026, 10, 18, 23, 0).getTime();
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const MIN = 60_000;

const book = (id: string, extra: Partial<Book> = {}): Book =>
  ({ id, title: id, author: '', language: 'zh', shelf: 'reading', createdAt: 0, updatedAt: 0, ...extra }) as Book;
let n = 0;
const session = (bookId: string, startedAt: number, minutes: number, chapterId = `${bookId}-c${++n}`): Session => ({
  id: `s${n}`,
  bookId,
  chapterId,
  startedAt,
  ms: minutes * MIN,
});
const chapters = (bookId: string, total: number, read: number): Chapter[] =>
  Array.from({ length: total }, (_, i) => ({ id: `${bookId}-ch${i}`, bookId, number: i + 1, title: '', read: i < read, position: 0 }) as Chapter);

describe('readingReport', () => {
  const books = [book('cult', { genre: 'cultivation' }), book('oz', { language: 'en', genre: 'fantasy', finishedAt: at(2026, 11, 10), shelf: 'finished' })];
  const sessions = [
    session('cult', at(2026, 11, 18, 22), 30),
    session('cult', at(2026, 11, 17, 22), 20),
    session('oz', at(2026, 11, 16, 9), 10),
    session('oz', at(2026, 11, 2, 9), 40),
    session('cult', at(2026, 6, 1, 9), 60),
    // The week before this one, for the comparison.
    session('cult', at(2026, 11, 10, 9), 15),
  ];
  const input = { books, sessions, chapters: [...chapters('cult', 100, 40), ...chapters('oz', 24, 24)] };

  it('adds up a week, with days read and the week before to compare', () => {
    const r = readingReport(input, 'week', NOW);
    expect(r.totalMinutes).toBe(60);
    expect(r.daysRead).toBe(3);
    expect(r.perReadingDay).toBe(20);
    expect(r.buckets).toHaveLength(7);
    expect(r.buckets.at(-1)!.minutes).toBe(30);
    expect(r.previousMinutes).toBe(15);
    expect(r.chapters).toBe(3);
  });

  it('splits time by genre and by language, biggest first', () => {
    const r = readingReport(input, 'month', NOW);
    expect(r.genres.map((g) => [g.label, g.minutes])).toEqual([
      ['Cultivation', 65],
      ['Fantasy', 50],
    ]);
    expect(r.languages.map((l) => l.label)).toEqual(['Chinese', 'English']);
    expect(r.finished).toBe(1);
  });

  it('finds when the reading happens', () => {
    const r = readingReport(input, 'week', NOW);
    // Tue and Wed evenings at 22:00 are "Late" (20–24); Wednesday has the most.
    expect(r.peak).toEqual({ weekday: 2, band: 5 });
    expect(r.rhythm[2][5]).toBe(30);
  });

  it('uses months for a year and forecasts the finish of a book being read', () => {
    const r = readingReport(input, 'year', NOW);
    expect(r.buckets).toHaveLength(12);
    expect(r.buckets.find((b) => new Date(b.start).getMonth() === 5)!.minutes).toBe(60);
    const cult = r.books.find((b) => b.book.id === 'cult')!;
    expect(cult.read).toBe(40);
    expect(cult.total).toBe(100);
    // 3 chapters in the last 14 days: 60 left at 3/14 a day.
    expect(cult.daysLeft).toBe(280);
    expect(r.books.find((b) => b.book.id === 'oz')!.daysLeft).toBeUndefined();
  });

  it('covers everything for all time, with nothing to compare to', () => {
    const r = readingReport(input, 'all', NOW);
    expect(r.totalMinutes).toBe(175);
    expect(r.previousMinutes).toBeUndefined();
    expect(new Date(r.buckets[0].start).getMonth()).toBe(5);
  });

  it('is empty and calm with no reading at all', () => {
    const r = readingReport({ books: [], sessions: [], chapters: [] }, 'month', NOW);
    expect(r.totalMinutes).toBe(0);
    expect(r.peak).toBeUndefined();
    expect(r.chaptersPerHour).toBeUndefined();
    expect(r.buckets.every((b) => b.minutes === 0)).toBe(true);
  });
});

describe('streaks', () => {
  it('counts the current run and the best one', () => {
    const s = [at(2026, 11, 18), at(2026, 11, 17), at(2026, 11, 10), at(2026, 11, 9), at(2026, 11, 8), at(2026, 11, 7)].map((t) => session('x', t, 5));
    expect(streaks(s, NOW)).toEqual({ streak: 2, best: 4 });
  });

  it('keeps a streak alive until the end of today', () => {
    const s = [at(2026, 11, 17), at(2026, 11, 16)].map((t) => session('x', t, 5));
    expect(streaks(s, NOW).streak).toBe(2);
  });
});

describe('calendar', () => {
  it('gives 53 weeks of 7 days, Monday first, ending this week', () => {
    const c = calendar([session('x', at(2026, 11, 18, 9), 25)], NOW);
    expect(c.weeks).toHaveLength(53);
    expect(new Date(c.firstDay).getDay()).toBe(1);
    const last = c.weeks.at(-1)!;
    // Wednesday is the third day; Thursday to Sunday have not happened yet.
    expect(last[2]).toBe(25);
    expect(last.slice(3)).toEqual([null, null, null, null]);
  });
});
