import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { makeBackup, parseBackup } from '../backup';
import { applyGuide, parseGuide } from '../guides';
import type { Book, Chapter, GlossaryEntry, Note, WorldEvent, WorldLink } from '../types';
import { firstSeen, nameFinder } from './seen';
import { readingLine, worldAt } from './visible';
import { loadWorld } from './load';

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
const chapter = (n: number, extra: Partial<Chapter> = {}): Chapter => ({ id: `c${n}`, bookId: 'b', number: n, title: `Ch ${n}`, read: false, createdAt: 1, ...extra });

describe('first seen: names in the text', () => {
  it('reads Chinese names anywhere, Latin names as whole words with their capitals', () => {
    const find = nameFinder([entry('a', 'Song Yawen', { original: '宋雅文' }), entry('b', 'Chun')]);
    expect([...find('他看见宋雅文走来')]).toEqual(['a']);
    expect([...find('Song Yawen smiled.')]).toEqual(['a']);
    expect([...find('a chunk of bread, Chunky')].length).toBe(0);
    expect([...find('“No,” said Chun.')]).toEqual(['b']);
  });

  it('a one-word god counts only in brackets; another one-word name also mid-sentence', () => {
    const find = nameFinder([entry('fate', 'Fate', { kind: 'god' }), entry('void', 'Void', { kind: 'term' })]);
    expect(find('It was Fate. At that time, fate smiled.').size).toBe(0);
    expect([...find('He prayed to [Fate].')]).toEqual(['fate']);
    expect([...find('Void was all he saw.')].length).toBe(0);
    expect([...find('He walked the path of the Void.')]).toEqual(['void']);
    expect([...find('【Void】')]).toEqual(['void']);
  });

  it('keeps the earliest chapter, whatever order the chapters come in', () => {
    const seen = firstSeen([entry('a', 'Cheng Shi')], [
      { number: 9, texts: ['Cheng Shi ran.'] },
      { number: 3, texts: [undefined, 'Cheng Shi woke.'] },
      { number: 5, texts: ['Nobody.'] },
    ]);
    expect(seen.get('a')).toBe(3);
  });
});

describe('the reading line', () => {
  it('is the furthest chapter read, or the one I am in when that is later', () => {
    const chapters = [chapter(1, { read: true }), chapter(2, { position: 0.95 }), chapter(3), chapter(4)];
    expect(readingLine({}, chapters)).toBe(2);
    expect(readingLine({ lastChapterId: 'c4' }, chapters)).toBe(4);
    expect(readingLine({ lastChapterId: 'c1' }, chapters)).toBe(2);
    expect(readingLine({}, [])).toBe(0);
  });
});

/**
 * A world that runs to chapter 100. Everything that should stay hidden at the line (40) has "SPOILER" in its text,
 * so a single search of the result proves nothing leaked, wherever it would show.
 */
function bigWorld() {
  const chapters = Array.from({ length: 100 }, (_, i) => chapter(i + 1));
  const entries = [
    entry('hero', 'Hero', {
      role: 'main',
      note: 'SPOILER note with no chapter',
      aliases: ['SPOILER other name'],
      look: 'SPOILER look',
      profile: {
        looks: [],
        about: [
          { text: 'An orphan', chapter: 1 },
          { text: 'SPOILER becomes a god', chapter: 80 },
          { text: 'SPOILER guide line', guide: true },
          { text: 'My own line', mine: true },
          { text: 'SPOILER line with no source' },
        ],
        powers: [{ text: 'Lies well', chapter: 10 }, { text: 'SPOILER new power', chapter: 41 }],
        status: [{ text: 'SPOILER dead', chapter: 90 }],
        quote: { text: 'SPOILER last words', chapter: 99 },
        v: 2,
      },
    }),
    entry('mentor', 'Mentor'),
    entry('villain', 'SPOILER Villain'),
    entry('city', 'City', { kind: 'place' }),
    entry('realm', 'Realm', { kind: 'place' }),
    entry('lake', 'SPOILER Lake', { kind: 'place', within: 'city' }),
    entry('pending', 'Pending', { status: 'review' }),
  ];
  entries.find((e) => e.id === 'city')!.within = 'realm';
  const firstSeenMap = new Map([
    ['hero', 1],
    ['mentor', 12],
    ['villain', 60],
    ['city', 2],
    ['realm', 30],
    ['lake', 70],
    ['pending', 1],
  ]);
  const link = (id: string, from: string, to: string, label: string, extra: Partial<WorldLink> = {}): WorldLink => ({ id, bookId: 'b', from, to, label, createdAt: 1, ...extra });
  const links = [
    link('l1', 'mentor', 'hero', 'teacher of', { chapter: 12 }),
    link('l2', 'mentor', 'hero', 'ally of', { chapter: 30 }),
    link('l3', 'mentor', 'hero', 'SPOILER betrays', { chapter: 70 }),
    link('l4', 'villain', 'hero', 'SPOILER enemy of', { chapter: 61 }),
    link('l5', 'hero', 'mentor', 'SPOILER guide link', { guide: true }),
    link('l6', 'hero', 'city', 'born in', { mine: true }),
  ];
  const event = (id: string, title: string, extra: Partial<WorldEvent> = {}): WorldEvent => ({ id, bookId: 'b', title, createdAt: 1, ...extra });
  const events = [
    event('e1', 'Hero arrives in the City', { chapter: 2, who: ['hero'], where: 'city' }),
    event('e2', 'Hero meets the Mentor', { chapter: 12, who: ['hero', 'mentor', 'villain'], where: 'lake' }),
    event('e3', 'SPOILER the fall', { chapter: 75 }),
    event('e4', 'SPOILER guide event', { guide: true }),
  ];
  const note = (id: string, chapterId: string, body: string): Note => ({ id, bookId: 'b', chapterId, kind: 'chapter', body, createdAt: 1, updatedAt: 1 });
  const notes = [note('n1', 'c5', 'Loved this'), note('n2', 'c41', 'SPOILER note ahead'), note('n3', 'gone', 'SPOILER lost chapter')];
  return { entries, links, events, notes, chapters, firstSeen: firstSeenMap };
}

