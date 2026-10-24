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

  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title.trim() || 'Chapter';

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
  const text = paragraphs.filter(Boolean).join('\n\n');
  return { title, text };
}
