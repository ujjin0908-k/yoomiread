import { db } from '../db';
import { needsTranslation } from '../logic';
import { chat } from '../translate/api';
import type { ChatMessage } from '../translate/prompt';
import { addSpend, callCost, loadSettings, modelFor } from '../translate/run';
import type { Chapter, Note, WorldEvent } from '../types';
import type { WorldData } from './load';
import { nameFinder } from './seen';
import type { WorldAt, WorldEntry } from './visible';

/**
 * "Previously on…": where the story stands at my reading line, for coming back to a book after days away.
 *
 * The free part is put together on the phone from what is already saved: the chapter I stopped in, the story-so-far
 * summary a translation leaves behind, the latest events, who was on the page in the last chapters, new faces and my
 * last marks. The cat's own telling is asked for only on a button press, uses nothing past the reading line, and is
 * kept (settings key `recap:<bookId>:<line>:<length>`), so each reading line is paid for once.
 */
export interface FreeRecap {
  line: number;
  chapter?: Chapter;
  /** Whole days since I last read this book. */
  daysAway?: number;
  /** The saved story-so-far summary of the latest translated chapter at or before the line, with its chapter. */
  soFar?: { text: string; chapter: number };
  events: WorldEvent[];
  /** Who and what was named in the last chapters before the line. */
  onPage: WorldEntry[];
  newFaces: WorldEntry[];
  marks: (Note & { chapter: number })[];
}

const LAST = 3;

/** The reading text of the last chapters at or before the line: the translation when the book needs one. */
async function lastChapters(data: WorldData, line: number): Promise<{ chapter: Chapter; text: string }[]> {
  const chapters = data.chapters.filter((c) => c.number <= line).slice(-LAST);
  const out = [];
  for (const chapter of chapters) {
    const original = (await db.texts.get(chapter.id))?.text;
    const translated = needsTranslation(data.book, original) ? (await db.translations.get(chapter.id))?.text : undefined;
    out.push({ chapter, text: translated ?? original ?? '' });
  }
  return out;
}

export async function freeRecap(data: WorldData, world: WorldAt, now = Date.now()): Promise<FreeRecap> {
  const line = world.line;
  const chapter = [...data.chapters].reverse().find((c) => c.number <= line);
  const numberOf = new Map(data.chapters.map((c) => [c.id, c.number]));
  let soFar: FreeRecap['soFar'];
  await db.translations.where('bookId').equals(data.book.id).each((t) => {
    const n = numberOf.get(t.chapterId);
    if (t.summary && n !== undefined && n <= line && (!soFar || n > soFar.chapter)) soFar = { text: t.summary, chapter: n };
  });
  const find = nameFinder(world.entries);
  const named = new Set<string>();
  for (const { text } of await lastChapters(data, line)) for (const id of find(text)) named.add(id);
  const weight = (e: WorldEntry) => (e.role === 'main' ? 0 : e.kind === 'person' ? 1 : e.kind === 'place' ? 2 : e.kind === 'god' ? 3 : 4);
  return {
    line,
    chapter,
    daysAway: data.book.lastReadAt ? Math.floor((now - data.book.lastReadAt) / 86_400_000) : undefined,
    soFar,
    events: world.events.filter((e) => e.chapter !== undefined).slice(-4).reverse(),
    onPage: world.entries.filter((e) => named.has(e.id) && e.kind !== 'term').sort((a, b) => weight(a) - weight(b) || a.english.localeCompare(b.english)).slice(0, 14),
    newFaces: world.entries
      .filter((e) => e.kind !== 'term' && e.firstChapter !== undefined && e.firstChapter > line - 15)
      .sort((a, b) => b.firstChapter! - a.firstChapter!)
      .slice(0, 8),
    marks: world.notes.slice(-2).reverse(),
  };
}

export interface CatRecap {
  text: string;
  cost?: number;
  estimated?: boolean;
}

const keyOf = (bookId: string, line: number, long: boolean) => `recap:${bookId}:${line}:${long ? 'long' : 'short'}`;

export async function savedCatRecap(bookId: string, line: number, long: boolean): Promise<CatRecap | undefined> {
  return (await db.settings.get(keyOf(bookId, line, long)))?.value as CatRecap | undefined;
}

/** What is sent for the cat's recap. Only names already met, and only text at or before the line. */
export function recapMessages(input: { title: string; names: string[]; soFar?: string; chapters: { number: number; title: string; text: string }[]; long: boolean }): ChatMessage[] {
  const words = input.long ? 350 : 150;
  return [
    {
      role: 'system',
      content:
        'You are a friendly cat in a wizard hat who reads this novel alongside the reader. The reader is coming back after some days away. ' +
        `Write a "Previously on…" recap of where the story stands, in about ${words} words, in the present tense, as plain paragraphs with no headings or lists. ` +
        'Say who matters right now, where they are, what is at stake, and end with exactly what was happening when the reader stopped. ' +
        'Use only the material given. Never reveal, hint at or guess anything that comes after it.',
    },
    {
      role: 'user',
      content:
        `Book: ${input.title}\n` +
        (input.names.length ? `Names met so far: ${input.names.join(', ')}\n` : '') +
        (input.soFar ? `\nThe story so far (earlier chapters):\n${input.soFar}\n` : '') +
        `\nThe last chapters read:\n` +
        input.chapters.map((c) => `Chapter ${c.number}: ${c.title}\n${c.text}`).join('\n\n'),
    },
  ];
}

/** Asks for the cat's recap (costs a little), keeps it, and adds the cost to the book's spend. */
export async function askCatRecap(data: WorldData, world: WorldAt, long: boolean): Promise<CatRecap> {
  const saved = await savedCatRecap(data.book.id, world.line, long);
  if (saved) return saved;
  const settings = await loadSettings();
  const model = modelFor(settings, data.book.model);
  const free = await freeRecap(data, world);
  const chapters = (await lastChapters(data, world.line)).map(({ chapter, text }) => ({ number: chapter.number, title: chapter.title, text: text.slice(-(long ? 9000 : 6000)) }));
  if (!chapters.some((c) => c.text.trim())) throw new Error('There is no chapter text to recap yet.');
  const names = world.entries.filter((e) => e.kind !== 'term').map((e) => e.english).slice(0, 120);
  const messages = recapMessages({ title: data.book.title, names, soFar: free.soFar?.text, chapters, long });
  const result = await chat(settings, model.id, messages);
  const spend = callCost(model, messages, result);
  await addSpend(data.book.id, spend.cost, spend.estimated);
  const recap: CatRecap = { text: result.text.trim(), cost: spend.cost, estimated: spend.estimated };
  await db.settings.put({ key: keyOf(data.book.id, world.line, long), value: recap });
  return recap;
}
