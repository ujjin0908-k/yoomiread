import { useState } from 'react';
import type { Book, Chapter } from '../types';
import { askTheCat } from './ask';
import { useMood } from './useMood';
import { lineFor } from './lines';
import { Wizard } from './Wizard';
import { retryTranslation, wantsRetry } from './retry';

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
      setAnswer(await askTheCat({ book, chapter, question: q }));
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
