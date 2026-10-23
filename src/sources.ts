import type { Book } from './types';

export type BookSource = NonNullable<Book['sources']>[number];

/** Only web addresses are kept: a link typed into the app must not open anything else. */
export function webLink(raw: string): string | undefined {
  const text = raw.trim();
  // Anything with another scheme (javascript:, file:, ...) is refused outright.
  if (!text || /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Reads one "Name | link" per line. Lines without a usable link are skipped. */
export function parseSources(text: string): BookSource[] {
  const out: BookSource[] = [];
  for (const line of text.split('\n')) {
    const [first, second] = line.includes('|') ? line.split('|', 2) : [line, undefined];
    const url = webLink(second ?? first);
    if (!url) continue;
    const name = second === undefined ? new URL(url).hostname.replace(/^www\./, '') : first.trim();
    out.push({ name: name || new URL(url).hostname, url });
  }
  return out;
}

/** Writes sources back as "Name | link" lines for the form. */
export function sourcesText(sources: BookSource[] = []): string {
  return sources.map((s) => `${s.name} | ${s.url}`).join('\n');
}
