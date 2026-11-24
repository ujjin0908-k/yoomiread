import { AI_OFF_FOR_FAN_WORK, aiAllowedFor } from '../import/ao3Book';
import { db } from '../db';
import { needsTranslation } from '../logic';
import { chat } from '../translate/api';
import { formatCost, type ChatMessage } from '../translate/prompt';
import { addSpend, aiReady, callCost, loadSettings, modelFor } from '../translate/run';
import type { Book, Note } from '../types';
import { loadWorldData } from '../world/load';
import { worldAt } from '../world/visible';
import { catContext, catLine } from './askContext';

/**
 * The Theory board's one AI piece: the cat checks every open theory in ONE short request, from what the reader has
 * read only (the same notes and passages Ask uses, src/mascot/askContext.ts). A theory is settled only when the
 * story so far clearly shows it; otherwise it stays open, and the cat must not hint either way.
 */

export type Verdict = { n: number; verdict: 'right' | 'wrong' | 'open'; chapter?: number; why: string };

/** Reads the cat's reply: one JSON object per line, {"n":1,"verdict":"right|wrong|open","chapter":12,"why":"…"}. */
export function parseVerdicts(reply: string, count: number, line: number): Verdict[] {
  const out: Verdict[] = [];
  for (const raw of reply.split('\n')) {
    const m = raw.match(/\{.*\}/);
    if (!m) continue;
    try {
      const o = JSON.parse(m[0]) as Record<string, unknown>;
      const n = Number(o.n);
      const v = String(o.verdict ?? '').toLowerCase();
      if (!Number.isInteger(n) || n < 1 || n > count || out.some((x) => x.n === n)) continue;
      const verdict = v === 'right' || v === 'true' ? 'right' : v === 'wrong' || v === 'false' ? 'wrong' : 'open';
      const chapter = Number(o.chapter);
      out.push({
        n,
        verdict,
        // A chapter past the reader's line would be a spoiler: never kept.
        chapter: verdict !== 'open' && Number.isInteger(chapter) && chapter > 0 && chapter <= line ? chapter : undefined,
        why: String(o.why ?? '').trim().slice(0, 240),
      });
    } catch {
      // A line that isn't JSON is skipped.
    }
  }
  return out;
}

/** Checks the open theories of a book. Returns how many were settled, and a note about the cost. */
export async function checkTheories(book: Book, theories: Note[]): Promise<{ settled: number; note: string }> {
  const open = theories.filter((t) => t.kind === 'theory' && !t.verdict);
  if (!open.length) return { settled: 0, note: 'No open theories to check.' };
  const settings = await loadSettings();
  if (!aiReady(settings)) throw new Error('Set up AI in Settings first, so the cat can check.');
  if (!aiAllowedFor(book)) throw new Error(AI_OFF_FOR_FAN_WORK);
  const model = modelFor(settings, book.model);
  const data = await loadWorldData(book.id);
  if (!data) throw new Error('That book is gone.');
  const line = catLine(data.chapters, data.book.startLine);
  if (!line) throw new Error('Finish a chapter first: the cat only checks against what you have read.');

  const [texts, translations] = await Promise.all([db.texts.where('bookId').equals(book.id).toArray(), db.translations.where('bookId').equals(book.id).toArray()]);
  const original = new Map(texts.map((t) => [t.chapterId, t.text]));
  const english = new Map(translations.map((t) => [t.chapterId, t.text]));
  const textOf = (cid: string) => (needsTranslation(data.book, original.get(cid)) ? english.get(cid) : undefined) ?? original.get(cid);
  const numberOf = new Map(data.chapters.map((c) => [c.id, c.number]));
  const list = open.map((t, i) => `${i + 1}. (written at chapter ${numberOf.get(t.chapterId) ?? '?'}) ${t.body}`).join('\n');
  const notes = catContext({ question: open.map((t) => t.body).join(' '), world: worldAt(data, { line, spoilers: false }), line, chapters: data.chapters, textOf });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a friendly, slightly smug cat in a wizard hat, keeping score of the reader’s predictions about a novel. ' +
        'You are given notes and passages covering ONLY what the reader has read so far. Judge each prediction from them alone. ' +
        '"right": what has been read clearly shows it happened. "wrong": what has been read clearly shows it did not or cannot. ' +
        '"open": anything else. When unsure, say "open". Never reveal, hint at or guess what comes later, and never use outside knowledge of this book. ' +
        'For an open one, the reason must not hint whether it will come true. ' +
        'Answer with one JSON object per line and nothing else: {"n": <number>, "verdict": "right" | "wrong" | "open", "chapter": <chapter that settled it, or null>, "why": "<under 20 words>"}',
    },
    {
      role: 'user',
      content: `Book: ${book.title}\nThe reader has finished up to chapter ${line}.\n\n${notes}\n\nPredictions:\n${list}`,
    },
  ];
  const result = await chat(settings, model.id, messages);
  const spend = callCost(model, messages, result);
  await addSpend(book.id, spend.cost, spend.estimated);

  const verdicts = parseVerdicts(result.text, open.length, line);
  const now = Date.now();
  let settled = 0;
  await db.transaction('rw', db.notes, async () => {
    for (const v of verdicts) {
      const t = open[v.n - 1];
      const change: Partial<Note> = { catSays: v.why || undefined, checkedAt: now, updatedAt: now };
      if (v.verdict !== 'open') {
        change.verdict = v.verdict;
        change.settledChapter = v.chapter;
        settled++;
      }
      await db.notes.update(t.id, change);
    }
  });
  return { settled, note: spend.cost === undefined ? '' : `The check cost ${formatCost(spend.cost)}${spend.estimated ? ' (estimate)' : ''}.` };
}
