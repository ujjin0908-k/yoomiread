import { useEffect, useRef, useState } from 'react';
import { Header, Sheet } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { formatDate, newId, paragraphs, segmentText } from '../logic';
import type { Chapter, Note } from '../types';

export function ChapterPage({ id }: { id: string }) {
  const chapter = useLive(() => db.chapters.get(id), [id]);
  const notes = useLive(() => db.notes.where('chapterId').equals(id).sortBy('createdAt'), [id]);
  const siblings = useLive(
    async () => (chapter ? db.chapters.where('bookId').equals(chapter.bookId).sortBy('number') : []),
    [chapter?.bookId],
  );
  const [pending, setPending] = useState<{ start: number; end: number; quote: string }>();
  // The selection is copied here when the note opens; focusing the note box clears the live one.
  const [open, setOpen] = useState<Note | { start: number; end: number; quote: string }>();
  const [comment, setComment] = useState('');
  const [editingText, setEditingText] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  // Shows the "Highlight" bar while text in the chapter is selected.
  useEffect(() => {
    const onSelect = () => setPending(readSelection(textRef.current));
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  if (chapter === undefined) return <Header title="" back="" />;
  if (!chapter) {
    return (
      <>
        <Header title="Not found" back="" />
        <p className="empty">This chapter was deleted.</p>
      </>
    );
  }

  const chapterComments = (notes ?? []).filter((n) => n.kind === 'chapter');
  const highlights = (notes ?? []).filter((n) => n.kind === 'highlight');
  const index = (siblings ?? []).findIndex((c) => c.id === id);
  const prev = siblings?.[index - 1];
  const next = siblings?.[index + 1];

  async function addComment() {
    const body = comment.trim();
    if (!body) return;
    const now = Date.now();
    await db.notes.add({
      id: newId(),
      bookId: chapter!.bookId,
      chapterId: id,
      kind: 'chapter',
      body,
      createdAt: now,
      updatedAt: now,
    });
    setComment('');
  }

  async function finishChapter() {
    await db.chapters.update(id, { read: true });
    go(next ? `chapter/${next.id}` : `book/${chapter!.bookId}`);
  }

  async function removeChapter() {
    if (!confirm('Delete this chapter and its notes?')) return;
    await db.deleteChapter(id);
    go(`book/${chapter!.bookId}`);
  }

  return (
    <>
      <Header
        title={`${chapter.number}. ${chapter.title}`}
        back={`book/${chapter.bookId}`}
        right={
          <button type="button" className="icon-btn" aria-label="Edit text" onClick={() => setEditingText(true)}>
            ✎
          </button>
        }
      />
      <main className="page">
        {chapter.text ? (
          <div className="reader" ref={textRef}>
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
              No text for this chapter. You can still leave comments below, or tap ✎ to paste the text and highlight
              lines.
            </p>
          </div>
        )}

        {highlights.length > 0 && (
          <section>
            <h3>Highlights</h3>
            <ul className="note-list">
              {highlights.map((h) => (
                <li key={h.id}>
                  <button type="button" className="note hl-note" onClick={() => setOpen(h)}>
                    <q>{h.quote}</q>
                    {h.body && <span>{h.body}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>Comments on this chapter</h3>
          <ul className="note-list">
            {chapterComments.map((c) => (
              <li key={c.id}>
                <button type="button" className="note" onClick={() => setOpen(c)}>
                  <span>{c.body}</span>
                  <span className="muted small">{formatDate(c.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="comment-form"
            onSubmit={(e) => {
              e.preventDefault();
              void addComment();
            }}
          >
            <textarea
              rows={2}
              placeholder="Your thoughts on this chapter…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={!comment.trim()}>
              Post
            </button>
          </form>
        </section>

        <nav className="chapter-nav">
          {prev ? (
            <a className="btn" href={`#/chapter/${prev.id}`}>
              ‹ {prev.number}
            </a>
          ) : (
            <span />
          )}
          <button type="button" className="btn primary" onClick={() => void finishChapter()}>
            {chapter.read ? (next ? `Next: ${next.number} ›` : 'Back to book') : 'Mark read' + (next ? ' & next ›' : '')}
          </button>
        </nav>

        <button type="button" className="btn danger wide" onClick={() => void removeChapter()}>
          Delete chapter
        </button>
      </main>

      {pending && !open && (
        <div className="selection-bar">
          <span className="muted small">“{pending.quote.slice(0, 40)}{pending.quote.length > 40 ? '…' : ''}”</span>
          <button
            type="button"
            className="btn primary"
            // Keep the selection on iPhone when the button is pressed.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setOpen(pending)}
          >
            Highlight + note
          </button>
        </div>
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
      {editingText && <EditText chapter={chapter} onClose={() => setEditingText(false)} />}
    </>
  );
}

/** Moves highlights into one paragraph's coordinates, cut to its edges. */
function shiftNotes(notes: Note[], start: number, length: number): Note[] {
  return notes
    .filter((n) => n.start! < start + length && n.end! > start)
    .map((n) => ({ ...n, start: Math.max(0, n.start! - start), end: Math.min(length, n.end! - start) }));
}

/** Turns the browser selection into offsets in the chapter text. */
function readSelection(root: HTMLElement | null) {
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

function NoteSheet({
  chapter,
  note,
  pending,
  onClose,
}: {
  chapter: Chapter;
  note?: Note;
  pending?: { start: number; end: number; quote: string };
  onClose: () => void;
}) {
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
              Delete
            </button>
          ) : (
            <span />
          )}
          <button className="btn primary" type="submit" disabled={note?.kind === 'chapter' && !body.trim()}>
            Save
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
        <button className="btn primary" type="submit">
          Save
        </button>
      </form>
    </Sheet>
  );
}
