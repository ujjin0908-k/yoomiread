import { db } from '../db';
import { useLive } from '../hooks';
import { LANGUAGES, sourceOf } from '../languages';
import { Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { Sheet } from '../components';
import { askOriginal, pairAt, saveFix, type FixAnswer } from '../translate/fixLine';
import type { GlossaryKind } from '../types';

/**
 * "Check the original": shows the Chinese paragraph behind a selected English line, finds the exact words (one small
 * call, or select them by hand), and fixes them in this chapter and in the glossary for later chapters.
 */
export function FixLine({
  bookId,
  chapterId,
  original,
  english,
  selection,
  onClose,
}: {
  bookId: string;
  chapterId: string;
  original: string;
  english: string;
  selection: { start: number; end: number; quote: string };
  onClose: () => void;
}) {
  const pair = pairAt(original, english, selection.start);
  const book = useLive(() => db.books.get(bookId), [bookId]);
  const src = sourceOf(book) ?? LANGUAGES.zh;
  const [answer, setAnswer] = useState<FixAnswer>();
  const [zh, setZh] = useState('');
  const [better, setBetter] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<GlossaryKind>('term');
  const [here, setHere] = useState(true);
  const [later, setLater] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const zhRef = useRef<HTMLParagraphElement>(null);

  async function find() {
    if (!pair) return;
    setBusy('Looking…');
    setError('');
    try {
      const a = await askOriginal(bookId, pair, selection.quote);
      setAnswer(a);
      setZh(a.original);
      setBetter(a.suggestion ?? '');
      setNote([a.literal && `Literally “${a.literal}”`, a.meaning].filter(Boolean).join('. '));
      setKind(a.kind ?? 'term');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ask.');
    } finally {
      setBusy('');
    }
  }

  function useSelected() {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && zhRef.current && sel && sel.rangeCount && zhRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      setZh(text);
      setError('');
    } else {
      setError(`Select the ${src.name} words in the paragraph above first (press and hold, then drag).`);
    }
  }

  async function save() {
    setBusy('Saving…');
    try {
      await saveFix({
        chapterId,
        bookId,
        start: selection.start,
        end: selection.end,
        replacement: here && better.trim() ? better.trim() : undefined,
        entry: later && zh.trim() && better.trim() ? { original: zh, english: better, note, kind } : undefined,
      });
      onClose();
    } catch (e) {
      console.error(e);
      setError('Could not save the fix.');
      setBusy('');
    }
  }

  // The selected words in bold inside their English paragraph.
  const at = pair ? pair.english.indexOf(selection.quote) : -1;

  return (
    <Sheet title="Check the original" locked={!!busy} onClose={onClose}>
      <div className="form fix-line">
        {!pair ? (
          <p className="muted small">This chapter has no original text to compare with.</p>
        ) : (
          <>
            <p className="small fix-en">
              {at >= 0 ? (
                <>
                  {pair.english.slice(0, at)}
                  <mark>{selection.quote}</mark>
                  {pair.english.slice(at + selection.quote.length)}
                </>
              ) : (
                pair.english
              )}
            </p>
            <p className="fix-zh" lang={src.htmlLang} ref={zhRef}>
              {zh && pair.original.includes(zh) ? (
                <>
                  {pair.original.slice(0, pair.original.indexOf(zh))}
                  <mark>{zh}</mark>
                  {pair.original.slice(pair.original.indexOf(zh) + zh.length)}
                </>
              ) : (
                pair.original
              )}
            </p>
            {!pair.exact && <p className="muted small">The two versions have a different number of paragraphs, so this may be the line before or after.</p>}

            {!answer && (
              <div className="row-2">
                <button type="button" className="pill-btn" disabled={!!busy} onClick={() => void find()}>
                  <Search size={16} />
                  <span>{busy || `Find the ${src.name}`}</span>
                </button>
                <button type="button" className="btn ghost" disabled={!!busy} onPointerDown={(e) => e.preventDefault()} onClick={useSelected}>
                  Use my selection
                </button>
              </div>
            )}
            {answer?.meaning && (
              <p className="small">
                <b lang={src.htmlLang}>{answer.original}</b>
                {answer.literal ? ` (literally “${answer.literal}”)` : ''}: {answer.meaning}
              </p>
            )}

            <div className="row-2">
              <label>
                {src.name}
                <input lang={src.htmlLang} value={zh} disabled={!!busy} onChange={(e) => setZh(e.target.value)} />
              </label>
              <label>
                English instead
                <input value={better} disabled={!!busy} placeholder={selection.quote} onChange={(e) => setBetter(e.target.value)} />
              </label>
            </div>
            <label>
              Note <span className="muted small">(goes to the translator with the name)</span>
              <input value={note} disabled={!!busy} onChange={(e) => setNote(e.target.value)} />
            </label>
            <label className="row small">
              <input type="checkbox" className="switch" checked={here} disabled={!!busy} onChange={(e) => setHere(e.target.checked)} />
              <span>
                Change “{selection.quote.slice(0, 30)}” in this chapter now
              </span>
            </label>
            <label className="row small">
              <input type="checkbox" className="switch" checked={later} disabled={!!busy} onChange={(e) => setLater(e.target.checked)} />
              <span>Add to the glossary, so later chapters use it</span>
            </label>
            {error && <p className="warn small">{error}</p>}
            <button type="button" className="pill-btn" disabled={!!busy || !better.trim() || (!here && !(later && zh.trim()))} onClick={() => void save()}>
              <span>{busy === 'Saving…' ? busy : 'Save the fix'}</span>
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
