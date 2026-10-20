import { FileText, PenLine } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { go } from '../hooks';
import { shrinkImage } from '../images';
import { SHELVES, moveToShelf, newId } from '../logic';
import type { Book, BookLanguage, Shelf } from '../types';

export function AddBook({ shelf = 'reading', onClose }: { shelf?: Shelf; onClose: () => void }) {
  const [mode, setMode] = useState<'pick' | 'manual'>('pick');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function fromPdf(file: File) {
    setError('');
    setStatus('Opening the PDF…');
    try {
      // Loaded only when needed: the PDF reader is big.
      const { importPdf } = await import('../import/pdf');
      const result = await importPdf(file, (page, pages) => setStatus(`Reading page ${page} of ${pages}…`));
      setStatus('Saving…');
      const now = Date.now();
      const book: Book = moveToShelf(
        {
          id: newId(),
          title: result.title,
          author: result.author,
          language: result.language,
          shelf: 'want',
          cover: result.cover,
          source: 'pdf',
          createdAt: now,
          updatedAt: now,
        },
        shelf === 'finished' ? 'reading' : shelf,
        now,
      );
      await db.transaction('rw', db.books, db.chapters, async () => {
        await db.books.add(book);
        await db.chapters.bulkAdd(
          result.chapters.map((c, i) => ({
            id: newId(),
            bookId: book.id,
            number: i + 1,
            title: c.title,
            text: c.text,
            read: false,
            createdAt: now,
          })),
        );
      });
      onClose();
      go(`book/${book.id}${result.scanned ? '/scanned' : ''}`);
    } catch (e) {
      console.error(e);
      setStatus('');
      setError('Could not read this PDF. Is it password protected or damaged?');
    }
  }

  if (mode === 'manual') return <ManualBook shelf={shelf} onClose={onClose} />;

  return (
    <Sheet title="Add a book" onClose={onClose}>
      <div className="add-options">
        <label className={`add-option ${status ? 'busy' : ''}`}>
          <FileText size={26} strokeWidth={1.5} />
          <span>
            <strong>Import a PDF</strong>
            <span className="muted small">Cover, title and chapters are filled in for you</span>
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            hidden
            disabled={!!status}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fromPdf(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" className="add-option" disabled={!!status} onClick={() => setMode('manual')}>
          <PenLine size={26} strokeWidth={1.5} />
          <span>
            <strong>Write it down</strong>
            <span className="muted small">A book I read elsewhere, for my journal</span>
          </span>
        </button>
        {status && <p className="muted small center">{status}</p>}
        {error && <p className="warn small center">{error}</p>}
        <p className="muted small center">ePub and chapter links are coming next.</p>
      </div>
    </Sheet>
  );
}

function ManualBook({ shelf, onClose }: { shelf: Shelf; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [language, setLanguage] = useState<BookLanguage>('en');
  const [where, setWhere] = useState<Shelf>(shelf);
  const [cover, setCover] = useState<Blob>();

  async function save() {
    const now = Date.now();
    const base: Book = {
      id: newId(),
      title: title.trim(),
      author: author.trim(),
      originalTitle: originalTitle.trim() || undefined,
      language,
      shelf: 'want',
      cover,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    const book = moveToShelf(base, where, now);
    await db.books.add(book);
    onClose();
    // Finished books go straight to the rating and review step.
    go(where === 'finished' ? `book/${book.id}/finish` : `book/${book.id}`);
  }

  return (
    <Sheet title="Write down a book" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void save();
        }}
      >
        <label>
          Title
          <input autoFocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          Original title <span className="muted small">(optional, e.g. Chinese)</span>
          <input value={originalTitle} onChange={(e) => setOriginalTitle(e.target.value)} lang="zh" />
        </label>
        <div className="row-2">
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as BookLanguage)}>
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Shelf
            <select value={where} onChange={(e) => setWhere(e.target.value as Shelf)}>
              {SHELVES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="btn ghost">
          {cover ? 'Cover added ✓' : 'Add a cover photo (optional)'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCover(await shrinkImage(f));
            }}
          />
        </label>
        <button className="btn primary" type="submit" disabled={!title.trim()}>
          Save book
        </button>
      </form>
    </Sheet>
  );
}
