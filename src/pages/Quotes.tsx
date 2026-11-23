import { htmlLangOf } from '../languages';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { TopBar } from '../components';
import { useLive } from '../hooks';
import { folderNames, formatDate } from '../logic';
import { allQuotes } from '../queries';
import type { Book, Chapter, Note } from '../types';

function useQuotes() {
  return useLive(allQuotes, [], 'quotes');
}

/**
 * A book's quotes, on its own page: the lines I highlighted in it, newest first, with their folders and a search.
 * (They used to be a tab of their own, mixed across books; 2026-11-23 they moved here, and the tab became Ask.)
 */
export function BookQuotes({ book, notes, chapters }: { book: Book; notes: Note[]; chapters: Chapter[] }) {
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  // undefined: every folder; '': lines with no folder; otherwise one folder.
  const [folder, setFolder] = useState<string>();
  const quotes = notes.filter((n) => n.kind === 'highlight' && n.quote).sort((a, b) => b.createdAt - a.createdAt);
  if (!quotes.length) return null;
  const number = new Map(chapters.map((c) => [c.id, c.number]));
  const folders = folderNames(quotes);
  const q = search.trim().toLowerCase();
  const shown = quotes.filter((n) => (folder === undefined || (n.folder ?? '') === folder) && (!q || [n.quote ?? '', n.body].some((x) => x.toLowerCase().includes(q))));
  const FEW = 4;
  const list = all || q || folder !== undefined ? shown : shown.slice(0, FEW);

  return (
    <section className="book-quotes">
      <div className="section-head">
        <h2>Quotes</h2>
        <span className="muted small">
          {quotes.length} {quotes.length === 1 ? 'line' : 'lines'} kept
        </span>
      </div>
      {quotes.length > FEW && (
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
      {!shown.length && <p className="muted small">No quotes match.</p>}
      <ul className="quote-list">
        {list.map((note) => (
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
      {list.length < shown.length && (
        <button type="button" className="btn ghost wide" onClick={() => setAll(true)}>
          Show all {shown.length}
        </button>
      )}
    </section>
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
      <TopBar back={`book/${book.id}`} />
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
