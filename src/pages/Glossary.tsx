import { Check, ImagePlus, Lock, Plus, Sparkles, Trash2, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Empty, Sheet, TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { shrinkImage, useObjectUrl } from '../images';
import { needsTranslation, newId } from '../logic';
import { chaptersToRead } from '../translate/profiles';
import { UpdateSheet } from './Character';
import { loadSettings, modelFor, scanGlossary } from '../translate/run';
import type { Gender, GlossaryEntry, GlossaryKind } from '../types';

const KIND_LABEL: Record<GlossaryKind, string> = { person: 'People', place: 'Places', term: 'Terms' };

/** A round face for a glossary person; nothing at all when there is no picture. */
export function Avatar({ entry, size = 32, onClick }: { entry: GlossaryEntry; size?: number; onClick?: () => void }) {
  const url = useObjectUrl(entry.picture);
  if (!url) return null;
  const img = <img className="avatar" src={url} alt="" width={size} height={size} />;
  return onClick ? (
    <button type="button" className="avatar-btn" aria-label={entry.english} onClick={onClick}>
      {img}
    </button>
  ) : (
    img
  );
}

/** Initials for a face without a picture: "Song Zang" gives SZ, 林梅 gives 林. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (/[^\x00-\x7f]/.test(words[0][0])) return words[0][0];
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

const TONES = ['olive', 'ink', 'clay', 'sage', 'night'];
/** A colour for a character, always the same for the same name. */
export function toneOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `tone-${TONES[h % TONES.length]}`;
}

