// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findCoverUrl } from './cover';

const page = (head: string) => `<html><head><title>x</title>${head}</head><body></body></html>`;

describe('finding a cover picture on a page', () => {
  it('takes the share picture, with the &amp; in its address read properly', () => {
    const html = page('<meta property="og:image" content="https://cdn.example/c.png?fit=800%2C1200&#038;ssl=1">');
    expect(findCoverUrl(html, 'https://scans.example/novel/')).toBe('https://cdn.example/c.png?fit=800%2C1200&ssl=1');
  });
  it('makes a relative address whole', () => {
    expect(findCoverUrl(page('<meta property="og:image" content="/img/c.jpg">'), 'https://scans.example/novel/')).toBe('https://scans.example/img/c.jpg');
  });
  it('refuses pictures that are not on https, and pages with none', () => {
    expect(findCoverUrl(page('<meta property="og:image" content="http://cdn.example/c.png">'), 'https://scans.example/')).toBeUndefined();
    expect(findCoverUrl(page('<meta property="og:image" content="javascript:alert(1)">'), 'https://scans.example/')).toBeUndefined();
    expect(findCoverUrl(page(''), 'https://scans.example/')).toBeUndefined();
  });
});
