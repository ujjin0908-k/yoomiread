import { ChevronRight, Plus, Settings as Gear } from 'lucide-react';
import { useState } from 'react';
import { Book3D, Empty, Pocket, TabBar } from '../components';
import { backupDue, loadBackupState, saveBackupFile, snoozeBackup } from '../backupNow';
import { db } from '../db';
import { go, useLive, useOnline } from '../hooks';
import { bookProgress, computeStats, continueChapter, estimateMinutes, formatDuration } from '../logic';
import { useMood } from '../mascot/useMood';
import { Wizard } from '../mascot/Wizard';
import type { Book, Chapter } from '../types';
import { AddBook } from './AddBook';

export function Home() {
  const data = useLive(async () => {
    const books = await db.books.toArray();
    const chapters = await db.chapters.toArray();
    const sessions = await db.sessions.toArray();
    const lines = await db.notes.where('kind').equals('highlight').count();
    const byBook = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const list = byBook.get(c.bookId);
      if (list) list.push(c);
      else byBook.set(c.bookId, [c]);
    }
    return { books, byBook, sessions, lines, backup: await loadBackupState() };
  }, [], 'home');
  const [adding, setAdding] = useState(false);
  const online = useOnline();
  const { mood } = useMood();

  const books = data?.books ?? [];
  const recent = [...books].sort((a, b) => (b.lastReadAt ?? b.updatedAt) - (a.lastReadAt ?? a.updatedAt));
  const current = recent.find((b) => b.shelf === 'reading');
  const others = recent.filter((b) => b !== current);

  // The strip of small facts that runs across the page. Only real numbers; nothing shows until there is one.
  const stats = data ? computeStats(data.books, data.sessions) : undefined;
  const facts: string[] = [];
  if (stats && stats.streak > 0) facts.push(`${stats.streak} day streak`);
  if (stats && stats.totalMs > 0) facts.push(`${formatDuration(stats.totalMs)} read`);
  if (data && data.lines > 0) facts.push(`${data.lines} ${data.lines === 1 ? 'line' : 'lines'} kept`);
  if (stats && stats.finishedThisYear > 0) facts.push(`${stats.finishedThisYear} finished in ${new Date().getFullYear()}`);
  if (!facts.length) facts.push('Read any world');

  // A weekly nudge to save a backup file: everything lives on this phone only.
  const firstBookAt = books.length ? Math.min(...books.map((b) => b.createdAt)) : undefined;
  const backupDays = data ? backupDue(data.backup, firstBookAt, Date.now()) : undefined;

  return (
    <>
      <main className="page tabs-page home">
        <header className="home-top">
          <span className="brand">YoomiRead</span>
          <a className="round-btn" href="#/settings" aria-label="Settings">
            <Gear size={18} />
          </a>
        </header>

        {current ? (
          <h1 className="loud">
            Keep
            {/* The second word turns like a slot machine. A screen reader hears the first one only. */}
            <span className="slot">
              <span className="slot-reel">
                <i>reading.</i>
                <i aria-hidden="true">dreaming.</i>
                <i aria-hidden="true">going.</i>
                <i aria-hidden="true">reading.</i>
              </span>
            </span>
          </h1>
        ) : (
          <h1 className="loud">
            Start
            <span className="slot">
              <i>something.</i>
            </span>
          </h1>
        )}

        {!online && (
          <p className="offline-note" role="status">
            Offline: your books are here. Translating needs internet.
          </p>
        )}

        {backupDays !== undefined && (
          <div className="backup-note glass" role="status">
            <p>
              <b>{data!.backup.lastAt ? `Last backup: ${backupDays} days ago.` : 'No backup yet.'}</b> Your books live on this phone only.
            </p>
            <div className="row">
              <button type="button" className="pill-btn small" onClick={() => void saveBackupFile()}>
                Save a backup
              </button>
              <button type="button" className="link" onClick={() => void snoozeBackup()}>
                Later
              </button>
            </div>
          </div>
        )}

        {data && !books.length && (
          <div className="home-empty">
            <img src="/mascot/cat-closeup.gif" alt="" width={180} height={180} />
            <Empty title="Your shelves are empty">Import a PDF or write down a book you have read.</Empty>
          </div>
        )}

        {current && <NowReading book={current} chapters={data!.byBook.get(current.id) ?? []} />}

        {data && books.length > 0 && (
          <div className="ticker" aria-label={facts.join(', ')}>
            <div className="ticker-run" aria-hidden="true">
              {[0, 1].map((half) => (
                <span key={half}>
                  {[0, 1, 2, 3].flatMap((n) => facts.map((f) => <b key={`${n}-${f}`}>{f} ✦</b>))}
                </span>
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <Pocket label="The shelf" count={books.length} books={others} tint="lilac" href="#/library">
            <span className="sticker pocket-sticker">
              <Wizard mood={mood ?? 'idle'} size={64} />
            </span>
          </Pocket>
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

/** The book being read, as a 3D book, beside a glass card with how far along it is. */
function NowReading({ book, chapters }: { book: Book; chapters: Chapter[] }) {
  const next = continueChapter(book, chapters);
  const pct = Math.round(bookProgress(book, chapters) * 100);
  const left = next?.length ? estimateMinutes(next.length, book.language, next.position ?? 0) : undefined;
  // The ring is 264 units round; the part not yet read is left empty.
  const ring = 264;
  return (
    <section className="now">
      <a className="now-book" href={`#/book/${book.id}`} aria-label={`${book.title}: book page`}>
        <Book3D book={book} />
        <span className="sticker star-sticker" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30">
            <path d="M12 1l3.2 6.9 7.5.9-5.5 5.2 1.4 7.5L12 17.8 5.4 21.5l1.4-7.5L1.3 8.8l7.5-.9z" fill="#ffd23f" />
          </svg>
        </span>
      </a>
      <div className="now-card glass">
        <div className="now-pct">
          <svg viewBox="0 0 100 100" width="50" height="50" role="img" aria-label={`${pct}% read`}>
            <circle className="ring-track" cx="50" cy="50" r="42" />
            <circle
              className="ring-fill"
              cx="50"
              cy="50"
              r="42"
              strokeDasharray={ring}
              strokeDashoffset={ring - (ring * pct) / 100}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <span className="now-num" aria-hidden="true">
            {pct}
            <small>%</small>
          </span>
        </div>
        <h3 lang={book.language === 'zh' ? 'zh' : undefined}>{book.title}</h3>
        <span className="muted small">{next ? `${next.title}${left ? ` · ${left} min left` : ''}` : 'No chapters yet'}</span>
        <button type="button" className="pill-btn" onClick={() => go(next ? `chapter/${next.id}` : `book/${book.id}`)}>
          <span>{next ? 'Continue' : 'Open book'}</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
