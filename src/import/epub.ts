import { unzipSync } from 'fflate';
import { guessLanguage } from '../logic';
import type { BookLanguage } from '../types';
import { isHeading, isJunkTitle, splitChapters, type DraftChapter } from './chapters';

export interface ParsedEpub {
  title: string;
  author: string;
  language: BookLanguage;
  cover?: { bytes: Uint8Array; type: string };
  chapters: DraftChapter[];
}

export class EpubError extends Error {}

const MAX_FILE = 60 * 1024 * 1024;

/** Elements whose own text is one paragraph. */
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, dd, dt, td, figcaption';

function named(root: Document | Element, name: string): Element[] {
  // Works with or without XML namespaces (dc:title, opf:item …).
  return Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name);
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

/** Resolves "../Text/ch1.xhtml#a" against a folder, dropping the #part. */
function resolve(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  const parts = (base + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

function tidy(text: string): string {
  return text.replace(/[\s 　]+/g, ' ').trim();
}

/** The paragraphs of one chapter page, in order. <br> breaks count as new paragraphs. */
export function pageParagraphs(html: string): { paragraphs: string[]; heading?: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, rt, rp, nav, head').forEach((e) => e.remove());
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  const body = doc.body;
  if (!body) return { paragraphs: [] };
  const heading = body.querySelector('h1, h2, h3');
  // Only blocks with no block inside them, so text is never counted twice.
  const leaves = Array.from(body.querySelectorAll(BLOCKS)).filter((e) => !e.querySelector(BLOCKS));
  const source = leaves.length ? leaves.map((e) => e.textContent ?? '') : [body.textContent ?? ''];
  const paragraphs = source.flatMap((t) => t.split('\n')).map(tidy).filter(Boolean);
  return { paragraphs, heading: heading ? tidy(heading.textContent ?? '') || undefined : undefined };
}

/** Reads an ePub file. Needs a DOMParser (the browser, or jsdom in tests). */
export function readEpub(bytes: Uint8Array): ParsedEpub {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_FILE });
  } catch {
    throw new EpubError('This file is not an ePub (it could not be opened as one).');
  }
  const text = (path: string) => (files[path] ? new TextDecoder().decode(files[path]) : undefined);
  const xml = (path: string) => {
    const t = text(path);
    return t ? new DOMParser().parseFromString(t, 'application/xml') : undefined;
  };

  const container = xml('META-INF/container.xml');
  const opfPath = container && named(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath || !files[opfPath]) throw new EpubError('This file is not an ePub (no book inside).');

  // Copy-protected books have their chapter files encrypted. Font obfuscation alone is fine.
  const encryption = xml('META-INF/encryption.xml');
  if (encryption && named(encryption, 'CipherReference').some((c) => /\.x?html?$/i.test(c.getAttribute('URI') ?? ''))) {
    throw new EpubError('This ePub is copy-protected (DRM), so its text cannot be read.');
  }

  const opf = xml(opfPath)!;
  const base = dirOf(opfPath);
  const meta = (name: string) => tidy(named(opf, name)[0]?.textContent ?? '');
  const items = new Map(
    named(opf, 'item').map((i) => [
      i.getAttribute('id') ?? '',
      {
        path: resolve(base, i.getAttribute('href') ?? ''),
        type: i.getAttribute('media-type') ?? '',
        props: (i.getAttribute('properties') ?? '').split(/\s+/),
      },
    ]),
  );

  // Chapter titles from the table of contents: EPUB 3 nav first, then the EPUB 2 NCX.
  const labels = new Map<string, string>();
  const navItem = [...items.values()].find((i) => i.props.includes('nav'));
  if (navItem && text(navItem.path)) {
    const nav = new DOMParser().parseFromString(text(navItem.path)!, 'text/html');
    const toc = Array.from(nav.querySelectorAll('nav')).find((n) => /toc/.test(n.getAttribute('epub:type') ?? '')) ?? nav.querySelector('nav');
    toc?.querySelectorAll('a[href]').forEach((a) => {
      const path = resolve(dirOf(navItem.path), a.getAttribute('href')!);
      if (!labels.has(path)) labels.set(path, tidy(a.textContent ?? ''));
    });
  }
  const spineEl = named(opf, 'spine')[0];
  const ncxItem = items.get(spineEl?.getAttribute('toc') ?? '') ?? [...items.values()].find((i) => i.type === 'application/x-dtbncx+xml');
  if (!labels.size && ncxItem) {
    const ncx = xml(ncxItem.path);
    for (const point of ncx ? named(ncx, 'navPoint') : []) {
      const src = named(point, 'content')[0]?.getAttribute('src');
      const label = tidy(named(point, 'text')[0]?.textContent ?? '');
      if (src && label) {
        const path = resolve(dirOf(ncxItem.path), src);
        if (!labels.has(path)) labels.set(path, label);
      }
    }
  }

  const chapters: DraftChapter[] = [];
  let allText = '';
  const spine = spineEl ? named(spineEl, 'itemref').map((r) => items.get(r.getAttribute('idref') ?? '')) : [];
  spine.forEach((item, index) => {
    if (!item || item === navItem || !/html/.test(item.type)) return;
    const html = text(item.path);
    if (!html) return;
    const { paragraphs, heading } = pageParagraphs(html);
    const body = paragraphs.join('');
    // Cover pages, blank pages and title pages with a word or two are skipped.
    if (body.replace(/\s/g, '').length < 20) return;
    allText += body;

    // Some books put many chapters in one page: split those at their headings.
    if (paragraphs.filter(isHeading).length >= 2) {
      chapters.push(...splitChapters(paragraphs.map((p) => ({ page: index + 1, text: p }))));
      return;
    }
    const title = labels.get(item.path) || heading || (isHeading(paragraphs[0]) ? paragraphs[0] : '') || `Section ${chapters.length + 1}`;
    // Do not repeat the title as the first line of the text.
    const rest = paragraphs[0] === title || paragraphs[0] === heading ? paragraphs.slice(1) : paragraphs;
    chapters.push({ title, text: rest.join('\n\n') });
  });
  if (!chapters.length) throw new EpubError('No readable chapters were found in this ePub.');

  // Cover: EPUB 3 "cover-image", then the EPUB 2 <meta name="cover">, then anything called cover.
  const coverId = named(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content') ?? '';
  const coverItem =
    [...items.values()].find((i) => i.props.includes('cover-image')) ??
    (items.get(coverId)?.type.startsWith('image/') ? items.get(coverId) : undefined) ??
    [...items.entries()].find(([id, i]) => i.type.startsWith('image/') && /cover/i.test(id + i.path))?.[1];

  const lang = meta('language').toLowerCase();
  const title = meta('title');
  return {
    title: isJunkTitle(title) ? '' : title,
    author: meta('creator'),
    language: lang.startsWith('zh') ? 'zh' : lang.startsWith('en') ? 'en' : guessLanguage(allText),
    cover: coverItem && files[coverItem.path] ? { bytes: files[coverItem.path], type: coverItem.type } : undefined,
    chapters,
  };
}
