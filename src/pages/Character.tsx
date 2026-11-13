import { cameFromChapter, chapterBefore } from '../trail';
import { ImagePlus, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet, TopBar, Working } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { shrinkImage } from '../images';
import { toPicture } from '../picture';
import { isRead, needsTranslation } from '../logic';
import { chaptersToRead, chaptersToSearch, planCost, planReading, readingTexts, searchCost, searchedTo, searchPlan, searchStory, updateProfiles, type UpdateResult } from '../translate/profiles';
import { formatCost } from '../translate/prompt';
import { loadSettings, modelFor } from '../translate/run';
import type { Book, Chapter, CharacterProfile, GlossaryEntry, GlossaryKind, ProfileFact, TranslateSettings } from '../types';
import { EntrySheet, Face } from './Glossary';

const PRONOUN: Record<string, { label: string; subject: string; possessive: string }> = {
  he: { label: 'he / him', subject: 'he', possessive: 'his' },
  she: { label: 'she / her', subject: 'she', possessive: 'her' },
  they: { label: 'they / them', subject: 'they', possessive: 'their' },
  it: { label: 'it', subject: 'it', possessive: 'its' },
};

/** "Ch. 2" or "Ch. 2–4". */
function span(chapters: Chapter[]): string {
  if (!chapters.length) return '';
  const first = chapters[0].number;
  const last = chapters[chapters.length - 1].number;
  return first === last ? `Ch. ${first}` : `Ch. ${first}–${last}`;
}

function summary(result: UpdateResult): string {
  const parts: string[] = [];
  if (result.updated.length) parts.push(`Updated: ${result.updated.join(', ')}.`);
  if (result.unchanged.length) parts.push(`Nothing new for ${result.unchanged.join(', ')}.`);
  if (result.added) parts.push(`${result.added} new ${result.added === 1 ? 'person' : 'people'} to check in the cast.`);
  if (result.cost) parts.push(`Cost ${formatCost(result.cost)}.`);
  if (result.stopped) parts.push(result.stopped === 'Stopped.' ? 'Stopped; what was read is kept.' : `Stopped: ${result.stopped} What was read before that is kept.`);
  return parts.join(' ');
}

/**
 * Works out what updating these people would read and cost, before anything is sent. Reads the chapter texts once
 * and keeps them while the sheet is open, so ticking boxes is instant.
 */
function useEstimate(book: Book | undefined, chapters: Chapter[], picked: GlossaryEntry[], findNew: boolean, model: string | undefined) {
  const [settings, setSettings] = useState<TranslateSettings>();
  const [texts, setTexts] = useState<Map<string, string>>();
  const needed = chapters.filter((c) => picked.some((p) => chaptersToRead(chapters, p).includes(c)));
  const neededKey = needed.map((c) => c.id).join();
  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);
  useEffect(() => {
    if (!book || !needed.length) return;
    let live = true;
    void readingTexts(book, needed).then((t) => live && setTexts((had) => new Map([...(had ?? []), ...t])));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, neededKey]);
  if (!settings || !book) return { settings, cost: undefined, chapters: needed, ready: false };
  const id = model ?? modelFor(settings, book.model).id;
  if (!needed.length) return { settings, cost: 0, chapters: needed, ready: true, model: id };
  if (!texts || needed.some((c) => !texts.has(c.id))) return { settings, cost: undefined, chapters: needed, ready: false, model: id };
  const plan = planReading(chapters, picked, (cid) => texts.get(cid) ?? '', findNew);
  return { settings, cost: planCost(plan, settings, id, picked.length), chapters: needed, ready: true, model: id, empty: !plan.parts.length };
}