describe('no spoilers: nothing past the reading line shows', () => {
  it('hides everything past chapter 40, wherever it would show', () => {
    const w = worldAt(bigWorld(), { line: 40, spoilers: false });
    expect(JSON.stringify(w, (_k, v) => (v instanceof Map ? [...v] : v))).not.toContain('SPOILER');
  });

  it('keeps what is allowed: met people, early facts, my own lines and links', () => {
    const w = worldAt(bigWorld(), { line: 40, spoilers: false });
    expect(w.entries.map((e) => e.id).sort()).toEqual(['city', 'hero', 'mentor', 'realm']);
    const hero = w.entries.find((e) => e.id === 'hero')!;
    expect(hero.profile!.about.map((f) => f.text)).toEqual(['An orphan', 'My own line']);
    expect(hero.profile!.powers!.map((f) => f.text)).toEqual(['Lies well']);
    expect(hero.firstChapter).toBe(1);
    expect(w.pairs.map((p) => p.current.label).sort()).toEqual(['ally of', 'born in']);
    expect(w.pairs.find((p) => p.current.label === 'ally of')!.history.map((l) => l.label)).toEqual(['teacher of']);
    expect(w.events.map((e) => e.title)).toEqual(['Hero arrives in the City', 'Hero meets the Mentor']);
    expect(w.events[1].who).toEqual(['hero', 'mentor']);
    expect(w.events[1].where).toBeUndefined();
    expect(w.notes.map((n) => n.body)).toEqual(['Loved this']);
    expect(w.placesWithin.get('')).toEqual(['realm']);
    expect(w.placesWithin.get('realm')).toEqual(['city']);
  });

  it('a pending name never shows, even when named', () => {
    const w = worldAt(bigWorld(), { line: 100, spoilers: true });
    expect(w.entries.some((e) => e.id === 'pending')).toBe(false);
  });

  it('at the start of the book there is almost nothing', () => {
    const w = worldAt(bigWorld(), { line: 1, spoilers: false });
    expect(w.entries.map((e) => e.id)).toEqual(['hero']);
    expect(w.pairs).toEqual([]);
    expect(w.events).toEqual([]);
  });

  it('with the guide’s spoilers on, undated guide lines, links and events show; undated lines with no source never do', () => {
    const w = worldAt(bigWorld(), { line: 40, spoilers: true });
    const text = JSON.stringify(w, (_k, v) => (v instanceof Map ? [...v] : v));
    expect(text).toContain('SPOILER guide line');
    expect(text).toContain('SPOILER guide link');
    expect(text).toContain('SPOILER guide event');
    expect(text).not.toContain('SPOILER line with no source');
    expect(text).not.toContain('SPOILER becomes a god');
  });
});

