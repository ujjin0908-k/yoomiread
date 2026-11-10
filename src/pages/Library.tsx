import { Plus, Search, Sticker, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Cover, Empty, PageTitle, Pocket, ProgressBar, Stars, TabBar, type PocketTint } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { LIBRARY_SORTS, SHELVES, bookProgress, sortBooks, type LibrarySort } from '../logic';
import type { Book, BookLanguage, Chapter, Shelf } from '../types';
import { StickerLayer, StickerTray, useStickers } from '../stickers';
import { AddBook } from './AddBook';

type LangFilter = 'all' | BookLanguage;

const LANGUAGES: { id: BookLanguage; label: string }[] = [
  { id: 'zh', label: 'Chinese' },
  { id: 'en', label: 'English' },
  { id: 'other', label: 'Other' },
];

/** How the library was last left: shelf, sort and language, remembered on this device. */
interface LibraryPrefs {
  shelf: Shelf;
  sort: LibrarySort;
  lang: LangFilter;
}

const PREFS_KEY = 'yoomiread.library';
const POCKET_TINT: Record<Shelf, PocketTint> = { reading: 'lilac', want: 'peach', finished: 'lime', dropped: 'sky' };

const DEFAULT_PREFS: LibraryPrefs = { shelf: 'reading', sort: 'recent', lang: 'all' };

function loadPrefs(): LibraryPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<LibraryPrefs>;
    return {
      shelf: SHELVES.some((s) => s.id === saved.shelf) ? saved.shelf! : DEFAULT_PREFS.shelf,
      sort: LIBRARY_SORTS.some((s) => s.id === saved.sort) ? saved.sort! : DEFAULT_PREFS.sort,
      lang: saved.lang === 'all' || LANGUAGES.some((l) => l.id === saved.lang) ? saved.lang! : DEFAULT_PREFS.lang,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function Library() {
  const books = useLive(() => db.books.toArray(), []);
  const chapters = useLive(() => db.chapters.toArray(), []);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  // Placing stickers on the shelf pockets.
  const [stickering, setStickering] = useState(false);
  const stickers = useStickers();
  const { shelf, sort, lang } = prefs;

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  }, [prefs]);

  const change = (next: Partial<LibraryPrefs>) => setPrefs((p) => ({ ...p, ...next }));

  const all = books ?? [];
  const chaptersByBook = new Map<string, Chapter[]>();
  for (const c of chapters ?? []) chaptersByBook.set(c.bookId, [...(chaptersByBook.get(c.bookId) ?? []), c]);
  const progressOf = (b: Book) => bookProgress(b, chaptersByBook.get(b.id) ?? []);

  const q = search.trim().toLowerCase();
  const matches = (b: Book) =>
    !q || [b.title, b.author, b.originalTitle ?? ''].some((s) => s.toLowerCase().includes(q));
  const inLang = (b: Book) => lang === 'all' || b.language === lang;
  const shown = sortBooks(
    all.filter((b) => (q ? true : b.shelf === shelf) && inLang(b) && matches(b)),
    sort,
    progressOf,
  );
  // Only offer the language filter when the library really has more than one language.
  const languagesHere = LANGUAGES.filter((l) => all.some((b) => b.language === l.id));

  return (
    <>
      <main className="page tabs-page">
        <PageTitle
          title="Library"
          right={
            <div className="row">
              {!q && all.length > 0 && (
                <button
                  type="button"
                  className={`round-btn${stickering ? ' on' : ''}`}
                  aria-label="Stickers"
                  aria-pressed={stickering}
                  onClick={() => setStickering(!stickering)}
                >
                  <Sticker size={18} />
                </button>
              )}
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
            </div>
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
          <nav className="pockets" aria-label="Shelves">
            {SHELVES.map((s) => {
              const inside = sortBooks(
                all.filter((b) => b.shelf === s.id && inLang(b)),
                'recent',
                progressOf,
              );
              return (
                <div key={s.id} className="pocket-slot">
                  <Pocket
                    label={s.label}
                    count={inside.length}
                    books={inside}
                    tint={POCKET_TINT[s.id]}
                    open={s.id === shelf}
                    onClick={() => change({ shelf: s.id })}
                  />
                  <StickerLayer shelf={s.id} stickers={stickers} editing={stickering} />
                </div>
              );
            })}
          </nav>
        )}

        {all.length > 0 && (
          <div className="lib-controls">
            <div className="filter-row" role="group" aria-label="Sort books">
              <span className="filter-label">Sort</span>
              {LIBRARY_SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`filter-chip${s.id === sort ? ' on' : ''}`}
                  aria-pressed={s.id === sort}
                  onClick={() => change({ sort: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {(languagesHere.length > 1 || lang !== 'all') && (
              <div className="filter-row" role="group" aria-label="Filter by language">
                <span className="filter-label">Language</span>
                {[{ id: 'all' as const, label: 'All' }, ...languagesHere].map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`filter-chip${l.id === lang ? ' on' : ''}`}
                    aria-pressed={l.id === lang}
                    onClick={() => change({ lang: l.id })}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {books && shown.length === 0 && (
          <Empty
            title={q ? 'No books match' : lang !== 'all' ? 'No books in this language' : 'Nothing here yet'}
          >
            {q ? 'Try another word.' : lang !== 'all' ? 'Tap All to see every book.' : 'Tap + to import a PDF or write a book down.'}
          </Empty>
        )}

        <ul className="arch-grid" key={shelf}>
          {shown.map((b) => {
            const p = progressOf(b);
            const hasChapters = (chaptersByBook.get(b.id)?.length ?? 0) > 0;
            return (
              <li key={b.id}>
                <a href={`#/book/${b.id}`}>
                  <Cover book={b} shape="arch" />
                  <strong>{b.title}</strong>
                  {(b.shelf === 'finished' || b.shelf === 'dropped') && b.rating ? (
                    <Stars value={b.rating} size="sm" />
                  ) : (
                    <span className="muted small">{b.author || ' '}</span>
                  )}
                  {b.shelf === 'reading' && hasChapters && (
                    <span className="arch-progress">
                      <ProgressBar value={p} label={`${b.title}: read`} />
                      <span className="small muted">{Math.round(p * 100)}% read</span>
                    </span>
                  )}
                  {q && <span className="chip">{SHELVES.find((s) => s.id === b.shelf)?.label}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </main>
      {stickering && !q ? (
        <StickerTray
          shelf={shelf}
          shelfLabel={SHELVES.find((s) => s.id === shelf)?.label ?? ''}
          count={stickers.filter((s) => s.shelf === shelf).length}
          onDone={() => setStickering(false)}
        />
      ) : (
        <button type="button" className="fab" aria-label="Add book" onClick={() => setAdding(true)}>
          <Plus size={22} />
        </button>
      )}
      <TabBar active="library" />
      {adding && <AddBook shelf={shelf} onClose={() => setAdding(false)} />}
    </>
  );
}
