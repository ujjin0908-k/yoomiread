import { describe, expect, it } from 'vitest';
import { backupDue } from './backupNow';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 10, 10, 12, 0).getTime();

describe('backupDue', () => {
  it('reminds after a week without a backup, and says how many days', () => {
    expect(backupDue({ every: 7, lastAt: now - 6 * DAY }, now - 40 * DAY, now)).toBeUndefined();
    expect(backupDue({ every: 7, lastAt: now - 9 * DAY }, now - 40 * DAY, now)).toBe(9);
  });
  it('counts from the first book when there has never been a backup', () => {
    expect(backupDue({ every: 7 }, now - 2 * DAY, now)).toBeUndefined();
    expect(backupDue({ every: 7 }, now - 8 * DAY, now)).toBe(8);
  });
  it('stays quiet with no books, when turned off, and after "Later"', () => {
    expect(backupDue({ every: 7 }, undefined, now)).toBeUndefined();
    expect(backupDue({ every: 0, lastAt: now - 90 * DAY }, now - 90 * DAY, now)).toBeUndefined();
    expect(backupDue({ every: 7, lastAt: now - 9 * DAY, snoozeUntil: now + DAY }, now - 40 * DAY, now)).toBeUndefined();
  });
});
