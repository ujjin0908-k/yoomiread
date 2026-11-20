import { db } from '../db';
import { applyGuide, guideFor, type Guide } from '../guides';
import { newId, paragraphs } from '../logic';
import type { Book, BookStyle, Chapter, GlossaryEntry, WorldEvent, WorldLink } from '../types';
import { loadFirstSeen } from './load';
import { readingLine } from './visible';

/**
 * "Copy the world": a second copy of a book (the Chinese original next to the English edition, say) takes over the
 * first one's cast, places, gods, groups, terms, links, events, pictures and translation style, so nothing has to be
 * built twice. The book it is copied from is only read, never changed.
 *
 * For a Chinese copy, names the English book only knows in English get their Chinese from the book's guide, so the
 * translator can find them in the Chinese text (it only sends glossary names that appear in a chapter).
 */

const HAN = /[㐀-鿿]/;
const squash = (s: string) => s.toLowerCase().replace(/[“”"'‘’「」『』【】[\]]/g, '').replace(/\s+/g, ' ').trim();
const plainTitle = (t: string) => squash(t).replace(/^the\s+/, '');

/** True when two books look like the same novel: a title or original title in common. */
export function sameNovel(a: Pick<Book, 'title' | 'originalTitle'>, b: Pick<Book, 'title' | 'originalTitle'>): boolean {
  const names = (x: Pick<Book, 'title' | 'originalTitle'>) => [x.title, x.originalTitle ?? ''].map(plainTitle).filter(Boolean);
  const mine = names(a);
  if (names(b).some((n) => mine.includes(n))) return true;
  // Two titles the same built-in guide knows ("The Fool of the Gods" and "诸神愚戏") are the same novel too.
  const guideA = guideFor(a as Book);
  return !!guideA && guideA === guideFor(b as Book);
}

/** Other books in the library that are the same novel and have a world to give (a glossary). */
export async function worldSources(book: Book): Promise<{ book: Book; names: number }[]> {
  const books = (await db.books.toArray()) as Book[];
  const out: { book: Book; names: number }[] = [];
  for (const b of books) {
    if (b.id === book.id) continue;
    const names = await db.glossary.where('bookId').equals(b.id).count();
    if (names) out.push({ book: b, names });
  }
  // The same novel first, then the biggest world.
  return out.sort((x, y) => Number(sameNovel(book, y.book)) - Number(sameNovel(book, x.book)) || y.names - x.names);
}

/**
 * A passage to use as the style sample: a run of whole paragraphs from about a third of the way in, starting at a line
 * of dialogue when there is one close by, of roughly `size` characters.
 */
export function passageFrom(text: string, size = 1200): string {
  const paras = paragraphs(text).map((p) => p.text.trim()).filter((p) => p.length > 1);
  if (!paras.length) return '';
  let start = Math.floor(paras.length / 3);
  for (let i = start; i < Math.min(paras.length, start + 12); i++) {
    if (/["“]/.test(paras[i])) {
      start = Math.max(0, i - 1);
      break;
    }
  }
  const out: string[] = [];
  let length = 0;
  for (let i = start; i < paras.length; i++) {
    if (out.length >= 2 && length + paras[i].length > size * 1.3) break;
    out.push(paras[i]);
    length += paras[i].length;
    if (length >= size) break;
  }
  return out.join('\n\n');
}

/**
 * The Chinese an entry should go by, from the guide: for an entry with no Chinese yet, the guide entry of the same kind
 * that shares a name with it. The English name it had as its original becomes another name. Chinese other names from
 * the guide (nicknames like 大猫) are added either way. Returns only the entries that change.
 */
export function chineseNames(entries: GlossaryEntry[], guide: Guide | undefined): Map<string, Pick<GlossaryEntry, 'original' | 'aliases'>> {
  const out = new Map<string, Pick<GlossaryEntry, 'original' | 'aliases'>>();
  if (!guide) return out;
  for (const g of entries) {
    const mine = [g.english, g.original, ...(g.aliases ?? [])].map(squash);
    const e = guide.entries.find((x) => x.kind === g.kind && [x.english, x.original, ...(x.aliases ?? [])].some((n) => mine.includes(squash(n))));
    if (!e) continue;
    const hasHan = HAN.test(g.original);
    // No Chinese yet: the guide's. The same word as the guide but without its 【】 (命运 for 【命运】): the guide's too.
    const original = !HAN.test(e.original) ? g.original : !hasHan || (g.original !== e.original && squash(g.original) === squash(e.original)) ? e.original : g.original;
    const extra = [...(original !== g.original && squash(g.original) !== squash(g.english) ? [g.original] : []), ...(e.aliases ?? []).filter((a) => HAN.test(a))];
    const have = new Set([original, g.english, ...(g.aliases ?? [])].map(squash));
    const add = [...new Set(extra)].filter((a) => !have.has(squash(a)));
    if (original === g.original && !add.length) continue;
    out.set(g.id, { original, aliases: add.length || g.aliases ? [...(g.aliases ?? []), ...add] : undefined });
  }
  return out;
}

/** Adds the rule that keeps 【】 names in square brackets, as the English edition writes them, unless notes say so already. */
export function withBracketRule(notes: string | undefined): string {
  const rule = 'Write names in 【】 with square brackets, as the English edition does: 【命运】 becomes [Fate], 【欺诈】 becomes [Deceit].';
  const now = (notes ?? '').trim();
  return now.includes('【】') ? now : [now, rule].filter(Boolean).join(' ');
}

export interface CopiedRows {
  entries: GlossaryEntry[];
  links: WorldLink[];
  events: WorldEvent[];
  /** Old id → id in the new book (an entry the new book already had keeps its own id). */
  ids: Map<string, string>;
  /** Entries the new book already had, matched by kind and name. */
  matched: number;
}

/** The rows to add to the new book. Entries it already has (same kind, a name in common) are not added twice. */
export function copyRows(
  from: { entries: GlossaryEntry[]; links: WorldLink[]; events: WorldEvent[] },
  toBookId: string,
  existing: GlossaryEntry[],
  now: number,
  makeId: () => string = newId,
): CopiedRows {
  const ids = new Map<string, string>();
  const entries: GlossaryEntry[] = [];
  let matched = 0;
  for (const g of from.entries) {
    const names = [g.english, g.original, ...(g.aliases ?? [])].map(squash);
    const there = existing.find((x) => x.kind === g.kind && [x.english, x.original, ...(x.aliases ?? [])].some((n) => names.includes(squash(n))));
    if (there) {
      ids.set(g.id, there.id);
      matched++;
      continue;
    }
    const id = makeId();
    ids.set(g.id, id);
    entries.push({ ...g, id, bookId: toBookId, createdAt: now, updatedAt: now });
  }
  for (const g of entries) g.within = g.within ? ids.get(g.within) : undefined;
  const links = from.links.flatMap((l) => {
    const a = ids.get(l.from);
    const b = ids.get(l.to);
    return a && b ? [{ ...l, id: makeId(), bookId: toBookId, from: a, to: b }] : [];
  });
  const events = from.events.map((e) => ({
    ...e,
    id: makeId(),
    bookId: toBookId,
    who: e.who?.map((w) => ids.get(w)).filter((w): w is string => !!w),
    where: e.where ? ids.get(e.where) : undefined,
  }));
  return { entries, links, events, ids, matched };
}

/** The newest "Ask the cat" recap saved for a book (the longer one first), to start a copy's story so far. */
export async function latestRecap(bookId: string): Promise<string | undefined> {
  const rows = await db.settings.where('key').startsWith(`recap:${bookId}:`).toArray();
  const parsed = rows
    .map((r) => {
      const [, , line, length] = r.key.split(':');
      return { line: Number(line), long: length === 'long', text: (r.value as { text?: string })?.text?.trim() };
    })
    .filter((r) => r.text && Number.isFinite(r.line))
    .sort((a, b) => b.line - a.line || Number(b.long) - Number(a.long));
  return parsed[0]?.text;
}

/** A suggested style sample: a passage from the furthest chapter read (or the last chapter) of the book copied from. */
export async function sampleFrom(bookId: string): Promise<{ chapter?: Chapter; text: string }> {
  const book = await db.books.get(bookId);
  const chapters = ((await db.chapters.where('bookId').equals(bookId).toArray()) as Chapter[]).sort((a, b) => b.number - a.number);
  if (!book || !chapters.length) return { text: '' };
  const line = readingLine(book, chapters);
  for (const c of [...chapters.filter((x) => x.number <= line), ...chapters]) {
    const text = (await db.texts.get(c.id))?.text ?? (await db.translations.get(c.id))?.text;
    const passage = text ? passageFrom(text) : '';
    if (passage.length > 300) return { chapter: c, text: passage };
  }
  return { text: '' };
}

export interface CopyOptions {
  /** The style sample for translations (a passage of the English edition). */
  sample?: string;
  /** The story before the new book's first chapter. */
  storySoFar?: string;
  /** Fill in Chinese names from the book's guide and add the guide's other names (on for a Chinese book). */
  chinese?: boolean;
}

export interface CopyResult {
  names: number;
  matched: number;
  links: number;
  events: number;
  /** Names that got their Chinese from the guide. */
  chinese: number;
  /** Names the guide added that the old book did not have. */
  fromGuide: number;
}

/** Copies the world of `fromId` into `toId`. The book copied from is not changed. */
export async function copyWorld(fromId: string, toId: string, options: CopyOptions = {}, now = Date.now()): Promise<CopyResult> {
  const [from, to] = await Promise.all([db.books.get(fromId), db.books.get(toId)]);
  if (!from || !to) throw new Error('One of the books is missing.');
  const [entries, links, events, existing, fromChapters] = await Promise.all([
    db.glossary.where('bookId').equals(fromId).toArray() as Promise<GlossaryEntry[]>,
    db.worldLinks.where('bookId').equals(fromId).toArray() as Promise<WorldLink[]>,
    db.worldEvents.where('bookId').equals(fromId).toArray() as Promise<WorldEvent[]>,
    db.glossary.where('bookId').equals(toId).toArray() as Promise<GlossaryEntry[]>,
    db.chapters.where('bookId').equals(fromId).toArray() as Promise<Chapter[]>,
  ]);

  const load = guideFor(to) ?? guideFor(from);
  const guide = options.chinese && load ? await load() : undefined;
  const names = chineseNames(entries, guide);
  const ready = entries.map((g) => (names.has(g.id) ? { ...g, ...names.get(g.id) } : g));
  const rows = copyRows({ entries: ready, links, events }, toId, existing, now);
  const chinese = rows.entries.filter((g) => HAN.test(g.original) && !HAN.test(entries.find((e) => rows.ids.get(e.id) === g.id)?.original ?? '')).length;

  // Who was met before the new book's first chapter, as the old book saw it.
  const seen = await loadFirstSeen(fromId).catch(() => new Map<string, number>());
  const seenBefore: Record<string, number> = { ...(to.seenBefore ?? {}) };
  for (const [id, n] of seen) {
    const mapped = rows.ids.get(id);
    if (mapped && (seenBefore[mapped] === undefined || n < seenBefore[mapped])) seenBefore[mapped] = n;
  }

  const style: BookStyle = { ...(from.style ?? {}), ...(to.style ?? {}) };
  if (options.sample?.trim()) style.sample = options.sample.trim();
  if (options.chinese) style.notes = withBracketRule(style.notes);
  const upTo = (a?: number, b?: number) => (a === undefined ? b : b === undefined ? a : Math.max(a, b));
  const change: Partial<Book> = {
    worldFrom: fromId,
    seenBefore,
    startLine: Math.max(to.startLine ?? 0, readingLine(from, fromChapters)),
    style: Object.keys(style).length ? style : undefined,
    artStyle: to.artStyle ?? from.artStyle,
    worldSpoilers: to.worldSpoilers ?? from.worldSpoilers,
    worldUpTo: upTo(to.worldUpTo, from.worldUpTo),
    castUpTo: upTo(to.castUpTo, from.castUpTo),
    linksUpTo: upTo(to.linksUpTo, from.linksUpTo),
    originalTitle: to.originalTitle ?? (HAN.test(to.title) ? to.title : from.originalTitle),
    updatedAt: now,
  };
  if (options.storySoFar?.trim()) change.storySoFar = options.storySoFar.trim();

  await db.transaction('rw', [db.glossary, db.worldLinks, db.worldEvents, db.books], async () => {
    if (rows.entries.length) await db.glossary.bulkAdd(rows.entries);
    if (rows.links.length) await db.worldLinks.bulkAdd(rows.links);
    if (rows.events.length) await db.worldEvents.bulkAdd(rows.events);
    await db.books.update(toId, change);
  });

  // The guide's names the old book never had (with their Chinese), so the translator knows them too.
  let fromGuide = 0;
  if (guide) fromGuide = (await applyGuide(toId, guide, now)).added;

  return { names: rows.entries.length, matched: rows.matched, links: rows.links.length, events: rows.events.length, chinese, fromGuide };
}
