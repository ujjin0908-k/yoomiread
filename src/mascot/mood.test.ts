import { describe, expect, it } from 'vitest';
import { moodFrom } from './mood';
import type { Session } from '../types';

const H = 60 * 60 * 1000;
const now = new Date(2026, 9, 24, 15, 0).getTime();
const s = (chapterId: string, hoursAgo: number, minutes = 20): Session => ({
  id: chapterId + hoursAgo,
  bookId: 'b',
  chapterId,
  startedAt: now - hoursAgo * H,
  ms: minutes * 60 * 1000,
});

describe('his mood', () => {
  it('is sad when there is no reading for two days', () => {
    expect(moodFrom([], now)).toBe('sad');
    expect(moodFrom([s('c1', 60)], now)).toBe('sad');
  });
  it('is happy after two chapters in three days', () => {
    expect(moodFrom([s('c1', 20), s('c2', 5)], now)).toBe('happy');
  });
  it('is idle after one chapter', () => {
    expect(moodFrom([s('c1', 5)], now)).toBe('idle');
  });
  it('is high after a long day of reading', () => {
    expect(moodFrom([s('c1', 1, 50), s('c2', 0.5, 50)], now)).toBe('high');
  });
});
