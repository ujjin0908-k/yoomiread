import { describe, expect, it } from 'vitest';
import { buildParagraphs, coverTitle, isHeading, isJunkTitle, splitChapters, type PdfLine } from './chapters';

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
