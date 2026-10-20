import { ChevronLeft, ChevronRight, Highlighter, List, MessageCircle, PenLine, Trash2, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProgressBar, Sheet, TopBar } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { bookProgress, formatDate, moveToShelf, newId, paragraphs, readingMinutes, segmentText } from '../logic';
import { FONT_SIZES, useReaderPrefs, type ReaderPrefs } from '../prefs';
import type { Book, Chapter, Note } from '../types';

type Selection = { start: number; end: number; quote: string };

export function ChapterPage({ id }: { id: string }) {
  const chapter = useLive(async () => (await db.chapters.get(id)) ?? null, [id]);
  const book = useLive(async () => (chapter ? await db.books.get(chapter.bookId) : undefined), [chapter?.bookId]);
  const notes = useLive(() => db.notes.where('chapterId').equals(id).sortBy('createdAt'), [id]);
  const siblings = useLive(
    async () => (chapter ? db.chapters.where('bookId').equals(chapter.bookId).sortBy('number') : []),
    [chapter?.bookId],
  );
  const [prefs, setPrefs] = useReaderPrefs();
  const [pending, setPending] = useState<Selection>();
  // The selection is copied here when the note opens; focusing the note box clears the live one.
  const [open, setOpen] = useState<Note | Selection>();
  const [sheet, setSheet] = useState<'look' | 'chapters' | 'notes' | 'edit'>();
  const [scroll, setScroll] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);

  useReadingSession(chapter, book);
  useScrollMemory(chapter, setScroll);

  // Reader theme colors the whole page while it is open.
  useEffect(() => {
    document.body.dataset.reader = prefs.theme;
    return () => {
      delete document.body.dataset.reader;
    };
  }, [prefs.theme]);

  // Shows the "Highlight" bar while text in the chapter is selected.
  useEffect(() => {
    const onSelect = () => setPending(readSelection(textRef.current));
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  if (chapter === undefined) return <TopBar back="" />;
  if (!chapter) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This chapter was deleted.</p>
      </>
    );
  }

  const highlights = (notes ?? []).filter((n) => n.kind === 'highlight');
  const comments = (notes ?? []).filter((n) => n.kind === 'chapter');
  const list = siblings ?? [];
  const index = list.findIndex((c) => c.id === id);
  const prev = list[index - 1];
  const next = list[index + 1];
  const live = list.map((c) => (c.id === id ? { ...c, position: Math.max(c.position ?? 0, scroll) } : c));
  const bookPct = book ? bookProgress(book, live) : 0;
  const minutesLeft = chapter.text ? readingMinutes(chapter.text, scroll) : 0;
  const zh = book?.language === 'zh';

  async function finishChapter() {
    await db.chapters.update(id, { read: true, position: 1 });
    go(next ? `chapter/${next.id}` : `book/${chapter!.bookId}`);
  }

  return (
    <div className={`reader-page font-${prefs.font} spacing-${prefs.spacing}`}>
      <TopBar
        back={`book/${chapter.bookId}`}
        right={
          <>
            <button type="button" className="round-btn plain" aria-label="Reading settings" onClick={() => setSheet('look')}>
              <Type size={19} />
            </button>
            <button type="button" className="round-btn plain" aria-label="Chapters" onClick={() => setSheet('chapters')}>
              <List size={19} />
            </button>
            <button type="button" className="round-btn plain" aria-label="Edit chapter" onClick={() => setSheet('edit')}>
              <PenLine size={18} />
            </button>
          </>
        }
      />
      <main className="page reader-main" style={{ fontSize: FONT_SIZES[prefs.size] }}>
        <p className="eyebrow">Chapter {chapter.number}</p>
        <h1 className="chapter-title" lang={zh ? 'zh' : undefined}>
          {chapter.title}
        </h1>
        <span className="title-rule" aria-hidden="true" />

        {chapter.text ? (
          <div className={`reader ${prefs.dropCap ? 'drop' : ''}`} ref={textRef} lang={zh ? 'zh' : undefined}>
            {paragraphs(chapter.text).map((p) => (
              <p key={p.start} data-start={p.start}>
                {segmentText(p.text, shiftNotes(highlights, p.start, p.text.length)).map((s) =>
                  s.noteIds.length ? (
                    <mark
                      key={s.start}
                      className={s.noteIds.length > 1 ? 'hl hl-2' : 'hl'}
                      onClick={() => setOpen(highlights.find((h) => h.id === s.noteIds[s.noteIds.length - 1]))}
                    >
                      {s.text}
                    </mark>
                  ) : (
                    <span key={s.start}>{s.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        ) : (
          <div className="card">
            <p className="muted">
              No text for this chapter. You can still leave comments below, or paste the text to highlight lines.
            </p>
            <button type="button" className="btn ghost" onClick={() => setSheet('edit')}>
              <PenLine size={16} /> Paste text
            </button>
          </div>
        )}

        <section className="end-of-chapter">
          <span className="end-orn" aria-hidden="true">
            ❦
          </span>
          <CommentBox chapter={chapter} />
          {comments.length > 0 && (
            <ul className="note-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <button type="button" className="note" onClick={() => setOpen(c)}>
                    <span>{c.body}</span>
                    <span className="muted small">{formatDate(c.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <nav className="chapter-nav">
            {prev ? (
              <a className="round-btn" href={`#/chapter/${prev.id}`} aria-label={`Previous: ${prev.title}`}>
                <ChevronLeft size={20} />
              </a>
            ) : (
              <span />
            )}
            <button type="button" className="pill-btn" onClick={() => void finishChapter()}>
              <span>{next ? 'Next chapter' : 'Finish chapter'}</span>
              <ChevronRight size={18} />
            </button>
          </nav>
        </section>
      </main>

      {pending && !open ? (
        <div className="selection-bar">
          <span className="muted small">
            “{pending.quote.slice(0, 36)}
            {pending.quote.length > 36 ? '…' : ''}”
          </span>
          <button
            type="button"
            className="pill-btn small"
            // Keep the selection on iPhone when the button is pressed.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setOpen(pending)}
          >
            <Highlighter size={16} />
            <span>Highlight</span>
          </button>
        </div>
      ) : (
        <footer className="reader-foot">
          {(highlights.length > 0 || comments.length > 0) && (
            <button type="button" className="notes-pill" onClick={() => setSheet('notes')}>
              <Highlighter size={14} /> {highlights.length + comments.length} notes
            </button>
          )}
          <ProgressBar value={scroll} label="Chapter progress" />
          <div className="foot-row small muted">
            <span>{Math.round(bookPct * 100)}%</span>
            <span>
              Chapter {index + 1} of {list.length}
            </span>
            <span>{minutesLeft ? `${minutesLeft} min left` : ' '}</span>
          </div>
        </footer>
      )}

      {open && (
        <NoteSheet
          chapter={chapter}
          note={'id' in open ? open : undefined}
          pending={'id' in open ? undefined : open}
          onClose={() => {
            setOpen(undefined);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
      {sheet === 'look' && <LookSheet prefs={prefs} setPrefs={setPrefs} onClose={() => setSheet(undefined)} />}
      {sheet === 'chapters' && (
        <Sheet title="Chapters" onClose={() => setSheet(undefined)}>
          <ul className="toc">
            {list.map((c) => (
              <li key={c.id}>
                <a href={`#/chapter/${c.id}`} className={c.id === id ? 'on' : ''} onClick={() => setSheet(undefined)}>
                  <span className="muted">{c.number}</span>
                  <span lang={zh ? 'zh' : undefined}>{c.title}</span>
                  {c.read && <span className="muted small">✓</span>}
                </a>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {sheet === 'notes' && (
        <Sheet title="Notes in this chapter" onClose={() => setSheet(undefined)}>
          <ul className="note-list">
            {[...highlights, ...comments].map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={n.kind === 'highlight' ? 'note hl-note' : 'note'}
                  onClick={() => {
                    setSheet(undefined);
                    setOpen(n);
                  }}
                >
                  {n.quote && <q>{n.quote}</q>}
                  {n.body && (
                    <span>
                      {n.kind === 'chapter' && <MessageCircle size={13} />} {n.body}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {sheet === 'edit' && <EditText chapter={chapter} onClose={() => setSheet(undefined)} />}
    </div>
  );
}

/** Saves reading time for this visit and marks the book as being read. */
function useReadingSession(chapter: Chapter | null | undefined, book: Book | undefined) {
  const chapterId = chapter?.id;
  const bookRef = useRef(book);
  bookRef.current = book;

  useEffect(() => {
    if (!chapterId || !chapter) return;
    const bookId = chapter.bookId;
    let startedAt = document.visibilityState === 'visible' ? Date.now() : 0;

    // Only touch the reading fields, so a cover or review saved at the same moment is not overwritten.
    void db.transaction('rw', db.books, async () => {
      const b = await db.books.get(bookId);
      if (!b) return;
      const changes: Partial<Book> = { lastChapterId: chapterId, lastReadAt: Date.now() };
      if (b.shelf === 'want') {
        const moved = moveToShelf(b, 'reading');
        Object.assign(changes, { shelf: moved.shelf, startedAt: moved.startedAt, updatedAt: moved.updatedAt });
      }
      await db.books.update(bookId, changes);
    });

    const flush = () => {
      if (!startedAt) return;
      const ms = Date.now() - startedAt;
      startedAt = 0;
      // Under 10 seconds is just passing through.
      if (ms < 10_000) return;
      void db.sessions.add({ id: newId(), bookId, chapterId, startedAt: Date.now() - ms, ms: Math.min(ms, 3 * 3_600_000) });
      void db.books.update(bookId, { lastReadAt: Date.now() });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else startedAt = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
    // Only when the chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);
}

/** Comes back to the same spot, and remembers how far down I got. */
function useScrollMemory(chapter: Chapter | null | undefined, onScroll: (fraction: number) => void) {
  const restored = useRef<string>();
  useEffect(() => {
    if (!chapter || restored.current === chapter.id) return;
    restored.current = chapter.id;
    const room = () => document.documentElement.scrollHeight - window.innerHeight;
    requestAnimationFrame(() => {
      const target = (chapter.position ?? 0) < 0.99 ? (chapter.position ?? 0) * room() : 0;
      window.scrollTo(0, target);
      onScroll(chapter.position && chapter.position < 0.99 ? chapter.position : 0);
    });

    let timer: number | undefined;
    const handle = () => {
      const r = room();
      const fraction = r > 0 ? Math.min(1, window.scrollY / r) : 1;
      onScroll(fraction);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void db.chapters.get(chapter.id).then((c) => {
          if (!c) return;
          // Keep the furthest point, and tick the chapter off at the very end of a long chapter.
          const longEnough = r > window.innerHeight * 0.5;
          const changes: Partial<Chapter> = { position: fraction };
          if (fraction > 0.995 && longEnough) changes.read = true;
          void db.chapters.update(chapter.id, changes);
        });
      }, 600);
    };
    window.addEventListener('scroll', handle, { passive: true });
    return () => {
      window.removeEventListener('scroll', handle);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);
}

function CommentBox({ chapter }: { chapter: Chapter }) {
  const [comment, setComment] = useState('');
  async function add() {
    const body = comment.trim();
    if (!body) return;
    const now = Date.now();
    await db.notes.add({ id: newId(), bookId: chapter.bookId, chapterId: chapter.id, kind: 'chapter', body, createdAt: now, updatedAt: now });
    setComment('');
  }
  return (
    <form
      className="comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <textarea
        rows={2}
        placeholder="Your thoughts on this chapter…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button className="pill-btn small" type="submit" disabled={!comment.trim()}>
        <span>Post</span>
      </button>
    </form>
  );
}

function LookSheet({ prefs, setPrefs, onClose }: { prefs: ReaderPrefs; setPrefs: (c: Partial<ReaderPrefs>) => void; onClose: () => void }) {
  return (
    <Sheet title="Reading" onClose={onClose}>
      <div className="look">
        <div className="look-row">
          <span>Text size</span>
          <div className="seg">
            {FONT_SIZES.map((px, i) => (
              <button
                key={px}
                type="button"
                className={prefs.size === i ? 'on' : ''}
                aria-label={`Text size ${i + 1}`}
                style={{ fontSize: 12 + i * 3 }}
                onClick={() => setPrefs({ size: i })}
              >
                A
              </button>
            ))}
          </div>
        </div>
        <div className="look-row">
          <span>Theme</span>
          <div className="themes">
            {(['paper', 'sepia', 'night'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`theme-dot theme-${t} ${prefs.theme === t ? 'on' : ''}`}
                aria-label={t}
                aria-pressed={prefs.theme === t}
                onClick={() => setPrefs({ theme: t })}
              >
                Aa
              </button>
            ))}
          </div>
        </div>
        <div className="look-row">
          <span>Font</span>
          <div className="seg">
            <button type="button" className={prefs.font === 'serif' ? 'on serif' : 'serif'} onClick={() => setPrefs({ font: 'serif' })}>
              Serif
            </button>
            <button type="button" className={prefs.font === 'sans' ? 'on' : ''} onClick={() => setPrefs({ font: 'sans' })}>
              Sans
            </button>
          </div>
        </div>
        <div className="look-row">
          <span>Line spacing</span>
          <div className="seg">
            {(['snug', 'normal', 'airy'] as const).map((s) => (
              <button key={s} type="button" className={prefs.spacing === s ? 'on' : ''} onClick={() => setPrefs({ spacing: s })}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <label className="look-row">
          <span>Big first letter</span>
          <input
            type="checkbox"
            className="switch"
            checked={prefs.dropCap}
            onChange={(e) => setPrefs({ dropCap: e.target.checked })}
          />
        </label>
      </div>
    </Sheet>
  );
}

/** Moves highlights into one paragraph's coordinates, cut to its edges. */
function shiftNotes(notes: Note[], start: number, length: number): Note[] {
  return notes
    .filter((n) => n.start! < start + length && n.end! > start)
    .map((n) => ({ ...n, start: Math.max(0, n.start! - start), end: Math.min(length, n.end! - start) }));
}

/** Turns the browser selection into offsets in the chapter text. */
function readSelection(root: HTMLElement | null): Selection | undefined {
  const sel = window.getSelection();
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return undefined;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return undefined;
  const start = offsetOf(range.startContainer, range.startOffset);
  const end = offsetOf(range.endContainer, range.endOffset);
  if (start === undefined || end === undefined || end <= start) return undefined;
  const quote = sel.toString().trim();
  return quote ? { start, end, quote } : undefined;
}

function offsetOf(node: Node, offset: number): number | undefined {
  const el = node instanceof Element ? node : node.parentElement;
  const p = el?.closest<HTMLElement>('p[data-start]');
  if (!p) return undefined;
  const before = document.createRange();
  before.setStart(p, 0);
  before.setEnd(node, offset);
  return Number(p.dataset.start) + before.toString().length;
}

function NoteSheet({ chapter, note, pending, onClose }: { chapter: Chapter; note?: Note; pending?: Selection; onClose: () => void }) {
  const [body, setBody] = useState(note?.body ?? '');
  const quote = note?.quote ?? pending?.quote;

  async function save() {
    const now = Date.now();
    if (note) {
      await db.notes.update(note.id, { body: body.trim(), updatedAt: now });
    } else if (pending) {
      await db.notes.add({
        id: newId(),
        bookId: chapter.bookId,
        chapterId: chapter.id,
        kind: 'highlight',
        start: pending.start,
        end: pending.end,
        quote: pending.quote,
        body: body.trim(),
        createdAt: now,
        updatedAt: now,
      });
    }
    onClose();
  }

  async function remove() {
    if (note) await db.notes.delete(note.id);
    onClose();
  }

  return (
    <Sheet title={note?.kind === 'chapter' ? 'Comment' : 'Highlight'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {quote && <blockquote>{quote}</blockquote>}
        <label>
          {note?.kind === 'chapter' ? 'Comment' : 'Note (optional)'}
          <textarea autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="row between">
          {note ? (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Trash2 size={16} /> Delete
            </button>
          ) : (
            <span />
          )}
          <button className="pill-btn small" type="submit" disabled={note?.kind === 'chapter' && !body.trim()}>
            <span>Save</span>
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function EditText({ chapter, onClose }: { chapter: Chapter; onClose: () => void }) {
  const [title, setTitle] = useState(chapter.title);
  const [text, setText] = useState(chapter.text ?? '');
  const hasHighlights = useLive(
    () => db.notes.where('chapterId').equals(chapter.id).filter((n) => n.kind === 'highlight').count(),
    [chapter.id],
  );

  async function save() {
    const clean = text.replace(/\r\n/g, '\n');
    await db.chapters.update(chapter.id, { title: title.trim() || chapter.title, text: clean.trim() ? clean : undefined });
    onClose();
  }

  async function removeChapter() {
    if (!confirm('Delete this chapter and its notes?')) return;
    await db.deleteChapter(chapter.id);
    go(`book/${chapter.bookId}`);
  }

  return (
    <Sheet title="Edit chapter" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Text
          <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {!!hasHighlights && text !== (chapter.text ?? '') && (
          <p className="warn small">Changing the text can move your highlights.</p>
        )}
        <div className="row between">
          <button type="button" className="btn danger" onClick={() => void removeChapter()}>
            <Trash2 size={16} /> Delete chapter
          </button>
          <button className="pill-btn small" type="submit">
            <span>Save</span>
          </button>
        </div>
      </form>
    </Sheet>
  );
}
