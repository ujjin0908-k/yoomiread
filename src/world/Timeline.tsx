import { ArrowDownUp, MapPin, MessageSquare, Quote, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Face } from '../pages/World';
import type { WorldData } from './load';
import { buildTimeline } from './timeline';
import type { WorldAt } from './visible';

/** The timeline page: sections by arc, newest first by default (where I am in the story is what I came for). */
export function Timeline({ data, world, onOpen }: { data: WorldData; world: WorldAt; onOpen: (id: string, tab: 'people' | 'places') => void }) {
  const [oldestFirst, setOldestFirst] = useState(false);
  const sections = useMemo(() => buildTimeline(world), [world]);
  const byId = useMemo(() => new Map(world.entries.map((e) => [e.id, e])), [world]);
  const chapterId = useMemo(() => new Map(data.chapters.map((c) => [c.number, c.id])), [data]);
  const shown = oldestFirst ? sections : [...sections].reverse().map((s) => ({ ...s, rows: [...s.rows].reverse() }));
  const count = world.events.length;

  return (
    <div className="world-scroll world-timeline">
      <div className="world-tl-head">
        <p>
          <b>{count}</b> {count === 1 ? 'event' : 'events'} up to chapter <b>{world.line}</b>
        </p>
        <button type="button" className="world-tool wide" onClick={() => setOldestFirst(!oldestFirst)}>
          <ArrowDownUp size={14} />
          {oldestFirst ? 'First to last' : 'Last to first'}
        </button>
      </div>
      {!sections.length && (
        <div className="world-empty">
          <h2>Nothing yet</h2>
          <p>Events, first appearances and your highlights will gather here as you read.</p>
        </div>
      )}
      {shown.map((section) => (
        <section key={`${section.title}-${section.from}`} className="world-arc">
          <header>
            <h2>{section.title}</h2>
            <span>
              Ch. {section.from}
              {section.to !== section.from ? `–${section.to}` : ''}
            </span>
          </header>
          <ol>
            {section.rows.map((row, i) => {
              const link = chapterId.get(row.chapter);
              const chip = (
                <a className="world-tl-ch" href={link ? `#/chapter/${link}` : undefined} aria-label={`Open chapter ${row.chapter}`}>
                  {row.chapter}
                </a>
              );
              if (row.kind === 'event') {
                const who = (row.event.who ?? []).map((id) => byId.get(id)).filter((e) => !!e);
                const where = row.event.where ? byId.get(row.event.where) : undefined;
                return (
                  <li key={`e${row.event.id}`} className="world-tl-row world-tl-event">
                    {chip}
                    <div className="world-tl-card">
                      <h3>{row.event.title}</h3>
                      {row.event.detail && <p>{row.event.detail}</p>}
                      {(who.length > 0 || where) && (
                        <div className="world-tl-tags">
                          {who.map((e) => (
                            <button key={e!.id} type="button" onClick={() => onOpen(e!.id, 'people')}>
                              <Face entry={e!} size={22} />
                              {e!.english}
                            </button>
                          ))}
                          {where && (
                            <button type="button" className="place" onClick={() => onOpen(where.id, 'places')}>
                              <MapPin size={13} />
                              {where.english}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              }
              if (row.kind === 'arrivals') {
                return (
                  <li key={`a${row.chapter}-${i}`} className="world-tl-row world-tl-arrivals">
                    {chip}
                    <div>
                      <span className="world-tl-kicker">
                        <Sparkles size={12} /> First appear
                      </span>
                      <div className="world-tl-tags">
                        {row.entries.map((e) => (
                          <button key={e.id} type="button" className={e.kind === 'place' ? 'place' : ''} onClick={() => onOpen(e.id, e.kind === 'place' ? 'places' : 'people')}>
                            {e.kind === 'place' ? <MapPin size={13} /> : <Face entry={e} size={22} />}
                            {e.english}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={`n${row.note.id}`} className="world-tl-row world-tl-note">
                  {chip}
                  <a className="world-tl-mine" href={link ? `#/chapter/${link}` : undefined}>
                    <span className="world-tl-kicker">
                      {row.note.kind === 'highlight' ? <Quote size={12} /> : <MessageSquare size={12} />} {row.note.kind === 'highlight' ? 'You kept' : 'You wrote'}
                    </span>
                    {row.note.quote && <q>{row.note.quote}</q>}
                    {row.note.body && <p>{row.note.body}</p>}
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
