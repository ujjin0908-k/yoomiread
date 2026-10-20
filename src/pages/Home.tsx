import { ChevronRight, Plus, Settings as Gear } from 'lucide-react';
import { useState } from 'react';
import { Cover, Empty, PageTitle, ProgressBar, TabBar } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { bookProgress, continueChapter, readingMinutes } from '../logic';
import type { Book, Chapter } from '../types';
import { AddBook } from './AddBook';

export function Home() {
  const data = useLive(async () => {
    const books = await db.books.toArray();
    const chapters = await db.chapters.toArray();
    const byBook = new Map<string, Chapter[]>();
    for (const c of chapters) byBook.set(c.bookId, [...(byBook.get(c.bookId) ?? []), c]);
    return { books, byBook };
  }, []);
  const [adding, setAdding] = useState(false);

  const books = data?.books ?? [];
  const recent = [...books].sort((a, b) => (b.lastReadAt ?? b.updatedAt) - (a.lastReadAt ?? a.updatedAt));
  const current = recent.find((b) => b.shelf === 'reading');
  const others = recent.filter((b) => b !== current).slice(0, 8);

  return (
    <>
      <main className="page tabs-page">
        <PageTitle
          title="My Library"
          sub="Pick up where you left off"
          right={
            <a className="round-btn" href="#/settings" aria-label="Settings">
              <Gear size={18} />
            </a>
          }
        />

        {data && !books.length && (
          <Empty title="Your shelves are empty">Import a PDF or write down a book you have read.</Empty>
        )}

        {current && <ContinueCard book={current} chapters={data!.byBook.get(current.id) ?? []} />}

        {others.length > 0 && (
          <section>
            <div className="section-head">
              <h2>Recent</h2>
              <a href="#/library">View all</a>
            </div>
            <ul className="shelf-row">
              {others.map((b) => {
                const p = bookProgress(b, data!.byBook.get(b.id) ?? []);
                return (
                  <li key={b.id}>
                    <a href={`#/book/${b.id}`}>
                      <Cover book={b} size="sm" />
                      <strong>{b.title}</strong>
                      <span className="muted small">{b.author}</span>
                      <span className="muted small">
                        {b.shelf === 'finished' ? 'Finished' : b.shelf === 'want' ? 'Want to read' : `${Math.round(p * 100)}%`}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <button type="button" className="fab" aria-label="Add book" onClick={() => setAdding(true)}>
        <Plus size={22} />
      </button>
      <TabBar active="" />
      {adding && <AddBook onClose={() => setAdding(false)} />}
    </>
  );
}

function ContinueCard({ book, chapters }: { book: Book; chapters: Chapter[] }) {
  const next = continueChapter(book, chapters);
  const pct = bookProgress(book, chapters);
  const left = next?.text ? readingMinutes(next.text, next.position ?? 0) : undefined;
  return (
    <section className="continue">
      <div className="continue-top">
        <Cover book={book} size="md" />
        <div className="continue-meta">
          <h3>{book.title}</h3>
          <span className="muted small">{book.author}</span>
          <div className="continue-progress">
            <ProgressBar value={pct} label="Book progress" />
            <span className="small">{Math.round(pct * 100)}%</span>
          </div>
          <span className="muted small">
            {next ? `${next.title}${left ? ` · ${left} min left` : ''}` : 'No chapters yet'}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="pill-btn"
        onClick={() => go(next ? `chapter/${next.id}` : `book/${book.id}`)}
      >
        <span>{next ? 'Continue Reading' : 'Open book'}</span>
        <ChevronRight size={18} />
      </button>
    </section>
  );
}
