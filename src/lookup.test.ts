import { describe, expect, it } from 'vitest';
import { needsTranslation, wordAt } from './logic';

describe('the word under a tap', () => {
  it('finds an English word and skips spaces and punctuation', () => {
    expect(wordAt('The lantern glowed.', 6, 'en')).toBe('lantern');
    expect(wordAt('The lantern glowed.', 18, 'en')).toBeUndefined();
  });
  it('finds a Chinese word without spaces', () => {
    expect(wordAt('他走进房间，灯还亮着。', 1, 'zh')).toBe('走进');
  });
});

describe('which books need translating', () => {
  it('skips English books and Latin-only text, but not Chinese', () => {
    expect(needsTranslation({ language: 'en' }, '他走了。')).toBe(false);
    expect(needsTranslation({ language: 'other' }, 'Plain English sentences only.')).toBe(false);
    expect(needsTranslation({ language: 'zh' }, '他走了。')).toBe(true);
    expect(needsTranslation({ language: 'zh' })).toBe(true);
  });
});
