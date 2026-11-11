// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chapterNumber, extractChapter, extractChapterLinks, findContentsChapter, findContentsLink, looksLikeContents } from './web';
import { checkWebUrl } from '../../netlify/edge-functions/fetch-page';

describe('reading a web page', () => {
  it('keeps the story paragraphs and drops menus and scripts', () => {
    const html = `<html><head><title>Site</title><script>var x=1</script></head><body>
      <nav><a>Home</a><a>Ranking</a></nav>
      <div class="ad"><p>Buy now buy now</p></div>
      <div class="viewer"><h1>第3话 小白花</h1>
        <p>他走进房间。</p><p>灯还亮着。</p><p>她没有回头。</p>
        <button>Next</button></div>
      <footer><p>Terms of use</p></footer></body></html>`;
    const got = extractChapter(html);
    expect(got.title).toBe('第3话 小白花');
    expect(got.text).toBe('他走进房间。\n\n灯还亮着。\n\n她没有回头。');
  });
});

describe('a blog post', () => {
  it('takes the title without the site name, and drops the empty labels after the story', () => {
    const html = `<html><head><title>CL – Chapter 1: The Beginning – Some Scans</title></head><body>
      <header><h1>Some Scans</h1></header>
      <article><p>The snow was heavy.</p><p>He walked on.</p><p>The dog followed.</p><p>By:</p><p>Posted in:</p></article>
      </body></html>`;
    const chapter = extractChapter(html);
    expect(chapter.title).toBe('CL – Chapter 1: The Beginning');
    expect(chapter.text).toBe('The snow was heavy.\n\nHe walked on.\n\nThe dog followed.');
  });
});

describe('the page fetcher only reads allowed sites', () => {
  it('allows listed sites and their subdomains', () => {
    expect(checkWebUrl('https://page.kakao.com/content/1/viewer/2')).toBeInstanceOf(URL);
    expect(checkWebUrl('https://m.series.naver.com/novel/detail.series?productNo=1')).toBeInstanceOf(URL);
  });
  it('refuses everything else', () => {
    expect(checkWebUrl('https://example.com/')).toMatch(/not on the list/);
    expect(checkWebUrl('http://127.0.0.1/')).toMatch(/not allowed/);
    expect(checkWebUrl('http://localhost/')).toMatch(/not allowed/);
    expect(checkWebUrl('http://localhost:9300/')).toMatch(/normal web ports/);
    expect(checkWebUrl('https://page.kakao.com.evil.test/')).toMatch(/not on the list/);
    expect(checkWebUrl('file:///etc/passwd')).toMatch(/Only web/);
    expect(checkWebUrl('https://user:pw@page.kakao.com/')).toMatch(/login/);
    expect(checkWebUrl('https://page.kakao.com:8443/')).toMatch(/normal web ports/);
    expect(checkWebUrl('not a url')).toMatch(/not a web address/);
  });
});

