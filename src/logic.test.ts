import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup } from './backup';
import {
  bookProgress,
  clampRating,
  computeStats,
  speaksAs,
  continueChapter,
  finishBook,
  formatDuration,
  guessLanguage,
  moveToShelf,
  nextChapterNumber,
  paragraphs,
  readingMinutes,
  segmentText,
} from './logic';
import type { Book, Chapter, Note, Session } from './types';

const book: Book = {
  id: 'b1',
  title: 'Test Book',
  author: 'Someone',
  language: 'zh',
  shelf: 'want',
  createdAt: 1,
  updatedAt: 1,
};

function note(id: string, start: number, end: number): Note {
  return { id, bookId: 'b1', chapterId: 'c1', kind: 'highlight', start, end, body: '', createdAt: 1, updatedAt: 1 };
}

describe('ratings', () => {
  it('rounds to half stars and stays in range', () => {
    expect(clampRating(3.3)).toBe(3.5);
    expect(clampRating(0)).toBe(0.5);
    expect(clampRating(9)).toBe(5);
  });
});

describe('shelves', () => {
  it('sets the start date when reading begins', () => {
    expect(moveToShelf(book, 'reading', 10).startedAt).toBe(10);
  });

  it('finishing saves rating, review and dates', () => {
    const done = finishBook(book, 4.2, '  Loved the ending.  ', 20);
    expect(done).toMatchObject({ shelf: 'finished', rating: 4, review: 'Loved the ending.', finishedAt: 20, startedAt: 20 });
  });

  it('an empty review is not saved', () => {
    expect(finishBook(book, 3, '   ', 20).review).toBeUndefined();
  });

  it('moving off the finished shelf clears the finish date but keeps the review', () => {
    const done = finishBook(book, 5, 'Great', 20);
    const back = moveToShelf(done, 'reading', 30);
    expect(back.finishedAt).toBeUndefined();
    expect(back.review).toBe('Great');
  });
});

describe('chapters', () => {
  it('numbers the next chapter after the highest one', () => {
    const chapters = [{ number: 1 }, { number: 4 }] as Chapter[];
    expect(nextChapterNumber(chapters)).toBe(5);
    expect(nextChapterNumber([])).toBe(1);
  });
});

describe('highlights', () => {
  const text = 'The rain stopped at dawn.';

  it('plain text is one piece', () => {
    expect(segmentText(text, [])).toEqual([{ text, start: 0, noteIds: [] }]);
  });

  it('splits around overlapping highlights', () => {
    const segs = segmentText(text, [note('a', 4, 8), note('b', 6, 16)]);
    expect(segs.map((s) => [s.text, s.noteIds])).toEqual([
      ['The ', []],
      ['ra', ['a']],
      ['in', ['a', 'b']],
      [' stopped', ['b']],
      [' at dawn.', []],
    ]);
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });

  it('ignores highlights outside the text', () => {
    expect(segmentText(text, [note('x', 5, 999), note('y', 7, 3)])).toHaveLength(1);
  });

  it('keeps paragraph offsets', () => {
    expect(paragraphs('One.\n\nTwo.')).toEqual([
      { start: 0, text: 'One.' },
      { start: 6, text: 'Two.' },
    ]);
  });
});

const empty = { chapters: [] as Chapter[], notes: [] as Note[], sessions: [] as Session[], glossary: [] };

