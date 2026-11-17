import { db } from './db';
import type { Picture } from './picture';

/**
 * A picture of the owner's own behind one book's pages while reading. The page colour lies over it, by `cover`
 * (0.5 shows the picture strongly, 0.95 is barely there), so the text stays easy to read. Saved on the book, so each
 * book can have its own; it goes into backups like the cover.
 */
export interface Backdrop {
  picture: Picture;
  cover: number;
}

export const DEFAULT_COVER = 0.8;

export async function saveBookBackdrop(bookId: string, value: Backdrop | undefined): Promise<void> {
  await db.books.update(bookId, { backdrop: value });
}

/**
 * Backgrounds used to be one for the whole phone (settings key "readerBackdrop", 2026-11-15). The owner set it for the
 * book they were reading, so it moves to the book read most recently, unless that book has one, and the old one goes.
 */
export async function movePhoneBackdropToBook(target = db): Promise<string | undefined> {
  const old = (await target.settings.get('readerBackdrop'))?.value as Backdrop | undefined;
  if (!old) return undefined;
  const books = await target.books.toArray();
  const latest = books.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))[0];
  if (latest && !latest.backdrop) await target.books.update(latest.id, { backdrop: old });
  await target.settings.delete('readerBackdrop');
  return latest?.id;
}

/** Mixes two colours: `a` with `share` of `b` (0 gives a, 1 gives b). Both as #rrggbb; also takes [r, g, b]. */
export function mix(a: string, b: [number, number, number], share: number): string {
  const n = parseInt(a.slice(1), 16);
  const from = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return '#' + from.map((c, i) => Math.round(c * (1 - share) + b[i] * share).toString(16).padStart(2, '0')).join('');
}

/**
 * The average colour of the strip of the picture that sits under the iPhone status bar, with the picture placed like
 * the reader places it (covering the screen, centred). iOS paints that strip itself in the page's theme colour, so
 * the reader sets this colour there and the strip matches the picture instead of standing out.
 */
export async function topColour(blob: Blob, width: number, height: number, strip = 60): Promise<[number, number, number] | undefined> {
  try {
    const img = await createImageBitmap(blob);
    const scale = Math.max(width / img.width, height / img.height);
    const sx = (img.width - width / scale) / 2;
    const sy = (img.height - height / scale) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, sx, sy, width / scale, strip / scale, 0, 0, 16, 2);
    const data = ctx.getImageData(0, 0, 16, 2).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
    const count = data.length / 4;
    return [sum[0] / count, sum[1] / count, sum[2] / count];
  } catch {
    return undefined;
  }
}
