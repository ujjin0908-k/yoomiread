import { htmlLangOf } from '../languages';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Empty, PageTitle, TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { folderNames, formatDate } from '../logic';
import { allQuotes } from '../queries';

function useQuotes() {
  return useLive(allQuotes, [], 'quotes');
}

/**
 * A book's quotes, on a page of their own (opened from the Quotes tile on the book's page): the lines I highlighted
 * in it, newest first, with their folders and a search. (Until 2026-11-23 they sat at the bottom of the book page.)
 */
export function BookQuotesPage({ bookId }: { bookId: string }) {
  const book = useLive(async () => (await db.books.get(bookId)) ?? null, [bookId], 'book');
  const chapters = useLive(() => db.chapters.where('bookId').equals(bookId).toArray(), [bookId], 'book-chapters-any');
  const notes = useLive(() => db.notes.where('bookId').equals(bookId).toArray(), [bookId], 'book-notes');
  const [search, setSearch] = useState('');
  // undefined: every folder; '': lines with no folder; otherwise one folder.
  const [folder, setFolder] = useState<string>();
  if (book === undefined) return <TopBar back={`book/${bookId}`} />;
  if (!book) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This book was deleted.</p>
      </>
    );
  }
  const quotes = (notes ?? []).filter((n) => n.kind === 'highlight' && n.quote).sort((a, b) => b.createdAt - a.createdAt);
  const number = new Map((chapters ?? []).map((c) => [c.id, c.number]));
  const folders = folderNames(quotes);
  const q = search.trim().toLowerCase();
  const shown = quotes.filter((n) => (folder === undefined || (n.folder ?? '') === folder) && (!q || [n.quote ?? '', n.body].some((x) => x.toLowerCase().includes(q))));

  return (
    <>
      <TopBar back={`book/${bookId}`} title={book.title} />
      <main className="page book-quotes">
        <PageTitle title="Quotes" sub={quotes.length ? `${quotes.length} ${quotes.length === 1 ? 'line' : 'lines'} kept from this book` : undefined} />
        {!quotes.length && <Empty title="No quotes yet">Highlight a line while reading and it is kept here.</Empty>}
        {quotes.length > 4 && (
          <input className="search" type="search" placeholder="Search this book’s quotes" value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
        {folders.length > 0 && (
          <div className="folder-chips">
            <button type="button" className={folder === undefined ? 'on' : ''} onClick={() => setFolder(undefined)}>
              All
            </button>
            {folders.map((f) => (
              <button key={f} type="button" className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>
                {f}
              </button>
            ))}
            <button type="button" className={folder === '' ? 'on' : ''} onClick={() => setFolder('')}>
              No folder
            </button>
          </div>
        )}
        {quotes.length > 0 && !shown.length && <p className="muted small">No quotes match.</p>}
        <ul className="quote-list">
          {shown.map((note) => (
            <li key={note.id}>
              <a href={`#/quote/${note.id}`}>
                <span className="quote-where">
                  Ch.{number.get(note.chapterId) ?? '?'} <span aria-hidden="true">|</span> {formatDate(note.createdAt)}
                </span>
                <span className="quote-text" lang={htmlLangOf(book.language)}>
                  {note.quote}
                </span>
                {note.body && <span className="quote-note">{note.body}</span>}
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

/** One quote, big, like a card I could screenshot. */
export function QuoteCard({ id }: { id: string }) {
  const quotes = useQuotes();
  const item = quotes?.find((x) => x.note.id === id);
  if (!quotes) return <TopBar back="" />;
  // Loaded, but this quote is gone.
  if (!item) {
    return (
      <>
        <TopBar back="" />
        <p className="empty">This quote was deleted.</p>
      </>
    );
  }
  const { note, book, chapter } = item;
  const text = note.quote ?? '';
  // The last word gets the marker stroke.
  const cut = Math.max(text.trimEnd().lastIndexOf(' '), htmlLangOf(book.language) ? text.length - 2 : -1);
  const head = cut > 0 ? text.slice(0, cut + 1) : '';
  const tail = cut > 0 ? text.slice(cut + 1) : text;

  return (
    <>
      <TopBar back={`quotes/${book.id}`} />
      <main className="page quote-card">
        <span className="quote-orn" aria-hidden="true">
          ❦
        </span>
        <blockquote lang={htmlLangOf(book.language)}>
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
