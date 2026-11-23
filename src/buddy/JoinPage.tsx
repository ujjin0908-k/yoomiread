import { useEffect, useState } from 'react';
import { useAccount } from '../account';
import { TopBar } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { CatPic, JoinSheet } from './BuddyCard';
import { buddyAvailable, cleanCode, peekBuddyRead, showCode } from './buddy';

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Opened from an invite link: say which book it is, then pick my own copy of it to read along in. */
export function JoinPage({ code: raw }: { code: string }) {
  const { signedIn } = useAccount();
  const code = cleanCode(raw);
  const books = useLive(() => db.books.toArray(), []);
  const [peek, setPeek] = useState<{ title: string; members: number } | null>();
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string>();

  useEffect(() => {
    if (!code || !signedIn) return;
    void peekBuddyRead(code)
      .then((p) => setPeek(p ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not look up the code.'));
  }, [code, signedIn]);

  // The same title first: most friends add the same book under the same name.
  const list = [...(books ?? [])].filter((b) => !b.buddy).sort((a, b) => Number(peek && squash(b.title) === squash(peek.title)) - Number(peek && squash(a.title) === squash(peek.title)) || a.title.localeCompare(b.title));

  return (
    <>
      <TopBar title="Buddy read" back="" />
      <main className="page join-page">
        <CatPic pose="sly" size={120} />
        {!buddyAvailable() ? (
          <p>This copy of YoomiRead has no accounts, so it cannot join buddy reads.</p>
        ) : !code ? (
          <p>That invite link looks broken. Ask your friend for the code instead.</p>
        ) : !signedIn ? (
          <>
            <p>
              You’re invited to a buddy read (code <b>{showCode(code)}</b>). Sign in first, then open the link again.
            </p>
            <button type="button" className="btn" onClick={() => go('settings')}>
              Sign in
            </button>
          </>
        ) : error ? (
          <p>{error}</p>
        ) : peek === undefined ? (
          <p className="muted">Looking up the code…</p>
        ) : peek === null ? (
          <p>No buddy read has that code. It may have ended.</p>
        ) : (
          <>
            <h2>{peek.title}</h2>
            <p className="muted small">
              {peek.members} {peek.members === 1 ? 'reader' : 'readers'} so far. Pick your own copy of the book to read along in. Comments on each
              chapter stay locked until you finish it.
            </p>
            {list.length ? (
              <ul className="join-books">
                {list.map((b) => (
                  <li key={b.id}>
                    <button type="button" className="btn ghost wide" onClick={() => setPicked(b.id)}>
                      {b.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">Add the book to your library first, then open the link again.</p>
            )}
          </>
        )}
      </main>
      {picked && code && <JoinSheet bookId={picked} code={code} onClose={() => setPicked(undefined)} onJoined={() => go(`book/${picked}`)} />}
    </>
  );
}