describe('backups', () => {
  it('round trips, covers included', async () => {
    const cover = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const raw = JSON.stringify(await makeBackup({ ...empty, books: [{ ...book, cover }] }, 5));
    const back = parseBackup(raw);
    expect(back.books[0].title).toBe('Test Book');
    expect(back.books[0].cover?.type).toBe('image/jpeg');
    expect([...new Uint8Array(await back.books[0].cover!.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('still reads version 1 backups', () => {
    const v1 = { app: 'yoomiread', version: 1, exportedAt: 1, books: [book], chapters: [], notes: [] };
    expect(parseBackup(JSON.stringify(v1)).sessions).toEqual([]);
  });

  it('rejects other files', () => {
    expect(() => parseBackup('nope')).toThrow(/not JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not a YoomiRead backup/);
  });

  it('rejects notes for missing books', async () => {
    const bad = await makeBackup({ ...empty, books: [], notes: [note('n', 0, 1)] });
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/not in it/);
  });
});

function ch(id: string, number: number, read = false, position?: number): Chapter {
  return { id, bookId: 'b1', number, title: `C${number}`, read, position, createdAt: 1 };
}

describe('progress', () => {
  it('counts read chapters and the scroll in unread ones', () => {
    expect(bookProgress({ ...book, shelf: 'reading' }, [ch('a', 1, true), ch('b', 2, false, 0.5)])).toBe(0.75);
    expect(bookProgress({ ...book, shelf: 'finished' }, [ch('a', 1)])).toBe(1);
  });

  it('continues in the last chapter, or the next unread one', () => {
    const chapters = [ch('a', 1, true), ch('b', 2, true), ch('c', 3)];
    expect(continueChapter({ ...book, lastChapterId: 'a' }, chapters)?.id).toBe('c');
    expect(continueChapter({ ...book, lastChapterId: 'c' }, chapters)?.id).toBe('c');
    expect(continueChapter(book, chapters)?.id).toBe('c');
  });

  it('estimates minutes for English and Chinese', () => {
    expect(readingMinutes('word '.repeat(460))).toBe(2);
    expect(readingMinutes('字'.repeat(800))).toBe(2);
    expect(readingMinutes('word '.repeat(460), 0.5)).toBe(1);
  });

  it('guesses the language', () => {
    expect(guessLanguage('她提着灯笼走过了小桥，河水很安静。'.repeat(3))).toBe('zh');
    expect(guessLanguage('She carried the lantern across the bridge.')).toBe('en');
  });
});

describe('stats', () => {
  const day = 86_400_000;
  const now = new Date(2026, 9, 20, 12).getTime();
  const s = (daysAgo: number, minutes: number): Session => ({
    id: String(daysAgo) + minutes,
    bookId: 'b1',
    chapterId: 'c1',
    startedAt: now - daysAgo * day,
    ms: minutes * 60_000,
  });

  it('adds up time, sessions, streak and daily minutes', () => {
    const stats = computeStats([], [s(0, 10), s(0, 5), s(1, 20), s(3, 30)], now, 7);
    expect(stats.totalMs).toBe(65 * 60_000);
    expect(stats.sessions).toBe(4);
    expect(stats.streak).toBe(2);
    expect(stats.daily.at(-1)).toMatchObject({ minutes: 15 });
    expect(stats.daily).toHaveLength(7);
  });

  it('counts this year\'s finished books and the average rating', () => {
    const books = [
      { ...book, shelf: 'finished' as const, finishedAt: now, rating: 4 },
      { ...book, id: 'b2', shelf: 'finished' as const, finishedAt: now - 400 * day, rating: 5 },
    ];
    const stats = computeStats(books, [], now);
    expect(stats.finishedThisYear).toBe(1);
    expect(stats.averageRating).toBe(4.5);
  });

  it('formats durations', () => {
    expect(formatDuration(530 * 60_000)).toBe('8h 50m');
    expect(formatDuration(5 * 60_000)).toBe('5m');
    expect(formatDuration(11_000)).toBe('<1m');
    expect(formatDuration(0)).toBe('0m');
  });
});

describe('speaking', () => {
  it('counts a name next to a quotation mark as speaking', () => {
    expect(speaksAs('Pu Yu said, “Wait.”', 'Pu Yu')).toBe(true);
    expect(speaksAs('“Wait.” Pu Yu said.', 'Pu Yu')).toBe(true);
    expect(speaksAs('普宇说：“等等。”', '普宇')).toBe(true);
  });

  it('does not count a name that only appears in narration', () => {
    const narration = 'Pu Yu walked to the window and stared at the rain for a long time. ' + 'The room was quiet. '.repeat(4) + '“Hello.”';
    expect(speaksAs(narration, 'Pu Yu')).toBe(false);
    expect(speaksAs('Pu Yu walked away.', 'Pu Yu')).toBe(false);
  });

  it('does not count a name inside the speech itself', () => {
    expect(speaksAs('“Pu Yu, come here.”', 'Pu Yu')).toBe(false);
    expect(speaksAs('"Pu Yu, come here."', 'Pu Yu')).toBe(false);
  });

  it('does not count someone who is only listening', () => {
    expect(speaksAs('A low voice sounded by Pu Yu’s ear: “Don’t move.”', 'Pu Yu')).toBe(false);
  });

  it('counts the speaker when the speech verb follows their name', () => {
    expect(speaksAs('“Ready?” Xiang Ningxuan said, leaning closer.', 'Xiang Ningxuan')).toBe(true);
  });

  it('needs the name in the paragraph at all', () => {
    expect(speaksAs('“Hello.”', 'Pu Yu')).toBe(false);
  });
});
