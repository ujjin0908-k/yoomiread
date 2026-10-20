import { ArrowRight, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Cover, Empty, PageTitle, TabBar, TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { formatDate } from '../logic';
import type { Book, Chapter, Note } from '../types';

function useQuotes() {
  return useLive(async () => {
    const notes = await db.notes.where('kind').equals('highlight').reverse().sortBy('createdAt');
    const books = new Map((await db.books.toArray()).map((b) => [b.id, b]));
    const chapters = new Map((await db.chapters.toArray()).map((c) => [c.id, c]));
    return notes
      .filter((n) => books.has(n.bookId))
      .map((n) => ({ note: n, book: books.get(n.bookId)!, chapter: chapters.get(n.chapterId) }));
  }, []);
}

type QuoteItem = { note: Note; book: Book; chapter?: Chapter };

export function Quotes() {
  const quotes = useQuotes();
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = (quotes ?? []).filter(
    (x) => !q || [x.note.quote ?? '', x.note.body, x.book.title].some((s) => s.toLowerCase().includes(q)),
  );

  // Group by book, keeping the newest book first.
  const groups: { book: Book; items: QuoteItem[] }[] = [];
  for (const item of shown) {
    const g = groups.find((x) => x.book.id === item.book.id);
    if (g) g.items.push(item);
    else groups.push({ book: item.book, items: [item] });
  }

  return (
    <>
      <main className="page tabs-page">
        <PageTitle
          title="Quotes"
          sub={quotes?.length ? `${quotes.length} ${quotes.length === 1 ? 'line' : 'lines'} I kept` : undefined}
          right={
            <button
              type="button"
              className="round-btn"
              aria-label={searching ? 'Close search' : 'Search quotes'}
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
          <input className="search" type="search" autoFocus placeholder="Search quotes and notes" value={search} onChange={(e) => setSearch(e.target.value)} />
        )}

        {quotes && !shown.length && (
          <Empty title={q ? 'No quotes match' : 'No quotes yet'}>
            {q ? 'Try another word.' : 'Select a few lines while reading and tap Highlight. They gather here.'}
          </Empty>
        )}

        {groups.map(({ book, items }) => (
          <section key={book.id} className="quote-group">
            <a className="quote-book" href={`#/book/${book.id}`}>
              <Cover book={book} size="xs" />
              <span>
                <strong>{book.title}</strong>
                <span className="muted small">{book.author}</span>
              </span>
            </a>
            <ul className="quote-list">
              {items.map(({ note, chapter }) => (
                <li key={note.id}>
                  <a href={`#/quote/${note.id}`}>
                    <span className="quote-where">
                      Ch.{chapter?.number ?? '?'} <span aria-hidden="true">|</span> {formatDate(note.createdAt)}
                    </span>
                    <span className="quote-text" lang={book.language === 'zh' ? 'zh' : undefined}>
                      {note.quote}
                    </span>
                    {note.body && <span className="quote-note">{note.body}</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <TabBar active="quotes" />
    </>
  );
}

/** One quote, big, like a card I could screenshot. */
export function QuoteCard({ id }: { id: string }) {
  const quotes = useQuotes();
  const item = quotes?.find((x) => x.note.id === id);
  if (!quotes) return <TopBar back="quotes" />;
  if (!item) {
    return (
      <>
        <TopBar back="quotes" />
        <p className="empty">This quote was deleted.</p>
      </>
    );
  }
  const { note, book, chapter } = item;
  const text = note.quote ?? '';
  // The last word gets the marker stroke.
  const cut = Math.max(text.trimEnd().lastIndexOf(' '), book.language === 'zh' ? text.length - 2 : -1);
  const head = cut > 0 ? text.slice(0, cut + 1) : '';
  const tail = cut > 0 ? text.slice(cut + 1) : text;

  return (
    <>
      <TopBar back="quotes" />
      <main className="page quote-card">
        <span className="quote-orn" aria-hidden="true">
          ❦
        </span>
        <blockquote lang={book.language === 'zh' ? 'zh' : undefined}>
          “{head}
          <mark>{tail}”</mark>
        </blockquote>
        <p className="quote-by">
          – {book.title}
          {chapter && <span className="muted">, chapter {chapter.number}</span>}
        </p>
        {note.body && <p className="quote-mynote">{note.body}</p>}
        {chapter && (
          <a className="quote-open" href={`#/chapter/${chapter.id}`}>
            Open in chapter <ArrowRight size={22} strokeWidth={1.3} />
          </a>
        )}
      </main>
    </>
  );
}
