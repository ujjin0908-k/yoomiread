import { describe, expect, it } from 'vitest';
import type { TranslateSettings } from '../types';
import { pickModel, wantsOtherModel, wantsRetry } from './retry';

describe('asking the cat to translate again', () => {
  it('hears a request to translate again', () => {
    for (const m of ['retry', 'Retry translation', 'retranslate', 'translate it again', 'try again', 'redo it with the other model', 'please re-translate this chapter']) {
      expect(wantsRetry(m), m).toBe(true);
    }
  });
  it('leaves questions about the story to the chat', () => {
    for (const m of ['who is Li Jingming?', 'why did Cheng Shi tear the contract?', 'what is on that paper']) expect(wantsRetry(m), m).toBe(false);
  });
  it('picks the other model when asked', () => {
    const settings = { models: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], defaultModel: 'a' } as unknown as TranslateSettings;
    expect(wantsOtherModel('retry with the other model')).toBe(true);
    expect(pickModel(settings, undefined, false)).toBe('a');
    expect(pickModel(settings, undefined, true)).toBe('b');
    expect(pickModel(settings, 'b', true)).toBe('a');
  });
});
