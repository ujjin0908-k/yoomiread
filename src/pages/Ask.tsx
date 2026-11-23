import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Cover, Empty, PageTitle, TabBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { motionOk } from '../motion';
import { askTheCat } from '../mascot/ask';
import { bareTitle, leftOff, type LeftOff } from '../mascot/leftOff';
import type { Book } from '../types';

/** Questions to start from, for someone who does not know what to ask. */
const STARTERS = ['What just happened?', 'Who are the main people?', 'Where are we now?', 'What is everyone after?'];

/** The books worth asking about: ones I have opened or am reading, most recently read first. Book rows only. */
async function booksToAsk(): Promise<Book[]> {
  const books = await db.books.toArray();
  return books
    .filter((b) => b.lastChapterId || b.shelf === 'reading')
    .sort((a, b) => (b.lastReadAt ?? b.updatedAt) - (a.lastReadAt ?? a.updatedAt));
}

interface Turn {
  q: string;
  a?: string;
  note?: string;
  error?: boolean;
}

/** This visit's conversation per book, so leaving the tab and coming back keeps it. */
const talks = new Map<string, Turn[]>();
let lastBook: string | undefined;

const cat = (pose: string) => `/mascot/cat-${pose}.${motionOk() ? 'gif' : 'png'}`;

/**
 * The Ask tab: talk to the cat about a book. He only knows what I have read (src/mascot/askContext.ts), and he
 * remembers where I left off. Opening the tab reads book rows only; the rest loads for the one book shown.
 */
export function Ask() {
  const books = useLive(booksToAsk, [], 'ask-books');
  const [bookId, setBookId] = useState<string | undefined>(lastBook);
  const book = books?.find((b) => b.id === bookId) ?? books?.[0];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [where, setWhere] = useState<LeftOff>();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!book) return;
    lastBook = book.id;
    setTurns(talks.get(book.id) ?? []);
    setWhere(undefined);
    let live = true;
    void leftOff(book).then((w) => live && setWhere(w));
    return () => {
      live = false;
    };
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ block: 'nearest', behavior: motionOk() ? 'smooth' : 'auto' });
  }, [turns.length, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!book || !q || busy) return;
    const id = book.id;
    const add = (t: Turn[]) => {
      talks.set(id, t);
      if (lastBook === id) setTurns(t);
    };
    const before = talks.get(id) ?? [];
    add([...before, { q }]);
    setQuestion('');
    setBusy(true);
    try {
      const { text: a, note } = await askTheCat({ book, question: q });
      add([...before, { q, a, note }]);
    } catch (e) {
      add([...before, { q, a: e instanceof Error ? e.message : 'He could not answer just now.', error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <main className="page tabs-page ask-page">
        <PageTitle title="Ask" sub="The cat has read what you’ve read. Nothing more." />
        {books && !books.length ? (
          <Empty title="Nothing to ask about yet">Open a book and start reading. The cat reads along with you.</Empty>
        ) : (
          <>
            {books && books.length > 1 && (
              <div className="ask-shelf" role="radiogroup" aria-label="Which book">
                {books.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={b.id === book?.id} className={b.id === book?.id ? 'on' : ''} onClick={() => setBookId(b.id)}>
                    <Cover book={b} size="xs" />
                    <span>{b.title}</span>
                  </button>
                ))}
              </div>
            )}

            {book && (
              <section className="ask-chat" aria-live="polite">
                <div className="ask-turn cat">
                  <img className="ask-face" src={cat(busy ? 'working' : 'sly')} alt="" width={96} height={96} draggable={false} />
                  <div className="ask-bubble">
                    <p>
                      {where?.chapter
                        ? `You’re in chapter ${where.chapter.number}${bareTitle(where.chapter) ? `, “${bareTitle(where.chapter)}”` : ''} of ${book.title}.`
                        : `Ask me anything about ${book.title}.`}
                      {where?.daysAway && where.daysAway > 1 ? ` It’s been ${where.daysAway} days.` : ''}
                    </p>
                    {where && (where.soFar || where.moments.length > 0) && (
                      <p className="ask-sofar">{where.soFar ?? `${where.moments.join('. ')}.`}</p>
                    )}
                    <a className="ask-link" href={`#/world/${book.id}/recap`}>
                      Full recap
                    </a>
                  </div>
                </div>

                {turns.map((t, i) => (
                  <div key={i} className="ask-pair">
                    <div className="ask-turn me">
                      <p className="ask-bubble">{t.q}</p>
                    </div>
                    {t.a !== undefined ? (
                      <div className="ask-turn cat">
                        <span className="ask-face-gap" aria-hidden="true" />
                        <div className={`ask-bubble${t.error ? ' warn' : ''}`}>
                          <p>{t.a}</p>
                          {t.note && <p className="ask-note">{t.note}</p>}
                        </div>
                      </div>
                    ) : (
                      <div className="ask-turn cat">
                        <span className="ask-face-gap" aria-hidden="true" />
                        <p className="ask-bubble ask-typing">
                          <span />
                          <span />
                          <span />
                          <span className="sr-only">The cat is thinking</span>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={end} />
              </section>
            )}

            {book && (
              <div className="ask-bottom">
                {!turns.length && (
                  <div className="ask-starters">
                    {STARTERS.map((s) => (
                      <button key={s} type="button" onClick={() => void ask(s)} disabled={busy}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  className="ask-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(question);
                  }}
                >
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who is this again?" aria-label={`Ask about ${book.title}`} enterKeyHint="send" />
                  <button type="submit" aria-label="Ask" disabled={busy || !question.trim()}>
                    <ArrowUp size={20} />
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </main>
      <TabBar active="ask" />
    </>
  );
}
