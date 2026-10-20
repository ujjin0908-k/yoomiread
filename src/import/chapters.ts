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

const HEADING = new RegExp(
  [
    '^第\\s*[0-9０-９一二三四五六七八九十百千零〇两]+\\s*[章节回卷集部篇]',
    '^(序章|序言|楔子|引子|尾声|后记|番外)',
    '^(chapter|chap\\.)\\s*([0-9]+|[ivxlc]+|[a-z-]+)\\b',
    '^(prologue|epilogue|interlude|afterword)\\b',
  ].join('|'),
  'i',
);

export function isHeading(text: string): boolean {
  return text.length <= 60 && HEADING.test(text.trim());
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
  const tidy = (t: string) => t.trim().replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '');
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
