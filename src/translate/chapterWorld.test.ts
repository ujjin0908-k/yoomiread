import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { GlossaryEntry, TranslateSettings } from '../types';
import { chapterMessages, estimateTokens, NEW_TERMS, splitReply, SUMMARY, TITLE, WORLD } from './prompt';
import { chapterWorld, translateChapter, worldNotesOn } from './run';

const stream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`));
      c.close();
    },
  });

const person = (id: string, original: string, english: string, status: GlossaryEntry['status'] = 'ok'): GlossaryEntry => ({
  id,
  bookId: 'b',
  original,
  english,
  kind: 'person',
  status,
  locked: false,
  createdAt: 1,
  updatedAt: 1,
});

describe('the Living Book while translating: the prompt and the reply', () => {
  const base = { bookTitle: 'B', chapterTitle: '第一章', text: '梅走了。', glossary: [] };

  it('asks for links and events only when it is on', () => {
    expect(chapterMessages({ ...base, world: true })[0].content).toContain(WORLD);
    expect(chapterMessages(base)[0].content).not.toContain(WORLD);
    expect(worldNotesOn({})).toBe(true);
    expect(worldNotesOn({ worldNotes: false })).toBe(false);
  });

  it('the price shown first counts the few extra lines', () => {
    const off = estimateTokens('梅走了。');
    const on = estimateTokens('梅走了。', 0, true);
    expect(on.input).toBeGreaterThan(off.input);
    expect(on.output - off.output).toBe(150);
  });

  it('splits the world lines from the new names, and leaves the translation alone', () => {
    const reply = [
      'Mei walked on.',
      TITLE,
      'The River',
      SUMMARY,
      'Mei left home.',
      NEW_TERMS,
      '{"original": "船夫", "english": "the Ferryman", "kind": "person", "gender": "he"}',
      WORLD,
      '{"link": "Mei", "to": "the Ferryman", "label": "owes a debt to"}',
    ].join('\n');
    const r = splitReply(reply);
    expect(r.text).toBe('Mei walked on.');
    expect(r.terms.map((t) => t.english)).toEqual(['the Ferryman']);
    expect(r.world).toContain('owes a debt to');
    expect(splitReply(`Mei walked on.\n${NEW_TERMS}\n`).world).toBeUndefined();
  });

  it('gives every line the chapter it was translated from, whatever the model says, and keeps the list short', () => {
    const raw = [
      '{"link": "Mei", "to": "Lan", "label": "sister of", "ch": 99}',
      '{"link": "Mei", "to": "Lan", "label": "this label is far too long to be a label", "ch": 1}',
      '{"event": "Mei left the village", "who": ["Mei"], "where": "Willow Village"}',
      '{"event": "Lan burned the letter", "who": ["Lan"]}',
      '{"event": "A third event", "who": ["Lan"]}',
      '{"new": "Lan", "english": "Lan", "kind": "person"}',
      '{"about": "Willow Village", "facts": [{"text": "x", "ch": 7}]}',
      'not json',
      ...['A', 'B', 'C', 'D'].map((n) => `{"link": "Mei", "to": "${n}", "label": "knows"}`),
    ].join('\n');
    const w = chapterWorld(raw, 7);
    expect(w.links.every((l) => l.chapter === 7)).toBe(true);
    expect(w.links[0]).toEqual({ from: 'Mei', to: 'Lan', label: 'sister of', chapter: 7 });
    expect(w.links).toHaveLength(4);
    expect(w.events.map((e) => e.title)).toEqual(['Mei left the village', 'Lan burned the letter']);
    expect(w.events.every((e) => e.chapter === 7)).toBe(true);
    expect(chapterWorld(undefined, 7)).toEqual({ links: [], events: [] });
  });
});

describe('the Living Book while translating: a real run', () => {
  const realFetch = globalThis.fetch;
  const settings: TranslateSettings = { baseUrl: 'https://example.test/v1', apiKey: 'k', models: [], defaultModel: 'm' };
  let sent: string[] = [];

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.books.add({ id: 'b', title: 'B', createdAt: 1, updatedAt: 1 } as never);
    await db.chapters.add({ id: 'c5', bookId: 'b', number: 5, title: '第五章', read: false, createdAt: 1 });
    await db.texts.add({ chapterId: 'c5', bookId: 'b', text: '梅和兰走了。船夫等着。' });
    await db.glossary.bulkAdd([person('mei', '梅', 'Mei'), person('lan', '兰', 'Lan')]);
    sent = [];
    const reply = [
      'Mei and Lan left. The ferryman waited.',
      TITLE,
      'Leaving',
      SUMMARY,
      'Mei and Lan left home.',
      NEW_TERMS,
      '{"original": "船夫", "english": "the Ferryman", "kind": "person", "gender": "he"}',
      WORLD,
      '{"link": "Mei", "to": "Lan", "label": "sister of"}',
      '{"link": "the Ferryman", "to": "Mei", "label": "guards"}',
      '{"link": "Mei", "to": "Nobody Known", "label": "loves"}',
      '{"event": "Mei and Lan left home", "who": ["Mei", "Lan"]}',
    ].join('\n');
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent.push(String(init?.body ?? ''));
      return new Response(stream(reply), { status: 200 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('saves the links and events with the chapter number, in the same request as the translation', async () => {
    const run = await translateChapter((await db.chapters.get('c5'))!, { settings, model: 'm' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(WORLD);
    expect(run.translation.text).toBe('Mei and Lan left. The ferryman waited.');
    const links = await db.worldLinks.toArray();
    // The new name was just added for review, so its link is kept too (it shows once the name is approved).
    // A name the glossary does not have is dropped.
    expect(links.map((l) => [l.label, l.chapter]).sort()).toEqual([
      ['guards', 5],
      ['sister of', 5],
    ]);
    const events = await db.worldEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Mei and Lan left home', chapter: 5, who: ['mei', 'lan'] });
    expect((await db.glossary.toArray()).find((g) => g.english === 'the Ferryman')?.status).toBe('review');
  });

  it('a second run of the same chapter does not add the same links again', async () => {
    const c = (await db.chapters.get('c5'))!;
    await translateChapter(c, { settings, model: 'm' });
    await translateChapter(c, { settings, model: 'm' });
    expect(await db.worldLinks.count()).toBe(2);
    expect(await db.worldEvents.count()).toBe(1);
  });

  it('turned off in Settings, nothing is asked for and nothing is added', async () => {
    await translateChapter((await db.chapters.get('c5'))!, { settings: { ...settings, worldNotes: false }, model: 'm' });
    expect(sent[0]).not.toContain(WORLD);
    // Even if a model writes the lines anyway, they are only kept when asked for.
    expect(await db.worldLinks.count()).toBe(0);
  });

  it('a Compare run saves nothing until it is kept', async () => {
    const run = await translateChapter((await db.chapters.get('c5'))!, { settings, model: 'm', save: false });
    expect(await db.worldLinks.count()).toBe(0);
    const { keepTranslation } = await import('./run');
    await keepTranslation(run);
    expect(await db.worldLinks.count()).toBe(2);
  });
});
