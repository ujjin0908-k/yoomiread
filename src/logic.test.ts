import { describe, expect, it } from 'vitest';
import {
  clampRating,
  finishBook,
  makeBackup,
  moveToShelf,
  nextChapterNumber,
  paragraphs,
  parseBackup,
  segmentText,
} from './logic';
import type { Book, Chapter, Note } from './types';

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

describe('backups', () => {
  it('round trips', () => {
    const raw = JSON.stringify(makeBackup([book], [], [], 5));
    expect(parseBackup(raw).books[0].title).toBe('Test Book');
  });

  it('rejects other files', () => {
    expect(() => parseBackup('nope')).toThrow(/not JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not a YoomiRead backup/);
  });

  it('rejects notes for missing books', () => {
    const bad = makeBackup([], [], [note('n', 0, 1)]);
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/not in it/);
  });
});
