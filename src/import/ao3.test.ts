// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { scanGlossary, translateChapter } from '../translate/run';
import type { Book, TranslateSettings } from '../types';
import { ao3DownloadUrl, ao3Guide, characterName } from './ao3';
import { addNewAo3Chapters, aiAllowedFor, setUpAo3Book } from './ao3Book';
import { readEpub } from './epub';

// A made-up work in the shape AO3's EPUBs have: a preface with the tags, the chapters, an afterword.
const page = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`;
const PREFACE = page(`<div id="preface">
<h1>The Lantern Keeper</h1><div class="byline">by <a rel="author" href="https://archiveofourown.org/users/someone">someone</a></div>
<p class="message">Posted originally on the <a href="https://archiveofourown.org/">Archive of Our Own</a> at <a href="https://archiveofourown.org/works/4242">https://archiveofourown.org/works/4242</a>.</p>
<div class="meta"><dl class="tags">
<dt>Rating:</dt><dd><a>Teen And Up Audiences</a></dd>
<dt>Archive Warning:</dt><dd><a>No Archive Warnings Apply</a></dd>
<dt>Category:</dt><dd><a>F/M</a></dd>
<dt>Fandom:</dt><dd><a>Lantern Tales (Original Work)</a></dd>
<dt>Relationship:</dt><dd><a>Mira/Tomas</a>, <a>Mira &amp; Old Fen</a></dd>
<dt>Character:</dt><dd><a>Mira (Lantern Tales)</a>, <a>Tomas</a>, <a>Old Fen</a></dd>
<dt>Additional Tags:</dt><dd><a>Slow Burn</a>, <a>Magic</a>, <a>Found Family</a></dd>
<dt>Language:</dt><dd>English</dd>
<dt>Stats:</dt><dd>Published: 2026-01-02 Updated: 2026-03-04 Words: 12,345 Chapters: 2/?</dd>
</dl>
<p>Summary</p><blockquote class="userstuff"><p>A girl who keeps the lanterns lit learns why they must never go out.</p></blockquote>
</div></div>`);
const CHAPTER = (n: number, title: string) => page(`<h2 class="heading">Chapter ${n}: ${title}</h2><div class="userstuff"><p>${'The lanterns hummed in the dark street and Mira listened. '.repeat(4)}</p></div>`);
const AFTERWORD = page(`<h2>Afterword</h2><p>Please drop by the Archive and comment to let the creator know if you enjoyed their work!</p>`);

function ao3Epub(chapters: number) {
  const spine = ['preface', ...Array.from({ length: chapters }, (_, i) => `ch${i + 1}`), 'afterword'];
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'content.opf': strToU8(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>The Lantern Keeper</dc:title><dc:creator>someone</dc:creator><dc:language>en</dc:language><dc:publisher>Archive of Our Own</dc:publisher>
</metadata><manifest>${spine.map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${spine.map((id) => `<itemref idref="${id}"/>`).join('')}</spine></package>`),
    'preface.xhtml': strToU8(PREFACE),
    'afterword.xhtml': strToU8(AFTERWORD),
  };
  for (let i = 1; i <= chapters; i++) files[`ch${i}.xhtml`] = strToU8(CHAPTER(i, ['Dusk', 'The Wick', 'Old Fen Speaks'][i - 1]));
  return zipSync(files);
}

