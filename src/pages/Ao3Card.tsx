import { useState } from 'react';
import type { Ao3Work } from '../import/ao3';

/**
 * An AO3 work's details on its book page, the way AO3 shows them: rating, warnings, fandoms, relationships, characters
 * and tags, the summary, and how far the work has got. Warnings show up front, as on AO3. Links go to the work on AO3.
 */
export function Ao3Card({ work, notice }: { work: Ao3Work; notice?: 'updated' | 'uptodate' }) {
  const [allTags, setAllTags] = useState(false);
  const tags = allTags ? work.tags : work.tags.slice(0, 8);
  const row = (label: string, values: string[] | undefined) =>
    values && values.length > 0 && (
      <div className="ao3-row">
        <dt>{label}</dt>
        <dd>
          {values.map((v) => (
            <span key={v} className="ao3-tag">
              {v}
            </span>
          ))}
        </dd>
      </div>
    );
  return (
    <section className="ao3-card glass" aria-label="Archive of Our Own">
      {notice && (
        <p className="small" role="status">
          {notice === 'updated' ? 'New chapters added from the newer download. Your notes and progress are as they were.' : 'This download has no new chapters.'}
        </p>
      )}
      <div className="row between">
        <strong>Archive of Our Own</strong>
        <span className="muted small">
          {[work.words ? `${work.words.toLocaleString()} words` : '', work.chapters ? `${work.chapters} chapters` : '', work.complete === false ? 'in progress' : work.complete ? 'complete' : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {work.summary && <p className="ao3-summary">{work.summary}</p>}
      <dl className="ao3-tags">
        {row('Rating', work.rating ? [work.rating] : [])}
        {row('Warnings', work.warnings)}
        {row('Fandom', work.fandoms)}
        {row('Relationships', work.relationships)}
        {row('Characters', work.characters)}
        {row('Tags', tags)}
      </dl>
      {work.tags.length > 8 && (
        <button type="button" className="link small" onClick={() => setAllTags(!allTags)}>
          {allTags ? 'Fewer tags' : `All ${work.tags.length} tags`}
        </button>
      )}
      {work.url && (
        <div className="row-btns">
          <a className="btn ghost" href={work.url} target="_blank" rel="noopener noreferrer">
            Open on AO3
          </a>
          {work.complete === false && (
            <a className="btn ghost" href={work.url} target="_blank" rel="noopener noreferrer">
              New chapters? Download again
            </a>
          )}
        </div>
      )}
      {work.complete === false && (
        <p className="muted small">For new chapters, download the EPUB again on AO3 and import it: only the new chapters are added.</p>
      )}
    </section>
  );
}
