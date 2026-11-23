import { isRead } from '../logic';
import { mentions, namesOf } from '../translate/profiles';
import type { Chapter, ProfileFact } from '../types';
import type { WorldAt, WorldEntry } from '../world/visible';

/**
 * What the cat may know when he is asked something: only what I have read.
 *
 * - The line is the last chapter I have finished (or a copied world's start). The chapter I am in counts only up to
 *   where I am in it, as raw text: the Living Book's facts for it wait until I finish it, since they can come from
 *   its end.
 * - The world is the Living Book at that line (`worldAt`), so people I have not met yet are never named.
 * - Passages come only from finished chapters and the part of this one I have read: where the people I ask about were
 *   first and last named, or the paragraphs that share the most words with the question.
 * Nothing past the line is put in the prompt, so the model cannot spoil it however it is asked.
 */

/** The last chapter I have finished. Unlike the Living Book's line, the chapter I am in does not count until it is read. */
export function catLine(chapters: Chapter[], startLine = 0): number {
  let line = startLine;
  for (const c of chapters) if (isRead(c) && c.number > line) line = c.number;
  return line;
}

/** The part of a chapter I have read so far, cut at a paragraph break. */
export function readPart(text: string, position = 0): string {
  if (position >= 0.99) return text;
  if (position <= 0) return '';
  const cut = Math.floor(text.length * position);
  const end = text.lastIndexOf('\n', cut);
  return text.slice(0, end > 0 ? end : cut).trim();
}

const STOP = new Set(
  'about after again also another because been before being between both could does doing down during each from have having here hers herself him himself into itself just more most once only other over same should some such than that their theirs them themselves then there these they this those through under until very what when where which while who whom whose why will with would your yours chapter again remind story happened really think know tell said the old young lord lady master miss little great elder brother sister'.split(
    ' ',
  ),
);

