import { BookMarked, ChevronRight, ImagePlus, Languages, MessageCircle, PenLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Cover, ProgressBar, Sheet, Stars, TopBar, Working } from '../components';
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
import { costOf, estimateTokens, formatCost } from '../translate/prompt';
import { keepTranslation, loadSettings, modelFor, translateChapter, translateTitle, type ChapterRun } from '../translate/run';
import type { Book, BookLanguage, Chapter, Shelf, TranslateSettings } from '../types';

export function BookPage({ id, sub }: { id: string; sub?: string }) {
  const book = useLive(async () => (await db.books.get(id)) ?? null, [id]);
  const chapters = useLive(() => db.chapters.where('bookId').equals(id).sortBy('number'), [id]);
  const notes = useLive(() => db.notes.where('bookId').equals(id).toArray(), [id]);
  const translated = useLive(async () => new Set(await db.translations.where('bookId').equals(id).primaryKeys()), [id]);
  const chapterCosts = useLive(
    async () => (await db.translations.where('bookId').equals(id).toArray()).map((t) => t.cost).filter((c): c is number => c !== undefined),
    [id],
  );
  const glossaryCount = useLive(async () => {
    const all = await db.glossary.where('bookId').equals(id).toArray();
    return { all: all.length, review: all.filter((g) => g.status === 'review').length };
  }, [id]);
  const [addingChapter, setAddingChapter] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [translating, setTranslating] = useState(false);
  const finishing = sub === 'finish';
  // Right after a PDF import: offer to fix the title.
  const justImported = sub === 'imported' || sub === 'scanned';

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
    if (!confirm(`Delete "${book!.title}" with all its chapters, translations, notes and glossary? This cannot be undone.`)) return;
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
    ['Translated', translated?.size ? `${translated.size} of ${p.total} chapters` : ''],
    ['AI spent', book.spent ? `${book.spentEstimated ? 'about ' : ''}${formatCost(book.spent)}` : ''],
    [
      'Per chapter',
      chapterCosts?.length ? `about ${formatCost(chapterCosts.reduce((a, b) => a + b, 0) / chapterCosts.length)}` : '',
    ],
  ];

  return (
    <>
      <TopBar
        back="library"
        title={SHELVES.find((s) => s.id === book.shelf)?.label}
        right={
          <>
          <button type="button" className="round-btn" aria-label="Edit details" onClick={() => setEditingDetails(true)}>
            <PenLine size={17} />
          </button>
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
          </>
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

        <div className="tool-row">
          <button type="button" className="tool" onClick={() => go(`glossary/${id}`)}>
            <BookMarked size={18} />
            <span>Glossary</span>
            <span className="muted small">
              {glossaryCount?.all ? `${glossaryCount.all} names` : 'empty'}
              {glossaryCount?.review ? ` · ${glossaryCount.review} to check` : ''}
            </span>
          </button>
          <button type="button" className="tool" disabled={!list.length} onClick={() => setTranslating(true)}>
            <Languages size={18} />
            <span>Translate</span>
            <span className="muted small">{list.length ? `${list.length - (translated?.size ?? 0)} left` : 'no chapters'}</span>
          </button>
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
                  <span className="chips">
                    {translated?.has(c.id) && <span className="chip">EN</span>}
                    {notesFor(c.id) > 0 && (
                      <span className="chip">
                        <MessageCircle size={12} /> {notesFor(c.id)}
                      </span>
                    )}
                  </span>
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
      {(editingDetails || justImported) && (
        <DetailsSheet
          book={book}
          justImported={justImported}
          onClose={() => {
            setEditingDetails(false);
            // Replace the import step in history so Back does not ask again.
            if (justImported) window.location.replace(`#/book/${id}`);
          }}
        />
      )}
      {translating && <TranslateSheet book={book} chapters={list} done={translated ?? new Set()} onClose={() => setTranslating(false)} />}
      {(finishing || editingReview) && (
        <FinishSheet
          book={book}
          onClose={() => {
            setEditingReview(false);
            // Replace the finish step in history so Back does not open it again.
            if (finishing) window.location.replace(`#/book/${id}`);
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
    await db.addChapters([
      {
        chapter: { id: newId(), bookId, number, title: title.trim() || `Chapter ${number}`, read: false, createdAt: Date.now() },
        text: text.trim() ? text.replace(/\r\n/g, '\n') : undefined,
      },
    ]);
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

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Rename a book and fix its details. After an import it asks "Keep this title?". */
function DetailsSheet({ book, justImported, onClose }: { book: Book; justImported: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [originalTitle, setOriginalTitle] = useState(book.originalTitle ?? '');
  const [language, setLanguage] = useState<BookLanguage>(book.language);
  const [naming, setNaming] = useState('');
  const hasChinese = /[\u3400-\u9fff]/.test(title);

  async function englishTitle() {
    setNaming('Translating the title…');
    try {
      const settings = await loadSettings();
      const english = await translateTitle(settings, modelFor(settings, book.model).id, title.trim(), author.trim() || undefined, book.id);
      // Keep the Chinese title as the original, so nothing is lost.
      if (!originalTitle.trim()) setOriginalTitle(title.trim());
      setTitle(english);
      setNaming('Done. Check it, then Save.');
    } catch (e) {
      setNaming(e instanceof Error ? e.message : 'Could not translate the title.');
    }
  }

  async function remove() {
    if (!confirm(`Delete "${book.title}" with all its chapters, translations, notes and glossary? This cannot be undone.`)) return;
    await db.deleteBook(book.id);
    window.location.replace('#/library');
  }

  async function save() {
    // An empty title is not allowed: keep the old one.
    await db.books.update(book.id, {
      title: title.trim() || book.title,
      author: author.trim(),
      originalTitle: originalTitle.trim() || undefined,
      language,
      updatedAt: Date.now(),
    });
    onClose();
  }

  return (
    <Sheet title={justImported ? 'Keep this title?' : 'Edit details'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {justImported && <p className="muted small">The title was taken from the file. Fix it now if it has a strange name.</p>}
        <label>
          Title
          <input autoFocus={justImported && !hasChinese} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {hasChinese && (
          <button type="button" className="btn ghost" disabled={naming.endsWith('…')} onClick={() => void englishTitle()}>
            <Languages size={16} /> Translate title to English
          </button>
        )}
        {naming && <p className="small">{naming}</p>}
        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          Original title <span className="muted small">(optional)</span>
          <input lang="zh" value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} />
        </label>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value as BookLanguage)}>
            <option value="zh">Chinese</option>
            <option value="en">English</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="row between">
          {justImported ? (
            <button type="button" className="btn" onClick={onClose}>
              Keep it
            </button>
          ) : (
            <span />
          )}
          <button className="pill-btn small" type="submit" disabled={!title.trim()}>
            <span>Save</span>
          </button>
        </div>
        <button type="button" className="btn danger" onClick={() => void remove()}>
          <Trash2 size={16} /> Delete this book
        </button>
      </form>
    </Sheet>
  );
}

/** Translate several chapters in a row, with a cost estimate first and a Stop button. */
function TranslateSheet({ book, chapters, done, onClose }: { book: Book; chapters: Chapter[]; done: Set<string>; onClose: () => void }) {
  const [settings, setSettings] = useState<TranslateSettings>();
  const [count, setCount] = useState(5);
  const [model, setModel] = useState(book.model ?? '');
  const [lengths, setLengths] = useState<Map<string, string>>();
  const [status, setStatus] = useState('');
  // The English as it streams in, so you can see progress.
  const [peek, setPeek] = useState('');
  const [running, setRunning] = useState(false);
  const stop = useRef<AbortController>();

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded);
      setModel((m) => m || loaded.defaultModel);
    });
  }, []);
  const todo = chapters.filter((c) => !done.has(c.id) && c.length);
  const batch = todo.slice(0, count);
  const batchKey = batch.map((c) => c.id).join();
  useEffect(() => {
    // Read the chapter texts once for a fair estimate.
    void Promise.all(batch.map(async (c) => [c.id, (await db.texts.get(c.id))?.text ?? ''] as const)).then((rows) =>
      setLengths(new Map(rows)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchKey]);
  if (!settings) return null;
  const option = modelFor(settings, model);
  let input = 0;
  let output = 0;
  for (const c of batch) {
    const t = estimateTokens(lengths?.get(c.id) ?? '字'.repeat(c.length ?? 0));
    input += t.input;
    output += t.output;
  }
  const ready = settings.baseUrl.trim() && settings.apiKey.trim();

  async function run() {
    setRunning(true);
    stop.current = new AbortController();
    const signal = stop.current.signal;
    setPeek('');
    if (model !== book.model) await db.books.update(book.id, { model });
    // Up to three chapters at once: each one spends most of its time waiting on the provider.
    const CONCURRENCY = 3;
    const queue = [...batch];
    const finished: ChapterRun[] = [];
    const failed: string[] = [];
    let started = 0;
    const worker = async () => {
      while (queue.length && !signal.aborted) {
        const c = queue.shift()!;
        started++;
        setStatus(`Translating ${started} of ${batch.length}: ${c.title}…`);
        try {
          finished.push(
            await translateChapter(c, {
              settings: settings!,
              model: option.id,
              signal,
              save: false,
              onText: (piece) => setPeek((p) => (p + piece).slice(-400)),
            }),
          );
        } catch (e) {
          if (signal.aborted) return;
          failed.push(`${c.title} (${e instanceof Error ? e.message : 'failed'})`);
        }
      }
    };
    let newTerms = 0;
    let spent = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
    } finally {
      // Save in chapter order, one at a time, so the same new name is never written twice.
      const order = (r: ChapterRun) => batch.findIndex((c) => c.id === r.translation.chapterId);
      finished.sort((a, b) => order(a) - order(b));
      for (const r of finished) {
        newTerms += await keepTranslation(r);
        spent += r.translation.cost ?? 0;
      }
      const parts = [`Done: ${plural(finished.length, 'chapter')}.`];
      if (spent) parts.push(`Cost ${formatCost(spent)}.`);
      if (newTerms) parts.push(`${plural(newTerms, 'new name')} to check in the glossary.`);
      if (failed.length) parts.push(`Not translated: ${failed.join('; ')}.`);
      if (signal.aborted) parts.push('Stopped.');
      setStatus(parts.join(' '));
      setRunning(false);
    }
  }

  return (
    <Sheet title="Translate chapters" onClose={() => (running ? undefined : onClose())}>
      <div className="form">
        {!ready && (
          <p className="warn small">
            Add your provider address and API key in <a href="#/settings">Settings</a> first.
          </p>
        )}
        <label>
          Model for this book
          <select value={option.id} disabled={running} onChange={(e) => setModel(e.target.value)}>
            {settings.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          How many
          <select
            value={count}
            disabled={running}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[1, 5, 10, 25, 1000].map((n) => (
              <option key={n} value={n}>
                {n === 1000 ? `All ${todo.length} left` : `Next ${Math.min(n, todo.length)}`}
              </option>
            ))}
          </select>
        </label>
        <p className="small">
          {plural(batch.length, 'chapter')} · about {formatCost(costOf(option, input, output))} (estimate)
        </p>
        <p className="muted small">The glossary is used for every chapter. New names are added for you to check, not used until approved.</p>
        {status && <p className="small">{status}</p>}
        {running ? (
          <>
            <Working label={status || 'Starting'} peek={peek} />
            <button type="button" className="btn" onClick={() => stop.current?.abort()}>
              Stop after this
            </button>
          </>
        ) : (
          <button type="button" className="pill-btn" disabled={!ready || !batch.length} onClick={() => void run()}>
            <span>Translate {plural(batch.length, 'chapter')}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
