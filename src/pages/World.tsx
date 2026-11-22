import { genreOf, kindLabel, type Genre } from '../genres';
import { ChevronLeft, Eye, EyeOff, Maximize2, Pause, Play, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from '../components';
import { db } from '../db';
import { go, useLive } from '../hooks';
import { motionOk } from '../motion';
import { usePictureUrl } from '../picture';
import { chapterBefore } from '../trail';
import { formatCost } from '../translate/prompt';
import { chaptersToSearch, readingTexts, searchCost, searchPlan, searchStory } from '../translate/profiles';
import { loadSettings, modelFor } from '../translate/run';
import type { GlossaryKind, TranslateSettings } from '../types';
import { toneOf, type Tone } from '../world/graph';
import { loadWorldData, worldOf, worldSignature, type WorldData } from '../world/load';
import { PeopleWeb } from '../world/PeopleWeb';
import { PlacesMap } from '../world/PlacesMap';
import { Recap } from '../world/Recap';
import { Timeline } from '../world/Timeline';
import type { WorldAt, WorldEntry } from '../world/visible';
import { GlossaryCard } from './GlossaryCard';
import { initials } from './Glossary';
import '../world/world.css';

/**
 * The Living Book: the story's people, places and events as they stand at the chapter I have reached. Nothing past
 * my reading line is ever shown (see src/world/visible.ts). Four parts: People (a web of who is who to whom), Places
 * (a map), Timeline, and "Previously on…" (a recap).
 */

type Tab = 'people' | 'places' | 'timeline' | 'recap';
const TABS: { id: Tab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'places', label: 'Places' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'recap', label: 'Recap' },
];
const TONES: { id: Tone; label: string }[] = [
  { id: 'bond', label: 'Bonds' },
  { id: 'faith', label: 'Faith' },
  { id: 'conflict', label: 'Conflict' },
];

