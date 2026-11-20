import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import type { DraftChapter } from '../import/chapters';
import { guessNumbers, inRange, placeNumbers, rangeLabel } from '../import/range';
import { newId, nextChapterNumber } from '../logic';
import type { Book, Chapter } from '../types';

/**
 * Adds chapters from an ePub or PDF to a book that is already here, so they join its cast, places, links and
 * reading line instead of starting a new book. Pick the file, choose "from chapter … to …", and add.
 */
export function ChapterFile({ book, chapters, onClose }: { book: Book; chapters: Chapter[]; onClose: () => void }) {
  const [found, setFound] = useState<{ name: string; drafts: DraftChapter[]; numbers: number[] }>();
  const [from, setFrom] = useState(() => String(nextChapterNumber(chapters)));
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function open(file: File) {
    setError('');
    setDone('');
    setFound(undefined);
    try {
      let drafts: DraftChapter[];
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        setStatus('Opening the PDF…');
        const { importPdf } = await import('../import/pdf');
        const pdf = await importPdf(file, (page, pages) => setStatus(`Reading page ${page} of ${pages}…`));
        if (pdf.scanned) throw new Error('This PDF is made of pictures, so it has no text to add.');
        drafts = pdf.chapters;
      } else {
        setStatus('Opening the ePub…');
        const { readEpub } = await import('../import/epub');
        drafts = readEpub(new Uint8Array(await file.arrayBuffer())).chapters;
      }
      drafts = drafts.filter((d) => d.text.trim());
      if (!drafts.length) throw new Error('No chapters with text were found in that file.');
      const numbers = guessNumbers(drafts.map((d) => d.title));
      setFound({ name: file.name, drafts, numbers });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message ? e.message : 'Could not read that file.');
    } finally {
      setStatus('');
    }
  }

  const lo = from.trim() ? Number(from) : undefined;
  const hi = to.trim() ? Number(to) : undefined;
  const picked = found ? inRange(found.numbers, lo, hi) : [];

  async function add() {
    if (!found || !picked.length) return;
    setStatus(`Adding ${picked.length} chapters…`);
    setError('');
    try {
      const now = Date.now();
      const existing = (await db.chapters.where('bookId').equals(book.id).toArray()) as Chapter[];
      const numbers = placeNumbers(
        picked.map((i) => found.numbers[i]),
        existing.map((c) => c.number),
      );
      const rows = picked.map((i, k) => {
        const d = found.drafts[i];
        const chapter: Chapter = { id: newId(), bookId: book.id, number: numbers[k], title: d.title, url: d.url, read: false, createdAt: now + k };
        return { chapter, text: d.text };
      });
      await db.transaction('rw', db.books, db.chapters, db.texts, async () => {
        await db.addChapters(rows);
        await db.books.update(book.id, { updatedAt: now });
      });
      setDone(`Added ${rangeLabel(numbers)} to ${book.title}. The cast, places and glossary carry on as they are.`);
      setFound(undefined);
    } catch (e) {
      console.error(e);
      setError('Could not save the chapters. Nothing was added.');
    } finally {
      setStatus('');
    }
  }

  const first = picked.length ? found!.drafts[picked[0]] : undefined;
  const last = picked.length ? found!.drafts[picked[picked.length - 1]] : undefined;

  return (
    <Sheet title="Chapters from a file" locked={!!status} onClose={onClose}>
      <div className="form">
        <p className="muted small">
          Add chapters from an ePub or PDF to <b>{book.title}</b>. They join this book, so its cast, places, links and glossary are used
          for them too. The book has {chapters.length} chapters now.
        </p>

        {!found && (
          <label className={`pill-btn file-pick${status ? ' disabled' : ''}`}>
            <FileUp size={18} />
            <span>{status || 'Choose an ePub or PDF'}</span>
            <input
              type="file"
              accept="application/epub+zip,.epub,application/pdf,.pdf"
              disabled={!!status}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void open(file);
              }}
            />
          </label>
        )}

        {found && (
          <>
            <p className="small">
              <b>{found.drafts.length} chapters</b> in {found.name} ({rangeLabel(found.numbers)}).
            </p>
            <div className="range-row" role="group" aria-label="Choose a range of chapters">
              <span className="small">From</span>
              <input type="number" inputMode="numeric" min={1} aria-label="From chapter" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="small">to</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                aria-label="To chapter"
                placeholder={String(Math.max(...found.numbers))}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            {first && last && (
              <p className="muted small">
                First: {first.title}
                {picked.length > 1 && (
                  <>
                    <br />
                    Last: {last.title}
                  </>
                )}
              </p>
            )}
            {!picked.length && <p className="warn small">No chapters in the file are in that range.</p>}
            <button type="button" className="pill-btn" disabled={!picked.length || !!status} onClick={() => void add()}>
              <span>{status || (picked.length ? `Add ${picked.length} ${picked.length === 1 ? 'chapter' : 'chapters'}` : 'Choose a range')}</span>
            </button>
            <button type="button" className="btn ghost wide" disabled={!!status} onClick={() => setFound(undefined)}>
              Choose another file
            </button>
          </>
        )}

        {done && (
          <p className="small" role="status">
            {done}
          </p>
        )}
        {error && <p className="warn small">{error}</p>}
      </div>
    </Sheet>
  );
}
