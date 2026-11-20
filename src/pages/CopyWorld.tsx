import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { needsTranslation } from '../logic';
import type { Book, Chapter } from '../types';
import { copyWorld, latestRecap, passageFrom, sameNovel, sampleFrom, worldSources, type CopyResult } from '../world/copyWorld';

/**
 * "Copy the world" sheet: pick the book to copy from (the same novel first), check the style sample and the story so
 * far, and copy. The book copied from is only read.
 */
export function CopyWorld({ book, onClose }: { book: Book; onClose: () => void }) {
  const [sources, setSources] = useState<{ book: Book; names: number }[]>();
  const [fromId, setFromId] = useState('');
  const [chinese, setChinese] = useState(needsTranslation(book));
  const [sample, setSample] = useState('');
  const [sampleChapter, setSampleChapter] = useState<Chapter>();
  const [story, setStory] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<CopyResult>();

  useEffect(() => {
    void worldSources(book).then((list) => {
      setSources(list);
      if (list[0]) setFromId(list[0].book.id);
    });
  }, [book]);

  // A fresh suggestion for the sample and the story so far whenever the book to copy from changes.
  useEffect(() => {
    if (!fromId) return;
    let live = true;
    void Promise.all([sampleFrom(fromId), latestRecap(fromId)]).then(([s, recap]) => {
      if (!live) return;
      setSample(book.style?.sample || s.text);
      setSampleChapter(book.style?.sample ? undefined : s.chapter);
      setStory(book.storySoFar || recap || '');
    });
    return () => {
      live = false;
    };
  }, [fromId, book.style?.sample, book.storySoFar]);

  async function anotherPassage() {
    const chapters = (await db.chapters.where('bookId').equals(fromId).toArray()) as Chapter[];
    const withText = chapters.filter((c) => c.length && c.length > 2000);
    for (let tries = 0; tries < 8 && withText.length; tries++) {
      const c = withText[Math.floor(Math.random() * withText.length)];
      const text = (await db.texts.get(c.id))?.text ?? '';
      const passage = passageFrom(text);
      if (passage.length > 300) {
        setSample(passage);
        setSampleChapter(c);
        return;
      }
    }
  }

  async function copy() {
    setBusy('Copying…');
    setError('');
    try {
      setDone(await copyWorld(fromId, book.id, { sample, storySoFar: story, chinese }));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Could not copy the world.');
    } finally {
      setBusy('');
    }
  }

  const from = sources?.find((s) => s.book.id === fromId);

  return (
    <Sheet title="Copy the world" locked={!!busy} onClose={onClose}>
      <div className="form">
        {done ? (
          <>
            <p className="small" role="status">
              <b>Done.</b> {done.names} names copied
              {done.matched ? ` (${done.matched} were here already)` : ''}, {done.links} links and {done.events} events.
              {chinese ? ` ${done.chinese} names got their Chinese from the guide, and the guide added ${done.fromGuide} more.` : ''}
            </p>
            <p className="muted small">
              {from?.book.title} was not changed. The style sample and the story so far are saved with this book; change them later in this book's
              details.
            </p>
            <button type="button" className="pill-btn" onClick={onClose}>
              <span>Close</span>
            </button>
          </>
        ) : sources === undefined ? (
          <p className="muted small">Looking for books with a world…</p>
        ) : !sources.length ? (
          <p className="muted small">No other book here has a glossary to copy.</p>
        ) : (
          <>
            <p className="muted small">
              The cast, places, gods, groups, terms, links, events and pictures of another book are copied into <b>{book.title}</b>. The other book
              stays as it is.
            </p>
            <label>
              Copy from
              <select value={fromId} disabled={!!busy} onChange={(e) => setFromId(e.target.value)}>
                {sources.map((s) => (
                  <option key={s.book.id} value={s.book.id}>
                    {s.book.title} · {s.names} names{sameNovel(book, s.book) ? ' · same novel' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="row small">
              <input type="checkbox" className="switch" checked={chinese} disabled={!!busy} onChange={(e) => setChinese(e.target.checked)} />
              <span>Add the Chinese names from the book's guide, so the translator finds them in the Chinese text</span>
            </label>
            <label>
              Style sample{' '}
              <span className="muted small">
                (the translator matches its rhythm and words{sampleChapter ? `; from ${sampleChapter.title}` : ''})
              </span>
              <textarea rows={7} value={sample} disabled={!!busy} onChange={(e) => setSample(e.target.value)} />
            </label>
            <button type="button" className="btn ghost wide" disabled={!!busy || !fromId} onClick={() => void anotherPassage()}>
              Take another passage
            </button>
            <label>
              The story so far <span className="muted small">(before this book's first chapter; used until a translated chapter has its own)</span>
              <textarea rows={5} value={story} disabled={!!busy} placeholder="Optional: a few lines on where the story stands." onChange={(e) => setStory(e.target.value)} />
            </label>
            {!story && (
              <p className="muted small">
                Tip: on {from?.book.title ?? 'the other book'}, The world → Recap → Ask the cat (Longer) writes one; it is picked up here next time.
              </p>
            )}
            {error && <p className="warn small">{error}</p>}
            <button type="button" className="pill-btn" disabled={!!busy || !fromId} onClick={() => void copy()}>
              <Copy size={18} />
              <span>{busy || 'Copy the world'}</span>
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
