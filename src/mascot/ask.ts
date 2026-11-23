import { AI_OFF_FOR_FAN_WORK, aiAllowedFor } from '../import/ao3Book';
import { db } from '../db';
import { isRead, needsTranslation } from '../logic';
import { chat } from '../translate/api';
import { formatCost, type ChatMessage } from '../translate/prompt';
import { addSpend, aiReady, callCost, loadSettings, modelFor } from '../translate/run';
import type { Book, Chapter } from '../types';
import { loadWorldData } from '../world/load';
import { worldAt } from '../world/visible';
import { catContext, catLine } from './askContext';

/** A small, stable hash, used to remember answers. */
function hash(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

/**
 * Asks the cat about a book, from what I have read only (see askContext.ts). Used by his bubble in the reader and by
 * the Ask tab. `chapter` is the one I am in; without it, the one I last opened. The same question about the same
 * reading is answered from memory, for free. Throws with a message to show when he cannot answer.
 */
export async function askTheCat(input: { book: Book; chapter?: Chapter; question: string }): Promise<{ text: string; note: string }> {
  const { book, question: q } = input;
  const settings = await loadSettings();
  const model = modelFor(settings, book.model);
  // Read fresh: how far I am in this chapter changes while the bubble is open.
  const data = await loadWorldData(book.id);
  if (!data) throw new Error('That book is gone.');
  const id = input.chapter?.id ?? data.book.lastChapterId;
  const now = data.chapters.find((c) => c.id === id);
  const line = catLine(data.chapters, data.book.startLine);
  const readIds = data.chapters.filter(isRead).map((c) => c.id).join(',');
  const at = !now ? 0 : isRead(now) ? 1 : Math.round((now.position ?? 0) * 20) / 20;
  const key = `wizard:${hash(`${book.id}|${readIds}|${now?.id ?? ''}@${at}|${q}|${model.id}`)}`;

  const saved = (await db.settings.get(key))?.value as { text: string; cost?: number } | undefined;
  if (saved) return { text: saved.text, note: 'Remembered from before. Free.' };
  if (!aiReady(settings)) throw new Error('Set up AI in Settings first to chat with him.');
  if (!aiAllowedFor(book)) throw new Error(AI_OFF_FOR_FAN_WORK);

  // Only this book's text, in the language I read it in.
  const [texts, translations] = await Promise.all([db.texts.where('bookId').equals(book.id).toArray(), db.translations.where('bookId').equals(book.id).toArray()]);
  const original = new Map(texts.map((t) => [t.chapterId, t.text]));
  const english = new Map(translations.map((t) => [t.chapterId, t.text]));
  const textOf = (cid: string) => (needsTranslation(data.book, original.get(cid)) ? english.get(cid) : undefined) ?? original.get(cid);
  const notes = catContext({
    question: q,
    world: worldAt(data, { line, spoilers: !!data.book.worldSpoilers }),
    line,
    chapters: data.chapters,
    textOf,
    current: now,
  });
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a friendly, slightly smug cat in a wizard hat, reading this novel alongside the reader. ' +
        'You are given notes and passages covering ONLY what the reader has read so far. Answer only from them. ' +
        'Never reveal, hint at or guess what comes later, and never use outside knowledge of this book, even if you know it. ' +
        'If the answer is not in what they have read, say they have not got there yet (or it has not come up), without hinting either way. ' +
        'Use the names as written in the notes. Answer in under 80 words.',
    },
    {
      role: 'user',
      content: `Book: ${book.title}\nThe reader has finished up to chapter ${line}${now && now.number > line ? ` and is partway through chapter ${now.number}` : ''}.\n\n${notes}\n\nQuestion: ${q}`,
    },
  ];
  const result = await chat(settings, model.id, messages);
  const spend = callCost(model, messages, result);
  await addSpend(book.id, spend.cost, spend.estimated);
  await db.settings.put({ key, value: { text: result.text, cost: spend.cost } });
  return { text: result.text, note: `This chat cost ${formatCost(spend.cost)}${spend.estimated ? ' (estimate)' : ''}.` };
}
