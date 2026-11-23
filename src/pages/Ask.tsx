import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Cover, Empty, PageTitle, TabBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { isRead } from '../logic';
import { motionOk } from '../motion';
import { askTheCat } from '../mascot/ask';
import type { Book } from '../types';
import { loadWorldData, worldOf } from '../world/load';
import { freeRecap, type FreeRecap } from '../world/recap';

/** Questions to start from, for someone who does not know what to ask. */
const STARTERS = ['Remind me what just happened', 'Who are the main people so far?', 'Where are we right now?', 'What is everyone after?'];

/** The books I am in the middle of, most recently read first: the ones worth asking about. */
async function booksToAsk(): Promise<{ book: Book; read: number }[]> {
  const books = await db.books.toArray();
  const out: { book: Book; read: number }[] = [];
  for (const book of books) {
    const read = (await db.chapters.where('bookId').equals(book.id).toArray()).filter(isRead).length;
    if (read || book.lastChapterId || book.shelf === 'reading') out.push({ book, read });
  }
  return out.sort((a, b) => (b.book.lastReadAt ?? b.book.updatedAt) - (a.book.lastReadAt ?? a.book.updatedAt));
}

/**
 * The Ask tab: the cat answers about any book I am reading, from what I have read only, and reminds me where each
 * book stands ("Previously on…", the free part, built on the phone from what is saved).
 */
export function Ask() {
  const books = useLive(booksToAsk, [], 'ask-books');
  const [bookId, setBookId] = useState<string>();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ text: string; note: string; q: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const book = books?.find((b) => b.book.id === bookId)?.book ?? books?.[0]?.book;

  async function ask(q: string) {
    if (!book || !q.trim()) return;
    setBusy(true);
    setError('');
    setAnswer(undefined);
    try {
      setAnswer({ ...(await askTheCat({ book, question: q.trim() })), q: q.trim() });
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'He could not answer just now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="page tabs-page ask-page">
        <PageTitle title="Ask the cat" sub="About anything you’ve read. Never a spoiler." />
        {books && !books.length ? (
          <Empty title="Nothing to ask about yet">Start reading a book, and the cat will read along with you.</Empty>
        ) : (
          <>
            <section className="card ask-card">
              <div className="ask-top">
                <img className="ask-cat" src={`/mascot/cat-sly.${motionOk() ? 'gif' : 'png'}`} alt="" width={76} height={76} draggable={false} />
                <label className="ask-book">
                  <span className="muted small">Which book?</span>
                  <select
                    value={book?.id ?? ''}
                    onChange={(e) => {
                      setBookId(e.target.value);
                      setAnswer(undefined);
                      setError('');
                    }}
                  >
                    {(books ?? []).map(({ book: b }) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <form
                className="ask-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(question);
                }}
              >
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who is this again?" disabled={busy || !book} />
                <button type="submit" className="btn" disabled={busy || !question.trim() || !book}>
                  {busy ? '…' : 'Ask'}
                </button>
              </form>
              {!answer && !busy && (
                <div className="folder-chips ask-starters">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => void ask(s)} disabled={!book}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {busy && <p className="muted small ask-answer">The cat is flipping back through the pages…</p>}
              {answer && (
                <div className="ask-answer">
                  <p className="muted small">“{answer.q}”</p>
                  <p>{answer.text}</p>
                  {answer.note && <p className="muted small">{answer.note}</p>}
                </div>
              )}
              {error && <p className="warn small ask-answer">{error}</p>}
            </section>

            {books && books.length > 0 && (
              <section className="ask-recaps">
                <div className="section-head">
                  <h2>Pick up where you left off</h2>
                </div>
                {books.slice(0, 5).map(({ book: b }) => (
                  <RecapCard key={b.id} book={b} />
                ))}
              </section>
            )}
          </>
        )}
      </main>
      <TabBar active="ask" />
    </>
  );
}

/** One book's "Previously on…", the free part: the story so far, or the latest big moments, up to where I am. */
function RecapCard({ book }: { book: Book }) {
  const [recap, setRecap] = useState<FreeRecap | null>();
  useEffect(() => {
    let live = true;
    void (async () => {
      const data = await loadWorldData(book.id);
      const r = data ? await freeRecap(data, worldOf(data)) : undefined;
      if (live) setRecap(r ?? null);
    })();
    return () => {
      live = false;
    };
  }, [book.id]);
  if (recap === undefined) return null;
  // Many chapter titles carry their own number ("6. The Cowardly Lion"): shown once.
  const title = (recap?.chapter?.titleEn ?? recap?.chapter?.title ?? '').replace(/^\s*(?:chapter\s*)?\d+\s*[.:\-–—]?\s*/i, '');
  const where = recap?.chapter ? `Ch. ${recap.chapter.number}${title ? ` · ${title}` : ''}` : 'Not started';
  // The story so far from a translation, or else the latest big moments, oldest first so they read as a story.
  const told = recap?.soFar?.text ?? (recap?.events.length ? [...recap.events].reverse().map((e) => e.title.replace(/[.!]$/, '')).join('. ') + '.' : '');
  return (
    <article className="card ask-recap">
      <a className="ask-recap-head" href={`#/book/${book.id}`}>
        <Cover book={book} size="xs" />
        <span>
          <strong>{book.title}</strong>
          <span className="muted small">
            {where}
            {recap?.daysAway ? ` · ${recap.daysAway === 1 ? 'yesterday' : `${recap.daysAway} days ago`}` : ''}
          </span>
        </span>
      </a>
      {told ? <p className="small ask-told">{told.length > 320 ? `${told.slice(0, 320).trimEnd()}…` : told}</p> : <p className="muted small">No recap yet: it fills in as you read and translate.</p>}
      <a className="link small ask-more" href={`#/world/${book.id}/recap`}>
        Full recap <ChevronRight size={14} />
      </a>
    </article>
  );
}
