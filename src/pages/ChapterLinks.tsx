import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { guessLanguage, newId, nextChapterNumber } from '../logic';
import { chapterNumber, extractChapter, extractChapterLinks, fetchPage, findContentsChapter, type ChapterLink } from '../import/web';
import { webLink } from '../sources';
import type { Book, Chapter } from '../types';

/** Chapters are fetched one at a time with this pause between them, so the site is not hammered. */
const PAUSE_MS = 700;
const DEFAULT_BATCH = 20;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const timer = window.setTimeout(done, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        done();
      },
      { once: true },
    );
  });
}

/** Reads one chapter's text. Tries a second time after a short wait when the site hiccups. */
async function readChapter(url: string, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const page = await fetchPage(url);
      const { text } = extractChapter(page.html);
      if (!text) throw new Error('No story text was found.');
      return text;
    } catch (e) {
      if (attempt >= 1 || signal.aborted) throw e;
      await wait(1500, signal);
    }
  }
}

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Adds many chapters to a book from the novel's contents page: paste its link, tick the chapters, and they are
 * read one after another and saved on this phone. Chapters already in the book are shown as added.
 */
export function ChapterLinks({
  book,
  chapters,
  initialLink,
  onClose,
}: {
  book: Book;
  chapters: Chapter[];
  /** When set, the page is read straight away (right after a contents page was pasted in "From a web link"). */
  initialLink?: string;
  onClose: () => void;
}) {
  const [link, setLink] = useState(initialLink ?? book.sources?.[0]?.url ?? '');
  const [found, setFound] = useState<ChapterLink[]>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [stray, setStray] = useState<Chapter>();
  const [removeStray, setRemoveStray] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('');
  const stop = useRef<AbortController>();
  const started = useRef(false);

  // What is in the book already, by address and by title (a chapter pasted earlier has no address).
  const have = (l: ChapterLink) => chapters.some((c) => c.url === l.url || same(c.title, l.title));

  async function find(raw: string) {
    setError('');
    setSummary('');
    const url = webLink(raw);
    if (!url) return setError('Paste a web address that starts with https://');
    setStatus('Reading the contents page…');
    try {
      const page = await fetchPage(url);
      const links = extractChapterLinks(page.html, page.url);
      if (!links.length) throw new Error("No chapter links were found on that page. Paste the novel's contents page, not a single chapter.");
      setLink(page.url);
      setFound(links);
      setPicked(new Set(links.filter((l) => !have(l)).slice(0, DEFAULT_BATCH).map((l) => l.url)));
      // The contents page itself may have been saved as a "chapter" by an earlier import.
      const rows = await Promise.all(chapters.map(async (c) => ({ id: c.id, url: c.url, title: c.title, text: (await db.texts.get(c.id))?.text ?? '' })));
      const id = findContentsChapter(rows, links, extractChapter(page.html));
      setStray(chapters.find((c) => c.id === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that page.');
    } finally {
      setStatus('');
    }
  }

  useEffect(() => {
    if (initialLink && !started.current) {
      started.current = true;
      void find(initialLink);
    }
    return () => stop.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const todo = (found ?? []).filter((l) => picked.has(l.url) && !have(l));
    if (!todo.length) return;
    setRunning(true);
    setError('');
    setSummary('');
    const controller = new AbortController();
    stop.current = controller;
    // Keeps the screen on while it reads: a phone that falls asleep stops the page.
    const awake = await navigator.wakeLock?.request('screen').catch(() => undefined);
    let added = 0;
    const failed: string[] = [];
    let lastText = '';
    try {
      if (stray && removeStray) {
        await db.deleteChapter(stray.id);
        setStray(undefined);
      }
      let existing = (await db.chapters.where('bookId').equals(book.id).toArray()) as Chapter[];
      for (let i = 0; i < todo.length && !controller.signal.aborted; i++) {
        const l = todo[i];
        setStatus(`Reading ${i + 1} of ${todo.length}: ${l.title}`);
        try {
          const text = await readChapter(l.url, controller.signal);
          const n = chapterNumber(l.title);
          const taken = new Set(existing.map((c) => c.number));
          const row: Chapter = {
            id: newId(),
            bookId: book.id,
            number: n !== undefined && !taken.has(n) ? n : nextChapterNumber(existing),
            title: l.title,
            url: l.url,
            read: false,
            createdAt: Date.now(),
          };
          // Saved as it arrives, so stopping (or the phone sleeping) never loses what is done.
          await db.addChapters([{ chapter: row, text }]);
          existing = [...existing, row];
          lastText = text;
          added++;
          setPicked((p) => {
            const next = new Set(p);
            next.delete(l.url);
            return next;
          });
        } catch (e) {
          if (controller.signal.aborted) break;
          failed.push(`${l.title} (${e instanceof Error ? e.message : 'failed'})`);
        }
        if (i < todo.length - 1) await wait(PAUSE_MS, controller.signal);
      }
      // Remember the contents page on the book, so next time the link is already there.
      const sources = book.sources ?? [];
      const change: Partial<Book> = { updatedAt: Date.now() };
      if (link && !sources.some((s) => s.url === link)) change.sources = [...sources, { name: new URL(link).hostname.replace(/^www\./, ''), url: link }];
      if (book.language === 'other' && lastText) change.language = guessLanguage(lastText);
      await db.books.update(book.id, change);
    } finally {
      await awake?.release().catch(() => {});
      const parts = [`Added ${added} ${added === 1 ? 'chapter' : 'chapters'}.`];
      if (controller.signal.aborted) parts.push('Stopped.');
      if (failed.length) parts.push(`Not read: ${failed.join('; ')}. They are still ticked, so tap Add again to try them.`);
      setSummary(parts.join(' '));
      setStatus('');
      setRunning(false);
    }
  }

  const list = found ?? [];
  const added = list.filter(have).length;
  const toAdd = list.filter((l) => picked.has(l.url) && !have(l)).length;

  return (
    <Sheet title="Add chapters" locked={running} onClose={onClose}>
      {!found ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void find(link);
          }}
        >
          <p className="muted small">
            Paste the link to the novel's contents page, the one that lists all its chapters. They are read one after another and saved on
            this phone.
          </p>
          <label>
            Contents page link
            <input inputMode="url" autoCapitalize="off" autoCorrect="off" required value={link} onChange={(e) => setLink(e.target.value)} />
          </label>
          {status && <p className="small">{status}</p>}
          {error && <p className="warn small">{error}</p>}
          <button className="btn primary" type="submit" disabled={!link.trim() || !!status}>
            Find chapters
          </button>
        </form>
      ) : (
        <div className="form">
          <p className="small">
            <b>{list.length} chapters found</b>
            {added ? `, ${added} already in this book` : ''}. Chapters are read one at a time, with a short pause. Keep the app open while it works.
          </p>

          {stray && (
            <label className="row small batch-stray">
              <input type="checkbox" className="switch" checked={removeStray} disabled={running} onChange={(e) => setRemoveStray(e.target.checked)} />
              <span>Remove “{stray.title}”: it is the contents page, saved as a chapter earlier.</span>
            </label>
          )}

          <div className="filter-row" role="group" aria-label="Choose chapters">
            <button
              type="button"
              className="filter-chip"
              disabled={running}
              onClick={() => setPicked(new Set(list.filter((l) => !have(l)).slice(0, DEFAULT_BATCH).map((l) => l.url)))}
            >
              Next {DEFAULT_BATCH}
            </button>
            <button type="button" className="filter-chip" disabled={running} onClick={() => setPicked(new Set(list.filter((l) => !have(l)).map((l) => l.url)))}>
              All
            </button>
            <button type="button" className="filter-chip" disabled={running} onClick={() => setPicked(new Set())}>
              None
            </button>
          </div>

          <ul className="batch-list">
            {list.map((l) => {
              const done = have(l);
              const on = picked.has(l.url);
              return (
                <li key={l.url}>
                  <button
                    type="button"
                    className={`check${on || done ? ' on' : ''}`}
                    disabled={done || running}
                    aria-pressed={on || done}
                    aria-label={`${done ? 'Already added: ' : on ? 'Unselect ' : 'Select '}${l.title}`}
                    onClick={() =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (next.has(l.url)) next.delete(l.url);
                        else next.add(l.url);
                        return next;
                      })
                    }
                  >
                    {on || done ? '✓' : ''}
                  </button>
                  <span className={done ? 'muted' : ''}>{l.title}</span>
                </li>
              );
            })}
          </ul>

          {status && (
            <p className="small" role="status">
              {status}
            </p>
          )}
          {summary && (
            <p className={`small${summary.includes('Not read') ? ' warn' : ''}`} role="status">
              {summary}
            </p>
          )}
          {error && <p className="warn small">{error}</p>}

          {running ? (
            <button type="button" className="btn wide" onClick={() => stop.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="button" className="pill-btn" disabled={!toAdd} onClick={() => void add()}>
              <span>{toAdd ? `Add ${toAdd} ${toAdd === 1 ? 'chapter' : 'chapters'}` : 'Tick the chapters to add'}</span>
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
