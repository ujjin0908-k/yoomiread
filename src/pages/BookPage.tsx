import { useState } from 'react';
import { Header, Sheet, Stars } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { SHELVES, finishBook, formatDate, moveToShelf, newId, nextChapterNumber, progress } from '../logic';
import type { Book, Shelf } from '../types';

export function BookPage({ id, finishing }: { id: string; finishing: boolean }) {
  const book = useLive(() => db.books.get(id), [id]);
  const chapters = useLive(() => db.chapters.where('bookId').equals(id).sortBy('number'), [id]);
  const notes = useLive(() => db.notes.where('bookId').equals(id).toArray(), [id]);
  const [addingChapter, setAddingChapter] = useState(false);
  const [editingReview, setEditingReview] = useState(false);

  if (book === undefined) return <Header title="" back="" />;
  if (!book) {
    return (
      <>
        <Header title="Not found" back="" />
        <p className="empty">This book was deleted.</p>
      </>
    );
  }

  const p = progress(chapters ?? []);
  const notesFor = (chapterId: string) => (notes ?? []).filter((n) => n.chapterId === chapterId).length;

  async function setShelf(shelf: Shelf) {
    if (shelf === 'finished') return go(`book/${id}/finish`);
    await db.books.put(moveToShelf(book!, shelf));
  }

  async function remove() {
    if (!confirm(`Delete "${book!.title}" with all its chapters and notes?`)) return;
    await db.deleteBook(id);
    go('');
  }

  return (
    <>
      <Header title={book.title} back="" />
      <main className="page">
        <section className="book-head">
          <div className="cover cover-lg" aria-hidden="true">
            {book.title.slice(0, 1)}
          </div>
          <div className="book-meta">
            <h2>{book.title}</h2>
            {book.originalTitle && (
              <span className="muted" lang="zh">
                {book.originalTitle}
              </span>
            )}
            {book.author && <span>{book.author}</span>}
            <span className="muted small">
              {book.startedAt && `Started ${formatDate(book.startedAt)}`}
              {book.finishedAt && ` · Finished ${formatDate(book.finishedAt)}`}
            </span>
          </div>
        </section>

        <label className="shelf-pick">
          Shelf
          <select value={book.shelf} onChange={(e) => void setShelf(e.target.value as Shelf)}>
            {SHELVES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {book.shelf === 'finished' ? (
          <section className="card">
            <div className="row between">
              <h3>My review</h3>
              <button type="button" className="link" onClick={() => setEditingReview(true)}>
                Edit
              </button>
            </div>
            <Stars value={book.rating} />
            {book.review ? <p className="review">{book.review}</p> : <p className="muted">No review written.</p>}
          </section>
        ) : (
          <button type="button" className="btn primary wide" onClick={() => go(`book/${id}/finish`)}>
            I finished this book
          </button>
        )}

        <section>
          <div className="row between">
            <h3>
              Chapters <span className="muted small">{p.total ? `${p.read} of ${p.total} read` : ''}</span>
            </h3>
            <button type="button" className="link" onClick={() => setAddingChapter(true)}>
              + Chapter
            </button>
          </div>
          {chapters && chapters.length === 0 && (
            <p className="muted">Add chapters to leave comments and highlight lines.</p>
          )}
          <ul className="chapter-list">
            {(chapters ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={c.read ? 'check on' : 'check'}
                  aria-label={c.read ? 'Mark unread' : 'Mark read'}
                  onClick={() => void db.chapters.update(c.id, { read: !c.read })}
                >
                  {c.read ? '✓' : ''}
                </button>
                <a href={`#/chapter/${c.id}`} className="chapter-link">
                  <span>
                    <span className="muted">{c.number}.</span> {c.title}
                  </span>
                  {notesFor(c.id) > 0 && <span className="chip">💬 {notesFor(c.id)}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="btn danger wide" onClick={() => void remove()}>
          Delete book
        </button>
      </main>

      {addingChapter && (
        <AddChapter bookId={id} next={nextChapterNumber(chapters ?? [])} onClose={() => setAddingChapter(false)} />
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
  const already = book.shelf === 'finished';

  async function save() {
    const next = already
      ? { ...finishBook(book, rating, review), finishedAt: book.finishedAt }
      : finishBook(book, rating, review);
    await db.books.put(next);
    onClose();
  }

  return (
    <Sheet title={already ? 'Edit review' : 'Finished! 🎉'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (rating) void save();
        }}
      >
        <div className="rating-pick">
          <span>How was it?</span>
          <Stars value={rating} onChange={setRating} />
          <span className="muted small">{rating ? `${rating} / 5 · tap a star again for half` : 'Tap to rate'}</span>
        </div>
        <label>
          Review
          <textarea
            rows={8}
            placeholder="What stayed with you? Favorite characters, the ending, would you reread it?"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={!rating}>
          Save to my read list
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
        <button className="btn primary" type="submit">
          Add chapter
        </button>
      </form>
    </Sheet>
  );
}
