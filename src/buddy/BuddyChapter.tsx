import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Users } from 'lucide-react';
import { useAccount } from '../account';
import { formatDate } from '../logic';
import type { Book, Chapter } from '../types';
import { CatPic } from './BuddyCard';
import { buddyComments, buddyMembers, deleteComment, myLine, postComment, shareLine, waitingComments, type BuddyComment, type BuddyMember } from './buddy';

/**
 * Buddy comments at the end of a chapter. Friends' comments on this chapter arrive only once I have finished it
 * (the server holds them back until then); before that, the cat guards a count. I can always write my own.
 */
export function BuddyChapter({ book, chapter, chapters: loaded }: { book: Book; chapter: Chapter; chapters?: Chapter[] }) {
  const ready = !!loaded;
  const chapters = loaded ?? [];
  const { signedIn } = useAccount();
  const link = book.buddy;
  const line = myLine(book, chapters);
  const finished = chapter.number <= line;
  const [members, setMembers] = useState<BuddyMember[]>([]);
  const [comments, setComments] = useState<BuddyComment[]>([]);
  const [locked, setLocked] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only the newest load may show: an older one (from before the chapters were read) can finish last.
  const latest = useRef(0);
  const load = useCallback(async () => {
    if (!link || !signedIn || !ready) return;
    const run = ++latest.current;
    const stale = () => run !== latest.current;
    try {
      // My line goes up first, so finishing this chapter unlocks its comments straight away.
      let list = await buddyMembers(link);
      const me = list.find((m) => m.me);
      if (!me) return;
      if (me.line !== line) {
        await shareLine(link, line);
        list = list.map((m) => (m.me ? { ...m, line } : m));
      }
      if (stale()) return;
      const [found, waits] = await Promise.all([buddyComments(link, chapter.number), finished ? [] : waitingComments(link)]);
      if (stale()) return;
      setMembers(list);
      setComments(found);
      setLocked(waits.find((w) => w.chapter === chapter.number)?.comments ?? 0);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the buddy read.');
    }
  }, [link, signedIn, line, chapter.number, finished, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!link || !signedIn) return null;
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name ?? 'Someone who left';
  const meId = members.find((m) => m.me)?.userId;
  const owner = members.find((m) => m.me)?.owner;
  const others = members.filter((m) => !m.me).map((m) => m.name);

  return (
    <section className="buddy-chapter" aria-label="Buddy read comments">
      <div className="buddy-head">
        <Users size={16} />
        <h3>With {others.length ? others.join(', ') : 'your buddies'}</h3>
      </div>
      {comments.length > 0 && (
        <ul className="buddy-comments">
          {comments.map((c) => (
            <li key={c.id} className={c.userId === meId ? 'mine' : ''}>
              <span className="buddy-name small">{c.userId === meId ? 'You' : nameOf(c.userId)}</span>
              {c.quote && <q className="small">{c.quote}</q>}
              <p>{c.body}</p>
              <span className="muted small">
                {formatDate(c.createdAt)}
                {(c.userId === meId || owner) && (
                  <button type="button" className="link small" aria-label="Delete comment" onClick={() => void deleteComment(c.id).then(load)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {locked > 0 && (
        <div className="buddy-note">
          <CatPic pose="sly" size={64} />
          <p className="small">
            {locked} {locked === 1 ? 'comment' : 'comments'} from your buddies on this chapter. Finish it and they’re yours. No peeking.
          </p>
        </div>
      )}
      {error && <p className="warn small">{error}</p>}
      <div className="buddy-write">
        <textarea
          value={draft}
          maxLength={2000}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Thoughts on chapter ${chapter.number}? Friends see them once they finish it.`}
        />
        <button
          type="button"
          className="btn"
          disabled={busy || !draft.trim()}
          onClick={() => {
            setBusy(true);
            void postComment(link, chapter.number, draft)
              .then(() => setDraft(''))
              .then(load)
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not send it.'))
              .finally(() => setBusy(false));
          }}
        >
          Share
        </button>
      </div>
    </section>
  );
}
