import { describe, expect, it } from 'vitest';
import type { Chapter } from '../types';
import { cleanCode, inviteLink, myLine, showCode, standing, waitingText, type BuddyMember } from './buddy';

const member = (name: string, line: number, me = false): BuddyMember => ({ userId: name, name, line, me, owner: false });
const chapter = (n: number, extra: Partial<Chapter> = {}): Chapter => ({ id: `c${n}`, bookId: 'b', number: n, title: `Ch ${n}`, read: false, createdAt: 1, ...extra });

describe('buddy reads: codes and links', () => {
  it('reads a code however it is typed or pasted', () => {
    expect(cleanCode('hk3m 9qr2')).toBe('HK3M9QR2');
    expect(cleanCode('HK3M-9QR2')).toBe('HK3M9QR2');
    expect(cleanCode('Read it with me https://yoomiread.app/#/join/HK3M9QR2 ok')).toBe('HK3M9QR2');
    // Look-alikes are never in a code, so a code with them was mistyped.
    expect(cleanCode('HK3M9QR0')).toBeUndefined();
    expect(cleanCode('short')).toBeUndefined();
  });

  it('makes the invite link and shows the code in two halves', () => {
    expect(inviteLink('HK3M9QR2', 'https://yoomiread.app')).toBe('https://yoomiread.app/#/join/HK3M9QR2');
    expect(showCode('HK3M9QR2')).toBe('HK3M 9QR2');
  });
});

describe('buddy reads: where I stand', () => {
  it('ahead of everyone: the cat saves a seat', () => {
    const s = standing([member('Me', 12, true), member('Ana', 9), member('Ben', 10)]);
    expect(s.ahead).toBe(true);
    expect(s.text).toContain('ahead by 2 chapters');
  });

  it('behind: names whoever is furthest', () => {
    expect(standing([member('Me', 3, true), member('Ana', 9), member('Ben', 4)]).text).toBe('Ana is 6 chapters ahead of you.');
    expect(standing([member('Me', 3, true), member('Ana', 4)]).text).toBe('Ana is 1 chapter ahead of you.');
  });

  it('level, or alone', () => {
    expect(standing([member('Me', 5, true), member('Ana', 5)]).text).toBe('You’re all at the same place.');
    expect(standing([member('Me', 5, true)]).text).toContain('Nobody has joined yet');
  });

  it('says what is waiting, counts only', () => {
    expect(waitingText([])).toBe('');
    expect(waitingText([{ chapter: 12, comments: 2 }, { chapter: 15, comments: 1 }])).toBe('2 comments waiting at chapter 12, 1 at chapter 15. Read on to unlock them.');
    expect(waitingText([1, 2, 3, 4].map((n) => ({ chapter: n, comments: 1 })))).toContain('and more after');
  });

  it('my line is the last chapter finished: the one I am in does not count yet', () => {
    const chapters = [chapter(1, { read: true }), chapter(2, { read: true }), chapter(3, { position: 0.4 })];
    expect(myLine({}, chapters)).toBe(2);
    // A book that carries on from another counts what came before.
    expect(myLine({ startLine: 520 }, chapters)).toBe(520);
  });
});
