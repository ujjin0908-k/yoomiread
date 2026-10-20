import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { guessLanguage } from '../logic';
import type { BookLanguage } from '../types';
import { buildParagraphs, coverTitle, isJunkTitle, splitChapters, type DraftChapter, type PdfLine } from './chapters';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfImport {
  title: string;
  author: string;
  language: BookLanguage;
  cover?: Blob;
  chapters: DraftChapter[];
  pages: number;
  /** True when the pages are pictures with no text (needs OCR). */
  scanned: boolean;
}

/** Reads a PDF: first page becomes the cover, the text is split into chapters. */
export async function importPdf(file: File, onProgress?: (page: number, pages: number) => void): Promise<PdfImport> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const meta = await doc.getMetadata().catch(() => undefined);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
    const cover = await renderCover(doc);

    const lines: PdfLine[] = [];
    let firstPage: PdfLine[] = [];
    let firstPageChars = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(n, doc.numPages);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pageLines = toLines(n, content.items.filter((i): i is TextItem => 'str' in i));
      if (n === 1) {
        firstPage = pageLines;
        firstPageChars = pageLines.reduce((s, l) => s + l.text.trim().length, 0);
      }
      lines.push(...pageLines);
      page.cleanup();
    }

    // A first page with almost no text is the cover; leave it out of chapter 1.
    const body = firstPageChars < 120 ? lines.filter((l) => l.page !== 1) : lines;
    const allText = body.map((l) => l.text).join('');
    const scanned = allText.replace(/\s/g, '').length < doc.numPages * 20;
    const chapters = scanned ? [] : splitChapters(buildParagraphs(body));
    // No usable title inside the file: read it off the cover page, then fall back to the file name.
    const fromCover = firstPageChars < 120 ? coverTitle(firstPage) : {};

    return {
      title: (!isJunkTitle(info.Title) && info.Title!.trim()) || fromCover.title || file.name.replace(/\.pdf$/i, ''),
      author: info.Author?.trim() || fromCover.author || '',
      language: guessLanguage(allText),
      cover,
      chapters,
      pages: doc.numPages,
      scanned,
    };
  } finally {
    await doc.destroy();
  }
}

/** Groups text pieces that sit on the same baseline into lines. */
function toLines(page: number, items: TextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | undefined;
  for (const item of items) {
    const [, , , d, x, y] = item.transform;
    const height = item.height || Math.abs(d) || 10;
    if (!current || Math.abs(current.y - y) > height * 0.5) {
      if (current) lines.push(current);
      current = { page, text: item.str, x, y, height };
    } else {
      current.text += item.str;
    }
    if (item.hasEOL && current) {
      lines.push(current);
      current = undefined;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderCover(doc: pdfjs.PDFDocumentProxy): Promise<Blob | undefined> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 720 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const out = trimMargins(canvas);
    return await new Promise<Blob | undefined>((done) => out.toBlob((b) => done(b ?? undefined), 'image/jpeg', 0.85));
  } catch {
    return undefined;
  }
}

/** Cuts plain white page margins off the cover picture. */
function trimMargins(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const inked = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235;
  };
  // A row or column counts as content when more than 2% of it is not white.
  const rowHas = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x += 2) if (inked(x, y)) n++;
    return n > width * 0.01;
  };
  const colHas = (x: number) => {
    let n = 0;
    for (let y = 0; y < height; y += 2) if (inked(x, y)) n++;
    return n > height * 0.01;
  };
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && !rowHas(top)) top++;
  while (bottom > top && !rowHas(bottom)) bottom--;
  while (left < right && !colHas(left)) left++;
  while (right > left && !colHas(right)) right--;
  const w = right - left + 1;
  const h = bottom - top + 1;
  // Leave covers alone when there is little to cut, or when cutting would leave a sliver.
  if (w * h > width * height * 0.94 || w * h < width * height * 0.3) return canvas;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out;
}
