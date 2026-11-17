import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { addWorldLinks, parseWorldReply, worldMessages } from '../translate/profiles';
import type { Book, Chapter, GlossaryEntry, Note, WorldEvent, WorldLink } from '../types';
import { buildWeb, layoutWeb, toneOf } from './graph';
import { loadWorldData, worldOf } from './load';
import { buildMap } from './map';
import { freeRecap, recapMessages } from './recap';
import { buildTimeline } from './timeline';
import { worldAt } from './visible';

const entry = (id: string, english: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry => ({ id, bookId: 'b', original: english, english, kind: 'person', status: 'ok', locked: false, createdAt: 1, updatedAt: 1, ...extra });
const chapter = (n: number, extra: Partial<Chapter> = {}): Chapter => ({ id: `c${n}`, bookId: 'b', number: n, title: `Ch ${n}`, read: false, createdAt: 1, ...extra });
const link = (from: string, to: string, label: string, ch?: number): WorldLink => ({ id: `${from}${to}${label}`, bookId: 'b', from, to, label, chapter: ch, createdAt: 1 });
const event = (id: string, title: string, ch: number, extra: Partial<WorldEvent> = {}): WorldEvent => ({ id, bookId: 'b', title, chapter: ch, createdAt: 1, ...extra });

function sample(line: number) {
  const entries = [
    entry('hero', 'Hero', { role: 'main' }),
    entry('mentor', 'Mentor'),
    entry('rival', 'Rival'),
    entry('loner', 'Loner'),
    entry('late', 'Latecomer'),
    entry('sun', 'Sun', { kind: 'god' }),
    entry('guild', 'Guild', { kind: 'group' }),
    entry('realm', 'Realm', { kind: 'place' }),
    entry('city', 'City', { kind: 'place', within: 'realm' }),
    entry('isle', 'Isle', { kind: 'place' }),
    entry('far', 'Far Shore', { kind: 'place' }),
    entry('sword', 'Sword', { kind: 'term' }),
  ];
  const firstSeen = new Map([['hero', 1], ['mentor', 2], ['rival', 5], ['loner', 6], ['late', 50], ['sun', 3], ['guild', 4], ['realm', 1], ['city', 2], ['isle', 9], ['far', 60], ['sword', 2]]);
  const links = [link('mentor', 'hero', 'teacher of', 2), link('hero', 'sun', 'follows', 3), link('rival', 'hero', 'enemy of', 5), link('hero', 'guild', 'member of', 4), link('late', 'hero', 'ally of', 50)];
  const events = [event('e1', 'Hero leaves home', 1, { who: ['hero'], where: 'realm', arc: 'Leaving' }), event('e2', 'The duel', 5, { who: ['hero', 'rival'], where: 'city', arc: 'The City' }), event('e3', 'Later', 55, { arc: 'Far away' })];
  const notes: Note[] = [{ id: 'n1', bookId: 'b', chapterId: 'c3', kind: 'highlight', quote: 'A line', body: '', createdAt: 1, updatedAt: 1 }];
  const chapters = Array.from({ length: 80 }, (_, i) => chapter(i + 1));
  return worldAt({ entries, links, events, notes, chapters, firstSeen }, { line, spoilers: false });
}

describe('the people web', () => {
  it('sorts links into bonds, faith and conflict by their words', () => {
    expect(toneOf('enemy of')).toBe('conflict');
    expect(toneOf('betrayed')).toBe('conflict');
    expect(toneOf('elder twin sister of')).toBe('bond');
    expect(toneOf('childhood friend of')).toBe('bond');
    expect(toneOf('follows')).toBe('faith');
    expect(toneOf('herald of')).toBe('faith');
    expect(toneOf('looked at')).toBe('other');
  });

  it('holds every person, and others only when linked', () => {
    const web = buildWeb(sample(10));
    expect(web.nodes.map((n) => n.id).sort()).toEqual(['guild', 'hero', 'loner', 'mentor', 'rival', 'sun']);
    expect(web.edges).toHaveLength(4);
    expect([...web.around.get('hero')!].sort()).toEqual(['guild', 'mentor', 'rival', 'sun']);
    const hero = web.byId.get('hero')!;
    expect(hero.r).toBeGreaterThan(web.byId.get('loner')!.r);
  });

  it('lays out the same world the same way, with no two faces on top of each other', () => {
    const a = buildWeb(sample(60));
    const b = buildWeb(sample(60));
    layoutWeb(a);
    layoutWeb(b);
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]));
    for (const p of a.nodes) for (const q of a.nodes) if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(p.r + q.r);
    expect(a.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
  });

  it('stays quick and tidy with two hundred names', () => {
    const entries = Array.from({ length: 200 }, (_, i) => entry(`p${i}`, `Person ${i}`));
    const links = Array.from({ length: 320 }, (_, i) => link(`p${(i * 7) % 200}`, `p${(i * 13 + 5) % 200}`, 'ally of', 1)).filter((l) => l.from !== l.to);
    const world = worldAt({ entries, links, events: [], notes: [], chapters: [chapter(1)], firstSeen: new Map(entries.map((e) => [e.id, 1])) }, { line: 1, spoilers: false });
    const web = buildWeb(world);
    const start = performance.now();
    layoutWeb(web);
    expect(performance.now() - start).toBeLessThan(3000);
    expect(web.nodes).toHaveLength(200);
  });
});

