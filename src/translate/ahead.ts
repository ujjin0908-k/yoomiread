import { useEffect, useState } from 'react';
import { db } from '../db';
import { needsTranslation } from '../logic';
import type { Book, Chapter } from '../types';
import { loadSettings, modelFor, translateChapter } from './run';

/**
 * While a chapter is open, translates the next few chapters in the background and saves them,
 * so turning the page shows English at once. Stops when the reader leaves the chapter.
 * Returns a short status line to show while it works.
 */
export function useTranslateAhead(chapter: Chapter | null | undefined, book: Book | undefined): string {
  const [status, setStatus] = useState('');
  const chapterId = chapter?.id;
  const bookId = book?.id;
  const bookModel = book?.model;

  useEffect(() => {
    if (!chapterId || !bookId || !needsTranslation(book)) return;
    const controller = new AbortController();
    void (async () => {
      const settings = await loadSettings();
      const count = settings.ahead ?? 1;
      if (count <= 0 || !settings.apiKey.trim() || !settings.baseUrl.trim()) return;
      const current = await db.chapters.get(chapterId);
      if (!current) return;
      const next = (await db.chapters.where('bookId').equals(bookId).sortBy('number')).filter((c) => c.number > current.number).slice(0, count);
      const model = modelFor(settings, bookModel).id;
      for (const c of next) {
        if (controller.signal.aborted) return;
        if (await db.translations.get(c.id)) continue;
        if (!(await db.texts.get(c.id))?.text) continue;
        setStatus(`Translating chapter ${c.number} in the background…`);
        try {
          await translateChapter(c, { settings, model, signal: controller.signal });
        } catch {
          // Stopped, or the provider failed: the chapter is simply translated when it is opened.
          break;
        }
      }
      if (!controller.signal.aborted) setStatus('');
    })();
    return () => {
      controller.abort();
      setStatus('');
    };
  }, [chapterId, bookId, bookModel, book?.language]);

  return status;
}