/** Words of the question worth searching for: longer words, not the everyday ones. */
export function questionWords(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  return [...new Set(words.filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);
}

/** The people, places and things shown in the world that the question names (by a full name, or one part of one). */
export function askedAbout(question: string, entries: WorldEntry[], max = 4): WorldEntry[] {
  const q = question.toLowerCase();
  const word = (n: string) => new RegExp(`(^|[^\\p{L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');
  const named = (g: WorldEntry) => namesOf(g).some((n) => (/^[\x00-\x7f]+$/.test(n) ? word(n).test(q) : q.includes(n.toLowerCase())));
  const full = entries.filter(named);
  if (full.length) return full.slice(0, max);
  // "Who is Mira again?" names Mira Vale by her first name.
  const parts = (g: WorldEntry) => g.english.split(/\s+/).filter((p) => p.length >= 3 && !STOP.has(p.toLowerCase()));
  return entries.filter((g) => parts(g).some((p) => word(p).test(q))).slice(0, max);
}

const dated = (f: ProfileFact) => (f.chapter !== undefined ? `${f.text} (ch. ${f.chapter})` : f.text);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** One shown entry as a few lines: what it is, the facts the line allows, its links and the events it is in. */
function card(g: WorldEntry, world: WorldAt, nameOf: (id: string) => string): string {
  const p = g.profile;
  const lines = [`${g.english}${g.original !== g.english ? ` (${g.original})` : ''}, ${g.kind}${g.firstChapter ? `, first named in ch. ${g.firstChapter}` : ''}`];
  if (g.note) lines.push(`  Note: ${g.note}`);
  if (p?.line) lines.push(`  In short: ${p.line}`);
  const facts = [...(p?.about ?? []), ...(p?.powers ?? []), ...(p?.status ?? [])].slice(-10);
  if (facts.length) lines.push(`  Known: ${facts.map(dated).join('; ')}`);
  const links = world.pairs.filter((x) => x.from === g.id || x.to === g.id).map((x) => `${nameOf(x.current.from)} ${x.current.label} ${nameOf(x.current.to)}${x.current.chapter ? ` (ch. ${x.current.chapter})` : ''}`);
  if (links.length) lines.push(`  Links: ${links.slice(0, 8).join('; ')}`);
  const events = world.events.filter((e) => e.who?.includes(g.id) || e.where === g.id).slice(-4);
  if (events.length) lines.push(`  Events: ${events.map((e) => `${e.title} (ch. ${e.chapter})`).join('; ')}`);
  return lines.join('\n');
}

export interface CatContextInput {
  question: string;
  /** The Living Book at `line` (see `catLine`). */
  world: WorldAt;
  line: number;
  /** All of the book's chapters. */
  chapters: Chapter[];
  /** The text I read each chapter in (the translation when there is one), by chapter id. */
  textOf: (chapterId: string) => string | undefined;
  /** The chapter I am in, and how far through it I am. */
  current?: Chapter;
}

/** The notes and passages the cat answers from. Everything in it is at or before my line. */
export function catContext(input: CatContextInput): string {
  const { world, line, question } = input;
  const nameOf = (id: string) => world.entries.find((g) => g.id === id)?.english ?? '?';
  const out: string[] = [];

  const met = [...world.entries].sort((a, b) => (a.firstChapter ?? 1e9) - (b.firstChapter ?? 1e9));
  if (met.length) out.push(`Met so far: ${met.slice(0, 80).map((g) => `${g.english} (${g.kind})`).join(', ')}`);

  const asked = askedAbout(question, world.entries);
  if (asked.length) out.push(`About what you asked:\n${asked.map((g) => card(g, world, nameOf)).join('\n')}`);
  const recent = world.events.slice(-5);
  if (recent.length) out.push(`Recent big moments: ${recent.map((e) => `${e.title} (ch. ${e.chapter})`).join('; ')}`);

  // Only finished chapters, plus the part of the one I am in that I have read.
  const sorted = [...input.chapters].sort((a, b) => a.number - b.number);
  const finished = sorted.filter((c) => c.number <= line && isRead(c));
  const cur = input.current && !finished.some((c) => c.id === input.current!.id) ? input.current : undefined;
  const curText = cur ? readPart(input.textOf(cur.id) ?? '', cur.position) : '';
  const sources: { chapter: number; paras: string[] }[] = finished.map((c) => ({ chapter: c.number, paras: (input.textOf(c.id) ?? '').split('\n').map((p) => p.trim()).filter(Boolean) }));
  if (cur && curText) sources.push({ chapter: cur.number, paras: curText.split('\n').map((p) => p.trim()).filter(Boolean) });

  const picked: { chapter: number; text: string }[] = [];
  const pick = (chapter: number, text: string) => {
    if (picked.length < 8 && !picked.some((p) => p.text === text)) picked.push({ chapter, text: clip(text, 500) });
  };
  for (const g of asked) {
    const names = namesOf(g);
    const hits = sources.flatMap((s) => s.paras.filter((p) => mentions(p, names)).map((text) => ({ chapter: s.chapter, text })));
    // Where they came in, and the latest times they were named.
    for (const h of [hits[0], ...hits.slice(-2)]) if (h) pick(h.chapter, h.text);
  }
  if (!asked.length) {
    const words = questionWords(question);
    if (words.length) {
      const scored = sources
        .flatMap((s) => s.paras.map((text) => ({ chapter: s.chapter, text, score: words.filter((w) => text.toLowerCase().includes(w)).length })))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.chapter - a.chapter)
        .slice(0, 4);
      for (const x of scored.sort((a, b) => a.chapter - b.chapter)) pick(x.chapter, x.text);
    }
  }
  if (picked.length) out.push(`Passages from what you have read:\n${picked.map((p) => `[Ch. ${p.chapter}] ${p.text}`).join('\n')}`);

  // Where I am now: the end of the last finished chapter, and what I have read of this one.
  const last = finished[finished.length - 1];
  const lastText = last ? input.textOf(last.id) ?? '' : '';
  if (last && lastText) out.push(`End of chapter ${last.number}:\n${lastText.slice(-1200)}`);
  if (cur && curText) out.push(`Chapter ${cur.number}, as far as you have read it:\n${curText.slice(-1500)}`);
  return out.join('\n\n') || '(Nothing read yet.)';
}
