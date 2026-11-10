import { useSyncExternalStore } from 'react';
import { db } from '../db';
import { needsTranslation } from '../logic';
import { loadSettings, modelFor, translateChapter } from './run';

/** How a "translate the first chapters" run is going for one book. Kept in memory only. */
export interface ImportJob {
  done: number;
  total: number;
  /** Set when it stopped early, with the reason in plain words. */
  failed?: string;
  finished: boolean;
}

const jobs = new Map<string, ImportJob>();
const listeners = new Set<() => void>();

function set(bookId: string, job: ImportJob): void {
  jobs.set(bookId, job);
  for (const l of listeners) l();
}

/** The run for this book, if one was started since the app was opened. */
export function useImportJob(bookId: string): ImportJob | undefined {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => jobs.get(bookId),
  );
}

/**
 * Right after a book is added: translates its first chapters in the background, one after another so the
 * story summary carries forward. Does nothing for English books, with no key set, offline, or when the
 * setting is Off. It keeps going while you move around the app; closing the app stops it.
 */
export async function translateFirstChapters(bookId: string): Promise<void> {
  if (jobs.get(bookId) && !jobs.get(bookId)!.finished) return;
  const settings = await loadSettings();
  const count = settings.onImport ?? 3;
  if (count <= 0 || !settings.apiKey.trim() || !settings.baseUrl.trim()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const book = await db.books.get(bookId);
  if (!book || !needsTranslation(book)) return;

  const first = (await db.chapters.where('bookId').equals(bookId).sortBy('number')).slice(0, count);
  const todo = [];
  for (const c of first) {
    if (await db.translations.get(c.id)) continue;
    const text = (await db.texts.get(c.id))?.text;
    if (text && needsTranslation(book, text)) todo.push(c);
  }
  if (!todo.length) return;

  const model = modelFor(settings, book.model).id;
  set(bookId, { done: 0, total: todo.length, finished: false });
  for (let i = 0; i < todo.length; i++) {
    try {
      await translateChapter(todo[i], { settings, model });
      set(bookId, { done: i + 1, total: todo.length, finished: i + 1 === todo.length });
    } catch (e) {
      set(bookId, { done: i, total: todo.length, finished: true, failed: e instanceof Error ? e.message : 'The provider did not answer.' });
      return;
    }
  }
}
