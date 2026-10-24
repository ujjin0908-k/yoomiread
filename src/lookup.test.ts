import { describe, expect, it } from 'vitest';
import { wordAt } from './logic';

describe('the word under a tap', () => {
  it('finds an English word and skips spaces and punctuation', () => {
    expect(wordAt('The lantern glowed.', 6, 'en')).toBe('lantern');
    expect(wordAt('The lantern glowed.', 18, 'en')).toBeUndefined();
  });
  it('finds a Chinese word without spaces', () => {
    expect(wordAt('他走进房间，灯还亮着。', 1, 'zh')).toBe('走进');
  });
});
