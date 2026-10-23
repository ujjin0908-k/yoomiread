import { Check, ImagePlus, Lock, Plus, Sparkles, Trash2, Unlock } from 'lucide-react';
import { useState } from 'react';
import { Empty, Sheet, TopBar } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { shrinkImage, useObjectUrl } from '../images';
import { newId } from '../logic';
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

export function GlossaryPage({ bookId }: { bookId: string }) {
  const book = useLive(async () => (await db.books.get(bookId)) ?? null, [bookId]);
  const entries = useLive(() => db.glossary.where('bookId').equals(bookId).toArray(), [bookId]);
  const [open, setOpen] = useState<GlossaryEntry | 'new'>();
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

  const list = (entries ?? []).sort((a, b) => a.english.localeCompare(b.english));
  const review = list.filter((g) => g.status === 'review');
  const approved = list.filter((g) => g.status === 'ok');

  async function runScan() {
    setScan('Reading the first chapters…');
    try {
      const settings = await loadSettings();
      const added = await scanGlossary(bookId, settings, modelFor(settings, book!.model).id);
      setScan(added ? `Found ${added} names and terms. Check them below, then approve.` : 'No new names found.');
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

  return (
    <>
      <TopBar
        back={`book/${bookId}`}
        title="Glossary"
        right={
          <button type="button" className="round-btn" aria-label="Add entry" onClick={() => setOpen('new')}>
            <Plus size={18} />
          </button>
        }
      />
      <main className="page">
        <h1 className="glossary-title" lang={book.language === 'zh' ? 'zh' : undefined}>
          {book.title}
        </h1>
        <p className="muted small">
          Names and terms the translator must keep the same. Only approved entries are used. Locked ones never change.
        </p>

        <button type="button" className="btn ghost wide" disabled={scan.endsWith('…')} onClick={() => void runScan()}>
          <Sparkles size={16} /> Build glossary from the first chapters
        </button>
        {scan && <p className="small center">{scan}</p>}

        {review.length > 0 && (
          <section className="glossary-group review">
            <div className="section-head">
              <h2>Needs review</h2>
              <button type="button" className="link" onClick={() => void approveAll()}>
                <Check size={16} /> Approve all
              </button>
              <button type="button" className="link" onClick={() => void removeEnglishOnly()}>
                Remove English-only
              </button>
            </div>
            <EntryList entries={review} onOpen={setOpen} />
          </section>
        )}

        {(['person', 'place', 'term'] as const).map((kind) => {
          const group = approved.filter((g) => g.kind === kind);
          if (!group.length) return null;
          return (
            <section key={kind} className="glossary-group">
              <div className="section-head">
                <h2>{KIND_LABEL[kind]}</h2>
              </div>
              <EntryList entries={group} onOpen={setOpen} />
            </section>
          );
        })}

        {entries && !list.length && (
          <Empty title="No names yet">Build it from the first chapters, or add names by hand with +.</Empty>
        )}
      </main>
      {open && <EntrySheet bookId={bookId} entry={open === 'new' ? undefined : open} onClose={() => setOpen(undefined)} />}
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

function EntrySheet({ bookId, entry, onClose }: { bookId: string; entry?: GlossaryEntry; onClose: () => void }) {
  const [original, setOriginal] = useState(entry?.original ?? '');
  const [english, setEnglish] = useState(entry?.english ?? '');
  const [kind, setKind] = useState<GlossaryKind>(entry?.kind ?? 'person');
  const [gender, setGender] = useState<Gender | ''>(entry?.gender ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [locked, setLocked] = useState(entry?.locked ?? false);
  const [picture, setPicture] = useState<Blob | undefined>(entry?.picture);
  const [error, setError] = useState('');
  const pictureUrl = useObjectUrl(picture);

  async function save(approve: boolean) {
    if (!original.trim() || !english.trim()) return setError('Both names are needed.');
    const clash = await db.glossary.where('[bookId+original]').equals([bookId, original.trim()]).first();
    if (clash && clash.id !== entry?.id) return setError(`"${original.trim()}" is already in the glossary.`);
    const now = Date.now();
    const next: GlossaryEntry = {
      id: entry?.id ?? newId(),
      bookId,
      original: original.trim(),
      english: english.trim(),
      kind,
      gender: kind === 'person' && gender ? gender : undefined,
      note: note.trim() || undefined,
      locked,
      // Anything I edit or add by hand counts as checked.
      status: approve || !entry ? 'ok' : entry.status,
      picture: kind === 'person' ? picture : undefined,
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
          Note <span className="muted small">(optional, also sent to the translator)</span>
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
