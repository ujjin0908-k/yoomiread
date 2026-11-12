import { db } from '../db';
import { isRead, needsTranslation, newId } from '../logic';
import type { Book, Chapter, CharacterProfile, GlossaryEntry, ProfileFact, TranslateSettings } from '../types';
import { chat } from './api';
import { costOf, estimateTokens, isRefusal, type ChatMessage } from './prompt';
import { addSpend, callCost, modelFor } from './run';

/**
 * Character profiles: who they are, their powers, their status, and one quote, built only from chapters the owner has read.
 * Nothing here runs on its own. The owner picks who to update; only chapters read since that character's last
 * update are looked at, and of those only the paragraphs that name the character, which keeps each update cheap.
 */

const MAX_LOOKS = 6;
const MAX_ABOUT = 6;
const MAX_POWERS = 10;
const MAX_STATUS = 6;
/** About 6,000 tokens of story per request. */
const CHUNK_CHARS = 24_000;

export const EMPTY_PROFILE: CharacterProfile = { looks: [], about: [], powers: [], status: [], v: 2 };

/** Every name a character goes by, longest first, so "Song Zang" is tried before "Song". A single letter is not a name; a single Chinese character can be. */
export function namesOf(entry: GlossaryEntry): string[] {
  const all = [entry.english, entry.original, ...(entry.aliases ?? [])].map((n) => n.trim()).filter((n) => n.length > 1 || /[^\x00-\x7f]/.test(n));
  return [...new Set(all)].sort((a, b) => b.length - a.length);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the paragraph names the character. Latin names must stand as whole words ("Song" is not in "Songs"). */
export function mentions(paragraph: string, names: string[]): boolean {
  return names.some((n) => (/^[\x00-\x7f]+$/.test(n) ? new RegExp(`(^|[^A-Za-z])${escape(n)}([^A-Za-z]|$)`, 'i').test(paragraph) : paragraph.includes(n)));
}

/** The chapters an update for this character would read: finished ones after the chapter the profile is up to. */
export function chaptersToRead(chapters: Chapter[], entry: GlossaryEntry): Chapter[] {
  // A profile in the old style (looks and scene-by-scene notes) is rebuilt from the start.
  const upTo = entry.profile?.v === 2 ? (entry.profile.upTo ?? 0) : 0;
  return chapters.filter((c) => isRead(c) && c.number > upTo).sort((a, b) => a.number - b.number);
}

export interface ReadingPlan {
  /** The story text to send, chapter by chapter: only paragraphs naming a picked character (or all, when looking for new people). */
  parts: { chapter: number; text: string }[];
  /** The highest chapter number covered, per character id. */
  upTo: Map<string, number>;
  chars: number;
}

/**
 * Works out what an update would read. `textOf` gives a chapter's text in the language the owner reads it in.
 * With `whole`, whole chapters are read (needed to spot people who are not in the cast yet).
 */
export function planReading(chapters: Chapter[], picked: GlossaryEntry[], textOf: (chapterId: string) => string, whole = false): ReadingPlan {
  const upTo = new Map<string, number>();
  const whoWants = new Map<number, GlossaryEntry[]>();
  for (const entry of picked) {
    for (const c of chaptersToRead(chapters, entry)) {
      whoWants.set(c.number, [...(whoWants.get(c.number) ?? []), entry]);
      upTo.set(entry.id, Math.max(upTo.get(entry.id) ?? 0, c.number));
    }
  }
  const parts: ReadingPlan['parts'] = [];
  let chars = 0;
  for (const c of [...chapters].sort((a, b) => a.number - b.number)) {
    const who = whoWants.get(c.number);
    if (!who) continue;
    const paragraphs = textOf(c.id).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const kept = whole ? paragraphs : paragraphs.filter((p) => who.some((e) => mentions(p, namesOf(e))));
    if (!kept.length) continue;
    const text = kept.join('\n\n');
    parts.push({ chapter: c.number, text });
    chars += text.length;
  }
  return { parts, upTo, chars };
}

/** Splits the reading into requests of a sensible size, never cutting a chapter in two unless it is huge. */
export function chunkParts(parts: ReadingPlan['parts'], max = CHUNK_CHARS): ReadingPlan['parts'][] {
  const chunks: ReadingPlan['parts'][] = [];
  let current: ReadingPlan['parts'] = [];
  let size = 0;
  for (const part of parts) {
    const text = part.text.length > max ? part.text.slice(0, max) : part.text;
    if (current.length && size + text.length > max) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push({ chapter: part.chapter, text });
    size += text.length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** A rough price for a plan, before anything is sent. Undefined when the model has no prices set. */
export function planCost(plan: ReadingPlan, settings: TranslateSettings, modelId: string, people: number): number | undefined {
  if (!plan.parts.length) return 0;
  const chunks = chunkParts(plan.parts);
  let input = 0;
  for (const chunk of chunks) input += estimateTokens(chunk.map((p) => p.text).join('\n')).input + people * 60;
  // A few short lines per character come back.
  const output = chunks.length * (120 + people * 160);
  return costOf(modelFor(settings, modelId), input, output);
}

export function profileMessages(input: { book: Book; chunk: ReadingPlan['parts']; people: GlossaryEntry[]; findNew: boolean; known: string[] }): ChatMessage[] {
  const system = [
    'You keep character notes for a reader of a novel. You are given excerpts from chapters the reader has already read,',
    'each marked with its chapter number, and a list of characters to update.',
    'Use ONLY what the excerpts say. Never guess, never use outside knowledge of the story, never mention later events.',
    'Write in English, in short plain phrases (under 14 words each), no full stops needed.',
    'For each listed character that the excerpts tell something NEW about, answer with one JSON object on its own line:',
    '{"name": "<exactly as listed>", "line": "<who they are in one short line>", "about": [{"text": "...", "ch": 3}],',
    ' "powers": [{"text": "...", "ch": 3}], "status": [{"text": "...", "ch": 3}], "quote": {"text": "<their exact words, copied from an excerpt>", "ch": 3}}',
    '"about" is WHO THEY ARE: identity, occupation or class, team or faction, relationships to other characters, goals, and',
    'personality in a few words. It is NOT a list of things they did in a scene: no "drinks wine", "sits on the ground", "shares a cola".',
    '"powers" is what they can do: abilities, skills, talents, spells, and the items or weapons they fight with, using the names the story gives.',
    '"status" is where they stand as of the LATEST chapter in the excerpts: rank or level, title, faction, and condition (injured, cursed,',
    'dead, missing) when the story says so. Give the full current status every time, as it replaces the old one.',
    'Give at most 3 new "about", 4 new "powers" and 5 "status" lines per character. Skip anything already in their notes.',
    'Leave out any field with nothing new. Never invent a power or a rank that the excerpts do not state.',
    '"quote" must be something the character says, copied word for word from the excerpts, under 30 words. Leave it out when unsure.',
    'A character with nothing new gets no line at all.',
    input.findNew
      ? 'After that, for each named character in the excerpts who is NOT in the "already known" list, add one line: {"new": "<name as written>", "english": "<name in English>", "gender": "he|she|they|it", "note": "<who they are, short>"}'
      : '',
    'Answer with JSON lines only.',
  ]
    .filter(Boolean)
    .join('\n');
  const notes = input.people
    .map((p) => {
      const current = p.profile?.v === 2 ? p.profile : undefined;
      const list = (label: string, facts?: ProfileFact[]) => (facts?.length ? ` ${label}: ${facts.map((f) => f.text).join('; ')}.` : '');
      const have = current ? list('Who', current.about) + list('Powers', current.powers) + list('Status', current.status) : '';
      const names = namesOf(p).filter((n) => n !== p.english);
      return `- ${p.english}${names.length ? ` (also: ${names.join(', ')})` : ''}${p.gender ? `, ${p.gender}` : ''}${have ? `. Notes so far:${have}` : ''}`;
    })
    .join('\n');
  const known = input.findNew ? `\n\nAlready known (do not list as new): ${input.known.join(', ') || 'nobody'}` : '';
  const story = input.chunk.map((p) => `[Chapter ${p.chapter}]\n${p.text}`).join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Book: ${input.book.title}\n\nCharacters to update:\n${notes}${known}\n\nExcerpts:\n\n${story}` },
  ];
}

export interface ProfileUpdate {
  name: string;
  line?: string;
  looks: ProfileFact[];
  about: ProfileFact[];
  powers: ProfileFact[];
  status: ProfileFact[];
  quote?: ProfileFact;
}
export interface NewPerson {
  original: string;
  english: string;
  gender?: GlossaryEntry['gender'];
  note?: string;
}

const squash = (s: string) => s.toLowerCase().replace(/[“”"'‘’「」『』]/g, '').replace(/\s+/g, ' ').trim();
/** Letters and digits only, so a quote still matches when a comma became a full stop. */
const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Reads the model's answer and keeps only what can be trusted: every detail must name a chapter that was really
 * sent, and a quote must be found word for word in that chapter's excerpts.
 */
export function parseProfileReply(raw: string, chunk: ReadingPlan['parts']): { updates: ProfileUpdate[]; fresh: NewPerson[] } {
  const sent = new Map(chunk.map((p) => [p.chapter, bare(p.text)]));
  const facts = (list: unknown): ProfileFact[] =>
    (Array.isArray(list) ? list : [])
      .map((f) => ({ text: String((f as { text?: unknown })?.text ?? '').trim(), chapter: Number((f as { ch?: unknown })?.ch) }))
      .filter((f) => f.text && f.text.length <= 160 && sent.has(f.chapter));
  const updates: ProfileUpdate[] = [];
  const fresh: NewPerson[] = [];
  for (const line of raw.split('\n')) {
    const at = line.indexOf('{');
    if (at < 0) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line.slice(at, line.lastIndexOf('}') + 1));
    } catch {
      continue;
    }
    if (typeof row.new === 'string' && row.new.trim()) {
      const gender = ['he', 'she', 'they', 'it'].includes(String(row.gender)) ? (row.gender as NewPerson['gender']) : undefined;
      fresh.push({ original: row.new.trim(), english: String(row.english ?? row.new).trim() || row.new.trim(), gender, note: typeof row.note === 'string' ? row.note.trim().slice(0, 120) || undefined : undefined });
      continue;
    }
    if (typeof row.name !== 'string') continue;
    const q = row.quote as { text?: unknown; ch?: unknown } | undefined;
    const quoteText = String(q?.text ?? '').trim().replace(/^[“"「]|[”"」]$/g, '');
    const quoteCh = Number(q?.ch);
    const quoteOk = bare(quoteText).length > 3 && quoteText.length <= 220 && (sent.get(quoteCh) ?? '').includes(bare(quoteText));
    const update: ProfileUpdate = {
      name: row.name.trim(),
      line: typeof row.line === 'string' ? row.line.trim().slice(0, 90) || undefined : undefined,
      looks: facts(row.looks),
      about: facts(row.about),
      powers: facts(row.powers),
      status: facts(row.status),
      quote: quoteOk ? { text: quoteText, chapter: quoteCh } : undefined,
    };
    if (update.looks.length || update.about.length || update.powers.length || update.status.length || update.quote || update.line) updates.push(update);
  }
  return { updates, fresh };
}

function addFacts(have: ProfileFact[], more: ProfileFact[], max: number): ProfileFact[] {
  const seen = new Set(have.map((f) => squash(f.text)));
  const out = [...have];
  for (const f of more) {
    if (seen.has(squash(f.text))) continue;
    seen.add(squash(f.text));
    out.push(f);
  }
  // When the list is full the oldest lines make room, but never one the owner wrote.
  while (out.length > max) {
    const drop = out.findIndex((f) => !f.mine);
    if (drop < 0) break;
    out.splice(drop, 1);
  }
  return out;
}

/** Folds an update into a profile. Lines the owner wrote always stay; a quote the owner chose is never replaced. */
export function mergeProfile(profile: CharacterProfile | undefined, update: ProfileUpdate | undefined, upTo: number, now = Date.now()): CharacterProfile {
  // An old-style profile keeps only the owner's own lines, its one-line summary and its quote; the rest is rebuilt.
  const base: CharacterProfile =
    profile?.v === 2
      ? profile
      : { ...EMPTY_PROFILE, line: profile?.line, quote: profile?.quote, looks: (profile?.looks ?? []).filter((f) => f.mine), about: (profile?.about ?? []).filter((f) => f.mine), upTo: 0 };
  const mine = (base.status ?? []).filter((f) => f.mine);
  return {
    line: update?.line ?? base.line,
    looks: addFacts(base.looks, update?.looks ?? [], MAX_LOOKS),
    about: addFacts(base.about, update?.about ?? [], MAX_ABOUT),
    powers: addFacts(base.powers ?? [], update?.powers ?? [], MAX_POWERS),
    // The status is where they stand now: a new one replaces the old, except lines the owner wrote.
    status: update?.status.length ? addFacts(mine, update.status, MAX_STATUS) : (base.status ?? []),
    quote: base.quote?.mine ? base.quote : (update?.quote ?? base.quote),
    upTo: Math.max(base.upTo ?? 0, upTo),
    updatedAt: now,
    v: 2,
  };
}

/** A chapter's text in the language it is read in: the English translation when there is one, else the original. */
export async function readingTexts(book: Book, chapters: Chapter[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of chapters) {
    const original = (await db.texts.get(c.id))?.text ?? '';
    const english = needsTranslation(book, original) ? (await db.translations.get(c.id))?.text : undefined;
    out.set(c.id, english ?? original);
  }
  return out;
}

export interface UpdateResult {
  updated: string[];
  unchanged: string[];
  added: number;
  cost: number;
  /** Set when it stopped early; what was finished before that is kept. */
  stopped?: string;
}

/**
 * Updates the picked characters from the chapters read since each one's last update. One request per chunk of
 * excerpts, shared by all picked characters. Saved chunk by chunk, so a failure keeps what was done.
 */
export async function updateProfiles(input: {
  book: Book;
  chapters: Chapter[];
  picked: GlossaryEntry[];
  findNew: boolean;
  settings: TranslateSettings;
  model: string;
  signal?: AbortSignal;
  onStatus?: (line: string) => void;
}): Promise<UpdateResult> {
  const { book, chapters, picked, findNew, settings, model, signal } = input;
  const needed = chapters.filter((c) => picked.some((e) => chaptersToRead(chapters, e).includes(c)));
  const texts = await readingTexts(book, needed);
  const plan = planReading(chapters, picked, (id) => texts.get(id) ?? '', findNew);
  const chunks = chunkParts(plan.parts);
  const result: UpdateResult = { updated: [], unchanged: [], added: 0, cost: 0 };
  const touched = new Set<string>();

  for (let i = 0; i < chunks.length && !signal?.aborted; i++) {
    const chunk = chunks[i];
    const last = chunk[chunk.length - 1].chapter;
    input.onStatus?.(`Reading chapters ${chunk[0].chapter}${last !== chunk[0].chapter ? `–${last}` : ''} (${i + 1} of ${chunks.length})`);
    const all = await db.glossary.where('bookId').equals(book.id).toArray();
    const people = all.filter((g) => picked.some((p) => p.id === g.id));
    const messages = profileMessages({ book, chunk, people, findNew, known: all.flatMap((g) => namesOf(g)) });
    try {
      const reply = await chat(settings, model, messages, undefined, signal);
      const spend = callCost(modelFor(settings, model), messages, reply);
      await addSpend(book.id, spend.cost, spend.estimated);
      result.cost += spend.cost ?? 0;
      if (isRefusal(reply.text)) throw new Error('The model would not read these chapters. Try the other model.');
      const { updates, fresh } = parseProfileReply(reply.text, chunk);
      const now = Date.now();
      for (const person of people) {
        const update = updates.find((u) => squash(u.name) === squash(person.english) || namesOf(person).some((n) => squash(n) === squash(u.name)));
        // Up to date through this chunk, whether or not the character appeared in it.
        const through = Math.min(plan.upTo.get(person.id) ?? 0, Math.max(last, person.profile?.upTo ?? 0));
        await db.glossary.update(person.id, { profile: mergeProfile(person.profile, update, through, now), updatedAt: now });
        if (update) touched.add(person.id);
      }
      if (findNew && fresh.length) result.added += await addNewPeople(book.id, fresh, all, now);
    } catch (e) {
      if (!signal?.aborted) result.stopped = e instanceof Error ? e.message : 'The provider did not answer.';
      break;
    }
  }
  if (signal?.aborted) result.stopped = 'Stopped.';

  // Chapters with no scene for anyone were never sent: with everything else done, those are covered too.
  if (!result.stopped) {
    const now = Date.now();
    for (const p of picked) {
      const fresh = await db.glossary.get(p.id);
      const upTo = plan.upTo.get(p.id);
      if (fresh && upTo && (fresh.profile?.upTo ?? 0) < upTo) await db.glossary.update(p.id, { profile: mergeProfile(fresh.profile, undefined, upTo, now) });
    }
  }
  for (const p of picked) (touched.has(p.id) ? result.updated : result.unchanged).push(p.english);
  return result;
}

/** Adds people who are not in the cast yet, under "To check". Returns how many were added. */
export async function addNewPeople(bookId: string, fresh: NewPerson[], all: GlossaryEntry[], now = Date.now()): Promise<number> {
  const have = new Set(all.flatMap((g) => namesOf(g)).map(squash));
  const rows: GlossaryEntry[] = fresh
    .filter((f) => !have.has(squash(f.original)) && !have.has(squash(f.english)))
    .filter((f, n, list) => list.findIndex((x) => squash(x.original) === squash(f.original)) === n)
    .map((f) => ({ id: newId(), bookId, original: f.original, english: f.english, kind: 'person', gender: f.gender, note: f.note, locked: false, status: 'review', createdAt: now, updatedAt: now }));
  if (rows.length) await db.glossary.bulkAdd(rows);
  return rows.length;
}

/** The chapters "Look for new characters" reads: finished ones after the chapter the cast was last searched to. */
export function chaptersToSearch(chapters: Chapter[], castUpTo = 0): Chapter[] {
  return chapters.filter((c) => isRead(c) && c.number > castUpTo).sort((a, b) => a.number - b.number);
}

export function newPeopleMessages(input: { book: Book; chunk: ReadingPlan['parts']; known: string[] }): ChatMessage[] {
  const system = [
    'You list the named characters of a novel for a reader. You are given chapters the reader has already read,',
    'each marked with its chapter number, and the names already in the reader\'s list.',
    'List every named character in these chapters who is NOT already in the list (by any of their names).',
    'Use only what the text says. Skip people who are only called by a job or a description, unless that is clearly how the story names them.',
    'Answer with one JSON object per line and nothing else:',
    '{"new": "<name exactly as written in the text>", "english": "<the name in English>", "gender": "he|she|they|it", "note": "<who they are, under 10 words>"}',
    'If there is nobody new, answer with nothing.',
  ].join('\n');
  const story = input.chunk.map((p) => `[Chapter ${p.chapter}]\n${p.text}`).join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Book: ${input.book.title}\n\nAlready in the list: ${input.known.join(', ') || 'nobody'}\n\nChapters:\n\n${story}` },
  ];
}

/** What a search would read, and a rough price, before anything is sent. */
export function searchPlan(chapters: Chapter[], texts: Map<string, string>, castUpTo = 0): ReadingPlan['parts'] {
  return chaptersToSearch(chapters, castUpTo)
    .map((c) => ({ chapter: c.number, text: texts.get(c.id) ?? '' }))
    .filter((p) => p.text.trim());
}

export function searchCost(parts: ReadingPlan['parts'], settings: TranslateSettings, modelId: string, known: number): number | undefined {
  if (!parts.length) return 0;
  let input = 0;
  const chunks = chunkParts(parts);
  for (const chunk of chunks) input += estimateTokens(chunk.map((p) => p.text).join('\n')).input + known * 4;
  return costOf(modelFor(settings, modelId), input, chunks.length * 250);
}

/**
 * "Look for new characters": reads the chapters finished since the cast was last searched, whole, and adds anyone
 * new under "To check". Profiles are not touched. Remembers how far it got after each request, so stopping keeps it.
 */
export async function findNewPeople(input: {
  book: Book;
  chapters: Chapter[];
  settings: TranslateSettings;
  model: string;
  signal?: AbortSignal;
  onStatus?: (line: string) => void;
}): Promise<{ added: number; cost: number; read: number; stopped?: string }> {
  const { book, chapters, settings, model, signal } = input;
  const todo = chaptersToSearch(chapters, book.castUpTo);
  const texts = await readingTexts(book, todo);
  const chunks = chunkParts(searchPlan(chapters, texts, book.castUpTo));
  const out = { added: 0, cost: 0, read: 0, stopped: undefined as string | undefined };
  for (let i = 0; i < chunks.length && !signal?.aborted; i++) {
    const chunk = chunks[i];
    const last = chunk[chunk.length - 1].chapter;
    input.onStatus?.(`Reading chapters ${chunk[0].chapter}${last !== chunk[0].chapter ? `–${last}` : ''} (${i + 1} of ${chunks.length})`);
    const all = await db.glossary.where('bookId').equals(book.id).toArray();
    const messages = newPeopleMessages({ book, chunk, known: [...new Set(all.flatMap((g) => namesOf(g)))] });
    try {
      const reply = await chat(settings, model, messages, undefined, signal);
      const spend = callCost(modelFor(settings, model), messages, reply);
      await addSpend(book.id, spend.cost, spend.estimated);
      out.cost += spend.cost ?? 0;
      if (isRefusal(reply.text)) throw new Error('The model would not read these chapters. Try the other model.');
      out.added += await addNewPeople(book.id, parseProfileReply(reply.text, chunk).fresh, all);
      out.read += chunk.length;
      await db.books.update(book.id, { castUpTo: last });
    } catch (e) {
      if (!signal?.aborted) out.stopped = e instanceof Error ? e.message : 'The provider did not answer.';
      break;
    }
  }
  if (signal?.aborted) out.stopped = 'Stopped.';
  // Finished chapters with no text were never sent; with everything else read, the search is up to date past them.
  if (!out.stopped && todo.length) {
    const lastRead = todo[todo.length - 1].number;
    if (lastRead > ((await db.books.get(book.id))?.castUpTo ?? 0)) await db.books.update(book.id, { castUpTo: lastRead });
  }
  return out;
}
