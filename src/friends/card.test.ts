import { describe, expect, it } from 'vitest';
import { cardFrom, DEFAULT_PREFS, lineMightSpoil } from './card';
import { cleanFriendCode } from './friends';
import type { Book, Chapter, Note, Session } from '../types';

const NOW = new Date(2026, 10, 24, 23, 0).getTime();
const at = (m: number, d: number, h = 22) => new Date(2026, m - 1, d, h).getTime();
const book = (id: string, extra: Partial<Book> = {}): Book => ({ id, title: id, author: '', language: 'zh', shelf: 'reading', createdAt: 0, updatedAt: 0, ...extra }) as Book;
let n = 0;
const s = (bookId: string, t: number, min: number): Session => ({ id: `s${++n}`, bookId, chapterId: `${bookId}-c${n}`, startedAt: t, ms: min * 60_000 });
const chapters = (bookId: string, total: number, read: number): Chapter[] =>
  Array.from({ length: total }, (_, i) => ({ id: `${bookId}-ch${i}`, bookId, number: i + 1, title: '', read: i < read, position: 0 }) as Chapter);

const input = {
  books: [book('Gods', { genre: 'fantasy' }), book('Oz', { genre: 'fantasy', shelf: 'finished', language: 'en' })],
  sessions: [s('Oz', at(10, 3), 300), s('Gods', at(11, 20), 120), s('Gods', at(11, 21), 90), s('Gods', at(11, 22), 60)],
  chapters: [...chapters('Gods', 970, 212), ...chapters('Oz', 24, 24)],
  notes: [
    { id: 'h1', bookId: 'Oz', chapterId: 'Oz-ch3', kind: 'highlight', quote: 'There is no place like home.', body: '', createdAt: at(10, 4) },
    { id: 't1', bookId: 'Gods', chapterId: 'Gods-ch1', kind: 'theory', body: 'x', verdict: 'right', createdAt: 1 },
    { id: 't2', bookId: 'Gods', chapterId: 'Gods-ch1', kind: 'theory', body: 'y', verdict: 'wrong', createdAt: 2 },
    { id: 't3', bookId: 'Gods', chapterId: 'Gods-ch1', kind: 'theory', body: 'z', createdAt: 3 },
  ] as Note[],
};

describe('cardFrom', () => {
  it('fills the card from what the app already keeps', () => {
    const c = cardFrom(input, { ...DEFAULT_PREFS, name: ' Yoomi ', show: { ...DEFAULT_PREFS.show, theories: true } }, NOW);
    expect(c.name).toBe('Yoomi');
    expect(c.badge).toBe('Night owl');
    expect([c.now_title, c.now_chapter, c.now_total]).toEqual(['Gods', 212, 970]);
    expect(c.genres).toBe('Fantasy');
    expect([c.line, c.line_book, c.line_chapter]).toEqual(['There is no place like home.', 'Oz', 4]);
    expect([c.hours, c.streak]).toEqual([10, 3]);
    expect(c.theories).toBe('1 of 2 came true');
    expect(c.wrapped).toBe('October: 5h · Night owl');
  });

  it('leaves out everything switched off, so it is never sent', () => {
    const off = { now: false, genres: false, line: false, stats: false, theories: false, wrapped: false };
    const c = cardFrom(input, { ...DEFAULT_PREFS, show: off }, NOW);
    expect([c.now_title, c.genres, c.line, c.line_book, c.hours, c.streak, c.theories, c.wrapped].every((v) => v === null)).toBe(true);
    expect(c.name).toBe('Reader');
  });
});

describe('lineMightSpoil', () => {
  it('blurs a friend’s line from a chapter I haven’t reached in the same book', () => {
    expect(lineMightSpoil({ line_book: 'gods', line_chapter: 300 }, input.books, input.chapters)).toBe(true);
    expect(lineMightSpoil({ line_book: 'Gods', line_chapter: 100 }, input.books, input.chapters)).toBe(false);
    expect(lineMightSpoil({ line_book: 'Oz', line_chapter: 20 }, input.books, input.chapters)).toBe(false);
    expect(lineMightSpoil({ line_book: 'Another book', line_chapter: 5 }, input.books, input.chapters)).toBe(false);
  });
});

describe('cleanFriendCode', () => {
  it('reads a code as typed or a whole link', () => {
    expect(cleanFriendCode('hk3m 9qr2')).toBe('HK3M9QR2');
    expect(cleanFriendCode('https://yoomiread.pages.dev/#/friend/HK3M9QR2')).toBe('HK3M9QR2');
    expect(cleanFriendCode('HK3M')).toBeUndefined();
    expect(cleanFriendCode('OIL10000')).toBeUndefined();
  });
});
