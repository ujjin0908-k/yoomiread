/** The parts of a pdf.js text item we use. */
export interface TextPiece {
  str: string;
  transform: number[];
  height: number;
  hasEOL?: boolean;
}

/** Groups text pieces that sit on the same baseline into lines. */
export function toLines(page: number, items: TextPiece[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | undefined;
  for (const item of items) {
    const [, , , d, x, y] = item.transform;
    const height = item.height || Math.abs(d) || 10;
    if (!current || Math.abs(current.y - y) > height * 0.5) {
      if (current) lines.push(current);
      current = { page, text: item.str, x, y, height };
    } else {
      // Empty pieces carry no size, so a line takes its height from its first real text.
      if (!current.text.trim() && item.str.trim()) current.height = height;
      current.text += item.str;
    }
    if (item.hasEOL && current) {
      lines.push(current);
      current = undefined;
    }
  }
  if (current) lines.push(current);
  return lines.filter((l) => l.text.trim());
}

/** A line of text as laid out on a PDF page. */
export interface PdfLine {
  page: number;
  text: string;
  x: number;
  y: number;
  height: number;
}

export interface Paragraph {
  page: number;
  text: string;
}

export interface DraftChapter {
  title: string;
  text: string;
}

const CJK_END = /[㐀-鿿＀-￯　-〿]$/;
const CJK_START = /^[㐀-鿿＀-￯　-〿]/;

/** Joins two broken lines: Chinese needs no space, English needs one, and hyphens are glued back. */
function join(a: string, b: string): string {
  if (!a) return b;
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  if (CJK_END.test(a) || CJK_START.test(b)) return a + b;
  return `${a} ${b}`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

const PAGE_NUMBER = /^[\s\-–—·]*(\d{1,4}|[ivxlcdm]{1,7}|page\s*\d+(\s*(of|\/)\s*\d+)?|第\s*\d+\s*页|\d+\s*\/\s*\d+)[\s\-–—·]*$/i;

/**
 * Removes page furniture: page numbers, and running headers or footers
 * (the same line at the top or bottom of many pages). Chapter headings are kept.
 */
export function dropPageFurniture(lines: PdfLine[]): PdfLine[] {
  const pages = new Map<number, PdfLine[]>();
  for (const l of lines) if (l.text.trim()) pages.set(l.page, [...(pages.get(l.page) ?? []), l]);
  // Top-to-bottom order; PDFs often list headers and footers after the body.
  for (const list of pages.values()) list.sort((a, b) => b.y - a.y || a.x - b.x);

  const key = (t: string) => t.replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase();
  const edgeCount = new Map<string, number>();
  for (const list of pages.values()) {
    const edges = new Set([list[0], list[list.length - 1]].map((l) => key(l.text)));
    for (const k of edges) edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
  }
  const repeats = (t: string) => {
    const n = edgeCount.get(key(t)) ?? 0;
    return pages.size >= 3 && n >= Math.max(3, pages.size * 0.3);
  };

  const out: PdfLine[] = [];
  for (const [, list] of [...pages.entries()].sort(([a], [b]) => a - b)) {
    list.forEach((l, i) => {
      const edge = i === 0 || i === list.length - 1;
      const furniture = edge && (PAGE_NUMBER.test(l.text) || (repeats(l.text) && !isHeading(l.text)));
      if (!furniture) out.push(l);
    });
  }
  return out;
}

/**
 * Turns PDF lines back into paragraphs. A new paragraph starts on a new page,
 * after a gap bigger than usual, or on an indented line.
 */
export function buildParagraphs(lines: PdfLine[]): Paragraph[] {
  const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  const gaps: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].page === clean[i - 1].page) {
      const gap = clean[i - 1].y - clean[i].y;
      if (gap > 0) gaps.push(gap);
    }
  }
  const usualGap = median(gaps) || 14;
  const left = median(clean.map((l) => l.x));
  const lineHeight = median(clean.map((l) => l.height)) || 10;

  const out: Paragraph[] = [];
  let current: Paragraph | undefined;
  for (let i = 0; i < clean.length; i++) {
    const line = clean[i];
    const prev = clean[i - 1];
    const gap = prev && prev.page === line.page ? prev.y - line.y : 0;
    const breaks =
      !current ||
      gap > usualGap * 1.45 ||
      gap < 0 ||
      line.x - left > lineHeight * 1.2 ||
      isHeading(line.text) ||
      (current && isHeading(current.text));
    if (breaks) {
      current = { page: line.page, text: line.text };
      out.push(current);
    } else {
      current!.text = join(current!.text, line.text);
    }
  }
  return out;
}

