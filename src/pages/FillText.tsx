import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { chaptersWithoutText, fillFromDrafts, readBookFile } from '../fillText';
import { useLive } from '../hooks';

/**
 * Shown on a book whose text stayed on another device (sync without book text): pick the same PDF or ePub once and the
 * empty chapters are filled. Notes, highlights and progress stay as they are.
 */
export function FillText({ bookId }: { bookId: string }) {
  const missing = useLive(() => chaptersWithoutText(bookId), [bookId]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!missing?.length && !status) return null;

  async function pick(file: File) {
    setBusy(true);
    setStatus('Reading the file…');
    try {
      const drafts = await readBookFile(file);
      const { filled, stillEmpty } = await fillFromDrafts(bookId, drafts);
      setStatus(
        stillEmpty
          ? `Filled ${filled} chapters. ${stillEmpty} still have no text: the file may be a different edition.`
          : `Filled ${filled} chapters. Your notes and progress are as they were.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fill-text glass">
      {!!missing?.length && (
        <p className="small">
          <b>
            {missing.length} {missing.length === 1 ? 'chapter has' : 'chapters have'} no text on this device.
          </b>{' '}
          The text was kept on your other device. Pick the same PDF or ePub here to fill it in.
        </p>
      )}
      {!!missing?.length && (
        <label className={`btn${busy ? ' busy' : ''}`}>
          <FileUp size={16} /> Fill in from file
          <input
            type="file"
            accept="application/pdf,.pdf,application/epub+zip,.epub"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void pick(f);
            }}
          />
        </label>
      )}
      {status && (
        <p className="small" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
