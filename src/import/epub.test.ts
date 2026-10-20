// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { EpubError, pageParagraphs, readEpub } from './epub';

// Small books built for these tests. The text is our own.
const page = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><style>p{}</style></head><body>${body}</body></html>`;

function epub3(extra: Record<string, string> = {}) {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>灯笼信使</dc:title><dc:creator>测试作者</dc:creator><dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cov" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="c0" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="Text/ch%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c0"/><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`),
    'OEBPS/nav.xhtml': strToU8(
      page('<nav epub:type="toc"><ol><li><a href="Text/ch%201.xhtml#top">第一章 夜路</a></li><li><a href="Text/ch2.xhtml">第二章 渡口</a></li></ol></nav>'),
    ),
    'OEBPS/Images/cover.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    'OEBPS/Text/cover.xhtml': strToU8(page('<div><img src="../Images/cover.jpg"/></div>')),
    'OEBPS/Text/ch 1.xhtml': strToU8(
      page('<h2>第一章 夜路</h2><p>夜色很深，梅提着一盏旧灯笼走出村口。</p><p>风从河面吹来，带着<ruby>潮<rt>cháo</rt></ruby>湿的草香。</p>'),
    ),
    'OEBPS/Text/ch2.xhtml': strToU8(page('<div class="text">渡口的木桥在雾里若隐若现。<br/>一个少年坐在桥头。<br/><br/>他也拿着一封信。</div>')),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  });
}

describe('ePub (EPUB 3)', () => {
  it('reads title, author, language, cover and chapters in order', () => {
    const book = readEpub(epub3());
    expect(book.title).toBe('灯笼信使');
    expect(book.author).toBe('测试作者');
    expect(book.language).toBe('zh');
    expect(book.cover?.type).toBe('image/jpeg');
    expect(book.chapters.map((c) => c.title)).toEqual(['第一章 夜路', '第二章 渡口']);
  });

  it('keeps paragraphs, drops ruby readings and the repeated title, splits on <br>', () => {
    const [one, two] = readEpub(epub3()).chapters;
    expect(one.text).toBe('夜色很深，梅提着一盏旧灯笼走出村口。\n\n风从河面吹来，带着潮湿的草香。');
    expect(two.text.split('\n\n')).toEqual(['渡口的木桥在雾里若隐若现。', '一个少年坐在桥头。', '他也拿着一封信。']);
  });

  it('refuses copy-protected books with a clear message', () => {
    const drm = epub3({
      'META-INF/encryption.xml':
        '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/Text/ch2.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>',
    });
    expect(() => readEpub(drm)).toThrow(/copy-protected/);
  });

  it('allows font obfuscation (only fonts encrypted)', () => {
    const fonts = epub3({
      'META-INF/encryption.xml':
        '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/Fonts/a.ttf"/></enc:CipherData></enc:EncryptedData></encryption>',
    });
    expect(readEpub(fonts).chapters).toHaveLength(2);
  });

  it('says so when a file is not an ePub', () => {
    expect(() => readEpub(strToU8('hello'))).toThrow(EpubError);
    expect(() => readEpub(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/no book inside/);
  });
});

describe('ePub (EPUB 2 with NCX, many chapters in one file)', () => {
  const book = zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>',
    ),
    'content.opf': strToU8(`<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Quiet Orchard</dc:title><dc:creator>Sample Writer</dc:creator><meta name="cover" content="img"/></metadata>
  <manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="img" href="c.png" media-type="image/png"/>
    <item id="all" href="all.html" media-type="application/xhtml+xml"/><item id="end" href="end.html" media-type="application/xhtml+xml"/></manifest>
  <spine toc="ncx"><itemref idref="all"/><itemref idref="end"/></spine></package>`),
    'toc.ncx': strToU8(
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>Afterword</text></navLabel><content src="end.html"/></navPoint></navMap></ncx>',
    ),
    'c.png': new Uint8Array([137, 80, 78, 71]),
    'all.html': strToU8(page('<p>Chapter 1</p><p>The apples fell early that year.</p><p>Chapter 2</p><p>Nobody came to pick them up.</p>')),
    'end.html': strToU8(page('<p>Thank you for reading this little test book to the end.</p>')),
  });

  it('splits a file with several headings, and takes titles from the NCX', () => {
    const r = readEpub(book);
    expect(r.title).toBe('The Quiet Orchard');
    expect(r.language).toBe('en');
    expect(r.cover?.type).toBe('image/png');
    expect(r.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Afterword']);
    expect(r.chapters[1].text).toBe('Nobody came to pick them up.');
  });
});

describe('page text', () => {
  it('never counts nested blocks twice', () => {
    expect(pageParagraphs(page('<div><div><p>One.</p></div><p>Two.</p></div>')).paragraphs).toEqual(['One.', 'Two.']);
  });
});