describe('the map', () => {
  it('draws only places reached, nests a place on its island, and routes by first visit', () => {
    const map = buildMap(sample(10));
    expect(map.places.map((p) => p.id).sort()).toEqual(['city', 'isle', 'realm']);
    expect(map.byId.get('city')!.on).toBe('realm');
    expect(map.byId.get('realm')!.shore!.length).toBeGreaterThan(10);
    expect(map.route).toEqual(['realm', 'city', 'isle']);
    const realm = map.byId.get('realm')!;
    const city = map.byId.get('city')!;
    expect(Math.hypot(city.x - realm.x, city.y - realm.y)).toBeLessThan(realm.r);
  });

  it('keeps islands apart', () => {
    const map = buildMap(sample(70));
    const islands = map.places.filter((p) => !p.on);
    expect(islands).toHaveLength(3);
    for (const a of islands) for (const b of islands) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
  });
});

describe('the timeline', () => {
  it('gathers events, first appearances and my notes by chapter, under their arcs', () => {
    const sections = buildTimeline(sample(10));
    expect(sections.map((s) => s.title)).toEqual(['Leaving', 'The City']);
    const first = sections[0].rows;
    expect(first[0]).toMatchObject({ kind: 'arrivals', chapter: 1 });
    expect(first.some((r) => r.kind === 'note' && r.chapter === 3)).toBe(true);
    // Terms are left out of first appearances; nothing past the line is there.
    const names = sections.flatMap((s) => s.rows).flatMap((r) => (r.kind === 'arrivals' ? r.entries.map((e) => e.english) : []));
    expect(names).not.toContain('Sword');
    expect(names).not.toContain('Latecomer');
    expect(sections.flatMap((s) => s.rows).every((r) => r.chapter <= 10)).toBe(true);
  });

  it('falls back to runs of chapters when the book has no arcs', () => {
    const world = sample(10);
    const sections = buildTimeline({ ...world, events: world.events.map((e) => ({ ...e, arc: undefined })) });
    expect(sections.map((s) => s.title)).toEqual(['Chapters 1–25']);
  });
});

