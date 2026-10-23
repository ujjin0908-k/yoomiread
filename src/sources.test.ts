import { describe, expect, it } from 'vitest';
import { parseSources, sourcesText, webLink } from './sources';

describe('book links', () => {
  it('keeps only web addresses', () => {
    expect(webLink('https://www.novelupdates.com/series/x/')).toBe('https://www.novelupdates.com/series/x/');
    expect(webLink('novelupdates.com/series/x')).toBe('https://novelupdates.com/series/x');
    expect(webLink('javascript:alert(1)')).toBeUndefined();
    expect(webLink('file:///etc/passwd')).toBeUndefined();
    expect(webLink('   ')).toBeUndefined();
  });

  it('reads name | link lines and skips bad ones', () => {
    const got = parseSources('Qidian | https://www.qidian.com/book/1\nnot a link\nRoyal Road\nhttps://www.royalroad.com/fiction/2 ');
    expect(got).toEqual([
      { name: 'Qidian', url: 'https://www.qidian.com/book/1' },
      { name: 'royalroad.com', url: 'https://www.royalroad.com/fiction/2' },
    ]);
  });

  it('writes them back the same way', () => {
    expect(sourcesText([{ name: 'Qidian', url: 'https://www.qidian.com/book/1' }])).toBe('Qidian | https://www.qidian.com/book/1');
  });
});
