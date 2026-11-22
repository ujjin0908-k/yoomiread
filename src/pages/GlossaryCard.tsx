import { useState } from 'react';
import { picturePrompt } from '../art';
import { genreOf, kindLabel } from '../genres';
import { Sheet } from '../components';
import { db } from '../db';
import { useLive } from '../hooks';
import { usePictureUrl } from '../picture';
import type { GlossaryEntry, ProfileFact } from '../types';
import { ProfileLink } from './Character';
import { Avatar } from './Glossary';


/** A short explanation of a glossary name, opened from the reader: what it is, without leaving the chapter. */
export function GlossaryCard({ entry, onClose }: { entry: GlossaryEntry; onClose: () => void }) {
  const book = useLive(() => db.books.get(entry.bookId), [entry.bookId]);
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
  const scene = usePictureUrl(person ? undefined : entry.picture, entry.id);
  return (
    <Sheet title={entry.english} onClose={onClose}>
      <div className="g-card">
        {scene && <img className="g-card-art" src={scene} alt={entry.english} />}
        <div className="g-card-head">
          {person && entry.picture && <Avatar entry={entry} size={64} />}
          <div>
            <span className="chip">{kindLabel(genreOf(book), entry.kind)}</span>
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
        {entry.look && <LookBox entry={entry} />}
        {person && <ProfileLink entry={entry} />}
      </div>
    </Sheet>
  );
}

/** How it looks, with a button that copies the whole picture prompt (description and the book's art style). */
export function LookBox({ entry }: { entry: GlossaryEntry }) {
  const book = useLive(async () => (await db.books.get(entry.bookId)) ?? null, [entry.bookId]);
  const [copied, setCopied] = useState(false);
  return (
    <details className="look-box">
      <summary>How it looks{entry.picture ? '' : ' (for a picture)'}</summary>
      <p>{entry.look}</p>
      <button
        type="button"
        className="pill-btn small"
        onClick={() => void navigator.clipboard?.writeText(picturePrompt(entry, book?.artStyle)).then(() => setCopied(true))}
      >
        <span>{copied ? 'Copied: paste it into ChatGPT' : 'Copy picture prompt'}</span>
      </button>
      <p className="muted small">Then add the picture with Edit on the cast page.</p>
    </details>
  );
}

/** A big picture in the chapter, after the paragraph that first names the place, god or group. Tap for its card. */
export function StoryPicture({ entry, onOpen }: { entry: GlossaryEntry; onOpen: () => void }) {
  const url = usePictureUrl(entry.picture, entry.id);
  if (!url) return null;
  return (
    <figure className="story-art" onClick={(e) => (e.stopPropagation(), onOpen())}>
      <img src={url} alt={entry.english} loading="lazy" />
      <figcaption>{entry.english}</figcaption>
    </figure>
  );
}
