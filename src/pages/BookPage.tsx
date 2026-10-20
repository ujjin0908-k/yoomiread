import { ChevronRight, ImagePlus, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Cover, ProgressBar, Sheet, Stars, TopBar } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { shrinkImage } from '../images';
import {
  SHELVES,
  bookProgress,
  continueChapter,
  finishBook,
  formatDate,
  moveToShelf,
  newId,
  nextChapterNumber,
  progress,
} from '../logic';
import type { Book, Shelf } from '../types';

export function BookPage({ id, sub }: { id: string; sub?: string }) {
  const book = useLive(() => db.books.get(id), [id]);
  const chapters = useLive(() => db.chapters.where('bookId').equals(id).sortBy('number'), [id]);
  const notes = useLive(() => db.notes.where('bookId').equals(id).toArray(), [id]);
  const [addingChapter, setAddingChapter] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const finishing = sub === 'finish';

  if (book === undefined) return <TopBar back="library" />;
  if (!book) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This book was deleted.</p>
      </>
    );
  }

  const list = chapters ?? [];
  const p = progress(list);
  const pct = bookProgress(book, list);
  const next = continueChapter(book, list);
  const notesFor = (chapterId: string) => (notes ?? []).filter((n) => n.chapterId === chapterId).length;
  const highlights = (notes ?? []).filter((n) => n.kind === 'highlight').length;

  async function setShelf(shelf: Shelf) {
    if (shelf === 'finished') return go(`book/${id}/finish`);
    await db.books.put(moveToShelf(book!, shelf));
  }

  async function changeCover(file: File) {
    await db.books.update(id, { cover: await shrinkImage(file), updatedAt: Date.now() });
  }

  async function remove() {
    if (!confirm(`Delete "${book!.title}" with all its chapters and notes?`)) return;
    await db.deleteBook(id);
    go('library');
  }

  const facts: [string, string][] = [
    ['Author', book.author],
    ['Original', book.originalTitle ?? ''],
    ['Language', book.language === 'zh' ? 'Chinese' : book.language === 'en' ? 'English' : 'Other'],
    ['Started', formatDate(book.startedAt)],
    ['Finished', formatDate(book.finishedAt)],
    ['Chapters', p.total ? `${p.read} of ${p.total} read` : ''],
    ['Highlights', highlights ? String(highlights) : ''],
  ];

  return (
    <>
      <TopBar
        back="library"
        title={SHELVES.find((s) => s.id === book.shelf)?.label}
        right={
          <label className="round-btn" aria-label="Change cover">
            <ImagePlus size={18} />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void changeCover(f);
                e.target.value = '';
              }}
            />
          </label>
        }
      />
      <main className="page">
        <section className="book-hero">
          <Cover book={book} shape="arch" size="lg" />
          <h1 lang={book.language === 'zh' ? 'zh' : undefined}>{book.title}</h1>
          {book.shelf === 'finished' && book.rating ? <Stars value={book.rating} /> : null}
          {book.shelf !== 'finished' && list.length > 0 && (
            <div className="hero-progress">
              <ProgressBar value={pct} label="Book progress" />
              <span className="small muted">{Math.round(pct * 100)}%</span>
            </div>
          )}
        </section>

        {sub === 'scanned' && (
          <div className="card warn-card">
            This PDF is made of scanned pictures, so there is no text to read yet. The cover was saved. Text recognition
            (OCR) is planned.
          </div>
        )}

        <dl className="facts">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd lang={k === 'Original' ? 'zh' : undefined}>{v}</dd>
              </div>
            ))}
        </dl>

        <div className="actions">
          {next && (
            <button type="button" className="pill-btn" onClick={() => go(`chapter/${next.id}`)}>
              <span>{book.lastChapterId ? 'Continue Reading' : 'Start Reading'}</span>
              <ChevronRight size={18} />
            </button>
          )}
          <label className="select-pill">
            <span className="sr-only">Shelf</span>
            <select value={book.shelf} onChange={(e) => void setShelf(e.target.value as Shelf)}>
              {SHELVES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {book.shelf === 'finished' ? (
          <section className="card review-card">
            <div className="section-head">
              <h2>My review</h2>
              <button type="button" className="link" onClick={() => setEditingReview(true)}>
                Edit
              </button>
            </div>
            {book.review ? <p className="review">{book.review}</p> : <p className="muted">No review written.</p>}
          </section>
        ) : (
          <button type="button" className="btn ghost wide" onClick={() => go(`book/${id}/finish`)}>
            I finished this book
          </button>
        )}

        <section>
          <div className="section-head">
            <h2>Chapters</h2>
            <button type="button" className="link" onClick={() => setAddingChapter(true)}>
              <Plus size={16} /> Chapter
            </button>
          </div>
          {chapters && chapters.length === 0 && (
            <p className="muted">Add chapters to leave comments and highlight lines.</p>
          )}
          <ul className="chapter-list">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={c.read ? 'check on' : 'check'}
                  aria-label={c.read ? `Mark ${c.title} unread` : `Mark ${c.title} read`}
                  onClick={() => void db.chapters.update(c.id, { read: !c.read })}
                >
                  {c.read ? '✓' : ''}
                </button>
                <a href={`#/chapter/${c.id}`} className="chapter-link">
                  <span className="chapter-name">
                    <span className="muted">{c.number}</span>
                    <span lang={book.language === 'zh' ? 'zh' : undefined}>{c.title}</span>
                  </span>
                  {notesFor(c.id) > 0 && (
                    <span className="chip">
                      <MessageCircle size={12} /> {notesFor(c.id)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="btn danger wide" onClick={() => void remove()}>
          <Trash2 size={16} /> Delete book
        </button>
      </main>

      {addingChapter && (
        <AddChapter bookId={id} next={nextChapterNumber(list)} onClose={() => setAddingChapter(false)} />
      )}
      {(finishing || editingReview) && (
        <FinishSheet
          book={book}
          onClose={() => {
            setEditingReview(false);
            if (finishing) go(`book/${id}`);
          }}
        />
      )}
    </>
  );
}

function FinishSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const [rating, setRating] = useState(book.rating ?? 0);
  const [review, setReview] = useState(book.review ?? '');
  // A book saved straight to the Read shelf has no rating yet: that is still "finishing".
  const already = book.shelf === 'finished' && book.rating !== undefined;

  async function save() {
    const next = already
      ? { ...finishBook(book, rating, review), finishedAt: book.finishedAt }
      : finishBook(book, rating, review);
    await db.books.put(next);
    onClose();
  }

  return (
    <Sheet title={already ? 'Edit review' : 'Finished!'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (rating) void save();
        }}
      >
        <div className="rating-pick">
          <Cover book={book} size="sm" />
          <span className="serif">How was it?</span>
          <Stars value={rating} onChange={setRating} />
          <span className="muted small">{rating ? `${rating} / 5 · tap a star again for half` : 'Tap to rate'}</span>
        </div>
        <label>
          Review
          <textarea
            rows={7}
            placeholder="What stayed with you? Favorite characters, the ending, would you reread it?"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </label>
        <button className="pill-btn" type="submit" disabled={!rating}>
          <span>Save to my read list</span>
        </button>
      </form>
    </Sheet>
  );
}

function AddChapter({ bookId, next, onClose }: { bookId: string; next: number; onClose: () => void }) {
  const [number, setNumber] = useState(next);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function save() {
    await db.chapters.add({
      id: newId(),
      bookId,
      number,
      title: title.trim() || `Chapter ${number}`,
      text: text.trim() ? text.replace(/\r\n/g, '\n') : undefined,
      read: false,
      createdAt: Date.now(),
    });
    await db.books.update(bookId, { updatedAt: Date.now() });
    onClose();
  }

  return (
    <Sheet title="Add chapter" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="row-2">
          <label>
            Number
            <input type="number" min={1} value={number} onChange={(e) => setNumber(Number(e.target.value) || 1)} />
          </label>
          <label>
            Title
            <input value={title} placeholder={`Chapter ${number}`} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label>
          Text <span className="muted small">(optional: paste it to highlight lines)</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="pill-btn" type="submit">
          <span>Add chapter</span>
        </button>
      </form>
    </Sheet>
  );
}
