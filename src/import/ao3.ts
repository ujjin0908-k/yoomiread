import type { Guide } from '../guides/types';

/**
 * Archive of Our Own (AO3) works, imported from the EPUB that AO3 offers on every work ("Download → EPUB").
 * YoomiRead never fetches anything from AO3 itself: the reader downloads the file, as AO3 intends.
 *
 * An AO3 EPUB starts with a preface page ("Posted originally on the Archive of Our Own at …", then a list of tags:
 * Rating, Archive Warning, Category, Fandom, Relationship, Character, Additional Tags, Language, Series, Stats, and
 * the summary) and ends with an afterword ("Please drop by the Archive and comment…"). Those two pages are read for
 * the work's details and left out of the chapters.
 */
export interface Ao3Work {
  /** https://archiveofourown.org/works/123 */
  url?: string;
  rating?: string;
  warnings: string[];
  categories: string[];
  fandoms: string[];
  relationships: string[];
  characters: string[];
  tags: string[];
  language?: string;
  series?: string;
  summary?: string;
  published?: string;
  updated?: string;
  words?: number;
  /** "3/?" or "12/12". */
  chapters?: string;
  /** True when the chapter count is final ("12/12"). */
  complete?: boolean;
}

const tidy = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** True for the preface page AO3 puts first. */
export function isAo3Preface(html: string): boolean {
  return /archiveofourown\.org/i.test(html) && /(Fandom|Fandoms)\s*:/i.test(html);
}

/** True for the afterword page AO3 puts last. */
export function isAo3Afterword(html: string): boolean {
  return /Please drop by the Archive and comment/i.test(html) || (/archiveofourown\.org/i.test(html) && /<h[1-3][^>]*>\s*Afterword\s*</i.test(html));
}

/**
 * The page without AO3's preface block, for a file where the preface and the first chapter share a page. Empty when
 * nothing but the preface was there.
 */
export function withoutAo3Preface(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('#preface, .preface, .meta, dl.tags, .message').forEach((e) => e.remove());
  // Also the block that holds the "Posted originally on the Archive of Our Own" note, wherever it is.
  Array.from(doc.querySelectorAll('p, div')).forEach((e) => {
    if (/Posted originally on the/i.test(e.textContent ?? '') && (e.textContent ?? '').length < 400) e.remove();
  });
  return doc.body?.innerHTML ?? '';
}

/** The work's details from AO3's preface page. */
export function parseAo3Preface(html: string): Ao3Work {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const work: Ao3Work = { warnings: [], categories: [], fandoms: [], relationships: [], characters: [], tags: [] };
  const link = Array.from(doc.querySelectorAll('a[href]'))
    .map((a) => a.getAttribute('href') ?? '')
    .find((h) => /archiveofourown\.org\/works\/\d+/.test(h));
  if (link) work.url = `https://archiveofourown.org/works/${/works\/(\d+)/.exec(link)![1]}`;

  // The tag list: <dt>Fandom:</dt><dd><a>…</a>, <a>…</a></dd>
  for (const dt of Array.from(doc.querySelectorAll('dt'))) {
    const label = tidy(dt.textContent).replace(/:$/, '').toLowerCase();
    const dd = dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling : undefined;
    if (!dd) continue;
    const links = Array.from(dd.querySelectorAll('a')).map((a) => tidy(a.textContent)).filter(Boolean);
    const values = links.length ? links : tidy(dd.textContent).split(/\s*,\s*/).filter(Boolean);
    const text = tidy(dd.textContent);
    if (label === 'rating') work.rating = values[0];
    else if (/warning/.test(label)) work.warnings = values;
    else if (label === 'category' || label === 'categories') work.categories = values;
    else if (/^fandoms?$/.test(label)) work.fandoms = values;
    else if (/^relationships?$/.test(label)) work.relationships = values;
    else if (/^characters?$/.test(label)) work.characters = values;
    else if (/additional tags?|^freeforms?$/.test(label)) work.tags = values;
    else if (label === 'language') work.language = text;
    else if (label === 'series') work.series = text;
    else if (label === 'stats') {
      work.published = /Published:\s*([\d-]+)/.exec(text)?.[1];
      work.updated = /(?:Updated|Completed):\s*([\d-]+)/.exec(text)?.[1];
      const words = /Words:\s*([\d,]+)/.exec(text)?.[1];
      if (words) work.words = Number(words.replace(/,/g, ''));
      const chapters = /Chapters:\s*(\d+\/(?:\d+|\?))/.exec(text)?.[1];
      if (chapters) {
        work.chapters = chapters;
        const [done, total] = chapters.split('/');
        work.complete = total !== '?' && done === total;
      }
    }
  }

  // The summary: the block after a "Summary" heading or label.
  const summaryHead = Array.from(doc.querySelectorAll('p, h2, h3, b, strong, div')).find((e) => /^Summary\s*:?$/i.test(tidy(e.textContent)));
  let next = summaryHead?.nextElementSibling;
  while (next && !tidy(next.textContent)) next = next.nextElementSibling;
  if (next) work.summary = tidy(next.textContent).slice(0, 1200) || undefined;
  return work;
}

/** A character tag without the fandom AO3 adds to tell namesakes apart: "Lin Mei (Some Fandom)" → "Lin Mei". */
export function characterName(tag: string): string {
  return tag.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * The cast and their relationships from the work's tags, as a book guide, so the glossary and the People web fill in
 * at once, for free. "A/B" is a romantic relationship, "A & B" a friendship (AO3's own convention).
 */
export function ao3Guide(work: Ao3Work, title: string): Guide {
  const names = new Set<string>();
  const people = work.characters.map(characterName).filter((n) => n && !names.has(n) && names.add(n));
  const links: NonNullable<Guide['links']> = [];
  for (const rel of work.relationships) {
    const romantic = rel.includes('/');
    const pair = rel.split(romantic ? '/' : '&').map((p) => characterName(p)).filter(Boolean);
    if (pair.length !== 2) continue;
    for (const p of pair) if (!names.has(p)) {
      names.add(p);
      people.push(p);
    }
    links.push({ from: pair[0], to: pair[1], label: romantic ? 'in love with' : 'friends with', safe: true });
  }
  return {
    book: title,
    titles: [],
    entries: people.map((english, i) => ({ english, original: english, kind: 'person' as const, role: i < 2 ? ('main' as const) : ('side' as const) })),
    links,
  };
}

/** The address of AO3's own EPUB download for a work link, or undefined when the link is not an AO3 work. */
export function ao3DownloadUrl(link: string): string | undefined {
  const id = /archiveofourown\.org\/works\/(\d+)/i.exec(link)?.[1];
  return id ? `https://archiveofourown.org/downloads/${id}/work.epub` : undefined;
}
