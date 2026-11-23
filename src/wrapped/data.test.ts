import { describe, expect, it } from 'vitest';
import { parsePeriod, periodName, readerType, wrapFor, wrapsOffered } from './data';
import type { Book, Chapter, Note, Session } from '../types';

const NOW = new Date(2026, 10, 23, 23, 0).getTime();
const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();
const book = (id: string, extra: Partial<Book> = {}): Book => ({ id, title: id, author: '', language: 'zh', shelf: 'reading', createdAt: 0, updatedAt: 0, ...extra }) as Book;
let n = 0;
const s = (bookId: string, t: number, min: number): Session => ({ id: `s${++n}`, bookId, chapterId: `${bookId}-${n}`, startedAt: t, ms: min * 60_000 });

describe('periods', () => {
  it('reads a year or a month from the address', () => {
    expect(parsePeriod('2026')).toEqual({ kind: 'year', year: 2026 });
    expect(parsePeriod('2026-11')).toEqual({ kind: 'month', year: 2026, month: 11 });
    expect(parsePeriod('2026-13')).toBeUndefined();
    expect(parsePeriod('x')).toBeUndefined();
    expect(periodName({ kind: 'month', year: 2026, month: 11 })).toBe('November 2026');
  });

  it('offers this year, this month and last month when they have reading', () => {
    const offered = wrapsOffered([s('a', at(11, 2), 10), s('a', at(3, 2), 10)], NOW);
    expect(offered).toEqual([
      { kind: 'year', year: 2026 },
      { kind: 'month', year: 2026, month: 11 },
    ]);
  });
});

describe('wrapFor', () => {
  const books = [book('cult', { genre: 'cultivation', finishedAt: at(11, 20) }), book('oz', { language: 'en', genre: 'fantasy', startedAt: at(11, 1) })];
  const sessions = [s('cult', at(11, 20, 22), 50), s('cult', at(11, 21, 22), 30), s('cult', at(11, 22, 22), 20), s('oz', at(11, 5, 9), 15), s('oz', at(10, 30, 9), 99)];
  const notes = [
    { id: 'n1', bookId: 'oz', chapterId: 'c1', kind: 'highlight', quote: 'There is no place like home.', body: '', createdAt: at(11, 6) },
    { id: 'n2', bookId: 'oz', chapterId: 'c1', kind: 'highlight', quote: 'Short.', body: '', createdAt: at(11, 7) },
    { id: 'n3', bookId: 'oz', chapterId: 'c1', kind: 'highlight', quote: 'Long '.repeat(60), body: '', createdAt: at(11, 8) },
  ] as Note[];
  const chapters = [{ id: 'c1', bookId: 'oz', number: 4 }] as Chapter[];
  const w = wrapFor({ books, sessions, chapters, notes }, { kind: 'month', year: 2026, month: 11 }, NOW);

  it('adds up only the month', () => {
    expect(w.totalMinutes).toBe(115);
    expect(w.daysRead).toBe(4);
    expect(w.daily).toHaveLength(23);
    expect(w.daily[19]).toBe(50);
  });

  it('finds the streak, the busiest day and when the reading happens', () => {
    expect(w.bestStreak).toBe(3);
    expect(w.busiest?.minutes).toBe(50);
    expect(w.peak).toEqual({ weekday: 4, band: 5 });
    expect(readerType(w.peak)).toBe('Night owl');
  });

  it('picks the top book, genres, and the books started and finished', () => {
    expect(w.top?.book.id).toBe('cult');
    expect(w.top?.chapters).toBe(3);
    expect(w.genres.map((g) => g.label)).toEqual(['Cultivation', 'Fantasy']);
    expect(w.finished.map((b) => b.id)).toEqual(['cult']);
    expect(w.started.map((b) => b.id)).toEqual(['oz']);
  });

  it('chooses a quote that fits a page', () => {
    expect(w.highlights).toBe(3);
    expect(w.quote?.text).toBe('There is no place like home.');
    expect(w.quote?.chapter).toBe(4);
  });
});
