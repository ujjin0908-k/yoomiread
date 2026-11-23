import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { motionSetting, setMotionSetting } from '../motion';
import { parseBackup } from '../backup';
import { DEFAULT_BACKUP, loadBackupState, saveBackupFile, saveBackupState } from '../backupNow';
import { formatDate } from '../logic';
import { chat } from '../translate/api';
import { EMPTY_SETTINGS, fetchModels, hostedUsage, loadSettings, saveSettings, setAiMode } from '../translate/run';
import { accountsAvailable, deleteAccount, signInWith, signInWithEmail, signOut, useAccount } from '../account';
import { eraseThisPhone } from '../erase';
import { answerHeld, answerOtherAccount, setSyncOn, setSyncText, syncNow, syncOn, syncText, undoSync, useSyncStatus } from '../syncRun';
import type { ModelOption, TranslateSettings } from '../types';

export function Settings() {
  const [tourNote, setTourNote] = useState('');
  const counts = useLive(
    async () => ({ books: await db.books.count(), chapters: await db.chapters.count(), notes: await db.notes.count() }),
    [],
  );
  const backup = useLive(loadBackupState, []) ?? DEFAULT_BACKUP;
  const [persisted, setPersisted] = useState<boolean>();
  const [message, setMessage] = useState('');
  const [motion, setMotion] = useState(motionSetting);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  async function exportBackup() {
    const how = await saveBackupFile();
    if (how === 'shared') setMessage('Backup handed over. "Save to Files" keeps it safe outside the app.');
    if (how === 'downloaded') setMessage('Backup saved. Keep it somewhere safe (Files, iCloud Drive).');
  }

  async function importBackup(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const ok = confirm(
        `Replace everything here with this backup? (${backup.books.length} books, ${backup.notes.length} notes)`,
      );
      if (!ok) return;
      await db.restore(backup);
      setMessage('Backup restored.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read the backup.');
    }
  }

  async function keepData() {
    const ok = await navigator.storage?.persist?.();
    setPersisted(!!ok);
    setMessage(ok ? 'The browser will keep your data.' : 'The browser did not agree. Make backups often.');
  }

  return (
    <>
      <TopBar back="" title="Settings" />
      <main className="page">
        <section className="card">
          <h3>Your data</h3>
          <p className="muted">
            {counts ? `${counts.books} books, ${counts.chapters} chapters, ${counts.notes} notes and highlights.` : '…'}{' '}
            Everything is saved on this device only. Download a backup now and then: if the browser's data is cleared,
            the backup is the only copy of your books and notes.
          </p>
          <div className="stack">
            <button type="button" className="btn primary" onClick={() => void exportBackup()}>
              Download backup
            </button>
            <label className="btn">
              Restore from backup
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackup(f);
                  e.target.value = '';
                }}
              />
            </label>
            {persisted === false && (
              <button type="button" className="btn" onClick={() => void keepData()}>
                Ask the browser to keep my data
              </button>
            )}
          </div>
          {message && <p className="small">{message}</p>}
          <p className="muted small">{backup.lastAt ? `Last backup: ${formatDate(backup.lastAt)}.` : 'No backup saved from this phone yet.'}</p>
          <div className="look-row">
            <span>Remind me to back up</span>
            <div className="seg">
              {[
                { days: 7, label: 'Weekly' },
                { days: 30, label: 'Monthly' },
                { days: 0, label: 'Off' },
              ].map((o) => (
                <button key={o.days} type="button" className={backup.every === o.days ? 'on' : ''} onClick={() => void saveBackupState({ every: o.days })}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </section>
        {accountsAvailable && <AccountCard />}
        <TranslationSettings />
        <section className="card">
          <h3>Look and feel</h3>
          <label className="row between">
            <span>
              Animations
              <br />
              <span className="muted small">Page slides, the cat's movement and other small touches.</span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={motion}
              onChange={(e) => {
                setMotion(e.target.checked);
                setMotionSetting(e.target.checked);
              }}
            />
          </label>
        </section>
        <ReadingBackground />
        <section className="card">
          <h3>Getting started</h3>
          <p className="muted">A short tour of what the app does, shown after the welcome screen.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void import('./Tour').then(({ setTourSeen }) => setTourSeen(false)).then(() => setTourNote('The tour shows the next time the app opens.'));
            }}
          >
            Show the tour again
          </button>
          {tourNote && <p className="muted small">{tourNote}</p>}
        </section>
        <section className="card">
          <h3>On iPhone</h3>
          <p className="muted">
            Open this page in Safari, tap Share, then “Add to Home Screen”. It opens full screen like an app.
          </p>
        </section>
      </main>
    </>
  );
}

