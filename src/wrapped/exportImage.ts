import { pictureBlob } from '../picture';
import type { Book } from '../types';
import { PAGE_H, PAGE_W, type Assets } from './Pages';

/**
 * Turning a Wrapped page into a picture: the page's SVG, with its fonts and pictures packed inside, drawn onto a
 * 1080 × 1920 canvas and saved as a PNG. Then the phone's share sheet (Instagram Stories and the rest), or a download
 * where sharing files isn't possible.
 */

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function fetchDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return dataUrl(await res.blob());
}

const CATS = ['sly', 'happy', 'resting', 'idle'] as const;

/** The covers of the given books and the cat's pictures, as data addresses (a saved picture must carry them). */
export async function loadAssets(books: Book[]): Promise<Assets> {
  const covers: Record<string, string> = {};
  await Promise.all(
    books.map(async (b) => {
      const blob = pictureBlob(b.cover);
      if (blob) covers[b.id] = await dataUrl(blob).catch(() => '');
    }),
  );
  const cat = {} as Assets['cat'];
  await Promise.all(CATS.map(async (c) => (cat[c] = await fetchDataUrl(`/mascot/cat-${c}.png`).catch(() => ''))));
  return { covers, cat };
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600&display=swap';

let fontCss: Promise<string> | undefined;

/** The page fonts as @font-face rules with the font files inside, so the picture uses them too. Latin only, to stay small. */
function embeddedFonts(): Promise<string> {
  fontCss ??= (async () => {
    try {
      const css = await (await fetch(FONTS)).text();
      // Keep the latin blocks: each @font-face is preceded by a /* subset */ comment.
      const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* latin \*\//.test(b));
      const out: string[] = [];
      for (const block of blocks) {
        const url = block.match(/url\((https:[^)]+)\)/)?.[1];
        if (!url) continue;
        const data = await fetchDataUrl(url);
        out.push(block.replace(url, data));
      }
      return out.join('\n');
    } catch {
      // Offline or blocked: the picture falls back to the phone's own fonts.
      return '';
    }
  })();
  return fontCss;
}

/** The page as a PNG, 1080 × 1920. */
export async function pagePng(svg: SVGSVGElement): Promise<Blob> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(PAGE_W));
  copy.setAttribute('height', String(PAGE_H));
  const css = await embeddedFonts();
  if (css) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    copy.insertBefore(style, copy.firstChild);
  }
  const text = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The page could not be drawn.'));
      img.src = url;
    });
    // Safari draws an SVG's fonts only once it has decoded them: a short wait makes the first save complete.
    await new Promise((r) => setTimeout(r, 120));
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shares the picture through the phone's share sheet when it can take files, else saves it. */
export async function sharePicture(blob: Blob, name: string): Promise<'shared' | 'saved'> {
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      // Closing the share sheet is not an error.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  savePicture(blob, name);
  return 'saved';
}

/** Saves the picture as a file (on iPhone it opens, and can be saved to Photos from there). */
export function savePicture(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
