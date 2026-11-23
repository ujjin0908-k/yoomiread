import { AI_OFF_FOR_FAN_WORK, aiAllowedFor } from '../import/ao3Book';
import { useState } from 'react';
import { db } from '../db';
import { isRead, needsTranslation } from '../logic';
import { addSpend, callCost, aiReady, loadSettings, modelFor } from '../translate/run';
import { chat } from '../translate/api';
import { formatCost, type ChatMessage } from '../translate/prompt';
import type { Book, Chapter } from '../types';
import { loadWorldData } from '../world/load';
import { worldAt } from '../world/visible';
import { catContext, catLine } from './askContext';
import { useMood } from './useMood';
import { lineFor } from './lines';
import { Wizard } from './Wizard';
import { retryTranslation, wantsRetry } from './retry';

/** A small, stable hash, used to remember answers. */
function hash(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

export function Mascot({ book, chapter, away }: { book: Book; chapter: Chapter; away?: boolean }) {
  const { mood = 'idle', trouble } = useMood();
  const [open, setOpen] = useState(false);
  const [poked, setPoked] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ text: string; note: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    const q = question.trim();
    if (!q) return;
    // "Retry", "translate it again", "use the other model": he does it himself, no chat needed.
    if (wantsRetry(q)) {
      setError('');
      setQuestion('');
      const { now, later } = await retryTranslation({ book, current: chapter, trouble, message: q });
      setAnswer({ text: now, note: later ? 'Translating in the background. You can keep reading or close this.' : '' });
      if (later) void later.then((text) => setAnswer({ text, note: '' }));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const settings = await loadSettings();
      const model = modelFor(settings, book.model);
      // Read fresh: how far I am in this chapter changes while the bubble is open.
      const data = await loadWorldData(book.id);
      if (!data) return;
      const now = data.chapters.find((c) => c.id === chapter.id) ?? chapter;
      const line = catLine(data.chapters, data.book.startLine);
      const readIds = data.chapters.filter(isRead).map((c) => c.id).join(',');
      const at = isRead(now) ? 1 : Math.round((now.position ?? 0) * 20) / 20;
      const key = `wizard:${hash(`${book.id}|${readIds}|${now.id}@${at}|${q}|${model.id}`)}`;

      // The same question about the same reading is answered from memory, for free.
      const saved = (await db.settings.get(key))?.value as { text: string; cost?: number } | undefined;
      if (saved) {
        setAnswer({ text: saved.text, note: 'Remembered from before. Free.' });
        return;
      }
      if (!aiReady(settings)) {
        setError('Set up AI in Settings first to chat with him.');
        return;
      }
      if (!aiAllowedFor(book)) {
        setError(AI_OFF_FOR_FAN_WORK);
        return;
      }

      // Only this book's text, in the language I read it in.
      const [texts, translations] = await Promise.all([db.texts.where('bookId').equals(book.id).toArray(), db.translations.where('bookId').equals(book.id).toArray()]);
      const original = new Map(texts.map((t) => [t.chapterId, t.text]));
      const english = new Map(translations.map((t) => [t.chapterId, t.text]));
      const textOf = (id: string) => (needsTranslation(data.book, original.get(id)) ? english.get(id) : undefined) ?? original.get(id);
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
          content: `Book: ${book.title}\nThe reader has finished up to chapter ${line}${now.number > line ? ` and is partway through chapter ${now.number}` : ''}.\n\n${notes}\n\nQuestion: ${q}`,
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
    // He steps aside with the bars while reading, unless his bubble is open or he is cross about something.
    <div className={`mascot${away && !open && mood !== 'angry' ? ' away' : ''}`}>
      <button
        type="button"
        className={`mascot-btn${poked ? ' poked' : ''}`}
        aria-label="Talk to the cat"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setPoked(true);
        }}
        onAnimationEnd={(e) => e.target === e.currentTarget && setPoked(false)}
      >
        <Wizard mood={mood} size={112} sly={open && (busy || !!answer) && mood !== 'angry'} />
      </button>
      {open && (
        <div className="mascot-bubble" role="dialog" aria-label="The cat">
          <p>{lineFor(mood, chapter.id, trouble)}</p>
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
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about the story, or say “retry”" disabled={busy} />
            <button type="submit" className="btn ghost" disabled={busy || !question.trim()}>
              {busy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