/** Provider address, API key and models. Saved on this device only, never in a backup. */
function TranslationSettings() {
  const [s, setS] = useState<TranslateSettings>();
  const [showKey, setShowKey] = useState(false);
  const [note, setNote] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void loadSettings().then(setS);
  }, []);
  if (!s) return null;

  const update = (change: Partial<TranslateSettings>) => {
    const next = { ...s, ...change };
    setS(next);
    void saveSettings(next);
    setNote('Saved on this phone.');
  };
  const setMode = (mode: 'own' | 'hosted') => {
    // The model list belongs to the mode, so the settings are read again after the switch.
    void setAiMode(mode).then(loadSettings).then(setS);
    setNote('');
  };
  const setModel = (i: number, change: Partial<ModelOption>) =>
    update({ models: s.models.map((m, j) => (j === i ? { ...m, ...change } : m)) });
  const price = (v: string) => (v.trim() === '' ? undefined : Number(v));

  async function refreshModels() {
    try {
      const models = await fetchModels(s!);
      update({ models });
      setNote(`Found ${models.length} models. Set their prices if they are missing.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not refresh the models.');
    }
  }

  async function test() {
    setTesting(true);
    setNote('Testing…');
    try {
      const r = await chat(s!, s!.defaultModel, [{ role: 'user', content: 'Translate to English and reply with only the translation: 你好' }]);
      setNote(`It works: "${r.text.trim().slice(0, 40)}"`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The test failed.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card form translate-settings">
      <h3>AI</h3>
      <p className="muted small">
        Translation, character profiles, the story search and the cat's chat use AI. Reading, notes, the dictionary and
        book guides work without it.
      </p>
      {accountsAvailable && (
        <div className="look-row">
          <span>AI from</span>
          <div className="seg">
            <button type="button" className={s.mode === 'hosted' ? 'on' : ''} onClick={() => setMode('hosted')}>
              YoomiRead
            </button>
            <button type="button" className={s.mode !== 'hosted' ? 'on' : ''} onClick={() => setMode('own')}>
              My own service
            </button>
          </div>
        </div>
      )}
      {s.mode === 'hosted' ? (
        <HostedAI s={s} update={update} />
      ) : (
        <>
          <p className="muted small">
            Paste your AI service's address (it ends in /v1; any OpenAI-compatible service works) and your key. The key
            stays on this phone and is never put in a backup. Set a spending limit with the service.
          </p>
          <label>
            Service address
            <input
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="https://…/v1"
              value={s.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
            />
          </label>
          <label>
            API key
            <span className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                value={s.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
              />
              <button type="button" className="round-btn plain" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <div className="models">
            <span className="label">Models and prices (US$ per million tokens)</span>
            {s.models.map((m, i) => (
              <div className="model-row" key={i}>
                <label className="radio">
                  <input
                    type="radio"
                    name="default-model"
                    checked={s.defaultModel === m.id}
                    onChange={() => update({ defaultModel: m.id })}
                    aria-label={`Use ${m.label} by default`}
                  />
                </label>
                <div className="model-fields">
                  <input aria-label="Name" value={m.label} onChange={(e) => setModel(i, { label: e.target.value })} />
                  <input
                    aria-label="Model id"
                    className="mono"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={m.id}
                    onChange={(e) => {
                      const wasDefault = s.defaultModel === m.id;
                      const models = s.models.map((x, j) => (j === i ? { ...x, id: e.target.value } : x));
                      update({ models, defaultModel: wasDefault ? e.target.value : s.defaultModel });
                    }}
                  />
                  <span className="row-2">
                    <input aria-label="Input price" inputMode="decimal" placeholder="in" value={m.inputPrice ?? ''} onChange={(e) => setModel(i, { inputPrice: price(e.target.value) })} />
                    <input aria-label="Output price" inputMode="decimal" placeholder="out" value={m.outputPrice ?? ''} onChange={(e) => setModel(i, { outputPrice: price(e.target.value) })} />
                  </span>
                </div>
                {s.models.length > 1 && (
                  <button
                    type="button"
                    className="round-btn plain"
                    aria-label={`Remove ${m.label}`}
                    onClick={() => {
                      const models = s.models.filter((_, j) => j !== i);
                      update({ models, defaultModel: s.defaultModel === m.id ? models[0].id : s.defaultModel });
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <div className="row between">
              <button type="button" className="link" onClick={() => update({ models: [...s.models, { id: '', label: 'New model' }] })}>
                <Plus size={16} /> Add model
              </button>
              <button type="button" className="link" onClick={() => void refreshModels()}>
                Refresh from provider
              </button>
              <button type="button" className="link" onClick={() => update({ models: EMPTY_SETTINGS.models })}>
                Reset prices
              </button>
            </div>
          </div>

        </>
      )}

      <div className="look-row">
        <span>Model thinking (on is slower, off is faster)</span>
        <div className="seg">
          <button type="button" className={!s.thinkingOff ? 'on' : ''} onClick={() => update({ thinkingOff: false })}>
            On
          </button>
          <button type="button" className={s.thinkingOff ? 'on' : ''} onClick={() => update({ thinkingOff: true })}>
            Off
          </button>
        </div>
      </div>

      <div className="look-row">
        <span>Translate ahead while reading</span>
        <div className="seg">
          {[0, 1, 2, 3].map((n) => (
            <button key={n} type="button" className={(s.ahead ?? 1) === n ? 'on' : ''} onClick={() => update({ ahead: n })}>
              {n === 0 ? 'Off' : `Next ${n}`}
            </button>
          ))}
        </div>
      </div>

      <div className="look-row">
        <span>Translate when a book is added</span>
        <div className="seg">
          {[0, 1, 3, 5].map((n) => (
            <button key={n} type="button" className={(s.onImport ?? 3) === n ? 'on' : ''} onClick={() => update({ onImport: n })}>
              {n === 0 ? 'Off' : `First ${n}`}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="btn" disabled={testing} onClick={() => void test()}>
        Test connection
      </button>
      {note && <p className="small">{note}</p>}
    </section>
  );
}

/** Backgrounds are set per book now; this says where. */
function ReadingBackground() {
  return (
    <section className="card">
      <h3>Reading background</h3>
      <p className="muted small">Each book can have its own picture behind the pages: open the book, then Edit details, or tap T while reading it.</p>
    </section>
  );
}

/** YoomiRead AI: sign in (email link, Google or Apple), this month's use, and which model to use. */
function HostedAI({ s, update }: { s: TranslateSettings; update: (change: Partial<TranslateSettings>) => void }) {
  const account = useAccount();
  const [said, setSaid] = useState('');
  const [usage, setUsage] = useState<{ spent: number; limit: number }>();

  useEffect(() => {
    if (!account.signedIn) return;
    void hostedUsage().then(setUsage).catch((e: unknown) => setSaid(e instanceof Error ? e.message : ''));
  }, [account.signedIn]);

  if (!account.signedIn) {
    return <p className="muted small">Sign in under Account above to use YoomiRead AI. No key or AI account of your own is needed.</p>;
  }

  return (
    <div className="hosted-ai">
      {usage && (
        <div className="hosted-usage">
          <span className="small">This month</span>
          <span className="hosted-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (usage.spent / Math.max(usage.limit, 0.0001)) * 100)}%` }} />
          </span>
          <span className="muted small">
            {Math.round(Math.min(100, (usage.spent / Math.max(usage.limit, 0.0001)) * 100))}% of your monthly AI used. It starts again on the 1st.
          </span>
        </div>
      )}
      {s.models.length > 1 && (
        <label>
          Model
          <select value={s.defaultModel} onChange={(e) => update({ defaultModel: e.target.value })}>
            {s.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!s.models.length && <p className="warn small">YoomiRead AI is not available right now. Try again later.</p>}
      {said && <p className="small">{said}</p>}
    </div>
  );
}