export function WorldPage({ bookId, tab: firstTab }: { bookId: string; tab?: string }) {
  const fresh = useLive(async () => (await loadWorldData(bookId)) ?? null, [bookId], 'world');
  // The same data object is kept until something the world shows really changes: saving a reading spot elsewhere
  // must not lay the web out again.
  const kept = useRef<{ sig: string; data: WorldData }>();
  if (fresh && kept.current?.sig !== worldSignature(fresh)) kept.current = { sig: worldSignature(fresh), data: fresh };
  const data = fresh && kept.current ? kept.current.data : fresh;
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === firstTab) ? (firstTab as Tab) : 'people');
  // The chapter the slider is on; undefined means "now" (my reading line).
  const [at, setAt] = useState<number>();
  const [selected, setSelected] = useState<string>();
  const [tones, setTones] = useState<Set<Tone>>(() => new Set<Tone>(['bond', 'faith', 'conflict', 'other']));
  const [refit, setRefit] = useState(0);
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [detail, setDetail] = useState<WorldEntry>();

  // The stage fills the screen and must not scroll or bounce under a finger.
  useEffect(() => {
    document.body.dataset.world = tab;
    return () => {
      delete document.body.dataset.world;
    };
  }, [tab]);

  const full = useMemo(() => (data ? worldOf(data) : undefined), [data]);
  const world = useMemo(() => (data ? worldOf(data, at) : undefined), [data, at]);

  if (data === undefined) return <main className="world" />;
  if (data === null || !full || !world) {
    return (
      <main className="world world-missing">
        <a className="round-btn" href="#/library" aria-label="Back">
          <ChevronLeft size={20} />
        </a>
        <p>This book is no longer here.</p>
      </main>
    );
  }

  const back = chapterBefore(data.chapters.map((c) => c.id));
  const line = world.line;
  const entry = selected ? world.entries.find((e) => e.id === selected) : undefined;
  const staged = tab === 'people' || tab === 'places';

  const open = (id: string, where: Tab) => {
    setTab(where);
    setSelected(id);
  };

  return (
    <main className={`world world-${tab}`}>
      {tab === 'people' && <PeopleWeb full={full} world={world} selected={selected} onSelect={setSelected} tones={tones} refit={refit} />}
      {tab === 'places' && <PlacesMap full={full} world={world} selected={selected} onSelect={setSelected} refit={refit} />}

      <header className="world-top">
        <a className="round-btn" href={back ? `#/chapter/${back}` : `#/book/${bookId}`} aria-label="Back">
          <ChevronLeft size={20} />
        </a>
        <div className="world-title">
          <h1>
            The world<i className="dot">.</i>
          </h1>
          <p>{data.book.title}</p>
        </div>
        <button type="button" className="round-btn" aria-label="Spoilers and the story scan" onClick={() => setMenu(true)}>
          {data.book.worldSpoilers ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </header>

      <nav className="world-tabs" aria-label="Parts of the world">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'on' : ''}
            aria-pressed={t.id === tab}
            onClick={() => {
              setTab(t.id);
              setSelected(undefined);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {staged && (
        <div className="world-tools">
          {tab === 'people' &&
            TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`world-tone tone-${t.id}${tones.has(t.id) ? ' on' : ''}`}
                aria-pressed={tones.has(t.id)}
                onClick={() => {
                  const next = new Set(tones);
                  if (next.has(t.id)) next.delete(t.id);
                  else next.add(t.id);
                  setTones(next);
                }}
              >
                <i />
                {t.label}
              </button>
            ))}
          <span className="world-tools-gap" />
          <button type="button" className="world-tool" aria-label="Find a name" onClick={() => setSearching(true)}>
            <Search size={16} />
          </button>
          <button type="button" className="world-tool" aria-label="Show everything" onClick={() => setRefit((n) => n + 1)}>
            <Maximize2 size={16} />
          </button>
        </div>
      )}

      {tab === 'people' && !world.entries.some((e) => e.kind === 'person') && (
        <div className="world-empty floating">
          <h2>No one yet</h2>
          <p>People appear here from the chapter the story first names them. Fill the cast from the book guide, or with “New in the story”.</p>
        </div>
      )}
      {tab === 'places' && !world.entries.some((e) => e.kind === 'place') && (
        <div className="world-empty floating">
          <h2>Uncharted</h2>
          <p>Places appear on the map from the chapter the story first reaches them. Add places to the glossary to chart them.</p>
        </div>
      )}

      {tab === 'timeline' && <Timeline data={data} world={full} onOpen={open} />}
      {tab === 'recap' && <Recap data={data} world={full} onOpen={open} />}

      {staged && entry && <EntryCard entry={entry} genre={genreOf(data.book)} world={world} tab={tab} onClose={() => setSelected(undefined)} onHop={setSelected} onDetail={() => setDetail(entry)} onOpen={open} />}
      {staged && <Scrubber reached={data.reached} line={line} at={at} setAt={setAt} world={world} tab={tab} lifted={!!entry} />}

      {searching && (
        <FindSheet
          world={world}
          kinds={tab === 'places' ? ['place'] : ['person', 'god', 'group']}
          onClose={() => setSearching(false)}
          onPick={(id) => {
            setSearching(false);
            setSelected(id);
          }}
        />
      )}
      {menu && <SpoilerSheet data={data} onClose={() => setMenu(false)} />}
      {detail && <GlossaryCard entry={detail} onClose={() => setDetail(undefined)} />}
    </main>
  );
}

