import { describe, expect, it } from 'vitest';
import type { Chapter, GlossaryEntry } from '../types';
import { chaptersToRead, chunkParts, mentions, mergeProfile, namesOf, parseProfileReply, planReading } from './profiles';

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
  const mei = person('p1', 'Mei', { profile: { looks: [], about: [], upTo: 1 } });
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
    const before = { looks: [{ text: 'Red coat', chapter: 1 }], about: [mine], quote: { text: 'Mine.', mine: true }, upTo: 1 };
    const after = mergeProfile(before, { name: 'Mei', looks: [{ text: 'red coat', chapter: 2 }, { text: 'Short hair', chapter: 2 }], about: [{ text: 'Quiet', chapter: 2 }], quote: { text: 'New quote', chapter: 2 } }, 3, 99);
    expect(after.looks.map((f) => f.text)).toEqual(['Red coat', 'Short hair']);
    expect(after.about).toEqual([mine, { text: 'Quiet', chapter: 2 }]);
    expect(after.quote?.text).toBe('Mine.');
    expect(after.upTo).toBe(3);
  });
  it('moves the profile forward even when the chapters said nothing new', () => {
    expect(mergeProfile({ looks: [], about: [], upTo: 2 }, undefined, 5, 1).upTo).toBe(5);
  });
  it('makes room by dropping the oldest lines, never the owner\'s', () => {
    const full = Array.from({ length: 8 }, (_, i) => ({ text: 'fact ' + i, chapter: 1, mine: i === 0 }));
    const after = mergeProfile({ looks: [], about: full }, { name: 'x', looks: [], about: [{ text: 'newest', chapter: 2 }] }, 2, 1);
    expect(after.about).toHaveLength(8);
    expect(after.about[0].text).toBe('fact 0');
    expect(after.about.map((f) => f.text)).not.toContain('fact 1');
    expect(after.about[7].text).toBe('newest');
  });
});