const CN_NUM = '[0-9０-９一二三四五六七八九十百千零〇两]+';
const EN_NUM = '([0-9]+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)';
const CN_HEADING = new RegExp(`^(第\\s*${CN_NUM}\\s*[章节回卷集部篇]|序章|序言|楔子|引子|尾声|后记|番外)`);
const EN_HEADING = new RegExp(`^((chapter|chap\\.)\\s+${EN_NUM}\\b|prologue\\b|epilogue\\b|interlude\\b|afterword\\b)`, 'i');

/**
 * A chapter heading is short and is not a sentence: "第一章 夜路" or "Chapter 4: The Road",
 * but not "第三节课下课后，他跑去河边。" or "Chapter by chapter, the story grew."
 */
export function isHeading(text: string): boolean {
  const t = text.trim();
  if (CN_HEADING.test(t)) return t.length <= 30 && !/[，。！？；、,!?;]/.test(t);
  if (EN_HEADING.test(t)) return t.split(/\s+/).length <= 10 && !/[.!?]["']?$/.test(t.replace(/^(chapter|chap\.)\s+\S+\.?/i, ''));
  return false;
}

/**
 * Splits paragraphs into chapters at chapter headings.
 * Without headings it falls back to parts of `pagesPerPart` pages.
 */
export function splitChapters(paragraphs: Paragraph[], pagesPerPart = 10): DraftChapter[] {
  const chapters: { title: string; parts: string[] }[] = [];
  let before: string[] = [];
  for (const p of paragraphs) {
    if (isHeading(p.text)) {
      chapters.push({ title: p.text.trim(), parts: [] });
    } else if (chapters.length) {
      chapters[chapters.length - 1].parts.push(p.text);
    } else {
      before.push(p.text);
    }
  }

  if (chapters.length) {
    const result = chapters.map((c) => ({ title: c.title, text: c.parts.join('\n\n') }));
    // Keep a real opening (more than a title page), drop a table of contents made of headings only.
    const opening = before.join('\n\n');
    if (opening.length > 400) result.unshift({ title: 'Opening', text: opening });
    // Headings with no text after them are a table of contents; the real chapters come later.
    const withText = result.filter((c) => c.text.trim());
    return withText.length ? withText : result;
  }

  if (!paragraphs.length) return [];
  const byPart = new Map<number, string[]>();
  for (const p of paragraphs) {
    const part = Math.floor((p.page - 1) / pagesPerPart);
    byPart.set(part, [...(byPart.get(part) ?? []), p.text]);
  }
  return [...byPart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([part, texts]) => ({
      title: `Pages ${part * pagesPerPart + 1}–${(part + 1) * pagesPerPart}`,
      text: texts.join('\n\n'),
    }));
}

/**
 * Reads title and author off a cover page: the biggest text is the title,
 * the next biggest short line is the author.
 */
export function coverTitle(lines: PdfLine[]): { title?: string; author?: string } {
  // Wide letter spacing on covers turns into spaces; Chinese never needs them between characters.
  const tidy = (t: string) => t.trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1');
  const clean = lines.map((l) => ({ ...l, text: tidy(l.text) })).filter((l) => l.text && l.text.length <= 60);
  if (!clean.length) return {};
  const bySize = [...clean].sort((a, b) => b.height - a.height);
  const title = bySize[0];
  const author = bySize.find((l) => l !== title && l.height < title.height && l.text.length <= 30);
  return { title: title.text, author: author?.text };
}

/** PDF titles that are really file names or tool defaults. */
export function isJunkTitle(title?: string): boolean {
  return !title?.trim() || /^(untitled|microsoft word|about:blank)|\.(docx?|pdf|txt)$/i.test(title.trim());
}
