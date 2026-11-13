import { describe, expect, it } from 'vitest';
import type { Chapter, GlossaryEntry } from '../types';
import { chaptersToRead, chaptersToSearch, chunkParts, mentions, mergeProfile, namesOf, parseProfileReply, parseWorldReply, planReading, searchPlan, worldMessages } from './profiles';

const person = (id: string, english: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({
  id, bookId: 'b', original: english, english, kind: 'person', locked: false, status: 'ok', createdAt: 1, updatedAt: 1, ...extra,
});
const chapter = (n: number, read = true): Chapter => ({ id: 'c' + n, bookId: 'b', number: n, title: 'Chapter ' + n, read, createdAt: 1 });

describe('finding a character in the text', () => {
  it('matches whole names only, and other names too', () => {
    const mei = person('p1', 'Mei', { aliases: ['Little Mei', '梅'] });
    expect(mentions('Then Mei laughed.', namesOf(mei))).toBe(true);
    expect(mentions('The meitnerium glowed.', namesOf(mei))).toBe(false);
    expect(mentions('“小梅!” 梅回头。', namesOf(mei))).toBe(true);
    expect(mentions('The ferryman waited.', namesOf(mei))).toBe(false);
  });
});

describe('what an update reads', () => {
  const chapters = [chapter(1), chapter(2), chapter(3), chapter(4, false)];
  const text: Record<string, string> = {
    c1: 'Mei stood at the rail.\n\nThe river ran slow.',
    c2: 'The ferryman coughed.\n\nMei smiled at Jun.',
    c3: 'Jun slept.\n\nNobody spoke.',
    c4: 'Mei dies. (unread)',
  };
  const mei = person('p1', 'Mei', { profile: { looks: [], about: [], upTo: 1, v: 2 } });
  const jun = person('p2', 'Jun');

  it('reads only finished chapters after the one the profile is up to', () => {
    expect(chaptersToRead(chapters, mei).map((c) => c.number)).toEqual([2, 3]);
    expect(chaptersToRead(chapters, jun).map((c) => c.number)).toEqual([1, 2, 3]);
  });
  it('sends only the paragraphs that name a picked character, and never an unread chapter', () => {
    const plan = planReading(chapters, [mei], (id) => text[id]);
    expect(plan.parts).toEqual([{ chapter: 2, text: 'Mei smiled at Jun.' }]);
    expect(plan.upTo.get('p1')).toBe(3);
    expect(JSON.stringify(plan)).not.toContain('dies');
  });
  it('shares one reading between the characters picked together', () => {
    const plan = planReading(chapters, [mei, jun], (id) => text[id]);
    // Chapter 1 is new for Jun only, and it does not name Jun, so it is not sent at all.
    expect(plan.parts.map((p) => p.chapter)).toEqual([2, 3]);
    expect(plan.parts[0].text).toBe('Mei smiled at Jun.');
  });
  it('reads whole chapters when looking for new people', () => {
    expect(planReading(chapters, [mei], (id) => text[id], true).parts.map((p) => p.text.length)).toEqual([text.c2.length, text.c3.length]);
  });
  it('splits a long reading into several requests', () => {
    const parts = [1, 2, 3].map((n) => ({ chapter: n, text: 'x'.repeat(900) }));
    expect(chunkParts(parts, 2000).map((c) => c.map((p) => p.chapter))).toEqual([[1, 2], [3]]);
  });
});

describe('trusting the answer', () => {
  const chunk = [{ chapter: 2, text: '“You are late,” said the ferryman. Mei wore a red coat.' }];
  it('keeps details from chapters that were sent and a quote found word for word', () => {
    const raw = '{"name": "Mei", "line": "A girl by the river", "looks": [{"text": "Wears a red coat", "ch": 2}, {"text": "Has a scar", "ch": 9}], "quote": {"text": "You are late,", "ch": 2}}';
    const { updates } = parseProfileReply(raw, chunk);
    expect(updates[0].looks).toEqual([{ text: 'Wears a red coat', chapter: 2 }]);
    expect(updates[0].quote).toEqual({ text: 'You are late,', chapter: 2 });
  });
  it('accepts a real quote whose punctuation changed', () => {
    const { updates } = parseProfileReply('{"name": "Mei", "quote": {"text": "You are late.", "ch": 2}}', chunk);
    expect(updates[0].quote?.text).toBe('You are late.');
  });
  it('drops a quote that is not in the text', () => {
    const { updates } = parseProfileReply('{"name": "Mei", "about": [{"text": "Quiet", "ch": 2}], "quote": {"text": "I will burn this city", "ch": 2}}', chunk);
    expect(updates[0].quote).toBeUndefined();
  });
  it('reads new people, and ignores lines that are not JSON', () => {
    const { updates, fresh } = parseProfileReply('Sure!\n{"new": "渡船人", "english": "the Ferryman", "gender": "he", "note": "rows the boat"}\nnot json {', chunk);
    expect(updates).toEqual([]);
    expect(fresh).toEqual([{ original: '渡船人', english: 'the Ferryman', gender: 'he', note: 'rows the boat' }]);
  });
});

describe('folding an update into a profile', () => {
  it('adds new lines, skips repeats, and never touches what the owner wrote', () => {
    const mine = { text: 'My favourite', mine: true };
    const before = { looks: [{ text: 'Red coat', chapter: 1 }], about: [mine], quote: { text: 'Mine.', mine: true }, upTo: 1, v: 2 as const };
    const after = mergeProfile(before, { name: 'Mei', looks: [{ text: 'red coat', chapter: 2 }, { text: 'Short hair', chapter: 2 }], about: [{ text: 'Quiet', chapter: 2 }], powers: [], status: [], quote: { text: 'New quote', chapter: 2 } }, 3, 99);
    expect(after.looks.map((f) => f.text)).toEqual(['Red coat', 'Short hair']);
    expect(after.about).toEqual([mine, { text: 'Quiet', chapter: 2 }]);
    expect(after.quote?.text).toBe('Mine.');
    expect(after.upTo).toBe(3);
  });
  it('moves the profile forward even when the chapters said nothing new', () => {
    expect(mergeProfile({ looks: [], about: [], upTo: 2, v: 2 }, undefined, 5, 1).upTo).toBe(5);
  });
  it('makes room by dropping the oldest lines, never the owner\'s', () => {
    const full = Array.from({ length: 6 }, (_, i) => ({ text: 'fact ' + i, chapter: 1, mine: i === 0 }));
    const after = mergeProfile({ looks: [], about: full, v: 2 }, { name: 'x', looks: [], about: [{ text: 'newest', chapter: 2 }], powers: [], status: [] }, 2, 1);
    expect(after.about).toHaveLength(6);
    expect(after.about[0].text).toBe('fact 0');
    expect(after.about.map((f) => f.text)).not.toContain('fact 1');
    expect(after.about[5].text).toBe('newest');
  });
});

describe('looking for new characters', () => {
  const chapters = [chapter(1), chapter(2), chapter(3), chapter(4, false)];
  it('reads only finished chapters after the last search, never an unread one', () => {
    expect(chaptersToSearch(chapters, 1).map((c) => c.number)).toEqual([2, 3]);
    expect(chaptersToSearch(chapters).map((c) => c.number)).toEqual([1, 2, 3]);
    expect(chaptersToSearch(chapters, 3)).toEqual([]);
    const texts = new Map([['c2', 'Two'], ['c3', ''], ['c4', 'SPOILER']]);
    expect(searchPlan(chapters, texts, 1)).toEqual([{ chapter: 2, text: 'Two' }]);
  });
});

describe('who they are, powers and status', () => {
  const chunk = [{ chapter: 4, text: 'Cheng Shi, priest of Birth, rose to Ladder Rank 2000 and drew his die, Fate.' }];
  it('reads powers and status from the reply, only for chapters that were sent', () => {
    const raw = '{"name": "Cheng Shi", "about": [{"text": "Priest of Birth", "ch": 4}], "powers": [{"text": "Die called Fate", "ch": 4}, {"text": "Flight", "ch": 9}], "status": [{"text": "Ladder Rank 2000", "ch": 4}]}';
    const { updates } = parseProfileReply(raw, chunk);
    expect(updates[0].powers).toEqual([{ text: 'Die called Fate', chapter: 4 }]);
    expect(updates[0].status).toEqual([{ text: 'Ladder Rank 2000', chapter: 4 }]);
  });

  it('replaces the status with the newest one, keeping lines the owner wrote; powers add up', () => {
    const mine = { text: 'My note', mine: true };
    const before = { looks: [], about: [], powers: [{ text: 'Die', chapter: 2 }], status: [{ text: 'Ladder Rank 1900', chapter: 2 }, mine], v: 2 as const, upTo: 2 };
    const after = mergeProfile(before, { name: 'x', looks: [], about: [], powers: [{ text: 'Time acceleration', chapter: 5 }], status: [{ text: 'Ladder Rank 2000', chapter: 5 }] }, 5, 1);
    expect(after.status).toEqual([mine, { text: 'Ladder Rank 2000', chapter: 5 }]);
    expect(after.powers?.map((f) => f.text)).toEqual(['Die', 'Time acceleration']);
    // No new status: the old one stays.
    expect(mergeProfile(after, undefined, 6, 1).status).toEqual(after.status);
  });

  it('rebuilds an old-style profile from chapter 1, keeping only the owner\'s lines, line and quote', () => {
    const old = { line: 'Fertility priest', looks: [{ text: 'smiles playfully', chapter: 4 }], about: [{ text: 'downs half a bottle of wine', chapter: 7 }, { text: 'Mine', mine: true }], quote: { text: 'I won’t die.', chapter: 9 }, upTo: 17 };
    const entry = person('p9', 'Cheng Shi', { profile: old });
    expect(chaptersToRead([chapter(1), chapter(2), chapter(3)], entry).map((c) => c.number)).toEqual([1, 2, 3]);
    const after = mergeProfile(old, undefined, 3, 1);
    expect(after.v).toBe(2);
    expect(after.about).toEqual([{ text: 'Mine', mine: true }]);
    expect(after.looks).toEqual([]);
    expect(after.line).toBe('Fertility priest');
    expect(after.quote?.text).toBe('I won’t die.');
    expect(after.upTo).toBe(3);
  });
});

describe('searching the story for its world', () => {
  const chunk = [{ chapter: 5, text: 'In Bliss City the priests of Birth pray to the god Fertility. The Ladder ranks every player.' }];
  it('reads new people, places, gods, groups and terms, and facts only for chapters that were sent', () => {
    const raw = [
      '{"new": "Bliss City", "english": "Bliss City", "kind": "place", "note": "City where priests of Birth pray", "ch": 5}',
      '{"new": "Fertility", "english": "Fertility", "kind": "god", "gender": "she", "note": "God that Birth\'s priests worship", "ch": 5}',
      '{"new": "The Ladder", "english": "The Ladder", "kind": "term", "note": "Ranking of all players", "ch": 9}',
      '{"new": "Zhang Wei", "english": "Zhang Wei", "kind": "spaceship"}',
      '{"about": "Birth", "facts": [{"text": "Its priests pray in Bliss City", "ch": 5}, {"text": "Later truth", "ch": 30}]}',
    ].join('\n');
    const { fresh, facts } = parseWorldReply(raw, chunk);
    expect(fresh.map((f) => [f.english, f.kind, f.chapter])).toEqual([
      ['Bliss City', 'place', 5],
      ['Fertility', 'god', 5],
      ['The Ladder', 'term', undefined],
      ['Zhang Wei', 'person', undefined],
    ]);
    // Gender is for people only.
    expect(fresh[1].gender).toBeUndefined();
    expect(facts).toEqual([{ name: 'Birth', facts: [{ text: 'Its priests pray in Bliss City', chapter: 5 }] }]);
  });

  it('tells the model what the guide already holds', () => {
    const known = [person('p1', 'Cheng Shi'), { ...person('w1', 'Birth'), kind: 'god' as const, note: 'A god', profile: { looks: [], about: [{ text: 'Grants new life', chapter: 2 }] } }];
    const user = worldMessages({ book: { id: 'b', title: 'Book' } as never, chunk, known })[1].content;
    expect(user).toContain('People in the guide: Cheng Shi');
    expect(user).toContain('- Birth (god): A god. Known: Grants new life');
  });
});
