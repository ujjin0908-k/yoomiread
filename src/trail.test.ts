import { describe, expect, it } from 'vitest';
import { cameFromChapter, chapterBefore, noteRoute } from './trail';

describe('going back to the chapter', () => {
  it('remembers the chapter while the cast and a character are open', () => {
    noteRoute(['chapter', 'c7']);
    noteRoute(['glossary', 'b1']);
    expect(chapterBefore(['c6', 'c7'])).toBe('c7');
    noteRoute(['character', 'g1']);
    expect(cameFromChapter()).toBe(false);
    expect(chapterBefore(['c7'])).toBe('c7');
  });
  it('forgets it once the book page is opened, and ignores another book', () => {
    noteRoute(['chapter', 'c7']);
    noteRoute(['character', 'g1']);
    expect(cameFromChapter()).toBe(true);
    expect(chapterBefore(['x1'])).toBeUndefined();
    noteRoute(['book', 'b1']);
    noteRoute(['glossary', 'b1']);
    expect(chapterBefore(['c7'])).toBeUndefined();
  });
});
