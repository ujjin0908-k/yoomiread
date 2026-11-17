import { BookOpen, MapPin, MessageSquare, Quote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLive, useOnline } from '../hooks';
import { Wizard } from '../mascot/Wizard';
import { Face } from '../pages/World';
import { formatCost } from '../translate/prompt';
import type { WorldData } from './load';
import { askCatRecap, freeRecap, savedCatRecap, type CatRecap } from './recap';
import type { WorldAt } from './visible';

/** "Previously on…": the cat reminds me where the story stands, with nothing past my reading line. */
export function Recap({ data, world, onOpen }: { data: WorldData; world: WorldAt; onOpen: (id: string, tab: 'people' | 'places') => void }) {
  const recap = useLive(() => freeRecap(data, world), [data, world]);
  const online = useOnline();
  const [long, setLong] = useState(false);
  const [cat, setCat] = useState<CatRecap>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void savedCatRecap(data.book.id, world.line, long).then((saved) => live && setCat(saved));
    return () => {
      live = false;
    };
  }, [data.book.id, world.line, long]);

  async function ask() {
    setBusy(true);
    setError('');
    try {
      setCat(await askCatRecap(data, world, long));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'He could not tell it just now.');
    } finally {
      setBusy(false);
    }
  }

  if (!recap) return <div className="world-scroll world-recap" />;
  const away = recap.daysAway;
  const greeting = away === undefined ? 'Here is where things stand.' : away >= 3 ? `It has been ${away} days. Here is where we were.` : away >= 1 ? 'Back so soon. Here is where we were.' : 'Here is where things stand.';
  const told = cat?.text ?? recap.soFar?.text;

  return (
    <div className="world-scroll world-recap">
      <header className="world-recap-head">
        <Wizard mood={away !== undefined && away >= 3 ? 'happy' : 'idle'} size={104} />
        <div>
          <span className="world-tl-kicker">Up to chapter {recap.line}</span>
          <h2>
            Previously <i>on…</i>
          </h2>
          <p>{greeting}</p>
        </div>
      </header>

      {recap.line < 1 && (
        <div className="world-empty">
          <h2>Not started</h2>
          <p>Read a chapter and the cat will keep track of the story for you.</p>
        </div>
      )}

      {recap.chapter && (
        <a className="world-recap-stop" href={`#/chapter/${recap.chapter.id}`}>
          <BookOpen size={18} />
          <span>
            <small>You stopped in</small>
            <b>
              Chapter {recap.chapter.number}
              {recap.chapter.title && !/^chapter \d+$/i.test(recap.chapter.title) ? ` · ${recap.chapter.title}` : ''}
            </b>
          </span>
          <em>Continue</em>
        </a>
      )}

      {recap.line >= 1 && (
        <section className="world-recap-told">
          {told ? (
            <>
              {told.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              <small>
                {cat
                  ? `The cat's telling${cat.cost !== undefined ? `, ${formatCost(cat.cost)}${cat.estimated ? ' (estimate)' : ''}` : ''}. Kept on the phone.`
                  : `The story so far, saved with the translation of chapter ${recap.soFar!.chapter}.`}
              </small>
            </>
          ) : (
            <p className="quiet">The cat can tell you where the story stands, from the last chapters you read. Nothing ahead of you is sent or told.</p>
          )}
          <div className="world-recap-ask">
            {!cat && (
              <button type="button" className="pill-btn" disabled={busy || !online} onClick={() => void ask()}>
                {busy ? 'He is thinking…' : told ? 'Ask the cat to tell it' : 'Ask the cat'}
              </button>
            )}
            {(cat || long) && (
              <button type="button" className="world-tool wide" disabled={busy} onClick={() => setLong(!long)}>
                {long ? 'Shorter' : 'Longer'}
              </button>
            )}
            {!cat && <small>{online ? 'Uses your AI key: a fraction of a cent.' : 'Needs internet.'}</small>}
          </div>
          {error && <p className="warn small">{error}</p>}
        </section>
      )}

      {recap.events.length > 0 && (
        <section className="world-recap-block">
          <h3>Lately</h3>
          <ol className="world-recap-events">
            {recap.events.map((e) => (
              <li key={e.id}>
                <span>{e.chapter}</span>
                {e.title}
              </li>
            ))}
          </ol>
        </section>
      )}

      {recap.onPage.length > 0 && (
        <section className="world-recap-block">
          <h3>On the page in the last chapters</h3>
          <div className="world-tl-tags">
            {recap.onPage.map((e) => (
              <button key={e.id} type="button" className={e.kind === 'place' ? 'place' : ''} onClick={() => onOpen(e.id, e.kind === 'place' ? 'places' : 'people')}>
                {e.kind === 'place' ? <MapPin size={13} /> : <Face entry={e} size={22} />}
                {e.english}
              </button>
            ))}
          </div>
        </section>
      )}

      {recap.newFaces.length > 0 && (
        <section className="world-recap-block">
          <h3>New since chapter {Math.max(1, recap.line - 14)}</h3>
          <div className="world-tl-tags">
            {recap.newFaces.map((e) => (
              <button key={e.id} type="button" className={e.kind === 'place' ? 'place' : ''} onClick={() => onOpen(e.id, e.kind === 'place' ? 'places' : 'people')}>
                {e.kind === 'place' ? <MapPin size={13} /> : <Face entry={e} size={22} />}
                {e.english}
                <small>Ch. {e.firstChapter}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {recap.marks.length > 0 && (
        <section className="world-recap-block">
          <h3>Your last marks</h3>
          {recap.marks.map((n) => (
            <a key={n.id} className="world-tl-mine" href={`#/chapter/${n.chapterId}`}>
              <span className="world-tl-kicker">
                {n.kind === 'highlight' ? <Quote size={12} /> : <MessageSquare size={12} />} Chapter {n.chapter}
              </span>
              {n.quote && <q>{n.quote}</q>}
              {n.body && <p>{n.body}</p>}
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