/** The reader's account: sign in (email link, Google or Apple), sync between devices, sign out. */
function AccountCard() {
  const account = useAccount();
  const sync = useSyncStatus();
  const [email, setEmail] = useState('');
  const [said, setSaid] = useState('');
  const on = useLive(() => syncOn(), [], 'syncOn');
  const text = useLive(() => syncText(), [], 'syncText');

  async function go(run: () => Promise<void>, done?: string) {
    setSaid('');
    try {
      await run();
      if (done) setSaid(done);
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'That did not work. Try again.');
    }
  }

  return (
    <section className="card form account-card">
      <h3>Account</h3>
      {!account.signedIn ? (
        <div className="hosted-ai">
          <p className="muted small">
            Sign in to keep your library in step on all your devices and to use YoomiRead AI. Without an account,
            everything stays on this phone.
          </p>
          <button type="button" className="btn wide" onClick={() => void go(() => signInWith('apple'))}>
            Continue with Apple
          </button>
          <button type="button" className="btn wide" onClick={() => void go(() => signInWith('google'))}>
            Continue with Google
          </button>
          <form
            className="row-2"
            onSubmit={(e) => {
              e.preventDefault();
              void go(() => signInWithEmail(email), `A sign-in link is on its way to ${email.trim()}. Open it on this phone.`);
            }}
          >
            <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <button type="submit" className="btn">
              Email me a link
            </button>
          </form>
        </div>
      ) : (
        <div className="hosted-ai">
          <div className="row between">
            <span className="small">
              Signed in as <b>{account.email ?? 'you'}</b>
            </span>
            <button type="button" className="link small" onClick={() => void go(signOut)}>
              Sign out
            </button>
          </div>
          <label className="row between">
            <span>
              Sync this phone
              <br />
              <span className="muted small">Books, chapters, notes, highlights, progress, translations and the world. Keys and settings stay here.</span>
            </span>
            <input type="checkbox" className="switch" checked={on ?? true} onChange={(e) => void setSyncOn(e.target.checked)} />
          </label>
          {sync.askText && <AskBookText />}
          {(on ?? true) && !sync.askText && (
            <label className="row between">
              <span>
                Include book text
                <br />
                <span className="muted small">Chapters and translations. Off keeps them on this phone; notes and progress still sync.</span>
              </span>
              <input type="checkbox" className="switch" checked={text ?? true} onChange={(e) => void setSyncText(e.target.checked)} />
            </label>
          )}
          {sync.otherAccount && (
            <div className="sync-ask" role="alert">
              <p className="small">
                <b>This phone's library was synced with a different account.</b> Add it to {account.email ?? 'this account'} too, or keep
                it off this account?
              </p>
              <div className="row-btns">
                <button type="button" className="btn" onClick={() => void answerOtherAccount(true)}>
                  Add it to this account
                </button>
                <button type="button" className="btn" onClick={() => void answerOtherAccount(false)}>
                  Don't sync this phone
                </button>
              </div>
            </div>
          )}
          {sync.held && (
            <div className="sync-ask" role="alert">
              <p className="small">
                <b>
                  Sync wants to remove {sync.held.length} books from this phone
                </b>{' '}
                because they were deleted on another device: {sync.held.slice(0, 4).map((b) => b.title).join(', ')}
                {sync.held.length > 4 ? '…' : ''}. Nothing has been removed yet.
              </p>
              <div className="row-btns">
                <button type="button" className="btn" onClick={() => void answerHeld(false)}>
                  Keep them
                </button>
                <button type="button" className="btn danger" onClick={() => void answerHeld(true)}>
                  Remove them
                </button>
              </div>
            </div>
          )}
          {(on ?? true) && (
            <div className="row between">
              <span className={sync.error ? 'warn small' : 'muted small'}>
                {sync.running ? 'Syncing…' : sync.error ? `Sync stopped: ${sync.error}` : sync.lastAt ? `Last synced ${formatAgo(sync.lastAt)}.` : 'Not synced yet.'}
              </span>
              <button type="button" className="link small" disabled={sync.running} onClick={() => void syncNow()}>
                Sync now
              </button>
            </div>
          )}
          {sync.undoAt && !sync.running && (
            <div className="row between">
              <span className="muted small">The last sync changed this phone {formatAgo(sync.undoAt)}.</span>
              <button
                type="button"
                className="link small"
                onClick={() => void go(async () => void (await undoSync()), 'Put back what the last sync changed. The other devices get it back on their next sync.')}
              >
                Undo last sync
              </button>
            </div>
          )}
        </div>
      )}
      {account.signedIn && <DeleteAccount onDone={setSaid} />}
      {said && <p className="small">{said}</p>}
    </section>
  );
}

