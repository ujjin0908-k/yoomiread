import { Check, Copy, Share2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { accountsAvailable, onAccountChange, signedIn } from '../account';
import { Empty, PageTitle, Sheet, TabBar } from '../components';
import { useLive } from '../hooks';
import { wrapInput } from '../queries';
import { CARD_ITEMS, VISIBILITY, cardFrom, lineMightSpoil, updatedWords, type CardData, type CardPrefs } from '../friends/card';
import { addFriend, cardByCode, cleanFriendCode, friendCards, friendLink, loadPrefs, publishCard, removeFriend, savePrefs, showCode } from '../friends/friends';
import { ZineCard } from '../friends/ZineCard';

/** Signed in, and the app has accounts at all. Follows sign-in and sign-out. */
function useOnline(): boolean {
  const [on, setOn] = useState(() => accountsAvailable && signedIn());
  useEffect(() => onAccountChange(() => setOn(accountsAvailable && signedIn())), []);
  return on;
}

/**
 * The Friends tab (owner's picks, 2026-11-24: the zine card, an activity feed next): my name card, which I design and
 * show to the public, to friends or to nobody; friends added by code; their cards. Needs an account, like buddy reads;
 * without one, my card is shown here as a preview.
 */
export function Friends() {
  const input = useLive(wrapInput, [], 'wrap-input');
  const online = useOnline();
  const [prefs, setPrefs] = useState<CardPrefs>();
  const [code, setCode] = useState<string>();
  const [friends, setFriends] = useState<CardData[]>();
  const [sheet, setSheet] = useState<'edit' | 'add' | CardData>();
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void loadPrefs().then(setPrefs);
  }, []);
  const card = useMemo(() => (input && prefs ? cardFrom(input, prefs) : undefined), [input, prefs]);
  const cardKey = JSON.stringify(card ?? null);

  // My card is sent whenever it changes, then my friends' cards are read.
  useEffect(() => {
    if (!online || !card) return;
    let live = true;
    void (async () => {
      try {
        const saved = await publishCard(card);
        if (live) setCode(saved.code);
        const list = await friendCards();
        if (live) setFriends(list);
      } catch (e) {
        if (live) setStatus(e instanceof Error ? e.message : 'Friends could not be loaded.');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, cardKey]);

  async function share() {
    if (!code) return;
    const url = friendLink(code);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: 'Add me on YoomiRead', text: `My YoomiRead code: ${showCode(code)}`, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  const refresh = async () => setFriends(await friendCards());

  return (
    <>
      <main className="page tabs-page friends-page">
        <PageTitle title="Friends" sub="Your reader card, and the friends you read with" />

        {card && (
          <section className="my-card">
            <ZineCard card={card} code={code} />
            <div className="my-card-actions">
              <button type="button" className="pill-btn small" onClick={() => setSheet('edit')}>
                Edit card
              </button>
              {online && code && (
                <button type="button" className="btn ghost" onClick={() => void share()}>
                  {copied ? <Check size={16} /> : 'share' in navigator ? <Share2 size={16} /> : <Copy size={16} />} {copied ? 'Link copied' : 'Share my code'}
                </button>
              )}
            </div>
            <p className="muted small">{VISIBILITY.find((v) => v.id === card.visibility)!.note}</p>
          </section>
        )}

        {!online ? (
          <section className="card friends-offline">
            <h2>Read with friends</h2>
            <p className="muted small">
              {accountsAvailable
                ? 'Sign in to share your card, add friends with their code and see theirs.'
                : 'Friends arrive with accounts. Until then, this is how your card will look.'}
            </p>
            {accountsAvailable && (
              <a className="pill-btn small" href="#/settings">
                Sign in
              </a>
            )}
          </section>
        ) : (
          <section className="friends-list">
            <div className="section-head">
              <h2>Your friends</h2>
              <button type="button" className="btn ghost" onClick={() => setSheet('add')}>
                <UserPlus size={16} /> Add a friend
              </button>
            </div>
            {status && (
              <p className="small" role="status">
                {status}
              </p>
            )}
            {friends && friends.length === 0 && <Empty title="No friends yet">Share your code, or add a friend with theirs.</Empty>}
            <div className="friend-grid">
              {(friends ?? []).map((f) => (
                <button type="button" key={f.user_id} className="friend-tile" onClick={() => setSheet(f)} aria-label={`Open ${f.name}’s card`}>
                  <ZineCard card={f} mini />
                  <span className="muted small">{updatedWords(f.updated_at)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      <TabBar active="friends" />

      {sheet === 'edit' && prefs && (
        <EditCard
          prefs={prefs}
          onClose={() => setSheet(undefined)}
          onSave={async (p) => {
            await savePrefs(p);
            setPrefs(p);
            setSheet(undefined);
          }}
        />
      )}
      {sheet === 'add' && <AddFriend onClose={() => setSheet(undefined)} onAdded={() => void refresh()} />}
      {sheet && typeof sheet === 'object' && (
        <Sheet title={sheet.name} onClose={() => setSheet(undefined)}>
          <ZineCard card={sheet} spoils={!!input && lineMightSpoil(sheet, input.books, input.chapters)} />
          <button
            type="button"
            className="link small friend-remove"
            onClick={async () => {
              if (!sheet.user_id || !confirm(`Remove ${sheet.name} from your friends? You both stop seeing each other’s cards.`)) return;
              await removeFriend(sheet.user_id);
              setSheet(undefined);
              await refresh();
            }}
          >
            Remove friend
          </button>
        </Sheet>
      )}
    </>
  );
}

/** Edit my card: my name, who can see it, and what's on it. */
function EditCard({ prefs, onClose, onSave }: { prefs: CardPrefs; onClose: () => void; onSave: (p: CardPrefs) => Promise<void> }) {
  const [p, setP] = useState(prefs);
  return (
    <Sheet title="Your card" onClose={onClose}>
      <form
        className="form card-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(p);
        }}
      >
        <label>
          Your name on the card
          <input value={p.name} maxLength={40} placeholder="e.g. Yoomi" autoComplete="nickname" onChange={(e) => setP({ ...p, name: e.target.value })} />
        </label>
        <div className="card-form-group">
          <span className="card-form-label">Who can see it</span>
          <div className="seg card-vis" role="group" aria-label="Who can see your card">
            {VISIBILITY.map((v) => (
              <button key={v.id} type="button" className={p.visibility === v.id ? 'on' : ''} aria-pressed={p.visibility === v.id} onClick={() => setP({ ...p, visibility: v.id })}>
                {v.label}
              </button>
            ))}
          </div>
          <span className="muted small">{VISIBILITY.find((v) => v.id === p.visibility)!.note}</span>
        </div>
        <div className="card-form-group">
          <span className="card-form-label">On your card</span>
          <div className="card-switches">
            {CARD_ITEMS.map((it) => (
              <label key={it.id} className="row between card-switch">
                <span>{it.label}</span>
                <input type="checkbox" role="switch" checked={p.show[it.id]} onChange={(e) => setP({ ...p, show: { ...p.show, [it.id]: e.target.checked } })} />
              </label>
            ))}
          </div>
          <span className="muted small">Your books stay on your phone. Only what’s switched on is shared.</span>
        </div>
        <button type="submit" className="pill-btn">
          Save card
        </button>
      </form>
    </Sheet>
  );
}

/** Add a friend with their code (or link). */
function AddFriend({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const code = cleanFriendCode(typed);
  return (
    <Sheet title="Add a friend" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!code) return;
          setBusy(true);
          try {
            const name = await addFriend(code);
            setStatus(`${name} is your friend now.`);
            onAdded();
          } catch (err) {
            setStatus(err instanceof Error ? err.message : 'That code didn’t work.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Their code or link
          <input value={typed} placeholder="HK3M 9QR2" autoCapitalize="characters" autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </label>
        <p className="muted small">You both become friends, and see each other’s cards (unless one is private).</p>
        {status && (
          <p className="small" role="status">
            {status}
          </p>
        )}
        <button type="submit" className="pill-btn" disabled={!code || busy}>
          {busy ? 'Adding…' : 'Add friend'}
        </button>
      </form>
    </Sheet>
  );
}

/** Opened from a friend's link (#/friend/<code>): their card if I may see it, and a button to add them. */
export function FriendLinkPage({ code }: { code: string }) {
  const online = useOnline();
  const clean = cleanFriendCode(code);
  const [card, setCard] = useState<CardData | null>();
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!online || !clean) return;
    void cardByCode(clean)
      .then((c) => setCard(c ?? null))
      .catch((e) => setStatus(e instanceof Error ? e.message : 'That code didn’t work.'));
  }, [online, clean]);

  return (
    <main className="page friends-page">
      <PageTitle title="Add a friend" sub={clean ? `Code ${showCode(clean)}` : 'That link has no code in it.'} />
      {!online ? (
        <p className="muted">{accountsAvailable ? 'Sign in first (Settings › Account), then open the link again.' : 'Friends arrive with accounts, coming soon.'}</p>
      ) : (
        <>
          {card && <ZineCard card={card} code={card.code} />}
          {card === null && <p className="muted small">Their card is for friends only. Add them to see it.</p>}
          {status && (
            <p className="small" role="status">
              {status}
            </p>
          )}
          {clean && (
            <button
              type="button"
              className="pill-btn"
              onClick={async () => {
                try {
                  const name = await addFriend(clean);
                  setStatus(`${name} is your friend now.`);
                  setTimeout(() => (location.hash = '#/friends'), 900);
                } catch (e) {
                  setStatus(e instanceof Error ? e.message : 'That code didn’t work.');
                }
              }}
            >
              Add {card?.name ?? 'them'} as a friend
            </button>
          )}
        </>
      )}
    </main>
  );
}