describe('the world from the database', () => {
  const book: Book = { id: 'b', title: 'Test', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1 };

  beforeEach(async () => {
    await Promise.all([db.books, db.chapters, db.texts, db.glossary, db.worldLinks, db.worldEvents, db.notes, db.settings, db.translations].map((t) => t.clear()));
    await db.books.add({ ...book, lastChapterId: 'c2' });
    await db.addChapters([
      { chapter: chapter(1, { read: true }), text: 'Cheng Shi woke up in Hope City.' },
      { chapter: chapter(2), text: 'Cheng Shi lied to everyone.' },
      { chapter: chapter(3), text: 'Then he met Xiao Qi.' },
    ]);
    await db.glossary.bulkAdd([entry('cs', 'Cheng Shi', { bookId: 'b' }), entry('xq', 'Xiao Qi', { bookId: 'b' }), entry('hc', 'Hope City', { kind: 'place', bookId: 'b' })]);
  });

  it('finds who is met by the reading line, and the slider cannot pass it', async () => {
    const w = (await loadWorld('b'))!;
    expect(w.line).toBe(2);
    expect(w.entries.map((e) => e.id).sort()).toEqual(['cs', 'hc']);
    expect((await loadWorld('b', 99))!.line).toBe(2);
    expect((await loadWorld('b', 0))!.entries).toEqual([]);
  });

  it('keeps the scan and redoes it when a chapter changes', async () => {
    await loadWorld('b');
    await new Promise((r) => setTimeout(r, 20));
    const saved = await db.settings.get('world-seen:b');
    expect(saved).toBeDefined();
    await db.setText(chapter(2), 'Cheng Shi lied to Xiao Qi, at length.');
    const w = (await loadWorld('b'))!;
    expect(w.entries.map((e) => e.id).sort()).toEqual(['cs', 'hc', 'xq']);
  });

  it('a guide adds nested places, links and events once, by any name', async () => {
    const guide = parseGuide(
      JSON.stringify({
        book: 'Test',
        entries: [
          { english: 'Hope City', kind: 'place', within: 'Star Realm' },
          { english: 'Star Realm', kind: 'place' },
          { english: 'Cheng Shi', kind: 'person', aliases: ['Little Cheng'] },
        ],
        links: [
          { from: 'Little Cheng', to: 'Xiao Qi', label: 'friend of', chapter: 3 },
          { from: 'Cheng Shi', to: 'Nobody', label: 'ignored' },
        ],
        events: [{ title: 'Cheng Shi wakes', chapter: 1, who: ['Cheng Shi'], where: 'Hope City', arc: 'Opening' }],
      }),
    );
    await applyGuide('b', guide);
    await applyGuide('b', guide);
    const links = await db.worldLinks.toArray();
    expect(links.map((l) => [l.from, l.to, l.label, l.chapter, l.guide])).toEqual([['cs', 'xq', 'friend of', 3, true]]);
    const events = await db.worldEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ who: ['cs'], where: 'hc', arc: 'Opening', chapter: 1 });
    const realm = (await db.glossary.toArray()).find((g) => g.english === 'Star Realm')!;
    expect((await db.glossary.get('hc'))!.within).toBe(realm.id);
  });

  it('links and events go into a backup and come back', async () => {
    await db.worldLinks.add({ id: 'l', bookId: 'b', from: 'cs', to: 'xq', label: 'friend of', mine: true, createdAt: 1 });
    await db.worldEvents.add({ id: 'e', bookId: 'b', title: 'Met', chapter: 3, createdAt: 1 });
    const file = JSON.stringify(await makeBackup(await db.exportAll()));
    await db.worldLinks.clear();
    await db.worldEvents.clear();
    await db.restore(parseBackup(file));
    expect((await db.worldLinks.toArray()).map((l) => l.label)).toEqual(['friend of']);
    expect((await db.worldEvents.toArray()).map((e) => e.title)).toEqual(['Met']);
  });

  it('deleting the book removes its links and events', async () => {
    await db.worldLinks.add({ id: 'l', bookId: 'b', from: 'cs', to: 'xq', label: 'friend of', createdAt: 1 });
    await db.worldEvents.add({ id: 'e', bookId: 'b', title: 'Met', createdAt: 1 });
    await db.deleteBook('b');
    expect(await db.worldLinks.count()).toBe(0);
    expect(await db.worldEvents.count()).toBe(0);
  });
});

describe('the Foolish Game guide links', () => {
  it('every link names two entries of the guide', async () => {
    const { FOOLISH_GAME } = await import('../guides/foolish-game');
    const names = new Set(FOOLISH_GAME.entries.flatMap((e) => [e.english, ...(e.aliases ?? [])]));
    const missing = (FOOLISH_GAME.links ?? []).flatMap((l) => [l.from, l.to]).filter((n) => !names.has(n));
    expect(missing).toEqual([]);
  });
});
