import { describe, expect, it } from 'vitest';
import type { Chapter, GlossaryEntry, WorldEvent, WorldLink } from '../types';
import { worldAt } from '../world/visible';
import { askedAbout, catContext, catLine, questionWords, readPart } from './askContext';

/**
 * A book of 10 chapters. I have finished 1 to 4 and am halfway through 5. Everything I must not see has "SPOILER" in
 * it: later chapters, the second half of chapter 5, people first met later, and links and events dated later.
 */
const entry = (id: string, english: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  id,
  bookId: 'b',
  original: english,
  english,
  kind: 'person',
  status: 'ok',
  locked: false,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const chapter = (n: number, extra: Partial<Chapter> = {}): Chapter => ({ id: `c${n}`, bookId: 'b', number: n, title: `Ch ${n}`, read: n <= 4, createdAt: 1, ...extra });

const chapters = Array.from({ length: 10 }, (_, i) => chapter(i + 1, i === 4 ? { position: 0.5 } : {}));
const text: Record<string, string> = {
  c1: 'Mira Vale came to the harbor town.\nThe tide was low.',
  c2: 'Old Fen taught Mira to mend nets.\nThe church bells rang.',
  c3: 'Mira hated the church because it took her mother.',
  c4: 'Mira and Old Fen sailed out at dawn.',
  c5: 'Mira saw a strange ship.\nThe crew looked tired.\nSPOILER the ship belonged to Lord Ash.\nSPOILER Lord Ash smiled.',
  c6: 'SPOILER Lord Ash arrived.',
  c9: 'SPOILER Old Fen died.',
};
const entries = [
  entry('mira', 'Mira Vale', { profile: { looks: [], about: [{ text: 'A fisher girl', chapter: 1 }, { text: 'SPOILER queen in hiding', chapter: 8 }], status: [{ text: 'SPOILER dead', chapter: 9 }] } }),
  entry('fen', 'Old Fen', { note: 'SPOILER note with no chapter' }),
  entry('ash', 'Lord Ash'),
  entry('church', 'the Church', { kind: 'group' }),
];
const firstSeen = new Map([
  ['mira', 1],
  ['fen', 2],
  ['church', 2],
  ['ash', 5],
]);
const links: WorldLink[] = [
  { id: 'l1', bookId: 'b', from: 'fen', to: 'mira', label: 'teacher of', chapter: 2, createdAt: 1 },
  { id: 'l2', bookId: 'b', from: 'fen', to: 'mira', label: 'SPOILER betrays', chapter: 7, createdAt: 2 },
  { id: 'l3', bookId: 'b', from: 'ash', to: 'mira', label: 'SPOILER father of', chapter: 5, createdAt: 3 },
];
const events: WorldEvent[] = [
  { id: 'e1', bookId: 'b', chapter: 4, title: 'Mira and Old Fen sailed out', who: ['mira', 'fen'], createdAt: 1 },
  { id: 'e2', bookId: 'b', chapter: 5, title: 'SPOILER the ship was seized', who: ['mira'], createdAt: 2 },
  { id: 'e3', bookId: 'b', chapter: 9, title: 'SPOILER the funeral', who: ['fen'], createdAt: 3 },
];

function contextFor(question: string) {
  const line = catLine(chapters);
  const world = worldAt({ entries, links, events, notes: [], chapters, firstSeen }, { line, spoilers: false });
  return catContext({ question, world, line, chapters, textOf: (id) => text[id], current: chapters[4] });
}

describe('asking the cat: nothing past what I have read', () => {
  it('the line is the last finished chapter, not the one I am in', () => {
    expect(catLine(chapters)).toBe(4);
    expect(catLine(chapters, 12)).toBe(12);
  });

  it('only the part of this chapter I have read', () => {
    expect(readPart(text.c5, 0.5)).toBe('Mira saw a strange ship.\nThe crew looked tired.');
    expect(readPart(text.c5, 0)).toBe('');
    expect(readPart(text.c5, 1)).toBe(text.c5);
  });

  for (const question of ['Who is Lord Ash?', 'Who is Mira again?', 'Why does she hate the church?', 'What happens to Old Fen?', 'Tell me everything about the ship', 'Who is in this book?']) {
    it(`"${question}" sends nothing past the line`, () => {
      expect(contextFor(question)).not.toContain('SPOILER');
    });
  }

  it('never names someone first met in the chapter I am in, or later', () => {
    expect(contextFor('Who is Lord Ash?')).not.toContain('Lord Ash');
  });

  it('a first name finds the person, with what the Living Book knows at the line', () => {
    const c = contextFor('Who is Mira again?');
    expect(c).toContain('Mira Vale, person, first named in ch. 1');
    expect(c).toContain('A fisher girl (ch. 1)');
    expect(c).toContain('Old Fen teacher of Mira Vale (ch. 2)');
    expect(c).toContain('Mira and Old Fen sailed out (ch. 4)');
    // Where she came in, from chapter 1, even though only the last chapters were sent before.
    expect(c).toContain('[Ch. 1] Mira Vale came to the harbor town.');
  });

  it('a question with no names finds the passages that share its words', () => {
    const c = contextFor('Why does she hate the church?');
    expect(c).toContain('[Ch. 3] Mira hated the church because it took her mother.');
  });

  it('includes what I have read of this chapter, so "who is this?" about a new face still works', () => {
    expect(contextFor('What is this ship?')).toContain('Chapter 5, as far as you have read it:\nMira saw a strange ship.\nThe crew looked tired.');
  });

  it('with the guide’s spoilers on for the book, a note with no chapter may show, but later chapters still never do', () => {
    const line = catLine(chapters);
    const world = worldAt({ entries, links, events, notes: [], chapters, firstSeen }, { line, spoilers: true });
    const c = catContext({ question: 'Who is Old Fen?', world, line, chapters, textOf: (id) => text[id], current: chapters[4] });
    expect(c).toContain('SPOILER note with no chapter');
    expect(c).not.toContain('SPOILER Old Fen died');
    expect(c).not.toContain('SPOILER betrays');
  });
});

describe('asking the cat: finding what the question is about', () => {
  const shown = entries.map((g) => ({ ...g, firstChapter: firstSeen.get(g.id) }));
  it('full names first, then a part of a name; everyday words are not names', () => {
    expect(askedAbout('Who is Mira Vale?', shown).map((g) => g.id)).toEqual(['mira']);
    expect(askedAbout('is fen ok', shown).map((g) => g.id)).toEqual(['fen']);
    expect(askedAbout('Who is the old man?', shown)).toEqual([]);
    expect(questionWords('Why does she hate the church?')).toEqual(['hate', 'church']);
  });
});
