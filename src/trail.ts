/**
 * Where the reader came from, so "back" on the cast and on a character goes to the chapter being read instead of the
 * book page. A chapter is remembered until the book page or a tab is opened.
 */
let previous: string[] = [];
let current: string[] = [];
let reading: string | undefined;

const LEAVES_READING = new Set(['', 'library', 'quotes', 'stats', 'book', 'settings']);

export function noteRoute(parts: string[]): void {
  previous = current;
  current = parts;
  if (parts[0] === 'chapter') reading = parts[1];
  else if (LEAVES_READING.has(parts[0] ?? '')) reading = undefined;
}

/** The chapter being read when the cast was opened, if it belongs to this book (pass its chapter ids). */
export function chapterBefore(chapterIds: string[]): string | undefined {
  return reading && chapterIds.includes(reading) ? reading : undefined;
}

/** True when the page before this one was a chapter (a face or a name was tapped in the reader). */
export function cameFromChapter(): boolean {
  return previous[0] === 'chapter';
}
