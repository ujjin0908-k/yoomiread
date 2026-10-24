import { AlertTriangle, ChevronLeft, ChevronRight, Highlighter, Languages, List, MessageCircle, PenLine, Trash2, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProgressBar, Sheet, TopBar, Working } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { bookProgress, folderNames, formatDate, moveToShelf, newId, paragraphs, readingMinutes, segmentText, wordAt } from '../logic';
import { WordSheet } from './WordSheet';
import { FONT_SIZES, useReaderPrefs, type ReaderPrefs } from '../prefs';
import { costOf, estimateTokens, formatCost } from '../translate/prompt';
import { keepTranslation, loadSettings, modelFor, translateChapter, type ChapterRun } from '../translate/run';
import { useTranslateAhead } from '../translate/ahead';
import type { Book, Chapter, GlossaryEntry, Note, TranslateSettings } from '../types';
import { Avatar } from './Glossary';

type View = 'original' | 'translation';

type Selection = { start: number; end: number; quote: string };

export function ChapterPage({ id }: { id: string }) {
  const chapter = useLive(async () => (await db.chapters.get(id)) ?? null, [id]);
  const book = useLive(async () => (chapter ? await db.books.get(chapter.bookId) : undefined), [chapter?.bookId]);
  // '' means no text; undefined means still loading.
  const text = useLive(async () => (await db.texts.get(id))?.text ?? '', [id]);
  const translation = useLive(async () => (await db.translations.get(id)) ?? null, [id]);
  const glossary = useLive(async () => (chapter ? db.glossary.where('bookId').equals(chapter.bookId).toArray() : []), [chapter?.bookId]);
  const notes = useLive(() => db.notes.where('chapterId').equals(id).sortBy('createdAt'), [id]);
  const siblings = useLive(
    async () => (chapter ? db.chapters.where('bookId').equals(chapter.bookId).sortBy('number') : []),
    [chapter?.bookId],
  );
  const [prefs, setPrefs] = useReaderPrefs();
  const [pending, setPending] = useState<Selection>();
  // The selection is copied here when the note opens; focusing the note box clears the live one.
  const [open, setOpen] = useState<Note | Selection>();
  const [sheet, setSheet] = useState<'look' | 'chapters' | 'notes' | 'edit' | 'translate'>();
  // English first when there is a translation; I can switch any time.
  const [chosenView, setView] = useState<View>();
  const [card, setCard] = useState<GlossaryEntry>();
  // A word tapped in the reader, looked up in a dictionary and Wikipedia.
  const [lookup, setLookup] = useState<{ word: string; lang: 'en' | 'zh' }>();
  const [scroll, setScroll] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);

  useReadingSession(chapter, book);
  const aheadStatus = useTranslateAhead(chapter, book);
  useScrollMemory(chapter, text !== undefined && translation !== undefined, setScroll);

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

  const view: View = chosenView ?? (translation ? 'translation' : 'original');
  const shown = view === 'translation' && translation ? translation.text : text;
  const english = view === 'translation' && !!translation;
  const highlights = (notes ?? []).filter((n) => n.kind === 'highlight' && (n.on ?? 'original') === view);
  // Faces only for people who have a picture; nobody else gets a circle.
  const faces = (glossary ?? []).filter((g) => g.kind === 'person' && g.picture && g.status === 'ok');
  const faceFor = (paragraph: string) => faces.find((g) => paragraph.includes(english ? g.english : g.original));
  const comments = (notes ?? []).filter((n) => n.kind === 'chapter');
  const list = siblings ?? [];
  const index = list.findIndex((c) => c.id === id);
  const prev = list[index - 1];
  const next = list[index + 1];
  const live = list.map((c) => (c.id === id ? { ...c, position: Math.max(c.position ?? 0, scroll) } : c));
  const bookPct = book ? bookProgress(book, live) : 0;
  const minutesLeft = shown ? readingMinutes(shown, scroll) : 0;
  const zh = book?.language === 'zh' && !english;

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
            <button type="button" className="round-btn plain" aria-label="Translate" disabled={!text} onClick={() => setSheet('translate')}>
              <Languages size={19} />
            </button>
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
        {aheadStatus && <p className="small muted">{aheadStatus}</p>}
        <h1 className="chapter-title" lang={zh ? 'zh' : undefined}>
          {chapter.title}
        </h1>
        <span className="title-rule" aria-hidden="true" />

        {translation && (
          <div className="view-toggle seg" role="group" aria-label="Show">
            <button type="button" className={view === 'original' ? 'on' : ''} aria-pressed={view === 'original'} onClick={() => setView('original')}>
              中文
            </button>
            <button type="button" className={view === 'translation' ? 'on' : ''} aria-pressed={view === 'translation'} onClick={() => setView('translation')}>
              English
            </button>
          </div>
        )}
        {english && translation && <TranslatedBy translation={translation} />}
        {english && translation?.warnings?.length ? (
          <div className="card warn-card small">
            <AlertTriangle size={14} /> {translation.warnings.join(' ')}{' '}
            <a href={`#/glossary/${chapter.bookId}`}>Check the glossary</a>
          </div>
        ) : null}

        {text === undefined || translation === undefined ? null : shown ? (
          <div
            className={`reader ${prefs.dropCap ? 'drop' : ''}`}
            ref={textRef}
            lang={zh ? 'zh' : 'en'}
            onClick={(e) => {
              // A tap on a word looks it up; a highlight opens its note; a drag selects text instead.
              const sel = window.getSelection();
              if ((sel && !sel.isCollapsed) || (e.target as HTMLElement).closest('mark')) return;
              const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
              if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return;
              const word = wordAt((range.startContainer as Text).data, range.startOffset, zh ? 'zh' : 'en');
              if (word) setLookup({ word, lang: zh ? 'zh' : 'en' });
            }}
          >
            {withFaces(paragraphs(shown), faceFor).map(({ p, face }) => (
              <p key={`${view}-${p.start}`} data-start={p.start} className={face ? 'has-face' : undefined}>
                {face && <Avatar entry={face} size={26} onClick={() => setCard(face)} />}
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
          on={view}
          onClose={() => {
            setOpen(undefined);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
      {lookup && <WordSheet word={lookup.word} lang={lookup.lang} bookId={chapter.bookId} onClose={() => setLookup(undefined)} />}
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
      {sheet === 'edit' && <EditText chapter={chapter} text={text ?? ''} onClose={() => setSheet(undefined)} />}
      {sheet === 'translate' && book && (
        <TranslateChapterSheet
          book={book}
          chapter={chapter}
          text={text ?? ''}
          hasEnglishHighlights={(notes ?? []).some((n) => n.kind === 'highlight' && n.on === 'translation')}
          onClose={() => setSheet(undefined)}
          onDone={() => {
            setSheet(undefined);
            setView('translation');
          }}
        />
      )}
      {card && (
        <Sheet title={card.english} onClose={() => setCard(undefined)}>
          <div className="person-card">
            <Avatar entry={card} size={96} />
            <p lang="zh" className="muted">
              {card.original}
            </p>
            {card.gender && <span className="chip">{card.gender}</span>}
            {card.note && <p>{card.note}</p>}
            <a className="link" href={`#/glossary/${card.bookId}`}>
              Open the glossary
            </a>
          </div>
        </Sheet>
      )}
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
function useScrollMemory(chapter: Chapter | null | undefined, ready: boolean, onScroll: (fraction: number) => void) {
  const restored = useRef<string>();
  useEffect(() => {
    // Wait for the text: before it is on screen the page is too short to scroll to the saved spot.
    if (!chapter || !ready || restored.current === chapter.id) return;
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
          if (fraction > 0.9 && longEnough) changes.read = true;
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
  }, [chapter?.id, ready]);
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
            {(['paper', 'sepia', 'parchment', 'mint', 'rose', 'night'] as const).map((t) => (
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
            <button type="button" className={prefs.font === 'garamond' ? 'on serif' : 'serif'} onClick={() => setPrefs({ font: 'garamond' })}>
              Garamond
            </button>
            <button type="button" className={prefs.font === 'old' ? 'on serif' : 'serif'} onClick={() => setPrefs({ font: 'old' })}>
              Old print
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

/**
 * Pairs paragraphs with a face, but only when the character changes from the paragraph before,
 * so a long scene with one person does not get a circle on every line.
 */
function withFaces<P extends { text: string }>(list: P[], faceFor: (text: string) => GlossaryEntry | undefined) {
  let last: string | undefined;
  return list.map((p) => {
    const found = faceFor(p.text);
    const face = found && found.id !== last ? found : undefined;
    if (found) last = found.id;
    return { p, face };
  });
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

function NoteSheet({ chapter, note, pending, on, onClose }: { chapter: Chapter; note?: Note; pending?: Selection; on: View; onClose: () => void }) {
  const [body, setBody] = useState(note?.body ?? '');
  const [folder, setFolder] = useState(note?.folder ?? '');
  const folders = useLive(async () => folderNames(await db.notes.where('kind').equals('highlight').toArray()), []) ?? [];
  const quote = note?.quote ?? pending?.quote;

  async function save() {
    const now = Date.now();
    if (note) {
      await db.notes.update(note.id, { body: body.trim(), folder: folder.trim() || undefined, updatedAt: now });
    } else if (pending) {
      await db.notes.add({
        id: newId(),
        bookId: chapter.bookId,
        chapterId: chapter.id,
        kind: 'highlight',
        on,
        start: pending.start,
        end: pending.end,
        quote: pending.quote,
        folder: folder.trim() || undefined,
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
        {note?.kind !== 'chapter' && (
          <label>
            Folder <span className="muted small">(optional)</span>
            <input list="highlight-folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Lines, Plot" />
            <datalist id="highlight-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
        )}
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

function EditText({ chapter, text: original, onClose }: { chapter: Chapter; text: string; onClose: () => void }) {
  const [title, setTitle] = useState(chapter.title);
  const [text, setText] = useState(original);
  const hasHighlights = useLive(
    () => db.notes.where('chapterId').equals(chapter.id).filter((n) => n.kind === 'highlight').count(),
    [chapter.id],
  );

  async function save() {
    const clean = text.replace(/\r\n/g, '\n');
    await db.setText(chapter, clean.trim() ? clean : undefined);
    await db.chapters.update(chapter.id, { title: title.trim() || chapter.title });
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
        {!!hasHighlights && text !== original && (
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

/** "Claude Haiku 5.5 · 0.09¢": the model behind this English text and what it cost. */
function TranslatedBy({ translation }: { translation: { model: string; cost?: number; costEstimated?: boolean } }) {
  const [label, setLabel] = useState(translation.model);
  useEffect(() => {
    void loadSettings().then((s) => setLabel(s.models.find((m) => m.id === translation.model)?.label ?? translation.model));
  }, [translation.model]);
  return (
    <p className="translated-by small muted">
      {label}
      {translation.cost !== undefined && ` · ${translation.costEstimated ? 'about ' : ''}${formatCost(translation.cost)} for this chapter`}
    </p>
  );
}

type Mode = 'translate' | 'compare';

/** Translate this chapter, or compare two models on it and keep the better one. */
function TranslateChapterSheet({
  book,
  chapter,
  text,
  hasEnglishHighlights,
  onClose,
  onDone,
}: {
  book: Book;
  chapter: Chapter;
  text: string;
  hasEnglishHighlights: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [settings, setSettings] = useState<TranslateSettings>();
  const [mode, setMode] = useState<Mode>('translate');
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');
  const [live, setLive] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [runs, setRuns] = useState<{ a?: ChapterRun; b?: ChapterRun; aMs?: number; bMs?: number }>({});
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [useForBook, setUseForBook] = useState(true);
  const stop = useRef<AbortController>();

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      const first = modelFor(s, book.model).id;
      setModelA(first);
      setModelB(s.models.find((m) => m.id !== first)?.id ?? first);
    });
  }, [book.model]);
  useEffect(() => () => stop.current?.abort(), []);
  if (!settings) return null;

  const ready = settings.baseUrl.trim() && settings.apiKey.trim();
  const tokens = estimateTokens(text);
  const estimate = (id: string) => formatCost(costOf(modelFor(settings, id), tokens.input, tokens.output));
  const shownCost = (r?: ChapterRun) => (r?.translation.cost !== undefined ? formatCost(r.translation.cost) : undefined);

  async function translateOne() {
    setRunning(true);
    setError('');
    setLive({ a: '', b: '' });
    stop.current = new AbortController();
    try {
      if (useForBook && modelA !== book.model) await db.books.update(book.id, { model: modelA });
      await translateChapter(chapter, {
        settings: settings!,
        model: modelA,
        signal: stop.current.signal,
        onText: (piece) => setLive((l) => ({ ...l, a: l.a + piece })),
      });
      onDone();
    } catch (e) {
      setError(stop.current.signal.aborted ? 'Stopped. Nothing was saved.' : e instanceof Error ? e.message : 'The translation failed.');
    } finally {
      setRunning(false);
    }
  }

  async function compare() {
    setRunning(true);
    setError('');
    setRuns({});
    setLive({ a: '', b: '' });
    stop.current = new AbortController();
    const one = async (slot: 'a' | 'b', model: string) => {
      const started = Date.now();
      try {
        const run = await translateChapter(chapter, {
          settings: settings!,
          model,
          save: false,
          signal: stop.current!.signal,
          onText: (piece) => setLive((l) => ({ ...l, [slot]: l[slot] + piece })),
        });
        setRuns((r) => ({ ...r, [slot]: run, [`${slot}Ms`]: Date.now() - started }));
      } catch (e) {
        setError((old) => `${old}${old ? ' ' : ''}${modelFor(settings!, model).label}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    };
    await Promise.all([one('a', modelA), one('b', modelB)]);
    setRunning(false);
  }

  async function keep(slot: 'a' | 'b') {
    const run = runs[slot];
    if (!run) return;
    await keepTranslation(run);
    if (useForBook) await db.books.update(book.id, { model: run.translation.model });
    onDone();
  }

  const picker = (value: string, set: (v: string) => void, label: string) => (
    <label>
      {label}
      <select value={value} disabled={running} onChange={(e) => set(e.target.value)}>
        {settings.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );

  const preview = mode === 'translate' ? live.a : tab === 'a' ? runs.a?.translation.text ?? live.a : runs.b?.translation.text ?? live.b;

  return (
    <Sheet title={mode === 'compare' ? 'Compare two models' : 'Translate this chapter'} onClose={() => (running ? undefined : onClose())}>
      <div className="form">
        <div className="seg mode-toggle" role="group">
          <button type="button" className={mode === 'translate' ? 'on' : ''} disabled={running} onClick={() => setMode('translate')}>
            Translate
          </button>
          <button type="button" className={mode === 'compare' ? 'on' : ''} disabled={running || settings.models.length < 2} onClick={() => setMode('compare')}>
            Compare
          </button>
        </div>
        {!ready && (
          <p className="warn small">
            Add your provider address and API key in <a href="#/settings">Settings</a> first.
          </p>
        )}
        {mode === 'translate' ? (
          <>
            {picker(modelA, setModelA, 'Model')}
            <p className="small">About {estimate(modelA)} for this chapter (estimate).</p>
          </>
        ) : (
          <>
            <div className="row-2">
              {picker(modelA, setModelA, 'A')}
              {picker(modelB, setModelB, 'B')}
            </div>
            <p className="small">
              About {estimate(modelA)} + {estimate(modelB)}. Nothing is saved until you keep one.
            </p>
          </>
        )}
        <label className="look-row small">
          <span>Use the kept model for this book from now on</span>
          <input type="checkbox" className="switch" checked={useForBook} onChange={(e) => setUseForBook(e.target.checked)} />
        </label>
        {hasEnglishHighlights && <p className="warn small">A new translation can move your highlights on the English text.</p>}

        {mode === 'compare' && (runs.a || runs.b || live.a || live.b) && (
          <div className="seg" role="tablist">
            {(['a', 'b'] as const).map((slot) => {
              const r = runs[slot];
              const ms = slot === 'a' ? runs.aMs : runs.bMs;
              return (
                <button key={slot} type="button" role="tab" aria-selected={tab === slot} className={tab === slot ? 'on' : ''} onClick={() => setTab(slot)}>
                  {slot.toUpperCase()}
                  {r ? ` · ${shownCost(r) ?? '?'} · ${Math.round((ms ?? 0) / 1000)}s` : ' …'}
                </button>
              );
            })}
          </div>
        )}
        {preview && (
          <div className="preview" aria-live="polite">
            {preview.split(/\n+/).map((p, i) => (
              <p key={i}>{p.split('===NEW TERMS===')[0]}</p>
            ))}
          </div>
        )}
        {error && <p className="warn small">{error}</p>}

        {running ? (
          <>
            <Working label={mode === 'compare' ? 'Comparing both models' : 'Translating this chapter'} peek={tab === 'b' ? live.b : live.a} />
            <button type="button" className="btn" onClick={() => stop.current?.abort()}>
              Stop
            </button>
          </>
        ) : mode === 'translate' ? (
          <button type="button" className="pill-btn" disabled={!ready || !text} onClick={() => void translateOne()}>
            <span>Translate</span>
          </button>
        ) : runs.a || runs.b ? (
          <div className="row-2">
            <button type="button" className="pill-btn small" disabled={!runs.a} onClick={() => void keep('a')}>
              <span>Keep A</span>
            </button>
            <button type="button" className="pill-btn small" disabled={!runs.b} onClick={() => void keep('b')}>
              <span>Keep B</span>
            </button>
          </div>
        ) : (
          <button type="button" className="pill-btn" disabled={!ready || !text} onClick={() => void compare()}>
            <span>Compare</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
