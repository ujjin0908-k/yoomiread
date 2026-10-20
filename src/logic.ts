import type { Book, BookLanguage, Chapter, Note, Session, Shelf } from './types';

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

/** Share of the book read, 0 to 1: finished chapters plus the scroll position in unfinished ones. */
export function bookProgress(book: Book, chapters: Chapter[]): number {
  if (book.shelf === 'finished') return 1;
  if (!chapters.length) return 0;
  const done = chapters.reduce((sum, c) => sum + (c.read ? 1 : Math.min(1, Math.max(0, c.position ?? 0))), 0);
  return done / chapters.length;
}

/** The chapter to open when I tap "Continue": the last one I was in, else the first unread one. */
export function continueChapter(book: Book, chapters: Chapter[]): Chapter | undefined {
  const sorted = [...chapters].sort((a, b) => a.number - b.number);
  const last = sorted.find((c) => c.id === book.lastChapterId);
  if (last && !last.read) return last;
  const after = last ? sorted.filter((c) => c.number > last.number) : sorted;
  return after.find((c) => !c.read) ?? sorted.find((c) => !c.read) ?? last ?? sorted[0];
}

export function nextChapterNumber(chapters: Chapter[]): number {
  return chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1;
}

const CJK = /[㐀-鿿豈-﫿]/g;

/**
 * Minutes to read a piece of text. Chinese is counted by characters
 * (about 400 a minute), everything else by words (about 230 a minute).
 * `readFraction` is how much of it is already read.
 */
export function readingMinutes(text: string, readFraction = 0): number {
  const remaining = text.slice(Math.floor(text.length * Math.min(1, Math.max(0, readFraction))));
  const cjk = (remaining.match(CJK) ?? []).length;
  const words = remaining.replace(CJK, ' ').split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk / 400 + words / 230);
}

export function guessLanguage(text: string): BookLanguage {
  const sample = text.slice(0, 5000);
  const cjk = (sample.match(CJK) ?? []).length;
  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (cjk > letters / 3 && cjk > 20) return 'zh';
  return letters > 20 ? 'en' : 'other';
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

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface Stats {
  totalMs: number;
  sessions: number;
  finishedThisYear: number;
  averageRating?: number;
  /** Days in a row with reading, ending today or yesterday. */
  streak: number;
  /** Minutes read on each of the last `days` days, oldest first. */
  daily: { day: number; minutes: number }[];
}

export function computeStats(books: Book[], sessions: Session[], now = Date.now(), days = 14): Stats {
  const today = startOfDay(now);
  const perDay = new Map<number, number>();
  for (const s of sessions) perDay.set(startOfDay(s.startedAt), (perDay.get(startOfDay(s.startedAt)) ?? 0) + s.ms);

  const daily = Array.from({ length: days }, (_, i) => {
    const day = today - (days - 1 - i) * DAY;
    const ms = perDay.get(day) ?? 0;
    // Any reading at all shows as at least one minute, so short days still get a bar.
    return { day, minutes: ms ? Math.max(1, Math.round(ms / 60_000)) : 0 };
  });

  let streak = 0;
  let cursor = perDay.has(today) ? today : today - DAY;
  while (perDay.has(cursor)) {
    streak++;
    cursor -= DAY;
  }

  const year = new Date(now).getFullYear();
  const rated = books.filter((b) => b.shelf === 'finished' && b.rating);
  return {
    totalMs: sessions.reduce((sum, s) => sum + s.ms, 0),
    sessions: sessions.length,
    finishedThisYear: books.filter((b) => b.finishedAt && new Date(b.finishedAt).getFullYear() === year).length,
    averageRating: rated.length ? rated.reduce((sum, b) => sum + b.rating!, 0) / rated.length : undefined,
    streak,
    daily,
  };
}

export function formatDuration(ms: number): string {
  if (ms > 0 && ms < 60_000) return '<1m';
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function formatDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