describe('reading an AO3 EPUB', () => {
  it('reads the work’s details and leaves AO3’s own pages out of the chapters', () => {
    const book = readEpub(ao3Epub(2));
    expect(book.ao3).toMatchObject({
      url: 'https://archiveofourown.org/works/4242',
      rating: 'Teen And Up Audiences',
      warnings: ['No Archive Warnings Apply'],
      fandoms: ['Lantern Tales (Original Work)'],
      relationships: ['Mira/Tomas', 'Mira & Old Fen'],
      characters: ['Mira (Lantern Tales)', 'Tomas', 'Old Fen'],
      tags: ['Slow Burn', 'Magic', 'Found Family'],
      words: 12345,
      chapters: '2/?',
      complete: false,
      summary: 'A girl who keeps the lanterns lit learns why they must never go out.',
    });
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1: Dusk', 'Chapter 2: The Wick']);
    expect(book.chapters.some((c) => /drop by the Archive|Posted originally/.test(c.text))).toBe(false);
  });

  it('turns the tags into a cast and relationships, for free', () => {
    const guide = ao3Guide(readEpub(ao3Epub(1)).ao3!, 'The Lantern Keeper');
    expect(guide.entries.map((e) => e.english)).toEqual(['Mira', 'Tomas', 'Old Fen']);
    expect(guide.links).toEqual([
      { from: 'Mira', to: 'Tomas', label: 'in love with', safe: true },
      { from: 'Mira', to: 'Old Fen', label: 'friends with', safe: true },
    ]);
    expect(characterName('Mira (Lantern Tales)')).toBe('Mira');
  });

  it('gives the official download link for a work link', () => {
    expect(ao3DownloadUrl('https://archiveofourown.org/works/4242/chapters/99')).toBe('https://archiveofourown.org/downloads/4242/work.epub');
    expect(ao3DownloadUrl('https://example.com/works/1')).toBeUndefined();
  });
});

describe('an AO3 work in the library', () => {
  afterEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  const add = async () => {
    const parsed = readEpub(ao3Epub(2));
    const book: Book = { id: 'w', title: parsed.title, author: parsed.author, language: 'en', shelf: 'reading', ao3: parsed.ao3, createdAt: 1, updatedAt: 1 };
    await db.books.add(book);
    await db.addChapters(parsed.chapters.map((c, i) => ({ chapter: { id: `c${i + 1}`, bookId: 'w', number: i + 1, title: c.title, read: false, createdAt: 1 }, text: c.text })));
    await setUpAo3Book('w', parsed.ao3!, parsed.title);
    return book;
  };

  it('fills the glossary and the People web from the tags', async () => {
    await add();
    expect((await db.glossary.toArray()).map((g) => g.english).sort()).toEqual(['Mira', 'Old Fen', 'Tomas']);
    expect((await db.worldLinks.toArray()).map((l) => l.label).sort()).toEqual(['friends with', 'in love with']);
    // Fantasy, from the tags (Magic) and the summary.
    expect((await db.books.get('w'))!.genre).toBe('fantasy');
  });

  it('a newer download adds only the new chapters, and keeps notes', async () => {
    const book = await add();
    await db.notes.add({ id: 'n', bookId: 'w', chapterId: 'c1', kind: 'chapter', text: 'Love this', createdAt: 2 } as never);
    const newer = readEpub(ao3Epub(3));
    expect(await addNewAo3Chapters(book, newer.chapters, newer.ao3!)).toBe(1);
    const chapters = await db.chapters.where('bookId').equals('w').sortBy('number');
    expect(chapters.map((c) => c.title)).toEqual(['Chapter 1: Dusk', 'Chapter 2: The Wick', 'Chapter 3: Old Fen Speaks']);
    expect(await db.notes.count()).toBe(1);
    // The same download again adds nothing.
    expect(await addNewAo3Chapters((await db.books.get('w'))!, newer.chapters, newer.ao3!)).toBe(0);
  });

  it('keeps AI off for a fan work until the reader turns it on', async () => {
    await add();
    await db.books.update('w', { language: 'zh' });
    const settings: TranslateSettings = { baseUrl: 'https://example.test/v1', apiKey: 'k', models: [{ id: 'm', label: 'M' }], defaultModel: 'm' };
    const chapter = (await db.chapters.get('c1'))!;
    await expect(translateChapter(chapter, { settings, model: 'm' })).rejects.toThrow(/AI is off for this fan work/);
    await expect(scanGlossary('w', settings, 'm')).rejects.toThrow(/AI is off for this fan work/);
    expect(aiAllowedFor(await db.books.get('w'))).toBe(false);
    await db.books.update('w', { aiOk: true });
    expect(aiAllowedFor(await db.books.get('w'))).toBe(true);
    expect(aiAllowedFor({})).toBe(true);
  });
});