/**
 * Asked once, before the first sync of the public app: does book text sync too? "Off" is preselected, so nothing but
 * notes and progress leaves the phone unless the reader chooses it.
 */
function AskBookText() {
  const [text, setText] = useState(false);
  return (
    <div className="sync-ask" role="region" aria-label="Sync book text?">
      <p className="small">
        <b>Also sync your books' text?</b> Your notes, highlights and progress always sync. With book text, your books open on
        your other devices without importing them again, and a private copy is kept on YoomiRead's server. Without it, the
        text stays on this phone; on another device you pick the same file once to fill it in.
      </p>
      <label className="row between">
        <span className="small">Sync book text and translations</span>
        <input id="ask-book-text" type="checkbox" className="switch" checked={text} onChange={(e) => setText(e.target.checked)} />
      </label>
      <button type="button" className="btn primary" onClick={() => void setSyncText(text)}>
        Start syncing
      </button>
    </div>
  );
}

/**
 * "Delete my account": removes the sign-in, the synced library and the AI cost records from the server. The reader
 * types DELETE to confirm, and can also erase this phone's library (off by default; a backup is offered first).
 */
function DeleteAccount({ onDone }: { onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  async function run() {
    setBusy(true);
    setSaid('');
    try {
      await deleteAccount();
      if (erase) {
        await eraseThisPhone(db);
        window.location.replace(window.location.pathname);
        return;
      }
      // The card switches to signed out, so the message is shown by the card, not by this panel.
      onDone('Your account is deleted, with its synced library and AI records on the server. Your library is still on this phone.');
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'The account could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        <button type="button" className="link small danger-link" onClick={() => setOpen(true)}>
          Delete my account
        </button>
        {said && <p className="small">{said}</p>}
      </>
    );
  }
  return (
    <div className="sync-ask delete-account" role="region" aria-label="Delete my account">
      <p className="small">
        <b>Delete your account?</b> This removes your sign-in, your synced library on the server and your AI use records. Other
        devices stop syncing. It cannot be undone.
      </p>
      <button type="button" className="btn" onClick={() => void saveBackupFile()}>
        Download a backup first
      </button>
      <label className="row between">
        <span className="small">Also erase everything on this phone</span>
        <input id="erase-phone" type="checkbox" className="switch" checked={erase} onChange={(e) => setErase(e.target.checked)} />
      </label>
      <label className="small" htmlFor="delete-typed">
        Type DELETE to confirm
      </label>
      <input id="delete-typed" autoCapitalize="characters" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <div className="row-btns">
        <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="btn danger" disabled={busy || typed.trim() !== 'DELETE'} onClick={() => void run()}>
          {busy ? 'Deleting…' : erase ? 'Delete account and this phone’s library' : 'Delete my account'}
        </button>
      </div>
      {said && <p className="warn small">{said}</p>}
    </div>
  );
}

/** "just now", "5 minutes ago", "at 14:05" (today) or the date. */
function formatAgo(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const d = new Date(at);
  return d.toDateString() === new Date(now).toDateString() ? `at ${d.toTimeString().slice(0, 5)}` : formatDate(at);
}
