import { describe, expect, it } from 'vitest';
import { lookable } from './ChapterPage';

describe('looking up a selection', () => {
  it('offers a word or short phrase, without punctuation at the edges', () => {
    expect(lookable('dumbfounded.')).toBe('dumbfounded');
    expect(lookable('“no wrong')).toBe('no wrong');
    expect(lookable('程实')).toBe('程实');
  });
  it('does not offer a long selection, which is for highlighting', () => {
    expect(lookable('As the saying goes, there are no wrong answers')).toBeUndefined();
    expect(lookable('……')).toBeUndefined();
  });
});