/** One character's card: who they are, their powers and status, and one quote, from the chapters the owner has read. */
export function CharacterPage({ id }: { id: string }) {
  const entry = useLive(async () => (await db.glossary.get(id)) ?? null, [id]);
  const book = useLive(async () => (entry ? await db.books.get(entry.bookId) : undefined), [entry?.bookId]);
  const chapters = useLive(async () => (entry ? db.chapters.where('bookId').equals(entry.bookId).sortBy('number') : []), [entry?.bookId]) ?? [];
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const stop = useRef<AbortController>();
  const estimate = useEstimate(book ?? undefined, chapters, entry ? [entry] : [], false, undefined);

  useEffect(() => () => stop.current?.abort(), []);

  if (entry === undefined || (entry && book === undefined)) return <TopBar back="library" />;
  if (!entry || !book) {
    return (
      <>
        <TopBar back="library" />
        <p className="empty">This character was removed.</p>
      </>
    );
  }

  const p = entry.profile;
  const words = PRONOUN[entry.gender ?? 'they'];
  const fresh = chaptersToRead(chapters, entry);
  const readTo = chapters.filter(isRead).reduce((n, c) => Math.max(n, c.number), 0);
  const running = !!status;
  const keyMissing = estimate.settings && (!estimate.settings.apiKey.trim() || !estimate.settings.baseUrl.trim());

  async function save(change: Partial<GlossaryEntry>) {
    await db.glossary.update(id, { ...change, updatedAt: Date.now() });
  }
  async function saveProfile(change: Partial<CharacterProfile>) {
    await save({ profile: { looks: [], about: [], ...entry!.profile, ...change } });
  }

  async function update() {
    const settings = estimate.settings!;
    stop.current = new AbortController();
    setResult('');
    setStatus('Starting');
    try {
      const done = await updateProfiles({
        book: book!,
        chapters,
        picked: [entry!],
        findNew: false,
        settings,
        model: estimate.model ?? modelFor(settings, book!.model).id,
        signal: stop.current.signal,
        onStatus: setStatus,
      });
      setResult(summary(done));
    } finally {
      setStatus('');
    }
  }

  return (
    <div className="character-page">
      <TopBar
        // Opened from a face or a name in the reader: back goes to that chapter, otherwise to the cast.
        back={(() => {
          const ch = cameFromChapter() ? chapterBefore(chapters.map((c) => c.id)) : undefined;
          return ch ? `chapter/${ch}` : `glossary/${book.id}`;
        })()}
        title="The cast"
        right={
          <button type="button" className="round-btn" aria-label="Edit name and details" onClick={() => setEditing(true)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
            </svg>
          </button>
        }
      />
      <main className="page">
        <section className="char-hero">
          <div className="char-card">
            <span className="foil" aria-hidden="true" />
            <span className="char-card-in">
              <Face entry={entry} className="char-face" />
              <span className="char-shine" aria-hidden="true" />
              <label className="char-pic">
                <ImagePlus size={13} /> {entry.picture ? 'Change' : 'Add a picture'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) await save({ picture: await toPicture(await shrinkImage(f, 480)) });
                  }}
                />
              </label>
            </span>
          </div>
          <div className="char-meta">
            <h1>{entry.english}</h1>
            {needsTranslation(book) && entry.original !== entry.english && (
              <span className="muted" lang="zh">
                {entry.original}
              </span>
            )}
            <div className="seg char-role" role="group" aria-label="Main or side character">
              <button type="button" className={entry.role === 'main' ? 'on' : ''} aria-pressed={entry.role === 'main'} onClick={() => void save({ role: 'main' })}>
                Main
              </button>
              <button type="button" className={entry.role !== 'main' ? 'on' : ''} aria-pressed={entry.role !== 'main'} onClick={() => void save({ role: 'side' })}>
                Side
              </button>
            </div>
            {entry.gender && <span className="chip-outline">{PRONOUN[entry.gender].label}</span>}
            <span className="small char-upto">
              {p?.upTo ? (
                <>
                  Profile up to <b>Ch. {p.upTo}</b>
                </>
              ) : (
                'No profile yet'
              )}
              <br />
              {readTo ? `You have read to Ch. ${readTo}` : 'No chapters read yet'}
            </span>
          </div>
        </section>

        <p className="spoiler-bar">
          <ShieldCheck size={16} />{' '}
          {[...(p?.about ?? []), ...(p?.powers ?? []), ...(p?.status ?? [])].some((f) => f.guide)
            ? 'Lines marked "guide" come from the book guide and can spoil; the rest is from chapters you have read'
            : 'No spoilers: built only from chapters you have read'}
        </p>

        {p?.line && <p className="char-line">{p.line}</p>}

        {p && p.v !== 2 && (
          <p className="char-note small">
            Profiles now show who {words.subject} {entry.gender === 'they' || !entry.gender ? 'are' : 'is'}, {words.possessive} powers and status. The next
            update rebuilds this one from Ch. 1; lines you wrote are kept.
          </p>
        )}
        <Facts title={`Who ${words.subject} ${entry.gender === 'they' || !entry.gender ? 'are' : 'is'}`} facts={p?.about ?? []} onChange={(about) => void saveProfile({ about })} />
        <Facts title="Powers" facts={p?.powers ?? []} onChange={(powers) => void saveProfile({ powers })} />
        <Facts title="Status" facts={p?.status ?? []} onChange={(status) => void saveProfile({ status })} />

        {p?.quote ? (
          <section className="char-quote">
            <h2>In {words.possessive} own words</h2>
            <blockquote>“{p.quote.text}”</blockquote>
            <div className="row between">
              <span className="small">{p.quote.chapter ? `Ch. ${p.quote.chapter}` : 'Added by you'}</span>
              <button type="button" className="link" onClick={() => void saveProfile({ quote: undefined })}>
                Remove
              </button>
            </div>
          </section>
        ) : null}

        {!p && (
          <p className="muted center small">
            Nothing here yet. Update to build {words.possessive} profile from the chapters you have read, or add lines by hand.
          </p>
        )}

        {running && <Working label={status} />}
        {result && (
          <p className={`small center${result.includes('Stopped:') ? ' warn' : ''}`} role="status">
            {result}
          </p>
        )}
      </main>

      <div className="char-bar">
        {running ? (
          <button type="button" className="btn wide" onClick={() => stop.current?.abort()}>
            Stop
          </button>
        ) : keyMissing ? (
          <p className="small center muted">Add the provider address and key in Settings to update profiles.</p>
        ) : (
          <button type="button" className="update-btn" disabled={!fresh.length || !estimate.ready} onClick={() => void update()}>
            <span>
              {fresh.length ? `Update ${entry.english}` : `Up to date with Ch. ${p?.upTo ?? readTo}`}
              {fresh.length > 0 && (
                <small>
                  from {span(fresh)}, {words.possessive} parts only
                </small>
              )}
            </span>
            {fresh.length > 0 && <em>{estimate.ready ? (estimate.empty ? 'not named there' : `about ${formatCost(estimate.cost)}`) : '…'}</em>}
          </button>
        )}
      </div>

      {editing && <EntrySheet bookId={book.id} plain={!needsTranslation(book)} entry={entry} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** A list of profile lines, each with its chapter. Lines can be removed, and the owner can add their own. */
function Facts({ title, facts, onChange }: { title: string; facts: ProfileFact[]; onChange: (next: ProfileFact[]) => void }) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <section className="fact-box glass">
      <div className="row between">
        <h2>{title}</h2>
        <button type="button" className="link" onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>
      {facts.length === 0 && !adding && <p className="muted small">Nothing yet.</p>}
      <ul>
        {facts.map((f, i) => (
          <li key={`${i}-${f.text}`}>
            <span>
              {f.text} <span className="fact-ch">· {f.chapter ? `Ch. ${f.chapter}` : f.guide ? 'guide' : 'yours'}</span>
            </span>
            <button type="button" className="fact-x" aria-label={`Remove "${f.text}"`} onClick={() => onChange(facts.filter((_, n) => n !== i))}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      {adding && (
        <form
          className="fact-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onChange([...facts, { text: draft.trim(), mine: true }]);
            setDraft('');
            setAdding(false);
          }}
        >
          <input autoFocus value={draft} placeholder="Your own line, never changed by an update" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="pill-btn small" disabled={!draft.trim()}>
            <span>Add</span>
          </button>
        </form>
      )}
    </section>
  );
}

/** "Who to update?": tick the characters to update; only they are read for, and only from their new chapters. */
export function UpdateSheet({ book, chapters, people, onClose }: { book: Book; chapters: Chapter[]; people: GlossaryEntry[]; onClose: () => void }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [findNew, setFindNew] = useState(false);
  const [model, setModel] = useState<string>();
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const stop = useRef<AbortController>();
  const sorted = [...people].sort((a, b) => (a.role === 'main' ? 0 : 1) - (b.role === 'main' ? 0 : 1) || a.english.localeCompare(b.english));
  const picked = sorted.filter((p) => ticked.has(p.id));
  const estimate = useEstimate(book, chapters, picked, findNew, model);
  const running = !!status;
  const settings = estimate.settings;
  const keyMissing = settings && (!settings.apiKey.trim() || !settings.baseUrl.trim());

  useEffect(() => () => stop.current?.abort(), []);

  async function run() {
    stop.current = new AbortController();
    setResult('');
    setStatus('Starting');
    try {
      const done = await updateProfiles({ book, chapters, picked, findNew, settings: settings!, model: estimate.model!, signal: stop.current.signal, onStatus: setStatus });
      setResult(summary(done));
      setTicked(new Set());
    } finally {
      setStatus('');
    }
  }

  return (
    <Sheet title="Who to update?" locked={running} onClose={onClose}>
      <div className="form">
        <p className="muted small">
          Only the characters you tick are updated, from the chapters you have read since their last update. Only the parts where they
          appear are read.
        </p>
        <ul className="pick-list">
          {sorted.map((p) => {
            const n = chaptersToRead(chapters, p).length;
            const on = ticked.has(p.id);
            return (
              <li key={p.id}>
                <label className={`pick-row${on ? ' on' : ''}${n ? '' : ' done'}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!n || running}
                    onChange={() =>
                      setTicked((t) => {
                        const next = new Set(t);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                  <Face entry={p} className="pick-face" />
                  <span className="g-names">
                    <strong>
                      {p.english} <em className={p.role === 'main' ? 'tag-main' : 'tag-side'}>{p.role === 'main' ? 'Main' : 'Side'}</em>
                    </strong>
                    <span className="muted small">
                      {n ? `${p.profile?.upTo ? `Up to Ch. ${p.profile.upTo}` : 'No profile yet'} · ${n} new ${n === 1 ? 'chapter' : 'chapters'}` : 'Up to date'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <label className="row small">
          <input type="checkbox" checked={findNew} disabled={running} onChange={(e) => setFindNew(e.target.checked)} />
          <span>
            Also look for new people <span className="muted">(reads whole chapters, costs a little more)</span>
          </span>
        </label>

        {settings && (
          <label>
            Model
            <select value={estimate.model} disabled={running} onChange={(e) => setModel(e.target.value)}>
              {settings.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {running && <Working label={status} />}
        {result && (
          <p className={`small${result.includes('Stopped:') ? ' warn' : ''}`} role="status">
            {result}
          </p>
        )}

        {keyMissing ? (
          <p className="warn small">Add the provider address and key in Settings first.</p>
        ) : running ? (
          <button type="button" className="btn wide" onClick={() => stop.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="button" className="update-btn" disabled={!picked.length || !estimate.ready} onClick={() => void run()}>
            <span>{picked.length ? `Update ${picked.length} ${picked.length === 1 ? 'character' : 'characters'}` : 'Tick who to update'}</span>
            {picked.length > 0 && <em>{estimate.ready ? `about ${formatCost(estimate.cost)}` : '…'}</em>}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** For the reader's small character sheet: a button to the full card. */
export function ProfileLink({ entry }: { entry: GlossaryEntry }) {
  return (
    <a className="pill-btn small" href={`#/character/${entry.id}`}>
      <span>Open {entry.english}'s card</span>
    </a>
  );
}


/**
 * "New in the story" on the cast: reads the chapters finished since the last search, shows the price first, puts new
 * people, places, gods, groups and terms under "To check", and adds new facts to the world entries already there.
 * Nobody's character profile is changed.
 */
export function NewPeopleSearch({ book, chapters, known }: { book: Book; chapters: Chapter[]; known: number }) {
  const [settings, setSettings] = useState<TranslateSettings>();
  const [texts, setTexts] = useState<Map<string, string>>();
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const stop = useRef<AbortController>();
  const from = searchedTo(book);
  const todo = chaptersToSearch(chapters, from);
  const todoKey = todo.map((c) => c.id).join();

  useEffect(() => {
    void loadSettings().then(setSettings);
    return () => stop.current?.abort();
  }, []);
  useEffect(() => {
    if (!todo.length) return;
    let live = true;
    void readingTexts(book, todo).then((t) => live && setTexts(t));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, todoKey]);

  const running = !!status;
  const model = settings ? modelFor(settings, book.model).id : undefined;
  const ready = !!settings && (!todo.length || (!!texts && todo.every((c) => texts.has(c.id))));
  const cost = ready && settings && model && texts ? searchCost(searchPlan(chapters, texts, from), settings, model, known) : undefined;
  const keyMissing = settings && (!settings.apiKey.trim() || !settings.baseUrl.trim());

  async function run() {
    stop.current = new AbortController();
    setResult('');
    setStatus('Starting');
    try {
      const done = await searchStory({ book, chapters, settings: settings!, model: model!, signal: stop.current.signal, onStatus: setStatus });
      const parts: string[] = [];
      if (done.added.length) {
        const by = (['person', 'place', 'god', 'group', 'term'] as const)
          .map((k) => [k, done.added.filter((g) => g.kind === k).length] as const)
          .filter(([, n]) => n)
          .map(([k, n]) => `${n} ${KIND_WORDS[k][n === 1 ? 0 : 1]}`);
        parts.push(`Found ${by.join(', ')}: check them under "To check" at the top.`);
      }
      if (done.updated) parts.push(`Added details to ${done.updated} ${done.updated === 1 ? 'entry' : 'entries'}.`);
      if (!parts.length) parts.push(`Nothing new in ${span(todo)}.`);
      if (done.cost) parts.push(`Cost ${formatCost(done.cost)}.`);
      if (done.stopped) parts.push(done.stopped === 'Stopped.' ? 'Stopped; what was read is kept.' : `Stopped: ${done.stopped}`);
      setResult(parts.join(' '));
    } finally {
      setStatus('');
    }
  }

  return (
    <section className="new-people glass">
      <div className="row between">
        <strong>New in the story</strong>
        <span className="muted small">{from ? `Searched up to Ch. ${from}` : 'Not searched yet'}</span>
      </div>
      {!todo.length ? (
        <p className="muted small">Nothing new to read yet. Finish more chapters, then look again.</p>
      ) : keyMissing ? (
        <p className="warn small">Add the provider address and key in Settings to search the story.</p>
      ) : running ? (
        <>
          <Working label={status} />
          <button type="button" className="btn wide" onClick={() => stop.current?.abort()}>
            Stop
          </button>
        </>
      ) : (
        <button type="button" className="update-btn" disabled={!ready} onClick={() => void run()}>
          <span>
            Look for new names and places
            <small>people, places, gods, groups and terms in {span(todo)}</small>
          </span>
          <em>{ready ? `about ${formatCost(cost)}` : '…'}</em>
        </button>
      )}
      {result && (
        <p className={`small${result.includes('Stopped:') ? ' warn' : ''}`} role="status">
          {result}
        </p>
      )}
    </section>
  );
}

const KIND_WORDS: Record<GlossaryKind, [string, string]> = {
  person: ['person', 'people'],
  place: ['place', 'places'],
  god: ['god', 'gods'],
  group: ['group', 'groups'],
  term: ['term', 'terms'],
};
