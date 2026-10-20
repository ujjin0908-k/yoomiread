import { useState } from 'react';
import { Header, Sheet, Stars } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { SHELVES, formatDate, moveToShelf, newId } from '../logic';
import type { Book, BookLanguage, Shelf } from '../types';

export function Library() {
  const books = useLive(() => db.books.orderBy('updatedAt').reverse().toArray(), []);
  const [shelf, setShelf] = useState<Shelf>('reading');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const q = search.trim().toLowerCase();
  const matches = (b: Book) =>
    !q || [b.title, b.author, b.originalTitle ?? ''].some((s) => s.toLowerCase().includes(q));
  const shown = (books ?? []).filter((b) => (q ? true : b.shelf === shelf) && matches(b));

  return (
    <>
      <Header
        title="My books"
        right={
          <a className="icon-btn" href="#/settings" aria-label="Settings">
            ⚙
          </a>
        }
      />
      <main className="page">
        <input
          className="search"
          type="search"
          placeholder="Search all books"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!q && (
          <nav className="tabs" aria-label="Shelves">
            {SHELVES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === shelf ? 'tab active' : 'tab'}
                onClick={() => setShelf(s.id)}
              >
                {s.label} <span className="count">{(books ?? []).filter((b) => b.shelf === s.id).length}</span>
              </button>
            ))}
          </nav>
        )}

        {books && shown.length === 0 && (
          <p className="empty">{q ? 'No books match.' : 'Nothing on this shelf yet.'}</p>
        )}

        <ul className="book-list">
          {shown.map((b) => (
            <li key={b.id}>
              <a className="book-card" href={`#/book/${b.id}`}>
                <div className="cover" aria-hidden="true">
                  {b.title.slice(0, 1)}
                </div>
                <div className="book-meta">
                  <strong>{b.title}</strong>
                  {b.author && <span className="muted">{b.author}</span>}
                  {b.shelf === 'finished' && (
                    <>
                      <span className="row">
                        <Stars value={b.rating} size="sm" />
                        <span className="muted small">{formatDate(b.finishedAt)}</span>
                      </span>
                      {b.review && <span className="review-snippet">“{b.review}”</span>}
                    </>
                  )}
                  {q && <span className="chip">{SHELVES.find((s) => s.id === b.shelf)?.label}</span>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <button type="button" className="fab" onClick={() => setAdding(true)}>
        + Add book
      </button>
      {adding && <AddBook shelf={shelf} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddBook({ shelf, onClose }: { shelf: Shelf; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [language, setLanguage] = useState<BookLanguage>('zh');
  const [where, setWhere] = useState<Shelf>(shelf === 'finished' ? 'reading' : shelf);

  async function save() {
    const now = Date.now();
    const base: Book = {
      id: newId(),
      title: title.trim(),
      author: author.trim(),
      originalTitle: originalTitle.trim() || undefined,
      language,
      shelf: 'want',
      createdAt: now,
      updatedAt: now,
    };
    const book = moveToShelf(base, where, now);
    await db.books.add(book);
    onClose();
    // Finished books go straight to the rating and review step.
    go(where === 'finished' ? `book/${book.id}/finish` : `book/${book.id}`);
  }

  return (
    <Sheet title="Add a book" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void save();
        }}
      >
        <label>
          Title
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          Original title <span className="muted small">(optional, e.g. Chinese)</span>
          <input value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} lang="zh" />
        </label>
        <div className="row-2">
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as BookLanguage)}>
              <option value="zh">Chinese</option>
              <option value="en">English</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Shelf
            <select value={where} onChange={(e) => setWhere(e.target.value as Shelf)}>
              {SHELVES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={!title.trim()}>
          Save book
        </button>
      </form>
    </Sheet>
  );
}
