import { Sheet } from '../components';
import type { GlossaryEntry, GlossaryKind, ProfileFact } from '../types';
import { ProfileLink } from './Character';
import { Avatar } from './Glossary';

const KIND: Record<GlossaryKind, string> = { person: 'Person', place: 'Place', god: 'God', group: 'Group', term: 'Term' };

/** A short explanation of a glossary name, opened from the reader: what it is, without leaving the chapter. */
export function GlossaryCard({ entry, onClose }: { entry: GlossaryEntry; onClose: () => void }) {
  const p = entry.profile;
  const person = entry.kind === 'person';
  const lead = p?.line ?? entry.note;
  const lists: [string, ProfileFact[]][] = person
    ? [
        ['Who', p?.about ?? []],
        ['Powers', p?.powers ?? []],
        ['Status', p?.status ?? []],
      ]
    : [['', (p?.about ?? []).filter((f) => f.text !== entry.note)]];
  const empty = !lead && lists.every(([, l]) => !l.length);
  return (
    <Sheet title={entry.english} onClose={onClose}>
      <div className="g-card">
        <div className="g-card-head">
          {person && entry.picture && <Avatar entry={entry} size={64} />}
          <div>
            <span className="chip">{KIND[entry.kind]}</span>
            {entry.gender && <span className="chip">{entry.gender}</span>}
            {entry.original !== entry.english && (
              <p className="muted small" lang="zh">
                {entry.original}
              </p>
            )}
          </div>
        </div>
        {lead && <p className="g-card-lead">{lead}</p>}
        {lists.map(([title, facts]) =>
          facts.length ? (
            <section key={title || 'about'}>
              {title && <h3>{title}</h3>}
              <ul>
                {facts.slice(0, 6).map((f, i) => (
                  <li key={i}>
                    {f.text}
                    <em> · {f.chapter ? `Ch. ${f.chapter}` : f.guide ? 'guide' : 'yours'}</em>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {empty && <p className="muted small">No explanation yet. "New in the story" or the book guide on the cast can fill it in.</p>}
        {entry.aliases?.length ? <p className="muted small">Also: {entry.aliases.join(', ')}</p> : null}
        {person && <ProfileLink entry={entry} />}
      </div>
    </Sheet>
  );
}
