import type { DraftChapter } from './chapters';

/** Asks the site's page through the app's own server, which only reads the sites it allows. */
export async function fetchPage(url: string): Promise<{ url: string; html: string }> {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
  const body = (await res.json().catch(() => ({}))) as { url?: string; html?: string; error?: string };
  if (!res.ok || typeof body.html !== 'string') throw new Error(body.error ?? 'Could not read that page.');
  return { url: body.url ?? url, html: body.html };
}

const NOISE = 'script, style, noscript, iframe, nav, header, footer, aside, form, button, svg, [aria-hidden="true"]';

/** Takes the chapter title and the paragraphs of the story out of a web page. Menus and ads are dropped. */
export function extractChapter(html: string): DraftChapter {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(NOISE).forEach((el) => el.remove());

  // With no heading left, the page title is used, without the site's own name on the end ("Chapter 1 – Some Site").
  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title.replace(/\s+[–—|-]\s+[^–—|]+$/, '').trim() || 'Chapter';

  // The story is usually the block with the most paragraph text.
  const candidates = [...doc.querySelectorAll('article, main, section, div')];
  let best: Element = doc.body;
  let bestLength = 0;
  for (const el of candidates) {
    const length = [...el.querySelectorAll('p')].reduce((n, p) => n + (p.textContent?.trim().length ?? 0), 0);
    if (length > bestLength) {
      best = el;
      bestLength = length;
    }
  }

  let paragraphs = [...best.querySelectorAll('p')].map((p) => p.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  if (paragraphs.filter(Boolean).length < 3) {
    // Pages without <p> tags: use the line breaks of the text.
    paragraphs = (best.textContent ?? '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim());
  }
  paragraphs = paragraphs.filter(Boolean);
  // Blogs end a post with empty labels such as "By:" and "Posted in:". They are not part of the story.
  while (paragraphs.length && /^[\w ]{1,20}:$/.test(paragraphs[paragraphs.length - 1])) paragraphs.pop();
  const text = paragraphs.join('\n\n');
  return { title, text };
}

/** One chapter listed on a contents page. */
export interface ChapterLink {
  title: string;
  url: string;
}

const CHAPTER_WORD =
  /\bchapters?\b|\bch\.?\s*\d|\bepisode\b|\bep\.?\s*\d|\bprologue\b|\bepilogue\b|\bextra\b|\bside story\b|\bafterword\b|\binterlude\b|第\s*[0-9零一二三四五六七八九十百千两]+\s*[章话話回节節卷]/i;

/** The chapter number written in a title ("Chapter 12: ...", "第12章"), if there is one. */
export function chapterNumber(title: string): number | undefined {
  const m = /(?:chapter|ch\.?|episode|ep\.?)\s*(\d+)/i.exec(title) ?? /第\s*(\d+)\s*[章话話回节節]/.exec(title);
  return m ? Number(m[1]) : undefined;
}

/** Groups links by the shape of their address, digits ignored: "/2026/07/27/post" and "/2026/08/01/other" match. */
function addressShape(url: string): string {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return parts
    .slice(0, -1)
    .map((p) => (/\d/.test(p) ? '0' : p))
    .join('/');
}

/**
 * The chapters listed on a novel's contents page, in reading order. Menus, share buttons and links to other sites
 * are left out. Returns an empty list when the page does not look like a list of chapters.
 */
export function extractChapterLinks(html: string, pageUrl: string): ChapterLink[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(NOISE).forEach((el) => el.remove());
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const all: ChapterLink[] = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    let url: URL;
    try {
      url = new URL(a.getAttribute('href')!, base);
    } catch {
      continue;
    }
    if (url.hostname !== base.hostname || (url.protocol !== 'https:' && url.protocol !== 'http:')) continue;
    // Share buttons and reply links point back at the same page with a tag on the end.
    if (url.searchParams.has('share') || url.searchParams.has('replytocom')) continue;
    url.hash = '';
    const title = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!title || url.href === base.href || seen.has(url.href)) continue;
    seen.add(url.href);
    all.push({ title, url: url.href });
  }

  let links = all.filter((l) => CHAPTER_WORD.test(l.title));
  if (links.length < 5) {
    // Titles that do not say "chapter": the biggest group of posts that share one kind of address.
    const groups = new Map<string, ChapterLink[]>();
    for (const l of all) {
      const shape = addressShape(l.url);
      if (shape.split('/').filter(Boolean).length < 1) continue;
      groups.set(shape, [...(groups.get(shape) ?? []), l]);
    }
    const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    links = biggest && biggest.length >= 5 ? biggest : [];
  }
  if (links.length < 2) return [];

  // Some sites list the newest chapter first. Reading order is oldest first.
  const first = chapterNumber(links[0].title);
  const last = chapterNumber(links[links.length - 1].title);
  if (first !== undefined && last !== undefined && first > last) links.reverse();
  return links.slice(0, 2000);
}

/** True when a page is a list of chapters, not a chapter. */
export function looksLikeContents(html: string, pageUrl: string): boolean {
  return extractChapterLinks(html, pageUrl).length >= 5;
}

/**
 * The chapter that is really the contents page itself (it was imported as if it were a chapter): it has no address
 * of its own, and it is the same text or the same title as the page, or its text names many of the listed chapters.
 */
export function findContentsChapter(
  existing: { id: string; url?: string; title: string; text: string }[],
  links: ChapterLink[],
  page: { title: string; text: string },
): string | undefined {
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const need = Math.min(5, Math.ceil(links.length / 2));
  return existing.find((c) => {
    if (c.url) return false;
    const text = squash(c.text);
    if (text && text === squash(page.text)) return true;
    if (page.title && squash(c.title) === squash(page.title)) return true;
    return links.filter((l) => text.includes(squash(l.title))).length >= need;
  })?.id;
}
