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

  // The heading, unless it is some other part of the page ("Related Novels") and the page title names the chapter.
  // The page title comes without the site's own name on the end ("Chapter 1 – Some Site").
  const heading = doc.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim();
  const pageTitle = doc.title.replace(/\s+[–—|-]\s+([^–—|]+)$/, (whole, last: string) => (CHAPTER_WORD.test(last) ? whole : '')).trim();
  const title =
    heading && (!pageTitle || pageTitle.toLowerCase().includes(heading.toLowerCase()) || !CHAPTER_WORD.test(pageTitle)) ? heading : pageTitle || heading || 'Chapter';

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

  // A breadcrumb can leave a "> " at the start of the first paragraph.
  let paragraphs = [...best.querySelectorAll('p')].map((p) => p.textContent?.replace(/\s+/g, ' ').replace(/^[>›»]\s+/, '').trim() ?? '');
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
  // Some sites keep the whole list inside <noscript>, which a script-free parser may hand over as plain text.
  doc.querySelectorAll('noscript').forEach((el) => {
    if (!el.children.length && (el.textContent ?? '').includes('<a')) el.innerHTML = el.textContent ?? '';
  });
  doc.querySelectorAll(NOISE.replace('noscript, ', '')).forEach((el) => el.remove());
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }

  // Every link on the page, in order. The same address can appear twice ("Start reading" and "Ch1 - Title").
  const raw: ChapterLink[] = [];
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
    // A small badge inside the link ("Chinese" on a chapter that is not translated yet) is kept as a note.
    const label = a.cloneNode(true) as HTMLElement;
    label.querySelectorAll('small, sup').forEach((badge) => badge.replaceWith(` (${badge.textContent?.trim() ?? ''}) `));
    const title = (label.textContent ?? '').replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').trim();
    if (!title || url.href === base.href) continue;
    raw.push({ title, url: url.href });
  }
  const firstOfEach = (list: ChapterLink[]) => {
    const seen = new Set<string>();
    return list.filter((l) => !seen.has(l.url) && !!seen.add(l.url));
  };

  const all = firstOfEach(raw);
  let links = firstOfEach(raw.filter((l) => CHAPTER_WORD.test(l.title)));
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

/**
 * From a single chapter's page, the address of its novel's contents page. Some sites (like futiledevices.blog)
 * keep a list of novels in a script on every chapter, as short code -> address, and put the code in the chapter's
 * title ("CL – Chapter 1") and web address ("/cl-chapter-1-..."). Returns nothing when the page gives no such hint.
 */
export function findContentsLink(html: string, pageUrl: string): string | undefined {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return undefined;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const heading = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? doc.title;
  const fromTitle = /^\s*([A-Z][A-Z0-9]{0,5})\s*[–—-]\s/.exec(heading)?.[1];
  const fromAddress = base.pathname.split('/').filter(Boolean).pop()?.split('-')[0]?.toUpperCase();
  const codes = [fromTitle, fromAddress].filter((c): c is string => !!c);
  for (const script of doc.querySelectorAll('script')) {
    const source = script.textContent ?? '';
    for (const code of codes) {
      const hit = new RegExp(`[{,\\s]${code}\\s*:\\s*['"](/[^'"]+/)['"]`).exec(source);
      if (hit) return new URL(hit[1], base.origin).href;
    }
  }
  // Otherwise a link on the page to a parent address: /novel-tl/tour/tour-1/ sits under /novel-tl/tour/, which is the
  // novel's page. The caller checks that page really lists chapters, so a wrong guess is dropped.
  const linked = new Set<string>();
  for (const a of doc.querySelectorAll('a[href]')) {
    try {
      const url = new URL(a.getAttribute('href')!, base);
      if (url.origin === base.origin) linked.add(url.pathname.replace(/\/+$/, ''));
    } catch {
      // Not a web address: skip it.
    }
  }
  const parts = base.pathname.split('/').filter(Boolean);
  for (let n = parts.length - 1; n >= 1; n--) {
    const path = `/${parts.slice(0, n).join('/')}`;
    if (linked.has(path)) return new URL(`${path}/`, base.origin).href;
  }
  return undefined;
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