describe('a contents page', () => {
  const page = (items: string) => `<html><head><title>CL – Some Novel – Some Scans</title></head><body>
    <header><nav><a href="/">Home</a><a href="/all-projects/">All Projects</a></nav></header>
    <h1>Some Novel</h1>
    <div class="entry"><p>A short blurb about the novel.</p>${items}</div>
    <a href="https://other.example/chapter-9">Chapter 9 elsewhere</a>
    <footer><a href="/about-us/">About Us</a></footer></body></html>`;
  const ch = (n: number) => `<p><a href="/2026/07/${String(n).padStart(2, '0')}/cl-chapter-${n}/?share=x">x</a><a href="/2026/07/${String(n).padStart(2, '0')}/cl-chapter-${n}/#comments">Chapter ${n}: Part ${n}</a></p>`;
  const six = [1, 2, 3, 4, 5, 6].map(ch).join('');

  it('lists the chapters in order, without menus, share links or other sites', () => {
    const links = extractChapterLinks(page(six), 'https://scans.example/some-novel/');
    expect(links.map((l) => l.title)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Chapter ${n}: Part ${n}`));
    expect(links[0].url).toBe('https://scans.example/2026/07/01/cl-chapter-1/');
  });
  it('puts a newest-first list into reading order', () => {
    const links = extractChapterLinks(page([6, 5, 4, 3, 2, 1].map(ch).join('')), 'https://scans.example/some-novel/');
    expect(links.map((l) => chapterNumber(l.title))).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('finds chapters whose titles do not say "chapter", by their addresses', () => {
    const items = ['Dawn', 'Noon', 'Dusk', 'Night', 'Rain', 'Snow'].map((t, i) => `<p><a href="/2026/08/0${i + 1}/${t.toLowerCase()}/">${t}</a></p>`).join('');
    expect(extractChapterLinks(page(items), 'https://scans.example/some-novel/').map((l) => l.title)).toEqual(['Dawn', 'Noon', 'Dusk', 'Night', 'Rain', 'Snow']);
  });
  it('is not fooled by a chapter page, which has no list of chapters', () => {
    const chapterPage = page(`<p>The snow was heavy.</p><p><a href="/2026/07/02/cl-chapter-2/">Next chapter</a></p>`);
    expect(looksLikeContents(chapterPage, 'https://scans.example/2026/07/01/cl-chapter-1/')).toBe(false);
    expect(looksLikeContents(page(six), 'https://scans.example/some-novel/')).toBe(true);
  });
  it('knows a chapter number from its title, in English and Chinese', () => {
    expect(chapterNumber('Chapter 12: The Quay')).toBe(12);
    expect(chapterNumber('第38章 小白花')).toBe(38);
    expect(chapterNumber('Prologue')).toBeUndefined();
  });
  it('spots the contents page that was saved as a chapter earlier', () => {
    const links = extractChapterLinks(page(six), 'https://scans.example/some-novel/');
    const here = { title: 'Some Novel', text: 'A short blurb about the novel.' };
    // Same text as the page, same title as the page, or a text that lists the chapters.
    expect(findContentsChapter([{ id: 'c1', title: 'x', text: 'A short blurb  about the novel.' }], links, here)).toBe('c1');
    expect(findContentsChapter([{ id: 'c1', title: 'Some Novel', text: 'other' }], links, here)).toBe('c1');
    expect(findContentsChapter([{ id: 'c1', title: 'x', text: links.map((l) => l.title).join('\n\n') }], links, here)).toBe('c1');
    expect(findContentsChapter([{ id: 'c1', title: 'Chapter 1', text: 'The snow was heavy.' }], links, here)).toBeUndefined();
    // A chapter that came from a link is never the contents page.
    expect(findContentsChapter([{ id: 'c1', url: 'https://scans.example/x', title: 'Some Novel', text: here.text }], links, here)).toBeUndefined();
  });
});

describe('finding the contents page from a chapter', () => {
  const chapter = (title: string) => `<html><head><title>${title} – Some Scans</title>
    <meta property="og:title" content="${title}"></head><body><p>Story.</p>
    <script>const P={AB:'/another-novel/',CL:'/crazy-novel-title/',DF:'/drunken/'};const N={};</script></body></html>`;
  it('uses the code in the title', () => {
    expect(findContentsLink(chapter('CL – Chapter 1: The Beginning'), 'https://scans.example/2026/07/27/something-else/')).toBe('https://scans.example/crazy-novel-title/');
  });
  it('uses the code in the web address when the title has none', () => {
    expect(findContentsLink(chapter('Chapter 1: The Beginning'), 'https://scans.example/2026/07/27/cl-chapter-1-the-beginning/')).toBe('https://scans.example/crazy-novel-title/');
  });
  it('says nothing when the page gives no hint', () => {
    expect(findContentsLink(chapter('ZZ – Chapter 1'), 'https://scans.example/2026/07/27/zz-chapter-1/')).toBeUndefined();
    expect(findContentsLink('<html><head><title>Plain</title></head><body><p>x</p></body></html>', 'https://scans.example/a/')).toBeUndefined();
  });
});

describe('sites with the chapters in the page', () => {
  it('keeps a small badge such as "Chinese" as a note on the chapter title', () => {
    const items = [1, 2, 3, 4, 5, 6]
      .map((n) => `<a href="/novel-tl/tour/tour-${n}/">${n < 3 ? `Ch${n} - Some Title` : `Chapter ${n}<small>Chinese</small>`}</a>`)
      .join('');
    const links = extractChapterLinks(`<html><body><h1>Tour</h1><section>${items}</section></body></html>`, 'https://garden.example/novel-tl/tour/');
    expect(links.map((l) => l.title)).toEqual(['Ch1 - Some Title', 'Ch2 - Some Title', 'Chapter 3 (Chinese)', 'Chapter 4 (Chinese)', 'Chapter 5 (Chinese)', 'Chapter 6 (Chinese)']);
    expect(chapterNumber(links[0].title)).toBe(1);
    expect(chapterNumber(links[5].title)).toBe(6);
  });
  it('finds the novel page from the link back to it on a chapter page', () => {
    const html = `<html><head><title>Ch1</title></head><body><a href="/">Home</a> / <a href="/novel-tl/tour/">Tour</a><p>Story.</p></body></html>`;
    expect(findContentsLink(html, 'https://garden.example/novel-tl/tour/tour-1/')).toBe('https://garden.example/novel-tl/tour/');
    expect(findContentsLink(`<html><body><a href="/">Home</a><p>Story.</p></body></html>`, 'https://garden.example/novel-tl/tour/tour-1/')).toBeUndefined();
  });
});

describe('the sites the page reader may read', () => {
  it.each(['https://chrysanthemumgarden.org/novel-tl/tour/', 'https://www.wuxiaworld.com/novel/13-mink-street/13ms-chapter-1', 'https://wtr-lab.com/en/novel/1/x/chapter-1'])('accepts %s', (u) => {
    expect(checkWebUrl(u)).toBeInstanceOf(URL);
  });
  it.each(['https://wuxiaworld.com.evil.test/', 'https://notwtr-lab.com/', 'https://chrysanthemumgarden.org.evil.test/x'])('refuses the look-alike %s', (u) => {
    expect(checkWebUrl(u)).toMatch(/not on the list/);
  });
});