describe('the story scan: links and events', () => {
  const chunk = [{ chapter: 3, text: 'x' }, { chapter: 4, text: 'y' }];

  it('keeps only items that name a chapter that was sent, short labels, two events a chapter', () => {
    const reply = [
      '{"link": "Mentor", "to": "Hero", "label": "teacher of", "ch": 3}',
      '{"link": "Mentor", "to": "Hero", "label": "teacher of", "ch": 9}',
      '{"link": "Rival", "to": "Hero", "label": "has always secretly wanted to destroy everything about", "ch": 3}',
      '{"event": "The duel at dawn", "who": ["Hero", "Rival"], "where": "City", "ch": 4}',
      '{"event": "A second thing", "ch": 4}',
      '{"event": "A third thing", "ch": 4}',
      '{"event": "From a chapter not sent", "ch": 40}',
    ].join('\n');
    const { links, events } = parseWorldReply(reply, chunk);
    expect(links).toEqual([{ from: 'Mentor', to: 'Hero', label: 'teacher of', chapter: 3 }]);
    expect(events.map((e) => e.title)).toEqual(['The duel at dawn', 'A second thing']);
    expect(events[0]).toMatchObject({ who: ['Hero', 'Rival'], where: 'City', chapter: 4 });
  });

  it('asks for links and events, and only those in a links-only read', () => {
    const book = { id: 'b', title: 'T' } as Book;
    const full = worldMessages({ book, chunk, known: [] })[0].content;
    const only = worldMessages({ book, chunk, known: [], linksOnly: true, knownLinks: ['Hero follows Sun'] });
    expect(full).toContain('"link"');
    expect(full).toContain('"new"');
    expect(only[0].content).toContain('"event"');
    expect(only[0].content).not.toContain('"new"');
    expect(only[1].content).toContain('Hero follows Sun');
  });

  describe('saving', () => {
    beforeEach(async () => {
      await Promise.all([db.worldLinks.clear(), db.worldEvents.clear()]);
    });

    it('drops names the glossary does not hold, and never adds the same link or event twice', async () => {
      const all = [entry('hero', 'Hero', { aliases: ['the Boy'] }), entry('mentor', 'Mentor'), entry('city', 'City', { kind: 'place' })];
      const found = {
        links: [
          { from: 'Mentor', to: 'the Boy', label: 'teacher of', chapter: 3 },
          { from: 'Mentor', to: 'Nobody', label: 'enemy of', chapter: 3 },
          { from: 'Hero', to: 'Hero', label: 'ally of', chapter: 3 },
        ],
        events: [{ title: 'The duel', who: ['Hero', 'Ghost'], where: 'Hero', chapter: 4 }],
      };
      expect(await addWorldLinks('b', found, all)).toEqual({ links: 1, events: 1 });
      expect(await addWorldLinks('b', found, all)).toEqual({ links: 0, events: 0 });
      const saved = await db.worldLinks.toArray();
      expect(saved.map((l) => [l.from, l.to, l.label, l.chapter])).toEqual([['mentor', 'hero', 'teacher of', 3]]);
      // "where" must be a place: a person's name there is dropped.
      expect((await db.worldEvents.toArray())[0]).toMatchObject({ who: ['hero'], where: undefined, chapter: 4 });
    });
  });
});

describe('previously on', () => {
  beforeEach(async () => {
    await Promise.all([db.books, db.chapters, db.texts, db.glossary, db.worldLinks, db.worldEvents, db.notes, db.settings, db.translations].map((t) => t.clear()));
    await db.books.add({ id: 'b', title: 'Test', author: '', language: 'en', shelf: 'reading', createdAt: 1, updatedAt: 1, lastChapterId: 'c3', lastReadAt: Date.now() - 5 * 86_400_000 });
    await db.addChapters([
      { chapter: chapter(1, { read: true }), text: 'Hero left the Realm.' },
      { chapter: chapter(2, { read: true }), text: 'Hero met Mentor.' },
      { chapter: chapter(3), text: 'Mentor spoke of the City.' },
      { chapter: chapter(4), text: 'Then the Villain came to the Far Shore.' },
    ]);
    await db.glossary.bulkAdd([entry('hero', 'Hero', { role: 'main' }), entry('mentor', 'Mentor'), entry('villain', 'Villain'), entry('city', 'City', { kind: 'place' }), entry('far', 'Far Shore', { kind: 'place' })]);
    await db.worldEvents.bulkAdd([event('e1', 'Hero leaves', 1), event('e2', 'The Villain strikes', 4)]);
    await db.translations.bulkAdd([
      { chapterId: 'c2', bookId: 'b', text: 't', model: 'm', summary: 'So far: Hero left home.', createdAt: 1 },
      { chapterId: 'c4', bookId: 'b', text: 't', model: 'm', summary: 'So far: the Villain has come.', createdAt: 1 },
    ]);
  });

  it('is built only from chapters up to the reading line', async () => {
    const data = (await loadWorldData('b'))!;
    const recap = await freeRecap(data, worldOf(data));
    expect(recap.line).toBe(3);
    expect(recap.chapter?.number).toBe(3);
    expect(recap.daysAway).toBe(5);
    expect(recap.soFar).toEqual({ text: 'So far: Hero left home.', chapter: 2 });
    expect(recap.events.map((e) => e.title)).toEqual(['Hero leaves']);
    expect(recap.onPage.map((e) => e.english)).toEqual(['Hero', 'Mentor', 'City']);
    expect(JSON.stringify(recap)).not.toContain('Villain');
  });

  it('the cat is sent only what it is given, and told never to look ahead', () => {
    const messages = recapMessages({ title: 'Test', names: ['Hero', 'Mentor'], chapters: [{ number: 3, title: 'Three', text: 'Mentor spoke.' }], long: false });
    expect(messages[0].content).toContain('Never reveal');
    expect(messages[0].content).toContain('150 words');
    expect(messages[1].content).toContain('Chapter 3: Three');
    expect(messages[1].content).not.toContain('Villain');
  });
});
