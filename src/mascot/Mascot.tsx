import { useState } from 'react';
import { db } from '../db';
import { useLive } from '../hooks';
import { isRead, needsTranslation } from '../logic';
import { addSpend, callCost, loadSettings, modelFor } from '../translate/run';
import { chat } from '../translate/api';
import { formatCost, type ChatMessage } from '../translate/prompt';
import type { Book, Chapter, GlossaryEntry } from '../types';
import { moodFrom } from './mood';
import { lineFor } from './lines';
import { Wizard } from './Wizard';

/** A small, stable hash, used to remember answers. */
function hash(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

/** Only the chapters he may talk about: the ones the reader has finished. Later chapters never reach the model. */
function readExcerpts(chapters: Chapter[], texts: Map<string, string>, upTo: number): string {
  return chapters
    .filter((c) => isRead(c) && c.number <= upTo)
    .slice(-3)
    .map((c) => `Chapter ${c.number}: ${c.title}\n${(texts.get(c.id) ?? '').slice(0, 1500)}`)
    .join('\n\n');
}

export function Mascot({ book, chapter, chapters }: { book: Book; chapter: Chapter; chapters: Chapter[] }) {
  const sessions = useLive(() => db.sessions.toArray(), []);
  const mood = moodFrom(sessions ?? [], Date.now());
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ text: string; note: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    try {
      const settings = await loadSettings();
      const model = modelFor(settings, book.model);
      const readIds = chapters.filter(isRead).map((c) => c.id).join(',');
      const key = `wizard:${hash(`${book.id}|${readIds}|${q}|${model.id}`)}`;

      // The same question about the same reading is answered from memory, for free.
      const saved = (await db.settings.get(key))?.value as { text: string; cost?: number } | undefined;
      if (saved) {
        setAnswer({ text: saved.text, note: 'Remembered from before. Free.' });
        return;
      }
      if (!settings.apiKey.trim() || !settings.baseUrl.trim()) {
        setError('Add the provider address and API key in Settings to chat with him.');
        return;
      }

      const texts = new Map((await db.texts.toArray()).map((t) => [t.chapterId, t.text]));
      const translations = new Map((await db.translations.toArray()).map((t) => [t.chapterId, t.text]));
      const glossary: GlossaryEntry[] = (await db.glossary.where('bookId').equals(book.id).toArray()).filter((g) => g.status === 'ok');
      const readText = new Map<string, string>();
      for (const c of chapters.filter(isRead)) {
        const t = needsTranslation(book, texts.get(c.id)) ? translations.get(c.id) : undefined;
        readText.set(c.id, t ?? texts.get(c.id) ?? '');
      }
      const names = glossary.map((g) => `${g.english} (${g.original})`).join(', ');
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are a friendly wizard reading this novel alongside the reader. Use only the excerpts given. ' +
            'Never reveal or guess what comes after the excerpts. Answer in under 80 words.',
        },
        {
          role: 'user',
          content: `Book: ${book.title}\n${names ? `Names: ${names}\n` : ''}\nExcerpts from chapters already read:\n${readExcerpts(chapters, readText, chapter.number)}\n\nQuestion: ${q}`,
        },
      ];
      const result = await chat(settings, model.id, messages);
      const spend = callCost(model, messages, result);
      await addSpend(book.id, spend.cost, spend.estimated);
      await db.settings.put({ key, value: { text: result.text, cost: spend.cost } });
      setAnswer({ text: result.text, note: `This chat cost ${formatCost(spend.cost)}${spend.estimated ? ' (estimate)' : ''}.` });
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'He could not answer just now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mascot">
      <button type="button" className="mascot-btn" aria-label="Talk to the wizard" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Wizard mood={mood} size={56} />
      </button>
      {open && (
        <div className="mascot-bubble" role="dialog" aria-label="Wizard">
          <p>{lineFor(mood, chapter.id)}</p>
          {answer && (
            <>
              <p>{answer.text}</p>
              <p className="muted small">{answer.note}</p>
            </>
          )}
          {error && <p className="warn small">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask him about the story so far" disabled={busy} />
            <button type="submit" className="btn ghost" disabled={busy || !question.trim()}>
              {busy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
