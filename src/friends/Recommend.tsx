import { useEffect, useState } from 'react';
import { Sheet } from '../components';
import type { Book } from '../types';
import type { CardData } from './card';
import { friendCards, postFeed } from './friends';

/**
 * Recommend a book to friends (from the book's page): pick friends, or all of them, and write a short note with no
 * spoilers. It lands in their activity feed. Only the title and the note are sent, never the book.
 */
export function RecommendSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const [friends, setFriends] = useState<CardData[]>();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void friendCards()
      .then(setFriends)
      .catch((e) => setStatus(e instanceof Error ? e.message : 'Friends could not be loaded.'));
  }, []);

  const count = all ? friends?.length ?? 0 : picked.size;
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setAll(false);
  };

  async function send() {
    setBusy(true);
    setStatus('');
    try {
      if (all) await postFeed({ kind: 'recommend', book_title: book.title, note, rating: null, to_user: null });
      else for (const id of picked) await postFeed({ kind: 'recommend', book_title: book.title, note, rating: null, to_user: id });
      setStatus(`Sent to ${count === 1 ? 'your friend' : `${count} friends`}.`);
      setTimeout(onClose, 900);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'It could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Recommend it" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (count) void send();
        }}
      >
        <div className="card-form-group">
          <span className="card-form-label">To</span>
          {friends && friends.length === 0 && <p className="muted small">Add friends first, on the Friends tab.</p>}
          <div className="rec-chips">
            {(friends ?? []).map((f) => (
              <button key={f.user_id} type="button" className={`rec-chip${!all && picked.has(f.user_id!) ? ' on' : ''}`} aria-pressed={!all && picked.has(f.user_id!)} onClick={() => toggle(f.user_id!)}>
                {f.name}
              </button>
            ))}
            {!!friends?.length && (
              <button type="button" className={`rec-chip${all ? ' on' : ''}`} aria-pressed={all} onClick={() => setAll(!all)}>
                All friends
              </button>
            )}
          </div>
        </div>
        <label>
          Why they’ll love it (no spoilers)
          <textarea rows={3} maxLength={280} value={note} placeholder="Cosy, odd, and the best friendship." onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="muted small">They see the title and your note in their feed. Nothing from the book itself is sent.</p>
        {status && (
          <p className="small" role="status">
            {status}
          </p>
        )}
        <button type="submit" className="pill-btn" disabled={!count || busy}>
          {busy ? 'Sending…' : count ? `Send to ${count === 1 ? '1 friend' : `${count} friends`}` : 'Pick a friend'}
        </button>
      </form>
    </Sheet>
  );
}
