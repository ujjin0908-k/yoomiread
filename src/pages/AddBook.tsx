import { BookOpen, ClipboardPaste, FileText, Globe, PenLine } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { go } from '../hooks';
import { shrinkImage } from '../images';
import { SHELVES, moveToShelf, newId } from '../logic';
import type { DraftChapter } from '../import/chapters';
import { extractChapter, fetchPage } from '../import/web';
import { webLink } from '../sources';
import type { Book, BookLanguage, Shelf } from '../types';

export function AddBook({ shelf = 'reading', onClose }: { shelf?: Shelf; onClose: () => void }) {
  const [mode, setMode] = useState<'pick' | 'manual' | 'link' | 'paste'>('pick');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  /** Saves an imported book with its chapters, then asks "Keep this title?". */
  async function save(
    result: { title: string; author: string; language: BookLanguage; cover?: Blob; chapters: DraftChapter[]; scanned?: boolean },
    source: 'pdf' | 'epub' | 'web' | 'paste',
  ) {
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
        source,
        createdAt: now,
        updatedAt: now,
      },
      shelf === 'finished' ? 'reading' : shelf,
      now,
    );
    await db.transaction('rw', db.books, db.chapters, db.texts, async () => {
      await db.books.add(book);
      await db.addChapters(
        result.chapters.map((c, i) => ({
          chapter: { id: newId(), bookId: book.id, number: i + 1, title: c.title, read: false, createdAt: now },
          text: c.text,
        })),
      );
    });
    onClose();
    go(`book/${book.id}/${result.scanned ? 'scanned' : 'imported'}`);
  }

  async function fromLink(raw: string) {
    setError('');
    const url = webLink(raw);
    if (!url) return setError('Paste a web address that starts with https://');
    setStatus('Reading the page…');
    try {
      const page = await fetchPage(url);
      const chapter = extractChapter(page.html);
      if (!chapter.text) throw new Error('No story text was found on that page.');
      await save({ title: chapter.title, author: '', language: /[\u3400-\u9fff]/.test(chapter.text) ? 'zh' : 'other', chapters: [chapter] }, 'web');
    } catch (e) {
      setStatus('');
      setError(e instanceof Error ? e.message : 'Could not read that page.');
    }
  }

  async function fromPaste() {
    const text = pasteText.replace(/\r\n/g, '\n').trim();
    if (!text) return setError('Paste the chapter text first.');
    const title = pasteTitle.trim() || 'Pasted chapter';
    await save({ title, author: '', language: /[\u3400-\u9fff]/.test(text) ? 'zh' : 'other', chapters: [{ title, text }] }, 'paste');
  }

  async function fromPdf(file: File) {
    setError('');
    setStatus('Opening the PDF…');
    try {
      // Loaded only when needed: the PDF reader is big.
      const { importPdf } = await import('../import/pdf');
      const result = await importPdf(file, (page, pages) => setStatus(`Reading page ${page} of ${pages}…`));
      await save(result, 'pdf');
    } catch (e) {
      console.error(e);
      setStatus('');
      setError('Could not read this PDF. Is it password protected or damaged?');
    }
  }

  async function fromEpub(file: File) {
    setError('');
    setStatus('Opening the ePub…');
    try {
      const { readEpub, EpubError } = await import('../import/epub');
      let parsed;
      try {
        parsed = readEpub(new Uint8Array(await file.arrayBuffer()));
      } catch (e) {
        throw e instanceof EpubError ? e : new Error('Could not read this ePub. Is it damaged?');
      }
      let cover: Blob | undefined;
      if (parsed.cover) {
        const raw = new Blob([parsed.cover.bytes], { type: parsed.cover.type });
        // Smaller covers keep the phone light; keep the original if it cannot be shrunk.
        cover = await shrinkImage(raw).catch(() => raw);
      }
      await save({ ...parsed, title: parsed.title || file.name.replace(/\.epub$/i, ''), cover }, 'epub');
    } catch (e) {
      console.error(e);
      setStatus('');
      setError(e instanceof Error ? e.message : 'Could not read this ePub.');
    }
  }

  if (mode === 'manual') return <ManualBook shelf={shelf} onClose={onClose} />;
  if (mode === 'paste') {
    return (
      <Sheet title="Paste a chapter" onClose={onClose}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void fromPaste();
          }}
        >
          <p className="muted small">Copy the text from any page or app and paste it here. Nothing is fetched.</p>
          <label>
            Title <span className="muted small">(the book and chapter name)</span>
            <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} />
          </label>
          <label>
            Chapter text
            <textarea rows={12} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
          </label>
          {status && <p className="small">{status}</p>}
          {error && <p className="warn small">{error}</p>}
          <button className="btn primary" type="submit" disabled={!pasteText.trim() || !!status}>
            Save chapter
          </button>
        </form>
      </Sheet>
    );
  }
  if (mode === 'link') {
    return (
      <Sheet title="From a web link" onClose={onClose}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void fromLink(link);
          }}
        >
          <p className="muted small">Paste the link to one chapter. The page is read through YoomiRead's own server, and only the sites it allows.</p>
          <label>
            Chapter link
            <input inputMode="url" autoCapitalize="off" autoCorrect="off" required value={link} onChange={(e) => setLink(e.target.value)} />
          </label>
          {status && <p className="small">{status}</p>}
          {error && <p className="warn small">{error}</p>}
          <button className="btn primary" type="submit" disabled={!link.trim() || !!status}>
            Read this page
          </button>
        </form>
      </Sheet>
    );
  }

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
        <label className={`add-option ${status ? 'busy' : ''}`}>
          <BookOpen size={26} strokeWidth={1.5} />
          <span>
            <strong>Import an ePub</strong>
            <span className="muted small">Cover, title and chapters from the book file</span>
          </span>
          <input
            type="file"
            accept="application/epub+zip,.epub"
            hidden
            disabled={!!status}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fromEpub(f);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" className="add-option" disabled={!!status} onClick={() => setMode('link')}>
          <Globe size={26} strokeWidth={1.5} />
          <span>
            <strong>From a web link</strong>
            <span className="muted small">Paste a chapter's link and read it here</span>
          </span>
        </button>
        <button type="button" className="add-option" disabled={!!status} onClick={() => setMode('paste')}>
          <ClipboardPaste size={26} strokeWidth={1.5} />
          <span>
            <strong>Paste a chapter</strong>
            <span className="muted small">Copy the text from anywhere and paste it</span>
          </span>
        </button>
        <button type="button" className="add-option" disabled={!!status} onClick={() => setMode('manual')}>
          <PenLine size={26} strokeWidth={1.5} />
          <span>
            <strong>Write it down</strong>
            <span className="muted small">A book I read elsewhere, for my journal</span>
          </span>
        </button>
        {status && <p className="muted small center">{status}</p>}
        {error && <p className="warn small center">{error}</p>}
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
