import type { Backup, Book, Chapter, Note, Shelf } from './types';

export const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'want', label: 'Want to read' },
  { id: 'finished', label: 'Read' },
  { id: 'dropped', label: 'Dropped' },
];

export function newId(): string {
  return crypto.randomUUID();
}

/** Rounds to the nearest half star and keeps it in 0.5..5. */
export function clampRating(value: number): number {
  const half = Math.round(value * 2) / 2;
  return Math.min(5, Math.max(0.5, half));
}

/** Moves a book to a shelf and keeps the start and finish dates right. */
export function moveToShelf(book: Book, shelf: Shelf, now = Date.now()): Book {
  const next: Book = { ...book, shelf, updatedAt: now };
  if (shelf === 'reading' && !next.startedAt) next.startedAt = now;
  if (shelf === 'finished') {
    next.startedAt ??= now;
    next.finishedAt = now;
  } else {
    delete next.finishedAt;
  }
  return next;
}

/** Finishing a book: shelf, date, rating and review in one step. */
export function finishBook(book: Book, rating: number, review: string, now = Date.now()): Book {
  const moved = moveToShelf(book, 'finished', now);
  const trimmed = review.trim();
  return { ...moved, rating: clampRating(rating), review: trimmed || undefined };
}

export function progress(chapters: Chapter[]): { read: number; total: number } {
  return { read: chapters.filter((c) => c.read).length, total: chapters.length };
}

export function nextChapterNumber(chapters: Chapter[]): number {
  return chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1;
}

export interface Segment {
  text: string;
  start: number;
  /** Highlight note ids covering this piece of text. */
  noteIds: string[];
}

/**
 * Splits text into pieces so overlapping highlights can be drawn.
 * Highlights with bad offsets are ignored.
 */
export function segmentText(text: string, notes: Note[]): Segment[] {
  const marks = notes.filter(
    (n) =>
      n.kind === 'highlight' &&
      n.start !== undefined &&
      n.end !== undefined &&
      n.start >= 0 &&
      n.end <= text.length &&
      n.start < n.end,
  );
  const cuts = new Set<number>([0, text.length]);
  for (const m of marks) {
    cuts.add(m.start!);
    cuts.add(m.end!);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;
    segments.push({
      text: text.slice(start, end),
      start,
      noteIds: marks.filter((m) => m.start! <= start && m.end! >= end).map((m) => m.id),
    });
  }
  return segments;
}

/** Splits chapter text into paragraphs, keeping each paragraph's offset. */
export function paragraphs(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ start: m.index, text: m[0] });
  }
  return out;
}

export function makeBackup(books: Book[], chapters: Chapter[], notes: Note[], now = Date.now()): Backup {
  return { app: 'yoomiread', version: 1, exportedAt: now, books, chapters, notes };
}

/** Checks a backup file before it replaces anything. Throws with a readable message. */
export function parseBackup(raw: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a YoomiRead backup (not JSON).');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'yoomiread' || b.version !== 1) {
    throw new Error('This file is not a YoomiRead backup.');
  }
  if (!Array.isArray(b.books) || !Array.isArray(b.chapters) || !Array.isArray(b.notes)) {
    throw new Error('The backup is missing books, chapters or notes.');
  }
  const bookIds = new Set(b.books.map((x) => x.id));
  if (b.chapters.some((c) => !bookIds.has(c.bookId)) || b.notes.some((n) => !bookIds.has(n.bookId))) {
    throw new Error('The backup has chapters or notes for a book that is not in it.');
  }
  return b as Backup;
}

export function formatDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
