import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildParagraphs, coverTitle, dropPageFurniture, isHeading, isJunkTitle, splitChapters, toLines, type PdfLine } from './chapters';

const line = (page: number, y: number, text: string, x = 50): PdfLine => ({ page, y, x, text, height: 12 });

describe('PDF paragraphs', () => {
  it('joins broken lines and starts a paragraph after a big gap', () => {
    const paras = buildParagraphs([
      line(1, 700, 'The lantern swung in the'),
      line(1, 686, 'wind as she walked.'),
      line(1, 650, 'The bridge was empty.'),
    ]);
    expect(paras.map((p) => p.text)).toEqual(['The lantern swung in the wind as she walked.', 'The bridge was empty.']);
  });

  it('joins Chinese lines without spaces and fixes hyphens', () => {
    const zh = buildParagraphs([line(1, 700, '她提着灯笼'), line(1, 686, '走过了小桥。')]);
    expect(zh[0].text).toBe('她提着灯笼走过了小桥。');
    const en = buildParagraphs([line(1, 700, 'a quiet morn-'), line(1, 686, 'ing came')]);
    expect(en[0].text).toBe('a quiet morning came');
  });

  it('an indented line starts a new paragraph', () => {
    const paras = buildParagraphs([line(1, 700, 'First line.'), line(1, 686, 'Second para.', 80), line(1, 672, 'More.')]);
    expect(paras).toHaveLength(2);
  });
});

describe('chapter split', () => {
  it('knows Chinese and English chapter headings', () => {
    for (const h of ['第一章 灯笼', '第12章', '第 三 回', '楔子', 'Chapter 4', 'CHAPTER IV', 'Prologue']) {
      expect(isHeading(h), h).toBe(true);
    }
    expect(isHeading('The chapter was long and full of rain.')).toBe(false);
  });

  it('does not take sentences that start like headings', () => {
    for (const t of ['第三节课下课后，他跑去河边。', '第一回合她就输了。', '第二部分的人都走了，只剩下她', 'Chapter by chapter, the story grew.', 'Chapter one was the hardest to write, she said.']) {
      expect(isHeading(t), t).toBe(false);
    }
    for (const t of ['Chapter One', 'Chapter 4: The Road', 'Chapter 12.', '第十二章　回家']) expect(isHeading(t), t).toBe(true);
  });

  it('splits at headings and drops a contents page', () => {
    const p = (page: number, text: string) => ({ page, text });
    const chapters = splitChapters([
      p(2, '第一章 夜路'),
      p(2, '第二章 渡口'),
      p(3, '第一章 夜路'),
      p(3, '她提着灯笼走过了小桥。'),
      p(5, '第二章 渡口'),
      p(5, '船夫在雾里等她。'),
    ]);
    expect(chapters).toEqual([
      { title: '第一章 夜路', text: '她提着灯笼走过了小桥。' },
      { title: '第二章 渡口', text: '船夫在雾里等她。' },
    ]);
  });

  it('falls back to parts of pages when there are no headings', () => {
    const chapters = splitChapters([{ page: 1, text: 'a' }, { page: 11, text: 'b' }], 10);
    expect(chapters.map((c) => c.title)).toEqual(['Pages 1–10', 'Pages 11–20']);
  });
});

describe('cover page', () => {
  it('takes the biggest text as the title and the next as the author', () => {
    const lines = [
      { page: 1, text: '灯笼信使', x: 100, y: 400, height: 34 },
      { page: 1, text: '测 试 作 者', x: 120, y: 360, height: 12 },
      { page: 1, text: '2026', x: 130, y: 100, height: 9 },
    ];
    expect(coverTitle(lines)).toEqual({ title: '灯笼信使', author: '测试作者' });
  });

  it('spots junk titles', () => {
    expect(isJunkTitle('Microsoft Word - draft.docx')).toBe(true);
    expect(isJunkTitle('lantern.pdf')).toBe(true);
    expect(isJunkTitle('The Lantern Courier')).toBe(false);
  });
});

describe('page furniture', () => {
  const page = (n: number, body: string[]) => [
    line(n, 800, 'The Lantern Courier'),
    ...body.map((t, i) => line(n, 700 - i * 14, t)),
    line(n, 40, String(n + 10)),
  ];

  it('drops page numbers and running headers, keeps the text', () => {
    const lines = [1, 2, 3, 4].flatMap((n) => page(n, [`Body text on page ${n}.`]));
    expect(dropPageFurniture(lines).map((l) => l.text)).toEqual([1, 2, 3, 4].map((n) => `Body text on page ${n}.`));
  });

  it('keeps a real chapter heading at the top of a page', () => {
    const lines = [...page(1, ['x']), line(2, 800, '第二章 渡口'), line(2, 700, 'y'), line(2, 40, '12'), ...page(3, ['z']), ...page(4, ['w'])];
    expect(dropPageFurniture(lines).map((l) => l.text)).toContain('第二章 渡口');
  });

  it('reads lines top to bottom even when the PDF lists the footer first', () => {
    const lines = [line(1, 40, '7'), line(1, 700, 'First.'), line(1, 686, 'Second.')];
    expect(dropPageFurniture(lines).map((l) => l.text)).toEqual(['First.', 'Second.']);
  });
});

describe('text pieces to lines', () => {
  it('joins pieces on one baseline and takes the height from real text', () => {
    const piece = (str: string, x: number, y: number, height: number, hasEOL = false) => ({ str, transform: [1, 0, 0, height, x, y], height, hasEOL });
    const lines = toLines(1, [piece('', 70, 500, 0, true), piece('第', 50, 480, 15), piece('一章', 65, 480, 15, true), piece('正文', 50, 460, 11)]);
    expect(lines).toEqual([
      { page: 1, text: '第一章', x: 50, y: 480, height: 15 },
      { page: 1, text: '正文', x: 50, y: 460, height: 11 },
    ]);
  });
});

describe('a realistic PDF, end to end', () => {
  // Made for these tests: a cover, a running header, page numbers, long paragraphs across pages,
  // and sentences that begin like headings. The text is our own.
  it('finds exactly the two real chapters with clean text', async () => {
    const doc = await getDocument({ url: new URL('./fixtures/river-letter.pdf', import.meta.url).pathname }).promise;
    const lines: PdfLine[] = [];
    for (let n = 2; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      lines.push(...toLines(n, content.items.filter((i) => 'str' in i) as never));
    }
    const chapters = splitChapters(buildParagraphs(dropPageFurniture(lines)));
    expect(chapters.map((c) => c.title)).toEqual(['第一章 夜路', '第二章 渡口']);
    for (const c of chapters) {
      expect(c.text).not.toContain('河边的信');
      expect(c.text).not.toMatch(/(^|\n)\s*\d+\s*(\n|$)/);
      expect(c.text.split('\n\n').length).toBe(5);
    }
    expect(chapters[0].text).toContain('第三节课下课后，她跑去河边看船。');
    await doc.destroy();
  });
});
