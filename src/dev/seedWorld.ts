import { db } from '../db';
import { applyGuide } from '../guides';
import { FOOLISH_GAME } from '../guides/foolish-game';
import type { Book, Chapter, Note, WorldEvent, WorldLink } from '../types';

/**
 * Development only: a full-size test book for designing the Living Book without the owner's data. Opened with
 * `?seed=world` on the dev server (see main.tsx); never part of a production build.
 *
 * 300 chapters of made-up filler text that names the Foolish Game guide's people, places, gods and groups, each first
 * named in a set chapter, so the world grows as the reading line moves. Read up to chapter 120. Plus dated test links,
 * events and highlights. None of the story text, events or dated links are from the novel: they are labelled "(test)".
 */

const SEED_BOOK = 'seed-world';
const CHAPTERS = 300;
const READ_UP_TO = 120;

/** A small fixed random source, so every seed run gives the same book. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

export async function seedWorld(): Promise<string> {
  await db.deleteBook(SEED_BOOK);
  const now = Date.now();
  const rand = rng(17);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

  // When each name first appears: main people and the paths early, heralds and late groups later.
  const order = [...FOOLISH_GAME.entries].sort((a, b) => weight(a) - weight(b) || rand() - 0.5);
  const intro = new Map<string, number>();
  order.forEach((e, i) => intro.set(e.english, Math.max(1, Math.round(((i + 1) / order.length) * 280 * (0.35 + 0.65 * rand())))));
  intro.set('Cheng Shi', 1);
  intro.set('Deceit', 1);
  intro.set('Faith Game world', 1);

  // The way the translation writes each kind: gods in brackets.
  const say = (english: string) => (FOOLISH_GAME.entries.find((e) => e.english === english)?.kind === 'god' ? `[${english}]` : english);
  const verbs = ['looked at', 'thought about', 'remembered', 'lied to', 'followed', 'argued with', 'laughed at', 'stood beside'];

  const book: Book = {
    id: SEED_BOOK,
    title: 'Foolish Game of the Gods',
    originalTitle: '诸神愚戏',
    author: '一月九十秋',
    language: 'en',
    shelf: 'reading',
    source: 'paste',
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
    lastChapterId: `${SEED_BOOK}-c${READ_UP_TO + 1}`,
  };
  await db.books.add(book);

  const items: { chapter: Chapter; text: string }[] = [];
  for (let n = 1; n <= CHAPTERS; n++) {
    const met = order.filter((e) => intro.get(e.english)! <= n);
    const fresh = order.filter((e) => intro.get(e.english) === n);
    const paragraphs = [
      ...fresh.map((e) => `For the first time, the story named ${say(e.english)}. (test)`),
      ...Array.from({ length: 8 }, () => {
        const a = pick(met.filter((e) => e.kind === 'person').concat(met.slice(0, 1)));
        const b = pick(met);
        return `${a.english} ${pick(verbs)} ${say(b.english)}, and nothing else happened in this test paragraph.`;
      }),
    ];
    items.push({
      chapter: { id: `${SEED_BOOK}-c${n}`, bookId: SEED_BOOK, number: n, title: `Test chapter ${n}`, read: n <= READ_UP_TO, createdAt: now },
      text: paragraphs.join('\n\n'),
    });
  }
  await db.addChapters(items);

  await applyGuide(SEED_BOOK, FOOLISH_GAME, now);
  const entries = await db.glossary.where('bookId').equals(SEED_BOOK).toArray();
  const people = entries.filter((g) => g.kind === 'person');
  const places = entries.filter((g) => g.kind === 'place');

  // Dated test links between people, some changing over time, to exercise the web's history and slider.
  const labels = ['ally of', 'rival of', 'teammate of', 'owes a debt to', 'suspicious of', 'enemy of'];
  const links: WorldLink[] = [];
  for (let i = 0; i < 90; i++) {
    const a = pick(people);
    const b = pick(people);
    if (a.id === b.id) continue;
    const from = Math.max(intro.get(a.english) ?? 1, intro.get(b.english) ?? 1);
    const chapter = Math.min(CHAPTERS, from + Math.floor(rand() * 40));
    links.push({ id: `${SEED_BOOK}-l${i}`, bookId: SEED_BOOK, from: a.id, to: b.id, label: `${pick(labels)} (test)`, chapter, createdAt: now });
    if (rand() < 0.3) links.push({ id: `${SEED_BOOK}-l${i}b`, bookId: SEED_BOOK, from: a.id, to: b.id, label: `${pick(labels)} (test)`, chapter: Math.min(CHAPTERS, chapter + 30), createdAt: now });
  }
  await db.worldLinks.bulkAdd(links);

  // Test events, about three per ten chapters, grouped into test arcs of fifty chapters.
  const events: WorldEvent[] = [];
  for (let n = 2; n <= CHAPTERS; n += 3 + Math.floor(rand() * 4)) {
    const met = people.filter((g) => (intro.get(g.english) ?? 999) <= n);
    const where = places.filter((g) => (intro.get(g.english) ?? 999) <= n);
    const who = [pick(met), pick(met)].filter((g, i, all) => g && all.indexOf(g) === i);
    events.push({
      id: `${SEED_BOOK}-e${n}`,
      bookId: SEED_BOOK,
      chapter: n,
      title: `${who.map((g) => g.english).join(' and ')} face a trial (test)`,
      who: who.map((g) => g.id),
      where: where.length ? pick(where).id : undefined,
      arc: `Test arc ${Math.ceil(n / 50)}`,
      createdAt: now,
    });
  }
  await db.worldEvents.bulkAdd(events);

  // A few highlights and chapter comments on read chapters.
  const notes: Note[] = [5, 18, 33, 47, 60, 88, 101, 119, 150].map((n, i) => ({
    id: `${SEED_BOOK}-n${i}`,
    bookId: SEED_BOOK,
    chapterId: `${SEED_BOOK}-c${n}`,
    kind: i % 2 ? 'chapter' : 'highlight',
    quote: i % 2 ? undefined : 'Cheng Shi never lies. (test)',
    start: i % 2 ? undefined : 0,
    end: i % 2 ? undefined : 10,
    body: `A test note on chapter ${n}`,
    createdAt: now + i,
    updatedAt: now + i,
  }));
  await db.notes.bulkAdd(notes);
  return SEED_BOOK;
}

/** Earlier is lighter: main people and the six paths first, heralds and late groups last. */
function weight(e: (typeof FOOLISH_GAME.entries)[number]): number {
  if (e.role === 'main') return 0;
  if (e.kind === 'term' && e.english.startsWith('Path of')) return 1;
  if (e.kind === 'god' && /path/i.test(e.note ?? '')) return 1; // the sixteen true gods
  if (e.kind === 'person') return 2;
  if (e.kind === 'place' || e.kind === 'term') return 3;
  if (e.kind === 'group') return 4;
  return 5;
}
