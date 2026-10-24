// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractChapter } from './web';
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