/** A face for the cards: the picture, or initials on a quiet ground. */
export function Face({ entry, size = 44 }: { entry: WorldEntry; size?: number }) {
  const url = usePictureUrl(entry.picture, entry.id);
  return url ? (
    <img className="world-face" src={url} alt="" width={size} height={size} />
  ) : (
    <span className={`world-face world-face-${entry.kind}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {entry.kind === 'person' ? initials(entry.english) : { god: '✦', group: '⚑', term: '◆', place: '⌂' }[entry.kind]}
    </span>
  );
}

/** The card for the name that is selected: who or what it is at this chapter, and its links, each one a hop away. */
function EntryCard({
  entry,
  genre,
  world,
  tab,
  onClose,
  onHop,
  onDetail,
  onOpen,
}: {
  entry: WorldEntry;
  genre: Genre;
  world: WorldAt;
  tab: Tab;
  onClose: () => void;
  onHop: (id: string) => void;
  onDetail: () => void;
  onOpen: (id: string, tab: Tab) => void;
}) {
  const byId = new Map(world.entries.map((e) => [e.id, e]));
  const links = world.pairs
    .filter((p) => p.from === entry.id || p.to === entry.id)
    .map((p) => ({ pair: p, other: byId.get(p.from === entry.id ? p.to : p.from)!, out: p.from === entry.id }))
    .filter((l) => l.other)
    .sort((a, b) => (b.pair.current.chapter ?? 0) - (a.pair.current.chapter ?? 0));
  const lead = entry.profile?.line ?? entry.profile?.about[0]?.text ?? entry.profile?.status?.[0]?.text;
  const events = world.events.filter((e) => e.where === entry.id || e.who?.includes(entry.id));
  return (
    <section className="lb-card" aria-label={entry.english}>
      <header>
        <Face entry={entry} size={52} />
        <div className="lb-card-name">
          <h2>{entry.english}</h2>
          <p>
            <span className="chip">{entry.role === 'main' ? 'Main' : kindLabel(genre, entry.kind)}</span>
            {entry.firstChapter !== undefined && <span className="world-since">since Ch. {entry.firstChapter}</span>}
          </p>
        </div>
        <button type="button" className="round-btn plain" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="lb-card-body">
        {lead && <p className="world-lead">{lead}</p>}
        {links.length > 0 && (
          <ul className="world-links">
            {links.map(({ pair, other, out }) => (
              <li key={`${pair.from}>${pair.to}`}>
                <button type="button" onClick={() => (other.kind === 'place' && tab === 'people' ? onOpen(other.id, 'places') : other.kind !== 'place' && tab === 'places' ? onOpen(other.id, 'people') : onHop(other.id))}>
                  <i className={`tone-${toneOf(pair.current.label)}`} />
                  <span>
                    {out ? (
                      <>
                        {pair.current.label} <b>{other.english}</b>
                      </>
                    ) : (
                      <>
                        <b>{other.english}</b> · {pair.current.label}
                      </>
                    )}
                    {pair.history.length > 0 && <em> (was: {pair.history.map((h) => h.label).join(', ')})</em>}
                  </span>
                  <small>{pair.current.chapter ? `Ch. ${pair.current.chapter}` : pair.current.mine ? 'yours' : 'guide'}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {events.length > 0 && (
          <p className="lb-card-events">
            {events.length} {events.length === 1 ? 'event' : 'events'}
            {tab === 'places' ? ' here' : ''}: {events.slice(-3).map((e) => `Ch. ${e.chapter ?? '?'}`).join(', ')}
            {events.length > 3 ? '…' : ''}
          </p>
        )}
        {!lead && !links.length && (
          <p className="muted small">
            {entry.firstChapter !== undefined ? `First named in chapter ${entry.firstChapter}. ` : ''}Nothing more is known yet at this chapter.
          </p>
        )}
        <button type="button" className="pill-btn small" onClick={onDetail}>
          Full card
        </button>
      </div>
    </section>
  );
}

/**
 * The chapter slider: drag back to see the world as it was at an earlier chapter, or press play to watch it grow
 * from chapter 1. It can never go past my reading line.
 */
function Scrubber({
  reached,
  line,
  at,
  setAt,
  world,
  tab,
  lifted,
}: {
  reached: number;
  line: number;
  at: number | undefined;
  setAt: (n: number | undefined) => void;
  world: WorldAt;
  tab: Tab;
  lifted: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const ms = Math.max(3500, Math.min(9000, reached * 45));
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const chapter = Math.max(1, Math.round(t * reached));
      setAt(chapter >= reached ? undefined : chapter);
      if (t < 1) timer.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    timer.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (reached < 1) return null;
  const people = world.entries.filter((e) => e.kind === 'person').length;
  const places = world.entries.filter((e) => e.kind === 'place').length;
  return (
    <div className={`world-scrub${lifted ? ' lifted' : ''}`}>
      <button
        type="button"
        className="world-play"
        aria-label={playing ? 'Pause' : 'Watch the world grow from chapter 1'}
        onClick={() => {
          if (!motionOk() && !playing) return setAt(undefined);
          setPlaying(!playing);
        }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="world-scrub-main">
        <div className="world-scrub-label">
          <strong>Ch. {line}</strong>
          <span>
            {tab === 'places' ? `${places} ${places === 1 ? 'place' : 'places'}` : `${people} people · ${world.pairs.length} links`}
          </span>
          {at !== undefined && (
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setAt(undefined);
              }}
            >
              Now
            </button>
          )}
        </div>
        <input
          type="range"
          min={1}
          max={reached}
          value={line}
          aria-label="Chapter"
          style={{ '--fill': `${reached > 1 ? ((line - 1) / (reached - 1)) * 100 : 100}%` } as React.CSSProperties}
          onChange={(e) => {
            setPlaying(false);
            const n = Number(e.target.value);
            setAt(n >= reached ? undefined : n);
          }}
        />
      </div>
    </div>
  );
}

function FindSheet({ world, kinds, onClose, onPick }: { world: WorldAt; kinds: GlossaryKind[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = world.entries
    .filter((e) => kinds.includes(e.kind))
    .filter((e) => !needle || [e.english, e.original, ...(e.aliases ?? [])].some((n) => n.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.role === 'main') - Number(a.role === 'main') || a.english.localeCompare(b.english))
    .slice(0, 60);
  return (
    <Sheet title="Find" onClose={onClose}>
      <input className="search world-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A name" autoFocus />
      <ul className="world-find-list">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e.id)}>
              <Face entry={e} size={34} />
              <span>{e.english}</span>
              <small>{e.firstChapter !== undefined ? `Ch. ${e.firstChapter}` : ''}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted small">No one by that name has appeared yet.</li>}
      </ul>
    </Sheet>
  );
}

function SpoilerSheet({ data, onClose }: { data: WorldData; onClose: () => void }) {
  const on = !!data.book.worldSpoilers;
  const hidden = data.links.filter((l) => l.guide && !l.safe && l.chapter === undefined).length + data.events.filter((e) => e.guide && e.chapter === undefined).length;
  return (
    <Sheet title="This world" onClose={onClose}>
      <div className="world-spoilers">
        <p>
          The world shows only what has happened up to <b>chapter {data.reached}</b>, the furthest you have read. Faces, places, links and events from later chapters stay hidden.
        </p>
        <label className="world-switch">
          <span>
            <b>Show the guide’s spoilers</b>
            <small>
              {hidden
                ? `The book guide knows ${hidden} more ${hidden === 1 ? 'thing' : 'things'} without a chapter number: twists, other names, later facts. They may spoil the story.`
                : 'Guide facts without a chapter number (twists, other names). There are none hidden for this book right now.'}
            </small>
          </span>
          <input type="checkbox" className="switch" checked={on} onChange={(e) => void db.books.update(data.book.id, { worldSpoilers: e.target.checked })} />
        </label>
        <LinkScan data={data} />
        <button type="button" className="pill-btn" onClick={() => go(`glossary/${data.book.id}`)}>
          Open the cast and glossary
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Reads the chapters I have finished for links between names and for events, with their chapter numbers. It costs a
 * little, so it only runs on a button press, shows a price first, and carries on from where it last stopped.
 */
function LinkScan({ data }: { data: WorldData }) {
  const { book, chapters } = data;
  const [settings, setSettings] = useState<TranslateSettings>();
  const [texts, setTexts] = useState<Map<string, string>>();
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const stop = useRef<AbortController>();
  const from = book.linksUpTo ?? 0;
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

  const model = settings ? modelFor(settings, book.model).id : undefined;
  const ready = !!settings && !!texts;
  const cost = ready && model ? searchCost(searchPlan(chapters, texts!, from), settings!, model, data.entries.length) : undefined;
  const keyMissing = settings && (!settings.apiKey.trim() || !settings.baseUrl.trim());
  const span = todo.length ? `Ch. ${todo[0].number}${todo.length > 1 ? `–${todo[todo.length - 1].number}` : ''}` : '';

  async function run() {
    stop.current = new AbortController();
    setResult('');
    setStatus('Starting');
    try {
      const done = await searchStory({ book, chapters, settings: settings!, model: model!, signal: stop.current.signal, onStatus: setStatus, linksOnly: true });
      const parts = [`Found ${done.links} ${done.links === 1 ? 'link' : 'links'} and ${done.events} ${done.events === 1 ? 'event' : 'events'}.`];
      if (done.cost) parts.push(`Cost ${formatCost(done.cost)}.`);
      if (done.stopped) parts.push(done.stopped === 'Stopped.' ? 'Stopped; what was read is kept.' : `Stopped: ${done.stopped}`);
      setResult(parts.join(' '));
    } finally {
      setStatus('');
    }
  }

  return (
    <section className="world-scan">
      <b>Links and events from the story</b>
      <small>{from ? `Read up to chapter ${from}.` : 'Not read yet.'} Who is what to whom, and what happened, with the chapter for each. Only chapters you have finished are sent.</small>
      {!todo.length ? (
        <p className="muted small">Nothing new to read. Finish more chapters, then look again.</p>
      ) : keyMissing ? (
        <p className="warn small">Add the provider address and key in Settings first.</p>
      ) : status ? (
        <>
          <p className="small" role="status">
            {status}…
          </p>
          <button type="button" className="btn wide" onClick={() => stop.current?.abort()}>
            Stop
          </button>
        </>
      ) : (
        <button type="button" className="pill-btn" disabled={!ready} onClick={() => void run()}>
          Read {span} · {ready ? `about ${formatCost(cost)}` : '…'}
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
