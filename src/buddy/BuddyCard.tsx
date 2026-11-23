import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Share2, Users } from 'lucide-react';
import { useAccount } from '../account';
import { Sheet } from '../components';
import { go } from '../hooks';
import { motionOk } from '../motion';
import type { Book, Chapter } from '../types';
import {
  buddyAvailable,
  buddyMembers,
  cleanCode,
  inviteLink,
  joinBuddyRead,
  leaveBuddyRead,
  myLine,
  removeMember,
  savedName,
  shareLine,
  showCode,
  standing,
  startBuddyRead,
  waitingComments,
  waitingText,
  type BuddyMember,
  type Waiting,
} from './buddy';

/** One of the owner's cat pictures, animated unless animations are off. */
export function CatPic({ pose, size = 72 }: { pose: 'sly' | 'resting'; size?: number }) {
  return <img className="buddy-cat" src={`/mascot/cat-${pose}.${motionOk() ? 'gif' : 'png'}`} alt="" width={size} height={size} draggable={false} />;
}

/** The book page's buddy read: start or join one, or see who is reading along and how far they are. */
export function BuddyCard({ book, chapters: loaded }: { book: Book; chapters?: Chapter[] }) {
  const ready = !!loaded;
  const chapters = loaded ?? [];
  const { signedIn } = useAccount();
  const [sheet, setSheet] = useState<'start' | 'join' | 'leave'>();
  const [members, setMembers] = useState<BuddyMember[]>();
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const link = book.buddy;
  const line = myLine(book, chapters);

  // Only the newest load may show: an older one (from before the chapters were read) can finish last.
  const latest = useRef(0);
  const load = useCallback(async () => {
    if (!link || !signedIn || !ready) return;
    const run = ++latest.current;
    const stale = () => run !== latest.current;
    try {
      let list = await buddyMembers(link);
      // Tell the others how far I am, when that has changed.
      const me = list.find((m) => m.me);
      if (me && me.line !== line) {
        await shareLine(link, line);
        list = list.map((m) => (m.me ? { ...m, line } : m));
      }
      if (stale()) return;
      if (!me) {
        if (stale()) return;
        // Removed by the owner, or the buddy read was ended.
        setError('This buddy read has ended, or you were removed from it.');
        setMembers([]);
        return;
      }
      const waits = await waitingComments(link);
      if (stale()) return;
      setMembers(list);
      setWaiting(waits);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the buddy read.');
    }
  }, [link, signedIn, line, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!buddyAvailable()) return null;

  if (!link) {
    return (
      <section className="card buddy-card">
        <div className="buddy-head">
          <Users size={18} />
          <h3>Read it with friends</h3>
        </div>
        <p className="muted small">Comments on a chapter stay locked for each friend until they finish that chapter. No spoilers, ever.</p>
        {signedIn ? (
          <div className="row">
            <button type="button" className="btn" onClick={() => setSheet('start')}>
              Start a buddy read
            </button>
            <button type="button" className="btn ghost" onClick={() => setSheet('join')}>
              Join with a code
            </button>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => go('settings')}>
            Sign in to read with friends
          </button>
        )}
        {sheet === 'start' && <StartSheet book={book} onClose={() => setSheet(undefined)} />}
        {sheet === 'join' && <JoinSheet bookId={book.id} onClose={() => setSheet(undefined)} />}
      </section>
    );
  }

  const me = members?.find((m) => m.me);
  const where = members ? standing(members) : undefined;
  const total = Math.max(chapters.length, ...(members ?? []).map((m) => m.line), 1);
  // Phones have a share menu; most computers do not, so the invite is copied instead.
  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    const url = inviteLink(link.code);
    const text = `Read ${link.title} with me on YoomiRead. Code: ${showCode(link.code)}`;
    try {
      if (canShare) await navigator.share({ title: 'Buddy read', text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setCopied(true);
      }
    } catch {
      // Closing the share menu is not an error.
    }
  };

  return (
    <section className="card buddy-card">
      <div className="buddy-head">
        <Users size={18} />
        <h3>Buddy read</h3>
        <span className="muted small buddy-code">Code {showCode(link.code)}</span>
      </div>
      {!signedIn ? (
        <p className="muted small">Sign in (Settings) to see your buddies and their comments.</p>
      ) : error ? (
        <p className="small">{error}</p>
      ) : !members ? (
        <p className="muted small">Finding your buddies…</p>
      ) : (
        <>
          <ul className="buddy-members">
            {members.map((m) => (
              <li key={m.userId}>
                <span className="buddy-name">
                  {m.name}
                  {m.me ? ' (you)' : ''}
                </span>
                <span className="buddy-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (m.line / total) * 100)}%` }} />
                </span>
                <span className="muted small">{m.line ? `ch. ${m.line}` : 'not started'}</span>
                {me?.owner && !m.me && (
                  <button
                    type="button"
                    className="link small"
                    onClick={() => {
                      if (confirm(`Remove ${m.name} from this buddy read?`)) void removeMember(link, m.userId).then(load);
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {where?.text && (
            <div className="buddy-note">
              {where.ahead && <CatPic pose="resting" size={64} />}
              <p className="small">{where.text}</p>
            </div>
          )}
          {waiting.length > 0 && (
            <div className="buddy-note">
              <CatPic pose="sly" size={64} />
              <p className="small">{waitingText(waiting)}</p>
            </div>
          )}
        </>
      )}
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => void share()}>
          {canShare ? <Share2 size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Invite friends'}
        </button>
        <button type="button" className="link small" onClick={() => setSheet('leave')}>
          {me?.owner ? 'End buddy read' : 'Leave'}
        </button>
      </div>
      {sheet === 'leave' && (
        <Sheet title={me?.owner ? 'End this buddy read?' : 'Leave this buddy read?'} onClose={() => setSheet(undefined)}>
          <p className="small">
            {me?.owner
              ? 'Everyone’s comments in it are deleted, for everyone. Your book, notes and highlights stay.'
              : 'Your comments in it are kept for the others until you delete them. Your book stays as it is.'}
          </p>
          <button
            type="button"
            className="btn danger wide"
            onClick={() =>
              void leaveBuddyRead(book, !!me?.owner)
                .then(() => setSheet(undefined))
                .catch((e) => setError(e instanceof Error ? e.message : 'Could not leave.'))
            }
          >
            {me?.owner ? 'End it for everyone' : 'Leave'}
          </button>
        </Sheet>
      )}
    </section>
  );
}

/** The name friends see. Remembered on this phone; never the email address. */
function NameField({ name, setName }: { name: string; setName: (n: string) => void }) {
  useEffect(() => {
    void savedName().then((n) => n && setName(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <label className="form">
        Your name for your buddies
      <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yoomi" autoComplete="nickname" />
    </label>
  );
}

function StartSheet({ book, onClose }: { book: Book; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Sheet title="Start a buddy read" onClose={onClose} locked={busy}>
      <p className="small">You get a code to send to friends. They join with their own copy of {book.title}, and each sees a comment only after finishing its chapter.</p>
      <NameField name={name} setName={setName} />
      {error && <p className="warn small">{error}</p>}
      <button
        type="button"
        className="btn wide"
        disabled={busy || !name.trim()}
        onClick={() => {
          setBusy(true);
          void startBuddyRead(book, name)
            .then(onClose)
            .catch((e) => setError(e instanceof Error ? e.message : 'Could not start it.'))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Starting…' : 'Start'}
      </button>
    </Sheet>
  );
}

export function JoinSheet({ bookId, code: given = '', onClose, onJoined }: { bookId: string; code?: string; onClose: () => void; onJoined?: () => void }) {
  const [code, setCode] = useState(given);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clean = cleanCode(code);
  return (
    <Sheet title="Join a buddy read" onClose={onClose} locked={busy}>
      <label className="form">
        Code (or the whole invite link)
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HK3M 9QR2" autoCapitalize="characters" autoComplete="off" />
      </label>
      <NameField name={name} setName={setName} />
      {error && <p className="warn small">{error}</p>}
      <button
        type="button"
        className="btn wide"
        disabled={busy || !clean || !name.trim()}
        onClick={() => {
          setBusy(true);
          void joinBuddyRead(clean!, bookId, name)
            .then(() => (onJoined ?? onClose)())
            .catch((e) => setError(e instanceof Error ? e.message : 'Could not join.'))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Joining…' : 'Join'}
      </button>
    </Sheet>
  );
}