/** A character's face: their picture, or their initials on their own colour. */
export function Face({ entry, className = '' }: { entry: GlossaryEntry; className?: string }) {
  const url = useObjectUrl(entry.picture);
  return (
    <span className={`face ${url ? '' : toneOf(entry.english)} ${className}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <b>{initials(entry.english)}</b>}
    </span>
  );
}

export function GlossaryPage({ bookId }: { bookId: string }) {
  const book = useLive(async () => (await db.books.get(bookId)) ?? null, [bookId]);
  const entries = useLive(() => db.glossary.where('bookId').equals(bookId).toArray(), [bookId]);
  const chapters = useLive(() => db.chapters.where('bookId').equals(bookId).toArray(), [bookId]);
  const [open, setOpen] = useState<GlossaryEntry | 'new'>();
  const [kind, setKind] = useState<GlossaryKind>('person');
  const [updating, setUpdating] = useState(false);
  const [scan, setScan] = useState('');

  if (book === undefined) return <TopBar back="library" />;
  if (!book) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This book was deleted.</p>
      </>
    );
  }

  // An English book has no Chinese names and nothing to translate: the page is simply its cast.
  const plain = !needsTranslation(book);
  const list = (entries ?? []).sort((a, b) => a.english.localeCompare(b.english));
  const review = list.filter((g) => g.status === 'review');
  const approved = list.filter((g) => g.status === 'ok');
  const people = approved.filter((g) => g.kind === 'person');
  const main = people.filter((g) => g.role === 'main');
  const side = people.filter((g) => g.role !== 'main');
  const others = approved.filter((g) => g.kind === kind);
  const newFor = (g: GlossaryEntry) => chaptersToRead(chapters ?? [], g).length;

  async function runScan() {
    setScan('Reading the first chapters…');
    try {
      const settings = await loadSettings();
      const added = await scanGlossary(bookId, settings, modelFor(settings, book!.model).id);
      setScan(added ? `Found ${added} ${plain ? 'characters' : 'names and terms'}. Check them below, then approve.` : 'No new names found.');
    } catch (e) {
      setScan(e instanceof Error ? e.message : 'The scan failed.');
    }
  }

  async function approveAll() {
    await db.glossary.bulkUpdate(review.map((g) => ({ key: g.id, changes: { status: 'ok' as const, updatedAt: Date.now() } })));
  }

  // Entries from before the stricter rules: English words that are not from the Chinese text.
  async function removeEnglishOnly() {
    const junk = review.filter((g) => !/[㐀-鿿豈-﫿]/.test(g.original));
    if (!junk.length || !confirm(`Remove ${junk.length} entries that are not Chinese names or terms?`)) return;
    await db.glossary.bulkDelete(junk.map((g) => g.id));
  }

  const count = (k: GlossaryKind) => approved.filter((g) => g.kind === k).length;

  return (
    <>
      <TopBar
        back={`book/${bookId}`}
        title={book.title}
        right={
          <button type="button" className="round-btn" aria-label="Add a name" onClick={() => setOpen('new')}>
            <Plus size={18} />
          </button>
        }
      />
      <main className={`page cast${people.length ? ' has-bar' : ''}`}>
        <header className="page-title">
          <div className="page-title-text">
            <h1>
              The cast
              <i className="dot" aria-hidden="true">
                .
              </i>
            </h1>
            <p>
              {plain
                ? 'Who is who in this book. Profiles are built only from chapters you have read.'
                : 'Names the translator keeps the same, and who is who. Only approved entries are used.'}
            </p>
          </div>
        </header>

        <div className="filter-row" role="group" aria-label="Kind">
          {(['person', 'place', 'term'] as const).map((k) => (
            <button key={k} type="button" className={`filter-chip${kind === k ? ' on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]} {count(k)}
            </button>
          ))}
        </div>

        {review.length > 0 && (
          <section className="glossary-group review">
            <div className="section-head">
              <h2>To check</h2>
              <button type="button" className="link" onClick={() => void approveAll()}>
                <Check size={16} /> Approve all
              </button>
              {!plain && (
                <button type="button" className="link" onClick={() => void removeEnglishOnly()}>
                  Remove English-only
                </button>
              )}
            </div>
            <EntryList entries={review} onOpen={setOpen} />
          </section>
        )}

        {kind === 'person' ? (
          <>
            {main.length > 0 && (
              <section>
                <h2 className="cast-label">Main characters</h2>
                <ul className="cast-grid">
                  {main.map((g) => (
                    <li key={g.id}>
                      <a className="cast-card" href={`#/character/${g.id}`}>
                        <span className="cast-card-in">
                          <Face entry={g} className="cast-face" />
                          {newFor(g) > 0 && <span className="cast-new">{newFor(g)} new ch.</span>}
                          <strong>{g.english}</strong>
                          <span className="cast-line">{g.profile?.line ?? g.note ?? 'No profile yet'}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {side.length > 0 && (
              <section>
                <h2 className="cast-label">Side characters</h2>
                <ul className="cast-rows">
                  {side.map((g) => (
                    <li key={g.id}>
                      <a className="cast-row glass" href={`#/character/${g.id}`}>
                        <Face entry={g} className="cast-row-face" />
                        <span className="g-names">
                          <strong>{g.english}</strong>
                          <span className="muted small">{g.profile?.line ?? g.note ?? (plain ? 'No profile yet' : g.original)}</span>
                        </span>
                        {newFor(g) > 0 && g.profile && <span className="chip">{newFor(g)} new</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          others.length > 0 && (
            <section className="glossary-group">
              <EntryList entries={others} onOpen={setOpen} />
            </section>
          )
        )}

        {entries && !list.length && <Empty title="Nobody here yet">Find the cast in the first chapters, or add names by hand with +.</Empty>}

        <button type="button" className="btn ghost wide" disabled={scan.endsWith('…')} onClick={() => void runScan()}>
          <Sparkles size={16} /> {plain ? 'Find the cast in the first chapters' : 'Build glossary from the first chapters'}
        </button>
        {scan && <p className="small center">{scan}</p>}
      </main>

      {people.length > 0 && (
        <button type="button" className="cast-bar" onClick={() => setUpdating(true)}>
          Choose who to update
        </button>
      )}
      {updating && <UpdateSheet book={book} chapters={chapters ?? []} people={people} onClose={() => setUpdating(false)} />}
      {open && <EntrySheet bookId={bookId} plain={plain} entry={open === 'new' ? undefined : open} onClose={() => setOpen(undefined)} />}
    </>
  );
}

function EntryList({ entries, onOpen }: { entries: GlossaryEntry[]; onOpen: (g: GlossaryEntry) => void }) {
  return (
    <ul className="glossary-list">
      {entries.map((g) => (
        <li key={g.id}>
          <button type="button" onClick={() => onOpen(g)}>
            <span className="avatar-slot">{g.picture ? <Avatar entry={g} size={36} /> : <span className="avatar-empty">{g.english.slice(0, 1)}</span>}</span>
            <span className="g-names">
              <strong>{g.english}</strong>
              <span className="muted" lang="zh">
                {g.original}
              </span>
            </span>
            {g.gender && <span className="chip">{g.gender}</span>}
            {g.locked && <Lock size={14} className="muted" aria-label="Locked" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function EntrySheet({ bookId, entry, plain, onClose }: { bookId: string; entry?: GlossaryEntry; plain?: boolean; onClose: () => void }) {
  const [original, setOriginal] = useState(entry?.original ?? '');
  const [english, setEnglish] = useState(entry?.english ?? '');
  const [kind, setKind] = useState<GlossaryKind>(entry?.kind ?? 'person');
  const [gender, setGender] = useState<Gender | ''>(entry?.gender ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [role, setRole] = useState<'main' | 'side'>(entry?.role ?? 'side');
  const [aliases, setAliases] = useState((entry?.aliases ?? []).join(', '));
  const [locked, setLocked] = useState(entry?.locked ?? false);
  const [picture, setPicture] = useState<Blob | undefined>(entry?.picture);
  const [error, setError] = useState('');
  const pictureUrl = useObjectUrl(picture);

  async function save(approve: boolean) {
    // An English book has one name: it is kept in both places.
    const first = plain && !/[㐀-鿿]/.test(original) ? english.trim() : original.trim();
    if (!first || !english.trim()) return setError(plain ? 'A name is needed.' : 'Both names are needed.');
    const clash = await db.glossary.where('[bookId+original]').equals([bookId, first]).first();
    if (clash && clash.id !== entry?.id) return setError(`"${first}" is already in the glossary.`);
    const now = Date.now();
    const next: GlossaryEntry = {
      ...entry,
      id: entry?.id ?? newId(),
      bookId,
      original: first,
      english: english.trim(),
      kind,
      gender: kind === 'person' && gender ? gender : undefined,
      note: note.trim() || undefined,
      locked,
      // Anything I edit or add by hand counts as checked.
      status: approve || !entry ? 'ok' : entry.status,
      picture: kind === 'person' ? picture : undefined,
      role: kind === 'person' ? role : undefined,
      aliases: kind === 'person' && aliases.trim() ? aliases.split(',').map((a) => a.trim()).filter(Boolean) : undefined,
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
    };
    await db.glossary.put(next);
    onClose();
  }

  async function remove() {
    if (entry) await db.glossary.delete(entry.id);
    onClose();
  }

  return (
    <Sheet title={entry ? (entry.status === 'review' ? 'Check this name' : 'Edit name') : 'Add a name'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        {kind === 'person' && (
          <div className="picture-pick">
            {pictureUrl ? <img className="avatar" src={pictureUrl} alt="" width={64} height={64} /> : <span className="avatar-empty big">{english.slice(0, 1) || '?'}</span>}
            <label className="link">
              <ImagePlus size={16} /> {picture ? 'Change picture' : 'Add picture (optional)'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPicture(await shrinkImage(f, 200));
                  e.target.value = '';
                }}
              />
            </label>
            {picture && (
              <button type="button" className="link" onClick={() => setPicture(undefined)}>
                Remove
              </button>
            )}
          </div>
        )}
        {plain ? (
          <label>
            Name
            <input value={english} disabled={entry?.locked && locked} onChange={(e) => setEnglish(e.target.value)} />
          </label>
        ) : (
          <div className="row-2">
            <label>
              Original
              <input lang="zh" value={original} disabled={entry?.locked && locked} onChange={(e) => setOriginal(e.target.value)} />
            </label>
            <label>
              English
              <input value={english} disabled={entry?.locked && locked} onChange={(e) => setEnglish(e.target.value)} />
            </label>
          </div>
        )}
        {kind === 'person' && (
          <>
            <div className="look-row">
              <span>Character</span>
              <div className="seg">
                <button type="button" className={role === 'main' ? 'on' : ''} aria-pressed={role === 'main'} onClick={() => setRole('main')}>
                  Main
                </button>
                <button type="button" className={role === 'side' ? 'on' : ''} aria-pressed={role === 'side'} onClick={() => setRole('side')}>
                  Side
                </button>
              </div>
            </div>
            <label>
              Other names <span className="muted small">(optional, with commas: nicknames, titles)</span>
              <input value={aliases} placeholder="e.g. Little Song, the boss" onChange={(e) => setAliases(e.target.value)} />
            </label>
          </>
        )}
        <div className="row-2">
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as GlossaryKind)}>
              <option value="person">Person</option>
              <option value="place">Place</option>
              <option value="term">Term</option>
            </select>
          </label>
          {kind === 'person' && (
            <label>
              Pronouns
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}>
                <option value="">Not set</option>
                <option value="he">he / him</option>
                <option value="she">she / her</option>
                <option value="they">they / them</option>
                <option value="it">it</option>
              </select>
            </label>
          )}
        </div>
        <label>
          Note <span className="muted small">{plain ? '(optional)' : '(optional, also sent to the translator)'}</span>
          <input value={note} placeholder="e.g. always call him Senior Brother" onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="look-row">
          <span>
            {locked ? <Lock size={14} /> : <Unlock size={14} />} Lock (never change this name)
          </span>
          <input type="checkbox" className="switch" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
        </label>
        {error && <p className="warn small">{error}</p>}
        <div className="row between">
          {entry ? (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Trash2 size={16} /> {entry.status === 'review' ? 'Reject' : 'Delete'}
            </button>
          ) : (
            <span />
          )}
          <button className="pill-btn small" type="submit">
            <span>{entry?.status === 'review' ? 'Approve' : 'Save'}</span>
          </button>
        </div>
      </form>
    </Sheet>
  );
}
