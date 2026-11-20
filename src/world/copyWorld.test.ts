import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { FOOLISH_GAME } from '../guides/foolish-game';
import { numbersFor } from '../import/range';
import type { Book, Chapter, GlossaryEntry, WorldEvent, WorldLink } from '../types';
import { chineseNames, copyRows, copyWorld, passageFrom, sameNovel, withBracketRule } from './copyWorld';
import { loadFirstSeen } from './load';
import { readingLine } from './visible';

const entry = (extra: Partial<GlossaryEntry>): GlossaryEntry => ({
  id: 'x',
  bookId: 'en',
  original: 'X',
  english: 'X',
  kind: 'person',
  status: 'ok',
  locked: false,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const book = (extra: Partial<Book>): Book => ({ id: 'b', title: 'T', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1, ...extra });

describe('copying a world', () => {
  it('knows two books are the same novel by title or original title', () => {
    expect(sameNovel({ title: 'Foolish Game of the Gods', originalTitle: '诸神愚戏' }, { title: '诸神愚戏' })).toBe(true);
    expect(sameNovel({ title: 'The Foolish Game of the Gods' }, { title: 'foolish game of the gods' })).toBe(true);
    expect(sameNovel({ title: 'Foolish Game of the Gods' }, { title: 'Another Book' })).toBe(false);
    // Different titles, one novel: the built-in guide knows both.
    expect(sameNovel({ title: 'The Fool Of The Gods' }, { title: '诸神愚戏' })).toBe(true);
  });

  it('gives English-only names their Chinese from the guide and keeps Chinese nicknames', () => {
    const names = chineseNames(
      [
        entry({ id: 'qx', english: 'Qin Xin', original: 'Qin Xin' }),
        entry({ id: 'hl', english: 'Hong Lin', original: '红霖' }),
        entry({ id: 'cs', english: 'Cheng Shi', original: '程实' }),
        entry({ id: 'zz', english: 'Nobody Here', original: 'Nobody Here' }),
        entry({ id: 'fate', english: 'Fate', original: 'Fate', kind: 'god' }),
        entry({ id: 'silence', english: 'Silence', original: '沉默', kind: 'god' }),
      ],
      FOOLISH_GAME,
    );
    expect(names.get('qx')?.original).toBe('秦薪');
    expect(names.get('hl')?.aliases).toContain('大猫');
    expect(names.has('cs')).toBe(false);
    expect(names.has('zz')).toBe(false);
    // Gods go by their 【】 form, so "沉默了" (fell silent) is not taken for the god Silence.
    expect(names.get('fate')?.original).toBe('【命运】');
    expect(names.get('silence')?.original).toBe('【沉默】');
  });

  it('copies entries, links and events with new ids, and does not add a name twice', () => {
    let n = 0;
    const from = {
      entries: [entry({ id: 'a', english: 'Cheng Shi', original: '程实' }), entry({ id: 'p', english: 'Rosna', kind: 'place' }), entry({ id: 'c', english: 'City', kind: 'place', within: 'p' })],
      links: [{ id: 'l', bookId: 'en', from: 'a', to: 'p', label: 'lives in', createdAt: 1 }] as WorldLink[],
      events: [{ id: 'e', bookId: 'en', title: 'Arrives', who: ['a'], where: 'c', chapter: 3, createdAt: 1 }] as WorldEvent[],
    };
    const there = [entry({ id: 'mine', bookId: 'zh', english: 'Cheng Shi', original: '程实' })];
    const rows = copyRows(from, 'zh', there, 9, () => `n${++n}`);
    expect(rows.matched).toBe(1);
    expect(rows.entries.map((g) => g.english)).toEqual(['Rosna', 'City']);
    expect(rows.entries.every((g) => g.bookId === 'zh')).toBe(true);
    expect(rows.entries[1].within).toBe(rows.entries[0].id);
    expect(rows.links[0]).toMatchObject({ bookId: 'zh', from: 'mine', to: rows.entries[0].id });
    expect(rows.events[0]).toMatchObject({ who: ['mine'], where: rows.entries[1].id, chapter: 3 });
  });

  it('takes a passage of whole paragraphs, starting near dialogue', () => {
    const text = Array.from({ length: 30 }, (_, i) => (i === 11 ? '“Hello,” he said, and smiled at nobody in particular.' : `Line ${i} of the story, long enough to count as a real paragraph here.`)).join('\n');
    const p = passageFrom(text, 300);
    expect(p.startsWith('Line 10')).toBe(true);
    expect(p).toContain('“Hello,”');
    expect(p.split('\n\n').length).toBeGreaterThan(2);
  });

  it('adds the bracket rule once', () => {
    expect(withBracketRule('Keep pinyin.')).toMatch(/^Keep pinyin\. Write names in 【】/);
    expect(withBracketRule(withBracketRule(''))).toBe(withBracketRule(''));
  });

  it('numbers a book that starts at chapter 521 from its titles, and plain books 1, 2, 3', () => {
    expect(numbersFor(['简介', '第521章 没有谁', '第522章 扮演', '角色番外 幸存者们'])).toEqual([1, 521, 522, 523]);
    expect(numbersFor(['Prologue', 'Chapter 1', 'Chapter 1', 'Chapter 2'])).toEqual([1, 2, 3, 4]);
    // A bonus chapter between two numbered ones (as in the Chinese edition, between 1080 and 1081).
    expect(numbersFor(['第1080章 觐见', '程实生日番外章 生日', '第1081章 还是觐见'])).toEqual([1080, 1080.1, 1081]);
  });

  it('counts the chapters before a copy as read', () => {
    const chapters = [{ id: 'c', bookId: 'zh', number: 521, title: '', read: false, createdAt: 1 }] as Chapter[];
    expect(readingLine({ startLine: 520 }, chapters)).toBe(520);
    expect(readingLine({ startLine: 520, lastChapterId: 'c' }, chapters)).toBe(521);
  });
});

describe('copyWorld', () => {
  beforeEach(async () => {
    await Promise.all([db.books.clear(), db.glossary.clear(), db.worldLinks.clear(), db.worldEvents.clear(), db.chapters.clear(), db.texts.clear(), db.settings.clear()]);
  });

  it('copies into the Chinese book, adds Chinese names and leaves the English book as it was', async () => {
    await db.books.bulkAdd([
      book({ id: 'en', title: 'Foolish Game of the Gods', originalTitle: '诸神愚戏', style: { tone: 'literary' }, worldUpTo: 520 }),
      book({ id: 'zh', title: '诸神愚戏', language: 'zh' }),
    ]);
    await db.glossary.bulkAdd([
      entry({ id: 'qx', english: 'Qin Xin', original: 'Qin Xin', profile: { looks: [], about: [{ text: 'Mine', mine: true }], powers: [], status: [], v: 2 } }),
      entry({ id: 'cs', english: 'Cheng Shi', original: '程实' }),
    ]);
    await db.worldLinks.add({ id: 'l1', bookId: 'en', from: 'cs', to: 'qx', label: 'friend of', chapter: 300, createdAt: 1 });
    await db.addChapters([
      { chapter: { id: 'c1', bookId: 'en', number: 1, title: 'Chapter 1', read: true, createdAt: 1 }, text: 'Cheng Shi woke up.' },
      { chapter: { id: 'c520', bookId: 'en', number: 520, title: 'Chapter 520', read: true, createdAt: 1 }, text: 'Qin Xin and Cheng Shi talked.' },
    ]);
    const before = await db.glossary.where('bookId').equals('en').toArray();

    const result = await copyWorld('en', 'zh', { sample: 'A sample.', storySoFar: 'So far.', chinese: true }, 50);
    expect(result).toMatchObject({ names: 2, links: 1, chinese: 1 });
    expect(result.fromGuide).toBeGreaterThan(100);

    const zh = await db.glossary.where('bookId').equals('zh').toArray();
    const qin = zh.find((g) => g.english === 'Qin Xin');
    expect(qin?.original).toBe('秦薪');
    expect(qin?.profile?.about[0]).toMatchObject({ text: 'Mine', mine: true });
    expect(zh.filter((g) => g.english === 'Cheng Shi')).toHaveLength(1);
    expect(await db.worldLinks.where('bookId').equals('zh').count()).toBeGreaterThan(0);

    const target = await db.books.get('zh');
    expect(target).toMatchObject({ worldFrom: 'en', startLine: 520, storySoFar: 'So far.', worldUpTo: 520, originalTitle: '诸神愚戏' });
    expect(target?.style?.tone).toBe('literary');
    expect(target?.style?.sample).toBe('A sample.');
    expect(target?.style?.notes).toContain('【命运】 becomes [Fate]');
    // Met before the Chinese book's first chapter, as the English book saw it.
    const seen = await loadFirstSeen('zh');
    expect(seen.get(qin!.id)).toBe(520);

    expect(await db.glossary.where('bookId').equals('en').toArray()).toEqual(before);
    expect((await db.books.get('en'))?.worldFrom).toBeUndefined();
  });
});
