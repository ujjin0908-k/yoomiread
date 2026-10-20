import { Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Cover, Empty, PageTitle, Stars, TabBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { SHELVES } from '../logic';
import type { Book, Shelf } from '../types';
import { AddBook } from './AddBook';

export function Library() {
  const books = useLive(() => db.books.orderBy('updatedAt').reverse().toArray(), []);
  const [shelf, setShelf] = useState<Shelf>('reading');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const q = search.trim().toLowerCase();
  const matches = (b: Book) =>
    !q || [b.title, b.author, b.originalTitle ?? ''].some((s) => s.toLowerCase().includes(q));
  const shown = (books ?? []).filter((b) => (q ? true : b.shelf === shelf) && matches(b));

  return (
    <>
      <main className="page tabs-page">
        <PageTitle
          title="Library"
          right={
            <button
              type="button"
              className="round-btn"
              aria-label={searching ? 'Close search' : 'Search'}
              onClick={() => {
                setSearching(!searching);
                setSearch('');
              }}
            >
              {searching ? <X size={18} /> : <Search size={18} />}
            </button>
          }
        />
        {searching && (
          <input
            className="search"
            type="search"
            autoFocus
            placeholder="Title, author or 中文书名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {!q && (
          <nav className="shelf-tabs" aria-label="Shelves">
            {SHELVES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.id === shelf ? 'on' : ''}
                aria-pressed={s.id === shelf}
                onClick={() => setShelf(s.id)}
              >
                {s.label}
                <sup>{(books ?? []).filter((b) => b.shelf === s.id).length}</sup>
              </button>
            ))}
          </nav>
        )}

        {books && shown.length === 0 && (
          <Empty title={q ? 'No books match' : 'Nothing here yet'}>
            {q ? 'Try another word.' : 'Tap + to import a PDF or write a book down.'}
          </Empty>
        )}

        <ul className="arch-grid">
          {shown.map((b) => (
            <li key={b.id}>
              <a href={`#/book/${b.id}`}>
                <Cover book={b} shape="arch" />
                <strong>{b.title}</strong>
                {b.shelf === 'finished' && b.rating ? (
                  <Stars value={b.rating} size="sm" />
                ) : (
                  <span className="muted small">{b.author || ' '}</span>
                )}
                {q && <span className="chip">{SHELVES.find((s) => s.id === b.shelf)?.label}</span>}
              </a>
            </li>
          ))}
        </ul>
      </main>
      <button type="button" className="fab" aria-label="Add book" onClick={() => setAdding(true)}>
        <Plus size={22} />
      </button>
      <TabBar active="library" />
      {adding && <AddBook shelf={shelf} onClose={() => setAdding(false)} />}
    </>
  );
}
