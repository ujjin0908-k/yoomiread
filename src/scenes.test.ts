import { describe, expect, it } from 'vitest';
import { namedAt, scenesFor } from './scenes';
import type { GlossaryEntry } from './types';

const pic = { type: 'image/png', bytes: new ArrayBuffer(1) };
const e = (id: string, english: string, kind: GlossaryEntry['kind'] = 'god', extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({ id, bookId: 'b', original: english, english, kind, status: 'ok', locked: false, createdAt: 1, updatedAt: 1, picture: pic, ...extra });

describe('the picture book', () => {
  it('does not take an everyday word for a god', () => {
    expect(namedAt('At that time he left.', 'Time')).toBe(-1);
    expect(namedAt('Time passed slowly.', 'Time')).toBe(-1);
    expect(namedAt('He prayed to [Time] at dawn.', 'Time')).toBe(14);
    expect(namedAt('the chosen of Time smiled', 'Time')).toBe(14);
    expect(namedAt('the chosen of Time smiled', 'Time', true)).toBe(-1);
    expect(namedAt('Order was restored.', 'Order')).toBe(-1);
    expect(namedAt('they reached the Grand Tribunal at noon', 'Grand Tribunal')).toBe(17);
    expect(namedAt('他们来到欲海。', '欲海')).toBe(4);
  });

  it('does not call up a god for an item named after it', () => {
    const fate = e('fate', 'Fate');
    const die = e('die', 'Die of Fate', 'term', { picture: undefined });
    const voidPath = e('void', 'Path of the Void', 'term', { picture: undefined });
    const theVoid = e('v', 'Void', 'place');
    const paragraphs = ['The body that even the Die of Fate couldn’t hit was struck by a mask!', 'He walked the Path of the Void.', 'The chosen of Fate bowed.', 'Praise the great [Fate]!'];
    expect(scenesFor(paragraphs, [fate, die, voidPath, theVoid]).map((g) => g?.id)).toEqual([undefined, undefined, undefined, 'fate']);
  });

  it('shows each picture once per chapter, after the paragraph that first names it', () => {
    const tribunal = e('t', 'Grand Tribunal', 'place');
    const time = e('time', 'Time');
    const noPicture = e('x', 'Sea of Desire', 'place', { picture: undefined });
    // A term with a picture (a path, an item) shows too.
    const term = e('l', 'Ladder of Ascent', 'term');
    const out = scenesFor(
      ['They walked for a long time.', 'The Grand Tribunal rose ahead, and [Time] watched.', 'Inside the Grand Tribunal it was cold.', 'The Sea of Desire and the Ladder of Ascent.', 'He prayed to [Time].'],
      [tribunal, time, noPicture, term],
    );
    expect(out.map((g) => g?.id)).toEqual([undefined, 't', undefined, 'l', 'time']);
  });
});
