import { db } from '../db';
import { needsTranslation, titleOf } from '../logic';
import { loadSettings, modelFor, translateChapter } from '../translate/run';
import type { Book, Chapter, TranslateSettings } from '../types';
import type { Trouble } from './mood';

/**
 * Asking the cat to translate again: "retry", "translate it again", "redo it with the other model". He does it
 * himself, in the background, with no chat (so it costs only the translation). Which chapter: the one that went
 * wrong, else the one open.
 */

/** True when a message to the cat asks for a translation to be done again (not a question about the story). */
export function wantsRetry(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (m.length > 80) return false;
  return /\b(re-?try|re-?translate|re-?do|try (it |that |this )?again|translate (it|this|that|the chapter|chapter \d+)( again)?|fix (it|the translation)|again)\b/.test(m);
}

/** True when the message asks for the other model ("other model", "different model", "another model"). */
export function wantsOtherModel(message: string): boolean {
  return /\b(other|different|another|second) model\b/i.test(message);
}

/** The model to use: the book's, or another one when asked for. */
export function pickModel(settings: TranslateSettings, bookModel: string | undefined, other: boolean): string {
  const current = modelFor(settings, bookModel).id;
  if (!other) return current;
  return settings.models.find((m) => m.id !== current)?.id ?? current;
}

/** Translations he is doing now, by chapter, so asking twice does not start it twice. */
const jobs = new Map<string, Promise<string>>();

/**
 * Starts the translation in the background. Returns what he says now, and a promise of what he says when it is
 * done (or why it failed).
 */
export async function retryTranslation(input: { book: Book; current: Chapter; trouble?: Trouble; message: string }): Promise<{ now: string; later?: Promise<string> }> {
  const settings = await loadSettings();
  if (!settings.apiKey.trim() || !settings.baseUrl.trim()) return { now: 'I would, but there is no API key in Settings yet.' };
  const target = (input.trouble?.chapterId && ((await db.chapters.get(input.trouble.chapterId)) as Chapter | undefined)) || input.current;
  const book = target.bookId === input.book.id ? input.book : ((await db.books.get(target.bookId)) as Book | undefined) ?? input.book;
  const text = (await db.texts.get(target.id))?.text;
  if (!text) return { now: `"${titleOf(target)}" has no text for me to translate.` };
  if (!needsTranslation(book, text)) return { now: `"${titleOf(target)}" is already in English. Nothing to translate.` };
  const running = jobs.get(target.id);
  if (running) return { now: `Patience! I am already on "${titleOf(target)}".`, later: running };

  const other = wantsOtherModel(input.message);
  const model = pickModel(settings, book.model, other);
  const label = settings.models.find((m) => m.id === model)?.label ?? model;
  const job = translateChapter(target, { settings, model })
    .then(() => `Done! "${titleOf(target)}" is translated${other ? ` with ${label}` : ''}. Open it whenever you like.`)
    .catch((e) => `It failed again: ${e instanceof Error ? e.message : 'the translator said no'}. ${other ? '' : 'Say "try the other model" and I will.'}`.trim())
    .finally(() => jobs.delete(target.id));
  jobs.set(target.id, job);
  return { now: `*cracks knuckles* On it: translating "${titleOf(target)}" again${other ? ` with ${label}` : ''}, in the background. Keep reading.`, later: job };
}
