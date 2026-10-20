import type { LibraryData } from './db';
import type { Backup, GlossaryEntry } from './types';

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

function dataUrlToBlob(url: string): Blob {
  const m = /^data:([^;,]*);base64,(.*)$/.exec(url);
  if (!m) throw new Error('A cover in the backup is damaged.');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export async function makeBackup(data: LibraryData, now = Date.now()): Promise<Backup> {
  const books = await Promise.all(
    data.books.map(async (b) => ({ ...b, cover: b.cover ? await blobToDataUrl(b.cover) : undefined })),
  );
  const glossary = await Promise.all(
    data.glossary.map(async (g) => ({ ...g, picture: g.picture ? await blobToDataUrl(g.picture) : undefined })),
  );
  return {
    app: 'yoomiread',
    version: 3,
    exportedAt: now,
    books,
    chapters: data.chapters,
    notes: data.notes,
    sessions: data.sessions,
    glossary,
  };
}

/** Checks a backup file before it replaces anything. Throws with a readable message. */
export function parseBackup(raw: string): LibraryData {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a YoomiRead backup (not JSON).');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'yoomiread' || ![1, 2, 3].includes(b.version as number)) {
    throw new Error('This file is not a YoomiRead backup.');
  }
  if (!Array.isArray(b.books) || !Array.isArray(b.chapters) || !Array.isArray(b.notes)) {
    throw new Error('The backup is missing books, chapters or notes.');
  }
  const bookIds = new Set(b.books.map((x) => x.id));
  if (b.chapters.some((c) => !bookIds.has(c.bookId)) || b.notes.some((n) => !bookIds.has(n.bookId))) {
    throw new Error('The backup has chapters or notes for a book that is not in it.');
  }
  return {
    books: b.books.map((x) => ({ ...x, cover: x.cover ? dataUrlToBlob(x.cover) : undefined })),
    chapters: b.chapters,
    notes: b.notes,
    sessions: (b.sessions ?? []).filter((s) => bookIds.has(s.bookId)),
    glossary: (b.glossary ?? [])
      .filter((g) => bookIds.has(g.bookId))
      .map((g): GlossaryEntry => ({ ...g, picture: g.picture ? dataUrlToBlob(g.picture) : undefined })),
  };
}
