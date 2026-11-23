import { Check, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Empty, PageTitle, TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { formatDate, newId } from '../logic';
import { checkTheories } from '../mascot/theories';
import type { Note } from '../types';

/**
 * The Theory board (owner's pick, 2026-11-23: "cute, but don't overdo it"): write a guess about the story, sealed
 * with the chapter you're at; mark it yourself, or let the cat check all open ones in one short request.
 * Theories are notes of kind 'theory', so they back up and sync like highlights. #/theories/<book>[/<chapter>].
 */
export function TheoriesPage({ bookId, chapterId }: { bookId: string; chapterId?: string }) {
  const book = useLive(async () => (await db.books.get(bookId)) ?? null, [bookId], 'book');
  const chapters = useLive(() => db.chapters.where('bookId').equals(bookId).sortBy('number'), [bookId], 'book-chapters');
  const notes = useLive(() => db.notes.where('bookId').equals(bookId).toArray(), [bookId], 'book-notes');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  if (book === undefined) return <TopBar back={`book/${bookId}`} />;
  if (!book) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This book was deleted.</p>
      </>
    );
  }

  const list = chapters ?? [];
  const numberOf = new Map(list.map((c) => [c.id, c.number]));
  // The chapter a new theory is sealed with: the one it was written from, else the one last opened.
  const here = list.find((c) => c.id === chapterId) ?? list.find((c) => c.id === book.lastChapterId) ?? list[0];
  const theories = (notes ?? []).filter((n) => n.kind === 'theory').sort((a, b) => b.createdAt - a.createdAt);
  const open = theories.filter((t) => !t.verdict);
  const settled = theories.filter((t) => t.verdict);
  const right = settled.filter((t) => t.verdict === 'right').length;

  async function add() {
    const body = text.trim();
    if (!body || !here) return;
    const now = Date.now();
    await db.notes.add({ id: newId(), bookId, chapterId: here.id, kind: 'theory', body, createdAt: now, updatedAt: now });
    setText('');
  }

  async function mark(t: Note, verdict: Note['verdict']) {
    await db.notes.update(t.id, { verdict, settledChapter: verdict ? here?.number : undefined, updatedAt: Date.now() });
  }

  async function remove(t: Note) {
    if (confirm('Delete this theory?')) await db.notes.delete(t.id);
  }

  async function check() {
    setBusy(true);
    setStatus('The cat is reading your theories…');
    try {
      const r = await checkTheories(book!, theories);
      setStatus(`${r.settled ? `${r.settled} settled.` : 'Nothing settled yet: the story hasn’t answered them.'} ${r.note}`.trim());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'The cat could not check right now.');
    } finally {
      setBusy(false);
    }
  }

  const row = (t: Note) => (
    <li key={t.id} className={`theory${t.verdict ? ` ${t.verdict}` : ''}`}>
      <p className="theory-text">{t.body}</p>
      <p className="theory-meta">
        Written at chapter {numberOf.get(t.chapterId) ?? '?'} · {formatDate(t.createdAt)}
        {t.verdict && (
          <>
            {' · '}
            <b>{t.verdict === 'right' ? 'Came true' : 'Wrong'}</b>
            {t.settledChapter ? ` at chapter ${t.settledChapter}` : ''}
          </>
        )}
      </p>
      {t.catSays && <p className="theory-cat">“{t.catSays}”</p>}
      <div className="theory-actions">
        {t.verdict ? (
          <button type="button" className="link small" onClick={() => void mark(t, undefined)}>
            <RotateCcw size={14} /> Reopen
          </button>
        ) : (
          <>
            <button type="button" className="link small" onClick={() => void mark(t, 'right')}>
              <Check size={14} /> Came true
            </button>
            <button type="button" className="link small" onClick={() => void mark(t, 'wrong')}>
              <X size={14} /> Wrong
            </button>
          </>
        )}
        <button type="button" className="link small" aria-label="Delete theory" onClick={() => void remove(t)}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );

  return (
    <>
      <TopBar back={chapterId ? `chapter/${chapterId}` : `book/${bookId}`} title={book.title} />
      <main className="page theories-page">
        <PageTitle title="Theories" sub={settled.length ? `${right} of ${settled.length} came true` : 'Guess what happens next. The cat keeps score.'} />
        <form
          className="form theory-new"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label>
            Your theory
            <textarea rows={3} maxLength={400} value={text} placeholder="e.g. The kind mentor is hiding who he really is." onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row between">
            <span className="muted small">{here ? `Sealed with chapter ${here.number}` : 'Add chapters to this book first'}</span>
            <button type="submit" className="pill-btn small" disabled={!text.trim() || !here}>
              Save theory
            </button>
          </div>
        </form>

        {theories.length === 0 && <Empty title="No theories yet">Write a guess above. When the story answers it, mark it, or ask the cat.</Empty>}

        {open.length > 0 && (
          <section className="theory-group">
            <div className="section-head">
              <h2>Open</h2>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void check()}>
                {busy ? 'Checking…' : `Ask the cat to check ${open.length === 1 ? 'it' : `all ${open.length}`}`}
              </button>
            </div>
            <p className="muted small">One short AI request for all of them, from the chapters you’ve read only. Nothing runs unless you tap.</p>
            {status && (
              <p className="small" role="status">
                {status}
              </p>
            )}
            <ul className="theory-list">{open.map(row)}</ul>
          </section>
        )}

        {settled.length > 0 && (
          <section className="theory-group">
            <div className="section-head">
              <h2>Settled</h2>
              <span className="muted small">
                {right} came true · {settled.length - right} wrong
              </span>
            </div>
            <ul className="theory-list">{settled.map(row)}</ul>
          </section>
        )}
      </main>
    </>
  );
}
