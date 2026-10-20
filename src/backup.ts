import type { Backup, BackupChapter, Book, Note, Session } from './types';

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

export async function makeBackup(
  data: { books: Book[]; chapters: BackupChapter[]; notes: Note[]; sessions: Session[] },
  now = Date.now(),
): Promise<Backup> {
  const books = await Promise.all(
    data.books.map(async (b) => ({ ...b, cover: b.cover ? await blobToDataUrl(b.cover) : undefined })),
  );
  return { app: 'yoomiread', version: 2, exportedAt: now, books, chapters: data.chapters, notes: data.notes, sessions: data.sessions };
}

/** Checks a backup file before it replaces anything. Throws with a readable message. */
export function parseBackup(raw: string): { books: Book[]; chapters: BackupChapter[]; notes: Note[]; sessions: Session[] } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a YoomiRead backup (not JSON).');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'yoomiread' || (b.version !== 1 && b.version !== 2)) {
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
  };
}
