import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { guideFor } from './guides';
import { OZ } from './guides/oz';
import { addSampleBook, SAMPLE_TITLE } from './sample';
import { loadWorld } from './world/load';
import type { Book } from './types';

describe('the Oz guide', () => {
  const names = new Set(OZ.entries.flatMap((e) => [e.english, ...(e.aliases ?? [])]));

  it('names only people, places and groups it lists, in links and events', () => {
    for (const l of OZ.links ?? []) {
      expect(names.has(l.from), l.from).toBe(true);
      expect(names.has(l.to), l.to).toBe(true);
    }
    for (const e of OZ.events ?? []) {
      for (const who of e.who ?? []) expect(names.has(who), who).toBe(true);
      if (e.where) expect(names.has(e.where), e.where).toBe(true);
    }
  });

  it('dates every event and every link that is not a plain setup fact, within the book’s 24 chapters', () => {
    for (const e of OZ.events ?? []) {
      expect(e.chapter).toBeGreaterThanOrEqual(1);
      expect(e.chapter).toBeLessThanOrEqual(24);
    }
    for (const l of OZ.links ?? []) if (!l.safe) expect(l.chapter, `${l.from} ${l.label} ${l.to}`).toBeGreaterThanOrEqual(1);
  });

  it('is found for the sample book in every edition', () => {
    expect(guideFor({ title: SAMPLE_TITLE } as Book)).toBeDefined();
  });
});

describe('the sample book', () => {
  beforeEach(() => {
    const bytes = readFileSync('public/samples/oz.json.gz');
    vi.stubGlobal('fetch', async () => new Response(bytes));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('adds the whole book with its world, once', async () => {
    const id = await addSampleBook(1000);
    const book = (await db.books.get(id))!;
    expect(book).toMatchObject({ title: SAMPLE_TITLE, author: 'L. Frank Baum', genre: 'fantasy', language: 'en', shelf: 'reading', artStyle: OZ.style });
    const chapters = await db.chapters.where('bookId').equals(id).sortBy('number');
    expect(chapters).toHaveLength(24);
    expect(chapters[0].title).toBe('1. The Cyclone');
    expect((await db.texts.get(chapters[0].id))!.text).toMatch(/^Dorothy lived in the midst of the great Kansas prairies/);
    expect(await db.glossary.where('bookId').equals(id).count()).toBe(OZ.entries.length);
    expect(await db.worldEvents.where('bookId').equals(id).count()).toBe(OZ.events!.length);
    // A second tap opens the same book.
    expect(await addSampleBook(2000)).toBe(id);
    expect(await db.books.count()).toBe(1);
  });

  it('shows no spoilers: at chapter 3 the Lion and the Wizard’s secret are not there yet', async () => {
    const id = await addSampleBook(1000);
    const chapters = await db.chapters.where('bookId').equals(id).sortBy('number');
    await db.chapters.update(chapters[2].id, { read: true });
    await db.books.update(id, { lastChapterId: chapters[2].id });
    const world = (await loadWorld(id))!;
    const people = world.entries.map((e) => e.english);
    expect(people).toContain('Scarecrow');
    expect(people).not.toContain('Cowardly Lion');
    expect(world.events.some((e) => /humbug/.test(e.title))).toBe(false);
    expect(world.events.some((e) => /Wicked Witch of the East/.test(e.title))).toBe(true);
  });
});
