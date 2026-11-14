import { describe, expect, it } from 'vitest';
import { glossaryFor } from './glossaryMatch';
import type { GlossaryEntry } from './types';

const e = (id: string, english: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({ id, bookId: 'b', original: english, english, kind: 'god', status: 'ok', locked: false, createdAt: 1, updatedAt: 1, ...extra });
const all = [
  e('fate', 'Fate'),
  e('deceit', 'Deceit', { aliases: ['Deception'] }),
  e('sea', 'Sea of Desire', { kind: 'place', original: '欲海' }),
  e('cao', 'Cao Sansui', { kind: 'person' }),
  e('cs', 'Cheng Shi', { kind: 'person', original: '程实' }),
  e('chen', 'Chen Chong', { kind: 'person' }),
  e('path', 'Path of the Void', { kind: 'term', aliases: ['Void'] }),
];

describe('finding a selected word in the glossary', () => {
  it('matches a name however it is written in the text', () => {
    expect(glossaryFor('Fate', all)?.id).toBe('fate');
    expect(glossaryFor('[Deceit]', all)?.id).toBe('deceit');
    expect(glossaryFor('Deceit’s', all)?.id).toBe('deceit');
    expect(glossaryFor('deception.', all)?.id).toBe('deceit');
    expect(glossaryFor('the Sea of Desire', all)?.id).toBe('sea');
    expect(glossaryFor('欲海', all)?.id).toBe('sea');
    expect(glossaryFor('[Void]', all)?.id).toBe('path');
  });
  it('finds a name inside a longer selection, the longest first', () => {
    expect(glossaryFor('Praise the great [Fate]!', all)?.id).toBe('fate');
    expect(glossaryFor('into the Sea of Desire', all)?.id).toBe('sea');
  });
  it('matches part of a name only when one name has it', () => {
    expect(glossaryFor('Sansui', all)?.id).toBe('cao');
    expect(glossaryFor('程', all)).toBeUndefined();
    expect(glossaryFor('Chen', all)?.id).toBe('chen');
    expect(glossaryFor('river', all)).toBeUndefined();
  });
});
