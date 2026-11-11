import { coverShaped } from '../images';
import { extractChapter, extractChapterLinks, fetchPage, findContentsLink } from './web';

const MAX_BYTES = 10_000_000;

/** The page's share picture ("og:image") as a full web address. On a novel's page that is its cover. */
export function findCoverUrl(html: string, pageUrl: string): string | undefined {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const raw = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.getAttribute('content');
  if (!raw) return undefined;
  try {
    const url = new URL(raw, pageUrl);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Downloads a page's cover picture, shrunk and ready to save. The browser fetches it from the site's own picture
 * address, which works when the site allows it. Throws with a plain reason when it cannot, so a button can say why.
 */
export async function fetchCover(html: string, pageUrl: string): Promise<Blob> {
  const url = findCoverUrl(html, pageUrl);
  if (!url) throw new Error('That page has no cover picture.');
  let blob: Blob;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    throw new Error('The site would not let the app copy its cover picture.');
  }
  if (!blob.type.startsWith('image/') || blob.size > MAX_BYTES) throw new Error('That cover picture could not be used.');
  const cover = await coverShaped(blob).catch(() => undefined);
  if (!cover) throw new Error('The picture on that page is not a book cover (it is a logo or a banner).');
  return cover;
}

/**
 * The cover for a novel, starting from any of its links: the contents page's picture, or, from a single chapter,
 * the picture on the contents page that chapter points to. Throws with the reason when there is none.
 */
export async function coverFromLink(link: string): Promise<Blob> {
  const page = await fetchPage(link);
  if (extractChapterLinks(page.html, page.url).length >= 5) return fetchCover(page.html, page.url);
  const up = findContentsLink(page.html, page.url);
  if (up) {
    const contents = await fetchPage(up);
    // A guessed contents page only counts when it really lists chapters.
    if (extractChapterLinks(contents.html, contents.url).length >= 5) return fetchCover(contents.html, contents.url);
  }
  return fetchCover(page.html, page.url);
}

export interface Novel {
  /** The novel's contents page. */
  url: string;
  /** The novel's own title, not a chapter's. */
  title: string;
  cover?: Blob;
}

/**
 * The novel behind a link: from its contents page, or from one of its chapters. Gives its contents page, its title and
 * its cover when they can be had, and nothing when the page is not part of a novel with a list of chapters.
 * For a book being made right now, so it never throws and never blocks the import.
 */
export async function lookUpNovel(html: string, pageUrl: string): Promise<Novel | undefined> {
  try {
    let contents = { html, url: pageUrl };
    if (extractChapterLinks(html, pageUrl).length < 5) {
      const up = findContentsLink(html, pageUrl);
      if (!up) return undefined;
      contents = await fetchPage(up);
      if (extractChapterLinks(contents.html, contents.url).length < 5) return undefined;
    }
    const cover = await fetchCover(contents.html, contents.url).catch(() => undefined);
    return { url: contents.url, title: extractChapter(contents.html).title, cover };
  } catch {
    return undefined;
  }
}
